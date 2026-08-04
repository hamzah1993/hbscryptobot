import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisLockService } from '../redis/redis-lock.service';
import { PaperStrategyRunnerService } from './paper-strategy-runner.service';

const PAPER_STRATEGY_SCHEDULER_LOCK_KEY = 'hbs:lock:paper-strategy-scheduler';
const PAPER_STRATEGY_SCHEDULER_LOCK_TTL_MS = 30_000;

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
    const lock = await this.redisLock.acquire(
      PAPER_STRATEGY_SCHEDULER_LOCK_KEY,
      PAPER_STRATEGY_SCHEDULER_LOCK_TTL_MS,
    );

    if (!lock) {
      this.running = false;
      return;
    }

    try {
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
      await this.redisLock.release(lock);
      this.running = false;
    }
  }
}
