import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisLockService, type RedisLock } from '../redis/redis-lock.service';
import { TestnetRunnerHealthService } from './testnet-runner-health.service';
import { TestnetStrategyActionService } from './testnet-strategy-action.service';
import { TestnetStrategyExecutionService } from './testnet-strategy-execution.service';

const RETRY_SCHEDULER_LOCK_KEY = 'hbs:lock:testnet-action-retry-scheduler';
const DEFAULT_RETRY_SCHEDULER_LOCK_TTL_MS = 30_000;

const getRetrySchedulerLockTtlMilliseconds = () => {
  const value = Number.parseInt(process.env.TESTNET_ACTION_RETRY_SCHEDULER_LOCK_TTL_MS ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RETRY_SCHEDULER_LOCK_TTL_MS;
};

@Injectable()
export class TestnetActionRetrySchedulerService {
  private readonly logger = new Logger(TestnetActionRetrySchedulerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly actions: TestnetStrategyActionService,
    private readonly execution: TestnetStrategyExecutionService,
    private readonly redisLock: RedisLockService,
    private readonly health: TestnetRunnerHealthService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async runDueRetries() {
    if (this.running) return;
    this.running = true;
    let lock: RedisLock | null = null;

    try {
      lock = await this.redisLock.acquire(RETRY_SCHEDULER_LOCK_KEY, getRetrySchedulerLockTtlMilliseconds());
      this.health.markRedisAvailable();
      if (!lock) return;

      const dueActions = await this.prisma.strategyAction.findMany({
        where: {
          status: 'FAILED',
          retryable: true,
          nextRetryAt: { lte: new Date() },
          strategy: { status: 'RUNNING', mode: 'BINANCE_TESTNET', environment: 'TESTNET', paperTrading: false },
        },
        include: { strategy: true, position: true, subPosition: true, order: true },
        orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }],
        take: 50,
      });

      let retried = 0;
      let failed = 0;
      for (const action of dueActions) {
        try {
          if (action.order?.status === 'PENDING' || action.order?.status === 'PARTIALLY_FILLED') {
            continue;
          }
          const claimed = await this.actions.claimRetry(action.id);
          if (!claimed) continue;
          await this.execution.executeMarketOrder(action.userId, {
            strategyId: action.strategyId,
            side: action.side,
            quantity: Number(action.quantity ?? 0),
            actionType: action.type,
            actionKey: action.actionKey,
            level: action.level,
            triggerPrice: action.triggerPrice ? Number(action.triggerPrice) : null,
            orderType: action.side === 'BUY' ? 'LIMIT' : 'MARKET',
            limitPrice: action.side === 'BUY' && action.triggerPrice ? Number(action.triggerPrice) : null,
            allowRunningStrategy: true,
            retryActionId: action.id,
          });
          retried += 1;
        } catch (error: unknown) {
          failed += 1;
          this.health.markError(error);
          try {
            await this.actions.markFailed(action.id, error);
          } catch (markError) {
            this.health.markError(markError);
            this.logger.error(`Failed to persist retry outcome for Testnet action ${action.id}`, markError instanceof Error ? markError.stack : String(markError));
          }
        }
      }

      this.health.markRetryTick();
      if (retried > 0) this.logger.log(`Retried ${retried} due Binance Testnet action(s)`);
      if (failed > 0) this.logger.warn(`${failed} Binance Testnet retry attempt(s) failed`);
    } catch (error: unknown) {
      this.health.markRedisUnavailable(error);
      this.health.markError(error);
      this.logger.error('Scheduled Binance Testnet action retry processing failed', error instanceof Error ? error.stack : String(error));
    } finally {
      if (lock) {
        try {
          await this.redisLock.release(lock);
        } catch (error: unknown) {
          this.health.markError(error);
          this.logger.warn(`Failed to release Testnet retry scheduler lock: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      this.running = false;
    }
  }
}
