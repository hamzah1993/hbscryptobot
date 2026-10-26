import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JsonRpcProvider, formatUnits, getAddress, id, zeroPadValue } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisLockService, type RedisLock } from '../redis/redis-lock.service';
import { BillingService, DEPOSIT_CHAIN } from './billing.service';
import { DepositAddressService } from './deposit-address.service';

const SCAN_LOCK_KEY = 'hbs:lock:billing-bsc-deposit-scan';
const TRANSFER_TOPIC = id('Transfer(address,address,uint256)');
/** Binance-Peg BSC-USD (USDT, BEP20), 18 decimals. */
const DEFAULT_USDT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';
const ADDRESS_CHUNK = 200;

/**
 * Credits USDT (BEP20) transfers to users' deposit addresses once they have
 * enough confirmations. Progress is stored per chain, and each transfer is
 * credited at most once (unique chain + tx hash + log index).
 */
@Injectable()
export class BscDepositScanner {
  private readonly logger = new Logger(BscDepositScanner.name);
  private readonly provider: JsonRpcProvider | null;
  private readonly contract: string;
  private readonly decimals: number;
  private readonly confirmations: number;
  private readonly blockRange: number;
  private readonly maxRangesPerRun: number;
  private readonly startBlock: number | null;
  private running = false;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly addresses: DepositAddressService,
    private readonly redisLock: RedisLockService,
  ) {
    const rpcUrl = config.get<string>('BSC_RPC_URL')?.trim() || 'https://bsc-dataseed.bnbchain.org';
    this.provider = addresses.enabled ? new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true }) : null;
    this.contract = getAddress(config.get<string>('BSC_USDT_CONTRACT')?.trim() || DEFAULT_USDT_CONTRACT);
    this.decimals = Number(config.get<string>('BSC_USDT_DECIMALS') ?? 18);
    this.confirmations = Number(config.get<string>('BSC_CONFIRMATIONS') ?? 15);
    this.blockRange = Number(config.get<string>('BSC_SCAN_BLOCK_RANGE') ?? 500);
    this.maxRangesPerRun = Number(config.get<string>('BSC_SCAN_MAX_RANGES_PER_RUN') ?? 20);
    const start = config.get<string>('BSC_SCAN_START_BLOCK');
    this.startBlock = start ? Number(start) : null;
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async scan() {
    if (!this.provider || this.running) return;
    this.running = true;
    let lock: RedisLock | null = null;
    try {
      lock = await this.redisLock.acquire(SCAN_LOCK_KEY, 120_000);
      if (!lock) return;
      await this.scanOnce();
    } catch (error) {
      this.logger.warn(`BSC deposit scan failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (lock) await this.redisLock.release(lock).catch(() => undefined);
      this.running = false;
    }
  }

  /** Scans confirmed blocks since the last run and returns how many deposits were credited. */
  async scanOnce() {
    if (!this.provider) return 0;
    const latest = await this.provider.getBlockNumber();
    const safeHead = latest - this.confirmations;
    const state = await this.prisma.depositScanState.findUnique({ where: { chain: DEPOSIT_CHAIN } });
    let from = state ? state.lastScannedBlock + 1 : (this.startBlock ?? safeHead);
    if (from > safeHead) return 0;

    const accounts = await this.prisma.billingAccount.findMany({
      where: { depositAddress: { not: null } },
      select: { depositAddress: true },
    });
    const topics = accounts.map((account) => zeroPadValue(account.depositAddress!, 32));
    let credited = 0;

    for (let ranges = 0; ranges < this.maxRangesPerRun && from <= safeHead; ranges += 1) {
      const to = Math.min(from + this.blockRange - 1, safeHead);
      for (let index = 0; index < topics.length; index += ADDRESS_CHUNK) {
        const logs = await this.provider.getLogs({
          address: this.contract,
          topics: [TRANSFER_TOPIC, null, topics.slice(index, index + ADDRESS_CHUNK)],
          fromBlock: from,
          toBlock: to,
        });
        for (const log of logs) {
          const amountQuote = Number(formatUnits(BigInt(log.data), this.decimals));
          const ok = await this.billing.creditDeposit({
            chain: DEPOSIT_CHAIN,
            txHash: log.transactionHash,
            logIndex: log.index,
            fromAddress: getAddress(`0x${log.topics[1].slice(26)}`),
            toAddress: getAddress(`0x${log.topics[2].slice(26)}`),
            amountQuote,
            blockNumber: log.blockNumber,
          });
          if (ok) {
            credited += 1;
            this.logger.log(`Credited ${amountQuote} USDT deposit ${log.transactionHash}#${log.index}`);
          }
        }
      }
      // Progress is saved only after every chunk of the range succeeded, so a failed range is retried.
      await this.prisma.depositScanState.upsert({
        where: { chain: DEPOSIT_CHAIN },
        create: { chain: DEPOSIT_CHAIN, lastScannedBlock: to },
        update: { lastScannedBlock: to },
      });
      from = to + 1;
    }
    return credited;
  }
}
