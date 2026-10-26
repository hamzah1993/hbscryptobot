import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisLockService, type RedisLock } from '../redis/redis-lock.service';
import { TestnetStrategyRunnerService } from './testnet-strategy-runner.service';
import { MaintenanceService } from '../admin/maintenance.service';
import { SystemHeartbeatService } from '../admin/system-heartbeat.service';
import { forEachConcurrent, keepLockAlive, schedulerConcurrency } from './scheduler-concurrency';

const LIVE_STRATEGY_SCHEDULER_LOCK_KEY = 'hbs:lock:binance-live-strategy-scheduler';
const LOCK_TTL_MS = 30_000;

@Injectable()
export class LiveStrategySchedulerService {
  private readonly logger = new Logger(LiveStrategySchedulerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: TestnetStrategyRunnerService,
    private readonly redisLock: RedisLockService,
    private readonly maintenance?: MaintenanceService,
    private readonly heartbeat?: SystemHeartbeatService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async runAutomaticLiveStrategies() {
    this.heartbeat?.mark('liveStrategyScheduler');
    if (this.running) return;
    if (await this.maintenance?.isActive()) return;
    this.running = true;
    let lock: RedisLock | null = null;
    let stopRenewal: (() => void) | null = null;
    try {
      lock = await this.redisLock.acquire(LIVE_STRATEGY_SCHEDULER_LOCK_KEY, LOCK_TTL_MS);
      if (!lock) return;
      stopRenewal = keepLockAlive(this.redisLock, lock, LOCK_TTL_MS);
      // Every user with a running bot, several users in parallel; one user's bots stay sequential.
      const users = await this.prisma.tradingStrategy.findMany({
        where: {
          status: 'RUNNING', mode: 'BINANCE_LIVE', exchange: 'BINANCE',
          paperTrading: false, environment: 'LIVE',
        },
        select: { userId: true }, distinct: ['userId'],
      });

      let errors = 0;
      await forEachConcurrent(users, schedulerConcurrency('LIVE_STRATEGY_CONCURRENCY'), async ({ userId }) => {
        try {
          const results = await this.runner.runUserStrategies(userId, 'LIVE');
          errors += results.filter((result) => result.action === 'ERROR').length;
        } catch (error) {
          errors += 1;
          this.logger.error(`Binance LIVE strategies for user ${userId} failed closed`, error instanceof Error ? error.stack : String(error));
        }
      });
      if (errors) this.logger.warn(`${errors} Binance LIVE strategy tick(s) were blocked or failed`);
    } catch (error) {
      this.logger.error('Scheduled Binance LIVE execution failed closed', error instanceof Error ? error.stack : String(error));
    } finally {
      stopRenewal?.();
      if (lock) {
        try { await this.redisLock.release(lock); } catch (error) {
          this.logger.warn(`Failed to release Binance LIVE scheduler lock: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      this.running = false;
    }
  }
}
