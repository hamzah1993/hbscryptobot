import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LIVE_CONFIRMATION_VERSION } from '../trading/live-trading-safety.service';
import { StrategyService } from '../trading/strategy.service';
import { CreateTradingPackageDto, UpdateTradingPackageDto } from './dto/trading-package.dto';
import { packageStrategyInput, sanitizePackageTemplate } from './package-template';

/** Binance Spot's minimum order value for USDT pairs is 5 USDT. */
const MIN_PACKAGE_BASE_ORDER_QUOTE = 5;

/**
 * Managed trading packages. A subscription creates a Binance LIVE strategy on
 * the subscriber's own exchange account; the platform never holds user funds,
 * so each user's profit and loss is simply their own strategy's result.
 */
@Injectable()
export class PackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly strategies: StrategyService,
  ) {}

  async listAvailable() {
    const packages = await this.prisma.tradingPackage.findMany({
      where: { active: true },
      select: { id: true, name: true, description: true, amountQuote: true, symbol: true, strategyTemplate: true },
      orderBy: [{ sortOrder: 'asc' }, { amountQuote: 'asc' }],
    });
    return packages.map((pkg) => ({ ...pkg, amountQuote: Number(pkg.amountQuote) }));
  }

  async listMine(userId: string) {
    const subscriptions = await this.prisma.packageSubscription.findMany({
      where: { userId },
      include: {
        package: { select: { id: true, name: true, symbol: true } },
        strategy: { select: { id: true, name: true, status: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
    const strategyIds = subscriptions.map((item) => item.strategyId).filter((id): id is string => Boolean(id));
    const positions = strategyIds.length
      ? await this.prisma.tradingPosition.findMany({
          where: { userId, strategyId: { in: strategyIds } },
          select: { strategyId: true, status: true, realizedPnlQuote: true, totalCostQuote: true },
        })
      : [];

    return subscriptions.map((subscription) => {
      const own = positions.filter((position) => position.strategyId === subscription.strategyId);
      const open = own.filter((position) => position.status === 'OPEN');
      const realizedPnlQuote = own.reduce((sum, position) => sum + Number(position.realizedPnlQuote), 0);
      const amountQuote = Number(subscription.amountQuote);
      return {
        ...subscription,
        amountQuote,
        performance: {
          realizedPnlQuote,
          realizedReturnPercent: amountQuote > 0 ? (realizedPnlQuote / amountQuote) * 100 : 0,
          openPositions: open.length,
          openPositionCostQuote: open.reduce((sum, position) => sum + Number(position.totalCostQuote), 0),
          closedPositions: own.length - open.length,
        },
      };
    });
  }

  async subscribe(userId: string, packageId: string) {
    const pkg = await this.prisma.tradingPackage.findUnique({ where: { id: packageId } });
    if (!pkg || !pkg.active) throw new NotFoundException('Package not found');

    const credential = await this.prisma.exchangeCredential.findUnique({
      where: { userId_exchange_environment: { userId, exchange: 'BINANCE', environment: 'LIVE' } },
      select: { id: true },
    });
    if (!credential) {
      throw new BadRequestException('Connect your Binance LIVE API key (trading enabled, withdrawals disabled) before subscribing');
    }

    const input = packageStrategyInput(pkg, `${pkg.name} package ${randomUUID().slice(0, 8)}`);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.packageSubscription.findFirst({
          where: { userId, packageId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (existing) throw new ConflictException('You already have an active subscription to this package');

        const strategy = await this.strategies.createWithClient(tx, userId, input);
        const subscription = await tx.packageSubscription.create({
          data: { userId, packageId, strategyId: strategy.id, amountQuote: pkg.amountQuote },
        });

        // The user-wide LIVE capital ceiling must cover every active package.
        // Raising it clears the LIVE confirmation, so the user explicitly
        // re-acknowledges the larger real-money exposure before any entry.
        const total = await tx.packageSubscription.aggregate({
          where: { userId, status: 'ACTIVE' },
          _sum: { amountQuote: true },
        });
        const requiredCeiling = Number(total._sum.amountQuote ?? 0);
        const profile = await tx.liveTradingSafetyProfile.findUnique({ where: { userId } });
        const currentCeiling = Number(profile?.capitalCeilingQuote ?? 0);
        let confirmationRequired = !profile?.confirmedAt || profile.confirmationVersion !== LIVE_CONFIRMATION_VERSION;
        if (currentCeiling < requiredCeiling) {
          await tx.liveTradingSafetyProfile.upsert({
            where: { userId },
            create: { userId, capitalCeilingQuote: requiredCeiling },
            update: { capitalCeilingQuote: requiredCeiling, confirmedAt: null, confirmationVersion: null },
          });
          confirmationRequired = true;
        }

        return {
          subscription: { ...subscription, amountQuote: Number(subscription.amountQuote) },
          strategy: { id: strategy.id, name: strategy.name, status: strategy.status },
          capitalCeilingQuote: Math.max(currentCeiling, requiredCeiling),
          confirmationRequired,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Another subscription change is in progress; please try again');
      }
      throw error;
    }
  }

  async cancel(userId: string, subscriptionId: string) {
    const subscription = await this.prisma.packageSubscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { strategy: { select: { id: true, status: true } } },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    if (subscription.status === 'CANCELLED') return { ...subscription, amountQuote: Number(subscription.amountQuote) };

    if (subscription.strategy) {
      if (subscription.strategy.status === 'RUNNING') {
        throw new BadRequestException('Stop the package bot before cancelling the subscription');
      }
      const openPositions = await this.prisma.tradingPosition.count({
        where: { userId, strategyId: subscription.strategy.id, status: 'OPEN' },
      });
      if (openPositions) {
        throw new BadRequestException('Close the package bot\'s open position (or use emergency exit) before cancelling');
      }
    }

    // The capital ceiling is left unchanged: lowering it would only force a
    // needless re-confirmation, and the user can lower it themselves.
    return this.prisma.$transaction(async (tx) => {
      if (subscription.strategy) {
        await tx.tradingStrategy.update({ where: { id: subscription.strategy.id }, data: { status: 'STOPPED' } });
      }
      const cancelled = await tx.packageSubscription.update({
        where: { id: subscription.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      return { ...cancelled, amountQuote: Number(cancelled.amountQuote) };
    });
  }

  async adminList() {
    const packages = await this.prisma.tradingPackage.findMany({ orderBy: [{ sortOrder: 'asc' }, { amountQuote: 'asc' }] });
    const counts = await this.prisma.packageSubscription.groupBy({
      by: ['packageId'],
      where: { status: 'ACTIVE' },
      _count: { _all: true },
      _sum: { amountQuote: true },
    });
    return packages.map((pkg) => {
      const count = counts.find((item) => item.packageId === pkg.id);
      return {
        ...pkg,
        amountQuote: Number(pkg.amountQuote),
        activeSubscriptions: count?._count._all ?? 0,
        activeCapitalQuote: Number(count?._sum.amountQuote ?? 0),
      };
    });
  }

  async adminCreate(adminId: string, dto: CreateTradingPackageDto) {
    const data = {
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      amountQuote: dto.amountQuote,
      symbol: this.normalizeSymbol(dto.symbol),
      strategyTemplate: sanitizePackageTemplate(dto.strategyTemplate),
      active: dto.active ?? true,
      sortOrder: dto.sortOrder ?? 0,
    };
    this.validatePackage(data);

    const created = await this.writeUniquely(() => this.prisma.tradingPackage.create({ data }));
    await this.audit(adminId, 'TRADING_PACKAGE_CREATED', created.id, { name: created.name, amountQuote: dto.amountQuote });
    return { ...created, amountQuote: Number(created.amountQuote) };
  }

  /** Edits apply to future subscriptions only; existing package strategies keep the settings they were created with. */
  async adminUpdate(adminId: string, packageId: string, dto: UpdateTradingPackageDto) {
    const existing = await this.prisma.tradingPackage.findUnique({ where: { id: packageId } });
    if (!existing) throw new NotFoundException('Package not found');

    const data = {
      name: dto.name?.trim() ?? existing.name,
      description: dto.description !== undefined ? dto.description.trim() || null : existing.description,
      amountQuote: dto.amountQuote ?? Number(existing.amountQuote),
      symbol: dto.symbol ? this.normalizeSymbol(dto.symbol) : existing.symbol,
      strategyTemplate: sanitizePackageTemplate(dto.strategyTemplate ?? existing.strategyTemplate),
      active: dto.active ?? existing.active,
      sortOrder: dto.sortOrder ?? existing.sortOrder,
    };
    this.validatePackage(data);

    const updated = await this.writeUniquely(() => this.prisma.tradingPackage.update({ where: { id: packageId }, data }));
    await this.audit(adminId, 'TRADING_PACKAGE_UPDATED', packageId, { changed: Object.keys(dto) });
    return { ...updated, amountQuote: Number(updated.amountQuote) };
  }

  /**
   * Strategy validation clips a plan to its budget, which is right for a user's
   * own bot but would let a package be sold whose base order it cannot fund.
   */
  private validatePackage(data: { name: string; symbol: string; amountQuote: number; strategyTemplate: { baseOrderQuote: number } }) {
    const baseOrder = data.strategyTemplate.baseOrderQuote;
    if (baseOrder < MIN_PACKAGE_BASE_ORDER_QUOTE) {
      throw new BadRequestException(`Package base order must be at least ${MIN_PACKAGE_BASE_ORDER_QUOTE} USDT to meet Binance's minimum order value`);
    }
    if (baseOrder > data.amountQuote) {
      throw new BadRequestException('Package amount must cover at least the base order');
    }
    this.strategies.validateInput(packageStrategyInput(data, `${data.name} package`));
  }

  private normalizeSymbol(symbol: string) {
    return symbol.replace(/[^a-z0-9]/gi, '').toUpperCase();
  }

  private async writeUniquely<T>(write: () => Promise<T>) {
    try {
      return await write();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A package with this name already exists');
      }
      throw error;
    }
  }

  private async audit(adminId: string, action: string, target: string, metadata: Record<string, unknown>) {
    await this.prisma.adminAuditEvent.create({
      data: { adminId, action, target, metadata: metadata as Prisma.InputJsonValue },
    });
  }
}
