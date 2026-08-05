import { Injectable, NotFoundException } from '@nestjs/common';
import { BacktestRunStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BacktestExecutionService {
  constructor(private readonly prisma: PrismaService) {}

  async start(userId: string, runId: string) {
    const run = await this.prisma.backtestRun.findFirst({
      where: {
        id: runId.trim(),
        userId,
        status: BacktestRunStatus.PENDING,
      },
    });

    if (!run) {
      throw new NotFoundException('Pending backtest run was not found');
    }

    return this.prisma.backtestRun.update({
      where: { id: run.id },
      data: {
        status: BacktestRunStatus.RUNNING,
        startedAt: new Date(),
        errorMessage: null,
      },
    });
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
