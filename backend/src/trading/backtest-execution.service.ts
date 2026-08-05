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
    const normalizedRunId = runId.trim();
    const completedAt = new Date();
    const transition = await this.prisma.backtestRun.updateMany({
      where: {
        id: normalizedRunId,
        status: BacktestRunStatus.RUNNING,
      },
      data: {
        status: BacktestRunStatus.COMPLETED,
        ...result,
        completedAt,
        errorMessage: null,
      },
    });

    if (transition.count !== 1) {
      throw new NotFoundException('Running backtest run was not found');
    }

    const run = await this.prisma.backtestRun.findFirst({
      where: {
        id: normalizedRunId,
        status: BacktestRunStatus.COMPLETED,
        completedAt,
      },
    });

    if (!run) {
      throw new NotFoundException('Completed backtest run was not found');
    }

    return run;
  }

  async fail(runId: string, error: unknown) {
    const normalizedRunId = runId.trim();
    const completedAt = new Date();
    const message =
      error instanceof Error ? error.message : 'Backtest execution failed';
    const transition = await this.prisma.backtestRun.updateMany({
      where: {
        id: normalizedRunId,
        status: BacktestRunStatus.RUNNING,
      },
      data: {
        status: BacktestRunStatus.FAILED,
        errorMessage: message,
        completedAt,
      },
    });

    if (transition.count !== 1) {
      throw new NotFoundException('Running backtest run was not found');
    }

    const run = await this.prisma.backtestRun.findFirst({
      where: {
        id: normalizedRunId,
        status: BacktestRunStatus.FAILED,
        completedAt,
      },
    });

    if (!run) {
      throw new NotFoundException('Failed backtest run was not found');
    }

    return run;
  }
}
