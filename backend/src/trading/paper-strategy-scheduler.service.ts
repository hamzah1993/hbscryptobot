import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisLockService, type RedisLock } from '../redis/redis-lock.service';
import { PaperStrategyRunnerService } from './paper-strategy-runner.service';

const PAPER_STRATEGY_SCHEDULER_LOCK_KEY = 'hbs:lock:paper-strategy-scheduler';
const DEFAULT_PAPER_STRATEGY_SCHEDULER_LOCK_TTL_MS = 30_000;

const getLockTtlMilliseconds = (): number => {
  const value = Number.parseInt(process.env.PAPER_STRATEGY_SCHEDULER_LOCK_TTL_MS ?? '', 10);
  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_PAPER_STRATEGY_SCHEDULER_LOCK_TTL_MS;
};

@Injectable()
export class PaperStrategySchedulerService {
  private readonly logger = new Logger(PaperStrategySchedulerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: PaperStrategyRunnerService,
    private readonly redisLock: RedisLockService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async runScheduledPaperTick() {
    if (this.running) return;

    this.running = true;
    let lock: RedisLock | null = null;

    try {
      lock = await this.redisLock.acquire(
        PAPER_STRATEGY_SCHEDULER_LOCK_KEY,
        getLockTtlMilliseconds(),
      );

      if (!lock) return;

      const users = await this.prisma.tradingStrategy.findMany({
        where: { status: 'RUNNING', paperTrading: true },
        distinct: ['userId'],
        select: { userId: true },
      });

      for (const { userId } of users) {
        const results = await this.runner.runUserStrategies(userId);
        const actionable = results.filter(
          (result) => result.action !== 'HOLD' && result.action !== 'SKIP',
        );
        if (actionable.length > 0) {
          this.logger.log(
            `Processed ${actionable.length} paper strategy action(s) for user ${userId}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Scheduled paper strategy tick failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      if (lock) {
        try {
          await this.redisLock.release(lock);
        } catch (error) {
          this.logger.warn(
            `Failed to release the paper strategy scheduler lock: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      this.running = false;
    }
  }
}
