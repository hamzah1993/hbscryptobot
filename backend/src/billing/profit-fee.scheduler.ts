import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisLockService, type RedisLock } from '../redis/redis-lock.service';
import { BillingService } from './billing.service';

const PROFIT_FEE_LOCK_KEY = 'hbs:lock:billing-profit-fee';
const BATCH_SIZE = 100;

/** Charges the platform profit fee on every Binance LIVE position closed since billing started. */
@Injectable()
export class ProfitFeeScheduler {
  private readonly logger = new Logger(ProfitFeeScheduler.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly redisLock: RedisLockService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async settlePendingFees() {
    if (this.running) return;
    this.running = true;
    let lock: RedisLock | null = null;
    try {
      lock = await this.redisLock.acquire(PROFIT_FEE_LOCK_KEY, 120_000);
      if (!lock) return;
      const settings = await this.billing.getSettings();
      const pending = await this.prisma.tradingPosition.findMany({
        where: {
          status: 'CLOSED', profitFeeSettledAt: null, closedAt: { gte: settings.profitFeeStartAt },
          strategy: { exchange: 'BINANCE', environment: 'LIVE', paperTrading: false },
        },
        select: { id: true },
        orderBy: { closedAt: 'asc' },
        take: BATCH_SIZE,
      });
      for (const { id } of pending) {
        try {
          await this.billing.settleProfitFee(id);
        } catch (error) {
          this.logger.error(`Profit fee settlement failed for position ${id}`, error instanceof Error ? error.stack : String(error));
        }
      }
    } catch (error) {
      this.logger.error('Profit fee settlement run failed', error instanceof Error ? error.stack : String(error));
    } finally {
      if (lock) await this.redisLock.release(lock).catch(() => undefined);
      this.running = false;
    }
  }
}
