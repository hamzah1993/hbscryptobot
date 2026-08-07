import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisLockService, type RedisLock } from '../redis/redis-lock.service';
import { TestnetStrategyRunnerService } from './testnet-strategy-runner.service';
import { MaintenanceService } from '../admin/maintenance.service';
import { SystemHeartbeatService } from '../admin/system-heartbeat.service';

const LIVE_STRATEGY_SCHEDULER_LOCK_KEY = 'hbs:lock:binance-live-strategy-scheduler';

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
    try {
      lock = await this.redisLock.acquire(LIVE_STRATEGY_SCHEDULER_LOCK_KEY, 30_000);
      if (!lock) return;
      const users = await this.prisma.tradingStrategy.findMany({
        where: {
          status: 'RUNNING', mode: 'BINANCE_LIVE', exchange: 'BINANCE',
          paperTrading: false, environment: 'LIVE',
        },
        select: { userId: true }, distinct: ['userId'], take: 100,
      });

      for (const { userId } of users) {
        const results = await this.runner.runUserStrategies(userId, 'LIVE');
        const errors = results.filter((result) => result.action === 'ERROR').length;
        if (errors) this.logger.warn(`${errors} Binance LIVE strategy tick(s) were blocked or failed`);
      }
    } catch (error) {
      this.logger.error('Scheduled Binance LIVE execution failed closed', error instanceof Error ? error.stack : String(error));
    } finally {
      if (lock) {
        try { await this.redisLock.release(lock); } catch (error) {
          this.logger.warn(`Failed to release Binance LIVE scheduler lock: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      this.running = false;
    }
  }
}
