import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BacktestRunStatus,
  BacktestStrategyMode,
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
  strategyMode?: BacktestStrategyMode;
};

@Injectable()
export class BacktestRunService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: CreateBacktestRunInput) {
    const strategyId = input.strategyId.trim();
    const symbol = input.symbol.trim().toUpperCase();
    const interval = input.interval.trim();
    const initialCapital = new Prisma.Decimal(input.initialCapital);
    const strategyMode = input.strategyMode ?? BacktestStrategyMode.DCA_SUB_POSITIONS;

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
    if (initialCapital.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Initial capital must be positive');
    }
    if (!Object.values(BacktestStrategyMode).includes(strategyMode)) {
      throw new BadRequestException('Invalid backtest strategy mode');
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
        strategyMode,
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
            dcaMultipliers: true,
            takeProfitPercent: true,
            subPositionTriggerPercent: true,
            subPositionTakeProfitPercent: true,
            independentFromLevel: true,
            riskBudgetQuote: true,
            baseOrderQuote: true,
            recoveryEnabled: true,
            recoveryMaxOrders: true,
            recoveryStepPercents: true,
            recoveryMultipliers: true,
            recoveryTakeProfitPercent: true,
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

    return { run, analytics: this.analytics(run) };
  }

  async compare(userId: string, runIds: string[]) {
    const normalizedRunIds = Array.from(
      new Set(runIds.map((runId) => this.normalizeRunId(runId))),
    );
    if (normalizedRunIds.length < 2 || normalizedRunIds.length > 10) {
      throw new BadRequestException('Select between 2 and 10 backtest runs');
    }

    const runs = await this.prisma.backtestRun.findMany({
      where: { id: { in: normalizedRunIds }, userId },
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
    if (runs.length !== normalizedRunIds.length) {
      throw new NotFoundException('One or more backtest runs were not found');
    }

    const byId = new Map(runs.map((run) => [run.id, run]));
    return normalizedRunIds.map((runId) => {
      const run = byId.get(runId)!;
      return { run, analytics: this.analytics(run) };
    });
  }

  async exportTradesCsv(userId: string, runId: string) {
    const report = await this.report(userId, runId);
    const rows = [
      [
        'executedAt',
        'type',
        'level',
        'independent',
        'price',
        'quantity',
        'quoteAmount',
        'feeQuote',
        'realizedPnlQuote',
      ],
      ...report.run.trades.map((trade) => [
        trade.executedAt.toISOString(),
        trade.type,
        trade.level,
        trade.independent,
        trade.price.toString(),
        trade.quantity.toString(),
        trade.quoteAmount.toString(),
        trade.feeQuote.toString(),
        trade.realizedPnlQuote?.toString() ?? '',
      ]),
    ];
    return this.toCsv(rows);
  }

  async exportEquityCsv(userId: string, runId: string) {
    const report = await this.report(userId, runId);
    const rows = [
      ['recordedAt', 'equityQuote', 'drawdownPercent'],
      ...report.run.equityPoints.map((point) => [
        point.recordedAt.toISOString(),
        point.equityQuote.toString(),
        point.drawdownPercent.toString(),
      ]),
    ];
    return this.toCsv(rows);
  }

  private analytics(run: {
    initialCapital: Prisma.Decimal;
    trades: Array<{
      type: BacktestTradeType;
      level: number;
      quoteAmount: Prisma.Decimal;
      feeQuote: Prisma.Decimal;
      realizedPnlQuote: Prisma.Decimal | null;
    }>;
    equityPoints: Array<{ equityQuote: Prisma.Decimal; recordedAt: Date }>;
  }) {
    const exits = run.trades.filter(
      (trade) =>
        trade.type === BacktestTradeType.PARENT_EXIT ||
        trade.type === BacktestTradeType.INDEPENDENT_EXIT,
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
      (sum, trade) =>
        sum.add((trade.realizedPnlQuote ?? new Prisma.Decimal(0)).abs()),
      new Prisma.Decimal(0),
    );
    const exitCount = exits.length;
    const winRate =
      exitCount === 0
        ? new Prisma.Decimal(0)
        : new Prisma.Decimal(wins.length).div(exitCount).mul(100);
    const averageWin =
      wins.length === 0 ? new Prisma.Decimal(0) : grossProfit.div(wins.length);
    const averageLoss =
      losses.length === 0
        ? new Prisma.Decimal(0)
        : grossLoss.div(losses.length);
    const profitFactor = grossLoss.isZero() ? null : grossProfit.div(grossLoss);
    const peakEquity = run.equityPoints.reduce(
      (peak, point) => Prisma.Decimal.max(peak, point.equityQuote),
      new Prisma.Decimal(run.initialCapital),
    );
    let runningPeak = new Prisma.Decimal(run.initialCapital);
    let underwaterStartedAt: Date | null = null;
    let longestUnderwaterMs = 0;
    let completedRecoveryMs = 0;
    let completedRecoveries = 0;
    for (const point of run.equityPoints) {
      if (point.equityQuote.greaterThanOrEqualTo(runningPeak)) {
        if (underwaterStartedAt) {
          const duration = point.recordedAt.getTime() - underwaterStartedAt.getTime();
          longestUnderwaterMs = Math.max(longestUnderwaterMs, duration);
          completedRecoveryMs += duration;
          completedRecoveries += 1;
          underwaterStartedAt = null;
        }
        runningPeak = point.equityQuote;
      } else if (!underwaterStartedAt) {
        underwaterStartedAt = point.recordedAt;
      }
    }
    if (underwaterStartedAt && run.equityPoints.length > 0) {
      longestUnderwaterMs = Math.max(
        longestUnderwaterMs,
        run.equityPoints[run.equityPoints.length - 1].recordedAt.getTime() - underwaterStartedAt.getTime(),
      );
    }
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
    const totalFees = run.trades.reduce(
      (sum, trade) => sum.add(trade.feeQuote),
      new Prisma.Decimal(0),
    );
    const entryTrades = run.trades.filter((trade) =>
      trade.type === BacktestTradeType.PARENT_ENTRY ||
      trade.type === BacktestTradeType.INDEPENDENT_ENTRY ||
      trade.type === BacktestTradeType.RECOVERY_ENTRY,
    );
    let parentDeployed = new Prisma.Decimal(0);
    const independentDeployed = new Map<number, Prisma.Decimal>();
    let maximumCapitalDeployed = new Prisma.Decimal(0);
    for (const trade of run.trades) {
      if (trade.type === BacktestTradeType.PARENT_ENTRY || trade.type === BacktestTradeType.RECOVERY_ENTRY) {
        parentDeployed = parentDeployed.add(trade.quoteAmount);
      } else if (trade.type === BacktestTradeType.INDEPENDENT_ENTRY) {
        independentDeployed.set(trade.level, trade.quoteAmount);
      } else if (trade.type === BacktestTradeType.PARENT_EXIT) {
        parentDeployed = new Prisma.Decimal(0);
      } else if (trade.type === BacktestTradeType.INDEPENDENT_EXIT) {
        independentDeployed.delete(trade.level);
      }
      const deployed = Array.from(independentDeployed.values()).reduce(
        (sum, quote) => sum.add(quote),
        parentDeployed,
      );
      maximumCapitalDeployed = Prisma.Decimal.max(maximumCapitalDeployed, deployed);
    }

    return {
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
      entryCount: entryTrades.length,
      totalFeesQuote: totalFees.toFixed(8),
      maximumCapitalDeployedQuote: maximumCapitalDeployed.toFixed(8),
      longestUnderwaterMinutes: Number((longestUnderwaterMs / 60_000).toFixed(2)),
      averageRecoveryMinutes: completedRecoveries === 0
        ? null
        : Number((completedRecoveryMs / completedRecoveries / 60_000).toFixed(2)),
    };
  }

  private toCsv(rows: Array<Array<string | number | boolean>>) {
    return rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');
  }

  private normalizeRunId(runId: string) {
    const normalizedRunId = runId.trim();
    if (!normalizedRunId) {
      throw new BadRequestException('Backtest run ID is required');
    }
    return normalizedRunId;
  }
}
