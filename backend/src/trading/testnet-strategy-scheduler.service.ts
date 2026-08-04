import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TestnetStrategyRunnerService } from './testnet-strategy-runner.service';

@Injectable()
export class TestnetStrategySchedulerService {
  private readonly logger = new Logger(TestnetStrategySchedulerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: TestnetStrategyRunnerService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async runAutomaticTestnetStrategies() {
    if (this.running) return;

    this.running = true;
    try {
      const users = await this.prisma.tradingStrategy.findMany({
        where: {
          status: 'RUNNING',
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

      if (opened > 0) {
        this.logger.log(`Opened ${opened} automatic Binance testnet position(s)`);
      }
      if (errors > 0) {
        this.logger.warn(`${errors} automatic Binance testnet strategy tick(s) failed`);
      }
    } catch (error) {
      this.logger.error(
        'Scheduled automatic Binance testnet strategy execution failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
