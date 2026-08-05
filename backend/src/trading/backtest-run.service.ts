import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BacktestRunStatus,
  BacktestTradeType,
  ExchangeName,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CreateBacktestRunInput = {
  strategyId: string;
  symbol: string;
  interval: string;
  startTime: Date;
  endTime: Date;
  initialCapital: string | number;
  exchange?: ExchangeName;
};

@Injectable()
export class BacktestRunService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: CreateBacktestRunInput) {
    const strategyId = input.strategyId.trim();
    const symbol = input.symbol.trim().toUpperCase();
    const interval = input.interval.trim();
    const initialCapital = new Prisma.Decimal(input.initialCapital);

    if (!strategyId) throw new BadRequestException('Strategy ID is required');
    if (!symbol) throw new BadRequestException('Symbol is required');
    if (!interval) throw new BadRequestException('Interval is required');
    if (Number.isNaN(input.startTime.getTime())) {
      throw new BadRequestException('startTime must be a valid date');
    }
    if (Number.isNaN(input.endTime.getTime())) {
      throw new BadRequestException('endTime must be a valid date');
    }
    if (input.startTime >= input.endTime) {
      throw new BadRequestException('startTime must be before endTime');
    }
    if (!initialCapital.isPositive()) {
      throw new BadRequestException('Initial capital must be positive');
    }

    const strategy = await this.prisma.tradingStrategy.findFirst({
      where: { id: strategyId, userId },
      select: { id: true, symbol: true, exchange: true },
    });
    if (!strategy) throw new NotFoundException('Strategy was not found');

    return this.prisma.backtestRun.create({
      data: {
        userId,
        strategyId: strategy.id,
        exchange: input.exchange ?? strategy.exchange ?? ExchangeName.BINANCE,
        symbol,
        interval,
        startTime: input.startTime,
        endTime: input.endTime,
        initialCapital,
        status: BacktestRunStatus.PENDING,
      },
    });
  }

  list(userId: string, limit = 100) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new BadRequestException(
        'Backtest run limit must be an integer between 1 and 500',
      );
    }

    return this.prisma.backtestRun.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async get(userId: string, runId: string) {
    const normalizedRunId = this.normalizeRunId(runId);
    const run = await this.prisma.backtestRun.findFirst({
      where: { id: normalizedRunId, userId },
      include: {
        strategy: {
          select: {
            maxDcaOrders: true,
            dcaStepPercent: true,
            dcaMultiplier: true,
            takeProfitPercent: true,
            independentFromLevel: true,
          },
        },
      },
    });
    if (!run) throw new NotFoundException('Backtest run was not found');
    return run;
  }

  async report(userId: string, runId: string) {
    const normalizedRunId = this.normalizeRunId(runId);
    const run = await this.prisma.backtestRun.findFirst({
      where: { id: normalizedRunId, userId },
      include: {
        strategy: {
          select: {
            name: true,
            maxDcaOrders: true,
            dcaStepPercent: true,
            dcaMultiplier: true,
            takeProfitPercent: true,
            independentFromLevel: true,
          },
        },
        trades: { orderBy: { executedAt: 'asc' } },
        equityPoints: { orderBy: { recordedAt: 'asc' } },
      },
    });
    if (!run) throw new NotFoundException('Backtest run was not found');

    const exits = run.trades.filter((trade) =>
      [
        BacktestTradeType.PARENT_EXIT,
        BacktestTradeType.INDEPENDENT_EXIT,
      ].includes(trade.type),
    );
    const wins = exits.filter(
      (trade) => trade.realizedPnlQuote?.greaterThan(0) ?? false,
    );
    const losses = exits.filter(
      (trade) => trade.realizedPnlQuote?.lessThan(0) ?? false,
    );
    const grossProfit = wins.reduce(
      (sum, trade) => sum.add(trade.realizedPnlQuote ?? 0),
      new Prisma.Decimal(0),
    );
    const grossLoss = losses.reduce(
      (sum, trade) => sum.add((trade.realizedPnlQuote ?? new Prisma.Decimal(0)).abs()),
      new Prisma.Decimal(0),
    );
    const exitCount = exits.length;
    const winRate = exitCount === 0 ? new Prisma.Decimal(0) : new Prisma.Decimal(wins.length).div(exitCount).mul(100);
    const averageWin = wins.length === 0 ? new Prisma.Decimal(0) : grossProfit.div(wins.length);
    const averageLoss = losses.length === 0 ? new Prisma.Decimal(0) : grossLoss.div(losses.length);
    const profitFactor = grossLoss.isZero() ? null : grossProfit.div(grossLoss);
    const peakEquity = run.equityPoints.reduce(
      (peak, point) => Prisma.Decimal.max(peak, point.equityQuote),
      new Prisma.Decimal(run.initialCapital),
    );
    const maximumDcaLevelUsed = run.trades.reduce(
      (maximum, trade) => Math.max(maximum, trade.level),
      0,
    );
    const independentEntries = run.trades.filter(
      (trade) => trade.type === BacktestTradeType.INDEPENDENT_ENTRY,
    ).length;
    const independentExits = run.trades.filter(
      (trade) => trade.type === BacktestTradeType.INDEPENDENT_EXIT,
    ).length;

    return {
      run,
      analytics: {
        completedExitCount: exitCount,
        winningTradeCount: wins.length,
        losingTradeCount: losses.length,
        winRatePercent: winRate.toFixed(6),
        grossProfitQuote: grossProfit.toFixed(8),
        grossLossQuote: grossLoss.toFixed(8),
        averageWinQuote: averageWin.toFixed(8),
        averageLossQuote: averageLoss.toFixed(8),
        profitFactor: profitFactor?.toFixed(6) ?? null,
        peakEquityQuote: peakEquity.toFixed(8),
        maximumDcaLevelUsed,
        independentEntries,
        independentExits,
      },
    };
  }

  private normalizeRunId(runId: string) {
    const normalizedRunId = runId.trim();
    if (!normalizedRunId) {
      throw new BadRequestException('Backtest run ID is required');
    }
    return normalizedRunId;
  }
}
