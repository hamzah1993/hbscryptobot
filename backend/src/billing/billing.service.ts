import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BalanceEntryType, Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DepositAddressService } from './deposit-address.service';

type Client = Prisma.TransactionClient;
type Settings = Awaited<ReturnType<BillingService['getSettings']>>;

export const DEPOSIT_CHAIN = 'BSC';
export const MAX_REFERRAL_LEVELS = 5;
const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Rounds a quote amount down to 8 decimals, the ledger's precision. */
export function floorQuote(value: number) {
  return Math.floor(value * 1e8) / 1e8;
}

/**
 * Prepaid platform balance ("fuel"), yearly membership, per-trade profit fee
 * and multi-level referral rewards. Every balance change is a BalanceEntry
 * whose (userId, type, referenceId) key makes it idempotent. Referral rewards
 * are paid only out of fees users actually pay, never for sign-ups.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly addresses: DepositAddressService,
  ) {}

  // ---- Settings -----------------------------------------------------------

  async getSettings(client: Client = this.prisma) {
    const settings = await client.billingSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    return {
      membershipFeeQuote: Number(settings.membershipFeeQuote),
      membershipDays: settings.membershipDays,
      profitFeePercent: Number(settings.profitFeePercent),
      minBalanceQuote: Number(settings.minBalanceQuote),
      referralPercents: (settings.referralPercents as number[]).map(Number),
      profitFeeStartAt: settings.profitFeeStartAt,
    };
  }

  async updateSettings(adminId: string, input: Partial<Omit<Settings, 'profitFeeStartAt'>>) {
    const current = await this.getSettings();
    const next = { ...current, ...input };
    if (!(next.membershipFeeQuote >= 0)) throw new BadRequestException('Membership fee cannot be negative');
    if (!Number.isInteger(next.membershipDays) || next.membershipDays < 1 || next.membershipDays > 3660) {
      throw new BadRequestException('Membership length must be 1 to 3660 days');
    }
    if (!(next.profitFeePercent >= 0 && next.profitFeePercent <= 50)) throw new BadRequestException('Profit fee must be 0% to 50%');
    if (!(next.minBalanceQuote >= 0)) throw new BadRequestException('Minimum balance cannot be negative');
    const percents = next.referralPercents;
    if (!Array.isArray(percents) || percents.length > MAX_REFERRAL_LEVELS || percents.some((value) => !(Number(value) >= 0))) {
      throw new BadRequestException(`Referral rewards must be up to ${MAX_REFERRAL_LEVELS} non-negative percentages`);
    }
    if (percents.reduce((sum, value) => sum + Number(value), 0) > 50) {
      throw new BadRequestException('Total referral rewards cannot exceed 50% of a fee');
    }

    await this.prisma.billingSettings.update({
      where: { id: 1 },
      data: {
        membershipFeeQuote: next.membershipFeeQuote,
        membershipDays: next.membershipDays,
        profitFeePercent: next.profitFeePercent,
        minBalanceQuote: next.minBalanceQuote,
        referralPercents: percents.map(Number),
      },
    });
    await this.prisma.adminAuditEvent.create({
      data: { adminId, action: 'BILLING_SETTINGS_UPDATED', metadata: { before: current, after: next } as unknown as Prisma.InputJsonValue },
    });
    return this.getSettings();
  }

  // ---- Accounts -----------------------------------------------------------

  /** Validates a referral code before an account is created; returns the referrer's user id. */
  async resolveReferrer(code: string | undefined) {
    const normalized = code?.trim().toUpperCase();
    if (!normalized) return null;
    const referrer = await this.prisma.billingAccount.findUnique({ where: { referralCode: normalized }, select: { userId: true } });
    if (!referrer) throw new BadRequestException('Referral code not found');
    return referrer.userId;
  }

  /** Creates the billing account on first use and assigns a deposit address once deposits are configured. */
  async ensureAccount(userId: string, referrerId: string | null = null) {
    let account = await this.prisma.billingAccount.findUnique({ where: { userId } });
    if (!account) {
      for (let attempt = 0; attempt < 5 && !account; attempt += 1) {
        try {
          account = await this.prisma.billingAccount.create({
            data: { userId, referrerId: referrerId === userId ? null : referrerId, referralCode: this.newReferralCode() },
          });
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
          // Either the account was created concurrently or the code collided; re-read and retry.
          account = await this.prisma.billingAccount.findUnique({ where: { userId } });
        }
      }
      if (!account) throw new ConflictException('Unable to create billing account; please retry');
    }
    if (!account.depositAddress && this.addresses.enabled) {
      account = await this.prisma.billingAccount.update({
        where: { userId },
        data: { depositAddress: this.addresses.addressFor(account.depositIndex) },
      });
    }
    return account;
  }

  async overview(userId: string) {
    const [account, settings] = await Promise.all([this.ensureAccount(userId), this.getSettings()]);
    const balanceQuote = Number(account.balanceQuote);
    const membershipActive = this.isMembershipActive(account.membershipExpiresAt);
    return {
      balanceQuote,
      membership: { active: membershipActive, expiresAt: account.membershipExpiresAt },
      referralCode: account.referralCode,
      deposit: account.depositAddress
        ? { enabled: true, chain: DEPOSIT_CHAIN, network: 'BNB Smart Chain (BEP20)', asset: 'USDT', address: account.depositAddress }
        : { enabled: false, chain: DEPOSIT_CHAIN, network: 'BNB Smart Chain (BEP20)', asset: 'USDT', address: null },
      fees: {
        membershipFeeQuote: settings.membershipFeeQuote,
        membershipDays: settings.membershipDays,
        profitFeePercent: settings.profitFeePercent,
        minBalanceQuote: settings.minBalanceQuote,
      },
      trading: this.tradingStatus(membershipActive, balanceQuote, settings),
    };
  }

  listEntries(userId: string, limit = 100) {
    return this.prisma.balanceEntry.findMany({
      where: { userId },
      select: { id: true, type: true, amountQuote: true, balanceAfterQuote: true, level: true, description: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    }).then((entries) => entries.map((entry) => ({
      ...entry,
      amountQuote: Number(entry.amountQuote),
      balanceAfterQuote: Number(entry.balanceAfterQuote),
    })));
  }

  // ---- Trading gate -------------------------------------------------------

  /** Final gate for every new Binance LIVE entry. Exits are never gated. */
  async assertCanOpenLiveEntry(userId: string) {
    const [account, settings] = await Promise.all([this.ensureAccount(userId), this.getSettings()]);
    const status = this.tradingStatus(this.isMembershipActive(account.membershipExpiresAt), Number(account.balanceQuote), settings);
    if (!status.allowed) throw new ConflictException(status.reason);
  }

  // ---- Membership -----------------------------------------------------------

  async activateMembership(userId: string) {
    await this.ensureAccount(userId);
    return this.prisma.$transaction(async (tx) => {
      const settings = await this.getSettings(tx);
      const account = await tx.billingAccount.findUniqueOrThrow({ where: { userId } });
      if (Number(account.balanceQuote) < settings.membershipFeeQuote) {
        throw new BadRequestException(`Membership costs ${settings.membershipFeeQuote} USDT; deposit to your balance first`);
      }
      const now = Date.now();
      const from = Math.max(now, account.membershipExpiresAt?.getTime() ?? 0);
      const expiresAt = new Date(from + settings.membershipDays * 86_400_000);

      const fee = await this.applyEntry(tx, {
        userId, type: 'MEMBERSHIP_FEE', amountQuote: -settings.membershipFeeQuote,
        referenceId: randomUUID(), description: `${settings.membershipDays}-day membership until ${expiresAt.toISOString().slice(0, 10)}`,
      });
      await tx.billingAccount.update({ where: { userId }, data: { membershipExpiresAt: expiresAt } });
      if (fee) await this.distributeReferralRewards(tx, userId, fee.id, settings.membershipFeeQuote, settings);
      return { membership: { active: true, expiresAt }, balanceQuote: fee ? Number(fee.balanceAfterQuote) : Number(account.balanceQuote) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  // ---- Profit fee -----------------------------------------------------------

  /**
   * Settles the profit fee for one closed position: profitFeePercent of its
   * realized profit, deducted from the user's balance (which may go negative,
   * blocking new entries until topped up). Idempotent per position.
   */
  async settleProfitFee(positionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const settings = await this.getSettings(tx);
      // Claiming the row first serializes concurrent settlements of the same position.
      const claimed = await tx.tradingPosition.updateMany({
        where: {
          id: positionId, status: 'CLOSED', profitFeeSettledAt: null, closedAt: { gte: settings.profitFeeStartAt },
          strategy: { exchange: 'BINANCE', environment: 'LIVE', paperTrading: false },
        },
        data: { profitFeeSettledAt: new Date() },
      });
      if (!claimed.count) return null;
      const position = await tx.tradingPosition.findUniqueOrThrow({
        where: { id: positionId },
        select: { id: true, userId: true, symbol: true, realizedPnlQuote: true },
      });

      const profit = Number(position.realizedPnlQuote);
      const feeQuote = floorQuote(profit > 0 ? (profit * settings.profitFeePercent) / 100 : 0);
      if (feeQuote <= 0) return { positionId: position.id, feeQuote: 0 };

      await this.ensureAccountWith(tx, position.userId);
      const fee = await this.applyEntry(tx, {
        userId: position.userId, type: 'PROFIT_FEE', amountQuote: -feeQuote, referenceId: position.id,
        description: `${settings.profitFeePercent}% of ${floorQuote(profit)} USDT profit on ${position.symbol}`,
      });
      if (fee) await this.distributeReferralRewards(tx, position.userId, fee.id, feeQuote, settings);
      return { positionId: position.id, feeQuote };
    });
  }

  // ---- Deposits -------------------------------------------------------------

  /** Records and credits one confirmed on-chain deposit; returns false when it was already credited. */
  async creditDeposit(input: {
    chain: string; txHash: string; logIndex: number; fromAddress: string; toAddress: string; amountQuote: number; blockNumber: number;
  }) {
    const account = await this.prisma.billingAccount.findUnique({ where: { depositAddress: input.toAddress.toLowerCase() } });
    if (!account) return false;
    const amountQuote = floorQuote(input.amountQuote);
    if (amountQuote <= 0) return false;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.cryptoDeposit.create({
          data: { ...input, txHash: input.txHash.toLowerCase(), toAddress: input.toAddress.toLowerCase(), fromAddress: input.fromAddress.toLowerCase(), amountQuote, userId: account.userId },
        });
        await this.applyEntry(tx, {
          userId: account.userId, type: 'DEPOSIT', amountQuote, referenceId: `${input.chain}:${input.txHash.toLowerCase()}:${input.logIndex}`,
          description: `USDT deposit (${input.chain})`,
        });
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
  }

  // ---- Referrals ------------------------------------------------------------

  async referralSummary(userId: string) {
    const [account, settings] = await Promise.all([this.ensureAccount(userId), this.getSettings()]);
    const levels: Array<{ level: number; rewardPercent: number; members: number; activeMembers: number }> = [];
    let frontier = [userId];
    for (let level = 1; level <= settings.referralPercents.length && frontier.length; level += 1) {
      const members = await this.prisma.billingAccount.findMany({
        where: { referrerId: { in: frontier } },
        select: { userId: true, membershipExpiresAt: true },
      });
      levels.push({
        level,
        rewardPercent: settings.referralPercents[level - 1],
        members: members.length,
        activeMembers: members.filter((member) => this.isMembershipActive(member.membershipExpiresAt)).length,
      });
      frontier = members.map((member) => member.userId);
    }
    const earned = await this.prisma.balanceEntry.groupBy({
      by: ['level'],
      where: { userId, type: 'REFERRAL_REWARD' },
      _sum: { amountQuote: true },
    });
    return {
      referralCode: account.referralCode,
      eligible: this.isMembershipActive(account.membershipExpiresAt),
      levels: levels.map((item) => ({
        ...item,
        earnedQuote: Number(earned.find((entry) => entry.level === item.level)?._sum.amountQuote ?? 0),
      })),
      totalEarnedQuote: earned.reduce((sum, entry) => sum + Number(entry._sum.amountQuote ?? 0), 0),
    };
  }

  // ---- Admin ----------------------------------------------------------------

  async adminAdjust(adminId: string, email: string, amountQuote: number, reason: string) {
    if (!Number.isFinite(amountQuote) || amountQuote === 0) throw new BadRequestException('Adjustment amount must be non-zero');
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    await this.ensureAccount(user.id);
    const entry = await this.prisma.$transaction((tx) => this.applyEntry(tx, {
      userId: user.id, type: 'ADMIN_ADJUSTMENT', amountQuote: floorQuote(amountQuote), referenceId: randomUUID(), description: reason.trim(),
    }));
    await this.prisma.adminAuditEvent.create({
      data: { adminId, action: 'BILLING_BALANCE_ADJUSTED', target: user.id, metadata: { email, amountQuote, reason } },
    });
    return { userId: user.id, balanceQuote: Number(entry?.balanceAfterQuote ?? 0) };
  }

  async adminOverview() {
    const [byType, balances, deposits, settings] = await Promise.all([
      this.prisma.balanceEntry.groupBy({ by: ['type'], _sum: { amountQuote: true }, _count: { _all: true } }),
      this.prisma.billingAccount.aggregate({ _sum: { balanceQuote: true }, _count: { _all: true } }),
      this.prisma.cryptoDeposit.findMany({
        orderBy: { createdAt: 'desc' }, take: 50,
        select: { id: true, chain: true, txHash: true, amountQuote: true, toAddress: true, createdAt: true, user: { select: { email: true } } },
      }),
      this.getSettings(),
    ]);
    const total = (type: BalanceEntryType) => Number(byType.find((item) => item.type === type)?._sum.amountQuote ?? 0);
    const activeMembers = await this.prisma.billingAccount.count({ where: { membershipExpiresAt: { gt: new Date() } } });
    return {
      settings,
      depositsEnabled: this.addresses.enabled,
      totals: {
        depositsQuote: total('DEPOSIT'),
        membershipFeesQuote: -total('MEMBERSHIP_FEE'),
        profitFeesQuote: -total('PROFIT_FEE'),
        referralRewardsQuote: total('REFERRAL_REWARD'),
        adminAdjustmentsQuote: total('ADMIN_ADJUSTMENT'),
        userBalancesQuote: Number(balances._sum.balanceQuote ?? 0),
        accounts: balances._count._all,
        activeMembers,
      },
      recentDeposits: deposits.map((deposit) => ({ ...deposit, amountQuote: Number(deposit.amountQuote) })),
    };
  }

  // ---- Internals --------------------------------------------------------------

  /** Pays each upline level its share of a fee, skipping uplines without an active membership. */
  private async distributeReferralRewards(tx: Client, payerId: string, feeEntryId: string, feeQuote: number, settings: Settings) {
    let current = await tx.billingAccount.findUnique({ where: { userId: payerId }, select: { referrerId: true } });
    const seen = new Set([payerId]);
    for (let level = 1; level <= settings.referralPercents.length && current?.referrerId; level += 1) {
      const uplineId: string = current.referrerId;
      if (seen.has(uplineId)) break;
      seen.add(uplineId);
      const upline = await tx.billingAccount.findUnique({ where: { userId: uplineId }, select: { referrerId: true, membershipExpiresAt: true } });
      if (!upline) break;
      const reward = floorQuote((feeQuote * settings.referralPercents[level - 1]) / 100);
      if (reward > 0 && this.isMembershipActive(upline.membershipExpiresAt)) {
        await this.applyEntry(tx, {
          userId: uplineId, type: 'REFERRAL_REWARD', amountQuote: reward, referenceId: `${feeEntryId}:L${level}`,
          sourceUserId: payerId, level, description: `Level ${level} referral reward`,
        });
      }
      current = upline;
    }
  }

  /** Writes one ledger entry and moves the balance by the same amount; returns null if it was already applied. */
  private async applyEntry(tx: Client, input: {
    userId: string; type: BalanceEntryType; amountQuote: number; referenceId: string;
    sourceUserId?: string; level?: number; description?: string;
  }) {
    const existing = await tx.balanceEntry.findUnique({
      where: { userId_type_referenceId: { userId: input.userId, type: input.type, referenceId: input.referenceId } },
      select: { id: true },
    });
    if (existing) return null;
    const account = await tx.billingAccount.update({
      where: { userId: input.userId },
      data: { balanceQuote: { increment: input.amountQuote } },
      select: { balanceQuote: true },
    });
    return tx.balanceEntry.create({
      data: { ...input, balanceAfterQuote: account.balanceQuote },
    });
  }

  private async ensureAccountWith(tx: Client, userId: string) {
    const existing = await tx.billingAccount.findUnique({ where: { userId }, select: { userId: true } });
    if (!existing) await tx.billingAccount.create({ data: { userId, referralCode: this.newReferralCode() } });
  }

  private tradingStatus(membershipActive: boolean, balanceQuote: number, settings: Settings) {
    if (!membershipActive) return { allowed: false, reason: 'An active membership is required to open new LIVE trades' };
    if (balanceQuote < settings.minBalanceQuote) {
      return { allowed: false, reason: `Keep at least ${settings.minBalanceQuote} USDT in your balance to open new LIVE trades` };
    }
    return { allowed: true, reason: null };
  }

  private isMembershipActive(expiresAt: Date | null) {
    return Boolean(expiresAt && expiresAt.getTime() > Date.now());
  }

  private newReferralCode() {
    return Array.from(randomBytes(8), (byte) => REFERRAL_CODE_ALPHABET[byte % REFERRAL_CODE_ALPHABET.length]).join('');
  }
}
