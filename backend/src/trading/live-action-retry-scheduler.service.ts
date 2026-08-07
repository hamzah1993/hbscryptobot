import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisLockService, type RedisLock } from '../redis/redis-lock.service';
import { RiskAwareLiveStrategyExecutionService } from './risk-aware-live-strategy-execution.service';
import { TestnetStrategyActionService } from './testnet-strategy-action.service';
import { MaintenanceService } from '../admin/maintenance.service';
import { SystemHeartbeatService } from '../admin/system-heartbeat.service';

const LIVE_RETRY_LOCK_KEY = 'hbs:lock:binance-live-action-retry';

@Injectable()
export class LiveActionRetrySchedulerService {
  private readonly logger = new Logger(LiveActionRetrySchedulerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly actions: TestnetStrategyActionService,
    private readonly execution: RiskAwareLiveStrategyExecutionService,
    private readonly redisLock: RedisLockService,
    private readonly maintenance?: MaintenanceService,
    private readonly heartbeat?: SystemHeartbeatService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async runDueLiveRetries() {
    this.heartbeat?.mark('liveRetryScheduler');
    if (this.running) return;
    if (await this.maintenance?.isActive()) return;
    this.running = true;
    let lock: RedisLock | null = null;
    try {
      lock = await this.redisLock.acquire(LIVE_RETRY_LOCK_KEY, 30_000);
      if (!lock) return;
      const dueActions = await this.prisma.strategyAction.findMany({
        where: {
          status: 'FAILED', retryable: true, nextRetryAt: { lte: new Date() },
          strategy: { status: 'RUNNING', mode: 'BINANCE_LIVE', exchange: 'BINANCE', environment: 'LIVE', paperTrading: false },
        },
        include: { strategy: true, position: true, subPosition: true, order: true },
        orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }], take: 50,
      });

      for (const action of dueActions) {
        if (action.order?.status === 'PENDING' || action.order?.status === 'PARTIALLY_FILLED') continue;
        const claimed = await this.actions.claimRetry(action.id);
        if (!claimed) continue;
        try {
          await this.execution.executeMarketOrder(action.userId, {
            strategyId: action.strategyId, side: action.side, quantity: Number(action.quantity ?? 0),
            actionType: action.type, actionKey: action.actionKey, level: action.level,
            triggerPrice: action.triggerPrice ? Number(action.triggerPrice) : null,
            orderType: action.side === 'BUY' ? 'LIMIT' : 'MARKET',
            limitPrice: action.side === 'BUY' && action.triggerPrice ? Number(action.triggerPrice) : null,
            allowRunningStrategy: true, retryActionId: action.id,
          });
        } catch (error) {
          await this.actions.markFailed(action.id, error);
          this.logger.warn(`Binance LIVE retry ${action.id} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } finally {
      if (lock) {
        try { await this.redisLock.release(lock); } catch (error) {
          this.logger.warn(`Failed to release Binance LIVE retry lock: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      this.running = false;
    }
  }
}
