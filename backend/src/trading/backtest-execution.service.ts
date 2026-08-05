import { Injectable, NotFoundException } from '@nestjs/common';
import { BacktestRunStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  BacktestSimulationEquityPoint,
  BacktestSimulationResult,
  BacktestSimulationTrade,
} from './backtest-buy-hold-simulator.service';

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

  private tradeData(runId: string, trade: BacktestSimulationTrade) {
    return {
      runId,
      type: trade.type,
      level: trade.level,
      independent: trade.independent,
      executedAt: trade.executedAt,
      price: new Prisma.Decimal(trade.price),
      quantity: new Prisma.Decimal(trade.quantity),
      quoteAmount: new Prisma.Decimal(trade.quoteAmount),
      feeQuote: new Prisma.Decimal(trade.feeQuote),
      realizedPnlQuote:
        trade.realizedPnlQuote === undefined
          ? null
          : new Prisma.Decimal(trade.realizedPnlQuote),
    };
  }

  private equityData(runId: string, point: BacktestSimulationEquityPoint) {
    return {
      runId,
      recordedAt: point.recordedAt,
      equityQuote: new Prisma.Decimal(point.equityQuote),
      drawdownPercent: new Prisma.Decimal(point.drawdownPercent),
    };
  }

  async persistEvents(
    runId: string,
    trades: BacktestSimulationTrade[] = [],
    equityPoints: BacktestSimulationEquityPoint[] = [],
  ) {
    const normalizedRunId = runId.trim();

    return this.prisma.$transaction(async (tx) => {
      await tx.backtestTrade.deleteMany({ where: { runId: normalizedRunId } });
      await tx.backtestEquityPoint.deleteMany({
        where: { runId: normalizedRunId },
      });

      if (trades.length > 0) {
        await tx.backtestTrade.createMany({
          data: trades.map((trade) => this.tradeData(normalizedRunId, trade)),
        });
      }

      if (equityPoints.length > 0) {
        await tx.backtestEquityPoint.createMany({
          data: equityPoints.map((point) =>
            this.equityData(normalizedRunId, point),
          ),
        });
      }

      return {
        tradeCount: trades.length,
        equityPointCount: equityPoints.length,
      };
    });
  }

  async complete(runId: string, result: BacktestSimulationResult) {
    const normalizedRunId = runId.trim();
    const completedAt = new Date();
    const {
      trades = [],
      equityPoints = [],
      endingCapital,
      realizedPnlQuote,
      returnPercent,
      maxDrawdownPercent,
      tradeCount,
    } = result;

    await this.persistEvents(normalizedRunId, trades, equityPoints);

    const transition = await this.prisma.backtestRun.updateMany({
      where: {
        id: normalizedRunId,
        status: BacktestRunStatus.RUNNING,
      },
      data: {
        status: BacktestRunStatus.COMPLETED,
        endingCapital,
        realizedPnlQuote,
        returnPercent,
        maxDrawdownPercent,
        tradeCount,
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
