import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BacktestRunStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_STALE_BACKTEST_MINUTES = 30;

function staleBacktestMinutes() {
  const configured = Number.parseInt(process.env.STALE_BACKTEST_MINUTES ?? '', 10);
  return Number.isFinite(configured) && configured >= 5
    ? configured
    : DEFAULT_STALE_BACKTEST_MINUTES;
}

@Injectable()
export class BacktestRunRecoveryScheduler {
  private readonly logger = new Logger(BacktestRunRecoveryScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async failStaleRuns() {
    const completedAt = new Date();
    const cutoff = new Date(completedAt.getTime() - staleBacktestMinutes() * 60_000);
    const result = await this.prisma.backtestRun.updateMany({
      where: {
        status: BacktestRunStatus.RUNNING,
        startedAt: { lt: cutoff },
      },
      data: {
        status: BacktestRunStatus.FAILED,
        completedAt,
        errorMessage: 'Backtest exceeded the execution time limit. Create a new run to retry.',
      },
    });

    if (result.count > 0) {
      this.logger.warn(`Marked ${result.count} stale backtest run(s) as failed`);
    }
    return result.count;
  }
}
