import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BacktestRunStatus, ExchangeName, Prisma } from '@prisma/client';
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
      throw new BadRequestException('Backtest run limit must be an integer between 1 and 500');
    }

    return this.prisma.backtestRun.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async get(userId: string, runId: string) {
    const normalizedRunId = runId.trim();
    if (!normalizedRunId) throw new BadRequestException('Backtest run ID is required');

    const run = await this.prisma.backtestRun.findFirst({
      where: { id: normalizedRunId, userId },
    });
    if (!run) throw new NotFoundException('Backtest run was not found');
    return run;
  }
}
