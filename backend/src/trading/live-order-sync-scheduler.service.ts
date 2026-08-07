import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisLockService, type RedisLock } from '../redis/redis-lock.service';
import { RiskAwareLiveStrategyExecutionService } from './risk-aware-live-strategy-execution.service';
import { MaintenanceService } from '../admin/maintenance.service';

const LIVE_ORDER_SYNC_LOCK_KEY = 'hbs:lock:binance-live-order-sync';

/** Reconciles pending/partial Binance LIVE fills without creating new exposure. */
@Injectable()
export class LiveOrderSyncSchedulerService {
  private readonly logger = new Logger(LiveOrderSyncSchedulerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly execution: RiskAwareLiveStrategyExecutionService,
    private readonly redisLock: RedisLockService,
    private readonly maintenance?: MaintenanceService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async syncOpenLiveOrders() {
    if (this.running) return;
    if (await this.maintenance?.isActive()) return;
    this.running = true;
    let lock: RedisLock | null = null;
    try {
      lock = await this.redisLock.acquire(LIVE_ORDER_SYNC_LOCK_KEY, 30_000);
      if (!lock) return;
      const orders = await this.prisma.tradingOrder.findMany({
        where: {
          status: { in: ['PENDING', 'PARTIALLY_FILLED'] }, exchangeOrderId: { not: null },
          position: { strategy: { mode: 'BINANCE_LIVE', exchange: 'BINANCE', environment: 'LIVE', paperTrading: false } },
        },
        select: { id: true, userId: true }, orderBy: { createdAt: 'asc' }, take: 100,
      });
      for (const order of orders) {
        try { await this.execution.syncOrder(order.userId, order.id); }
        catch (error) {
          this.logger.warn(`Unable to synchronize Binance LIVE order ${order.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } finally {
      if (lock) {
        try { await this.redisLock.release(lock); } catch (error) {
          this.logger.warn(`Failed to release Binance LIVE order-sync lock: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      this.running = false;
    }
  }
}
