import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisLockService, type RedisLock } from '../redis/redis-lock.service';
import { RiskAwareLiveStrategyExecutionService } from './risk-aware-live-strategy-execution.service';
import { MaintenanceService } from '../admin/maintenance.service';
import { SystemHeartbeatService } from '../admin/system-heartbeat.service';
import { forEachConcurrent, keepLockAlive, schedulerConcurrency } from './scheduler-concurrency';
import { entryOrderTimeoutMs } from './testnet-strategy-execution.service';

const LIVE_ORDER_SYNC_LOCK_KEY = 'hbs:lock:binance-live-order-sync';
const LOCK_TTL_MS = 30_000;

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
    private readonly heartbeat?: SystemHeartbeatService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async syncOpenLiveOrders() {
    this.heartbeat?.mark('liveOrderSync');
    if (this.running) return;
    if (await this.maintenance?.isActive()) return;
    this.running = true;
    let lock: RedisLock | null = null;
    let stopRenewal: (() => void) | null = null;
    try {
      lock = await this.redisLock.acquire(LIVE_ORDER_SYNC_LOCK_KEY, LOCK_TTL_MS);
      if (!lock) return;
      stopRenewal = keepLockAlive(this.redisLock, lock, LOCK_TTL_MS);
      const orders = await this.prisma.tradingOrder.findMany({
        where: {
          status: { in: ['PENDING', 'PARTIALLY_FILLED'] }, exchangeOrderId: { not: null },
          position: { strategy: { mode: 'BINANCE_LIVE', exchange: 'BINANCE', environment: 'LIVE', paperTrading: false } },
        },
        select: { id: true, userId: true, side: true, type: true, createdAt: true }, orderBy: { createdAt: 'asc' },
      });
      const staleBefore = Date.now() - entryOrderTimeoutMs();
      await forEachConcurrent(orders, schedulerConcurrency('LIVE_ORDER_SYNC_CONCURRENCY'), async (order) => {
        try {
          const synced = await this.execution.syncOrder(order.userId, order.id);
          // An entry buy that has not filled in time is cancelled so the bot can re-evaluate.
          const stillOpen = ['PENDING', 'PARTIALLY_FILLED'].includes(String(synced?.tradingOrder?.status));
          if (stillOpen && order.side === 'BUY' && order.type === 'LIMIT' && order.createdAt.getTime() < staleBefore) {
            await this.execution.cancelStaleEntryOrder(order.userId, order.id);
          }
        } catch (error) {
          this.logger.warn(`Unable to synchronize Binance LIVE order ${order.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    } finally {
      stopRenewal?.();
      if (lock) {
        try { await this.redisLock.release(lock); } catch (error) {
          this.logger.warn(`Failed to release Binance LIVE order-sync lock: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      this.running = false;
    }
  }
}
