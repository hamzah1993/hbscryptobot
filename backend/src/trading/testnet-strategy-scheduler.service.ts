import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisLockService, type RedisLock } from '../redis/redis-lock.service';
import { TestnetRunnerHealthService } from './testnet-runner-health.service';
import { TestnetStrategyRunnerService } from './testnet-strategy-runner.service';

const TESTNET_STRATEGY_SCHEDULER_LOCK_KEY = 'hbs:lock:testnet-strategy-scheduler';
const DEFAULT_TESTNET_STRATEGY_SCHEDULER_LOCK_TTL_MS = 30_000;

const getLockTtlMilliseconds = (): number => {
  const value = Number.parseInt(process.env.TESTNET_STRATEGY_SCHEDULER_LOCK_TTL_MS ?? '', 10);
  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_TESTNET_STRATEGY_SCHEDULER_LOCK_TTL_MS;
};

@Injectable()
export class TestnetStrategySchedulerService {
  private readonly logger = new Logger(TestnetStrategySchedulerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: TestnetStrategyRunnerService,
    private readonly redisLock: RedisLockService,
    private readonly health: TestnetRunnerHealthService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async runAutomaticTestnetStrategies() {
    if (this.running) return;

    this.running = true;
    let lock: RedisLock | null = null;

    try {
      try {
        lock = await this.redisLock.acquire(
          TESTNET_STRATEGY_SCHEDULER_LOCK_KEY,
          getLockTtlMilliseconds(),
        );
        this.health.markRedisAvailable();
      } catch (error) {
        this.health.markRedisUnavailable(error);
        throw error;
      }

      if (!lock) return;

      const users = await this.prisma.tradingStrategy.findMany({
        where: {
          status: 'RUNNING',
          mode: 'BINANCE_TESTNET',
          paperTrading: false,
          environment: 'TESTNET',
        },
        select: { userId: true },
        distinct: ['userId'],
        take: 100,
      });

      let opened = 0;
      let errors = 0;

      for (const { userId } of users) {
        const results = await this.runner.runUserStrategies(userId);
        opened += results.filter((result) => result.action === 'OPEN').length;
        errors += results.filter((result) => result.action === 'ERROR').length;
      }

      this.health.markStrategyTick();
      if (opened > 0) this.logger.log(`Opened ${opened} automatic Binance testnet position(s)`);
      if (errors > 0) this.logger.warn(`${errors} automatic Binance testnet strategy tick(s) failed`);
    } catch (error) {
      this.health.markError(error);
      this.logger.error(
        'Scheduled automatic Binance testnet strategy execution failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      if (lock) {
        try {
          await this.redisLock.release(lock);
        } catch (error) {
          this.health.markRedisUnavailable(error);
          this.health.markError(error);
          this.logger.warn(
            `Failed to release the Testnet strategy scheduler lock: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      this.running = false;
    }
  }
}
