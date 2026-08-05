import { Injectable, NotFoundException } from '@nestjs/common';
import { BacktestRunStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BacktestExecutionService {
  constructor(private readonly prisma: PrismaService) {}

  async start(userId: string, runId: string) {
    const normalizedRunId = runId.trim();
    const startedAt = new Date();
    const transition = await this.prisma.backtestRun.updateMany({
      where: {
        id: normalizedRunId,
        userId,
        status: BacktestRunStatus.PENDING,
      },
      data: {
        status: BacktestRunStatus.RUNNING,
        startedAt,
        errorMessage: null,
      },
    });

    if (transition.count !== 1) {
      throw new NotFoundException('Pending backtest run was not found');
    }

    const run = await this.prisma.backtestRun.findFirst({
      where: {
        id: normalizedRunId,
        userId,
        status: BacktestRunStatus.RUNNING,
        startedAt,
      },
    });

    if (!run) {
      throw new NotFoundException('Started backtest run was not found');
    }

    return run;
  }

  async complete(
    runId: string,
    result: {
      endingCapital: string | number;
      realizedPnlQuote: string | number;
      returnPercent: string | number;
      maxDrawdownPercent: string | number;
      tradeCount: number;
    },
  ) {
    return this.prisma.backtestRun.update({
      where: { id: runId },
      data: {
        status: BacktestRunStatus.COMPLETED,
        ...result,
        completedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  async fail(runId: string, error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Backtest execution failed';

    return this.prisma.backtestRun.update({
      where: { id: runId },
      data: {
        status: BacktestRunStatus.FAILED,
        errorMessage: message,
        completedAt: new Date(),
      },
    });
  }
}
