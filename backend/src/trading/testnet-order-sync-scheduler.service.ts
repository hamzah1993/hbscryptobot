import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisLockService, type RedisLock } from '../redis/redis-lock.service';
import { TestnetRunnerHealthService } from './testnet-runner-health.service';
import { TestnetStrategyActionService } from './testnet-strategy-action.service';
import { TestnetStrategyExecutionService } from './testnet-strategy-execution.service';

const TESTNET_ORDER_SYNC_SCHEDULER_LOCK_KEY = 'hbs:lock:testnet-order-sync-scheduler';
const DEFAULT_TESTNET_ORDER_SYNC_SCHEDULER_LOCK_TTL_MS = 30_000;

const getLockTtlMilliseconds = (): number => {
  const value = Number.parseInt(process.env.TESTNET_ORDER_SYNC_SCHEDULER_LOCK_TTL_MS ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TESTNET_ORDER_SYNC_SCHEDULER_LOCK_TTL_MS;
};

@Injectable()
export class TestnetOrderSyncSchedulerService {
  private readonly logger = new Logger(TestnetOrderSyncSchedulerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly testnetExecution: TestnetStrategyExecutionService,
    private readonly testnetActions: TestnetStrategyActionService,
    private readonly redisLock: RedisLockService,
    private readonly health: TestnetRunnerHealthService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async syncOpenTestnetOrders() {
    if (this.running) return;
    this.running = true;
    let lock: RedisLock | null = null;

    try {
      lock = await this.redisLock.acquire(TESTNET_ORDER_SYNC_SCHEDULER_LOCK_KEY, getLockTtlMilliseconds());
      this.health.markRedisAvailable();
      if (!lock) return;

      const orders = await this.prisma.tradingOrder.findMany({
        where: {
          status: { in: ['PENDING', 'PARTIALLY_FILLED'] },
          exchangeOrderId: { not: null },
          position: { strategy: { mode: 'BINANCE_TESTNET', paperTrading: false, environment: 'TESTNET' } },
        },
        select: { id: true, userId: true },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });

      let synced = 0;
      for (const order of orders) {
        try {
          await this.testnetExecution.syncOrder(order.userId, order.id);
          synced += 1;
        } catch (error) {
          this.health.markError(error);
          this.logger.warn(`Unable to synchronize testnet order ${order.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const recoverableActions = await this.testnetActions.listRecoverable(100);
      let recovered = 0;
      for (const action of recoverableActions) {
        try {
          if (!action.order) continue;
          if (action.order.status === 'FILLED') {
            await this.testnetActions.markCompleted(action.id);
            recovered += 1;
            continue;
          }
          if (['CANCELLED', 'REJECTED', 'FAILED'].includes(action.order.status)) {
            await this.testnetActions.markFailed(action.id, action.order.errorMessage ?? `Exchange order ended with ${action.order.status}`);
            recovered += 1;
          }
        } catch (error) {
          this.health.markError(error);
          this.logger.warn(`Unable to recover testnet strategy action ${action.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      this.health.markOrderSync();
      if (synced > 0) this.logger.log(`Synchronized ${synced} Binance testnet order(s)`);
      if (recovered > 0) this.logger.log(`Recovered ${recovered} Binance testnet strategy action(s)`);
    } catch (error) {
      this.health.markRedisUnavailable(error);
      this.health.markError(error);
      this.logger.error('Scheduled Binance testnet order synchronization failed', error instanceof Error ? error.stack : String(error));
    } finally {
      if (lock) {
        try {
          await this.redisLock.release(lock);
        } catch (error) {
          this.health.markError(error);
          this.logger.warn(`Failed to release the Testnet order sync scheduler lock: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      this.running = false;
    }
  }
}
