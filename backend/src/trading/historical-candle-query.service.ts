import { BadRequestException, Injectable } from '@nestjs/common';
import { ExchangeName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type HistoricalCandleQuery = {
  exchange?: ExchangeName;
  symbol: string;
  interval: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
};

@Injectable()
export class HistoricalCandleQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: HistoricalCandleQuery) {
    const symbol = query.symbol.trim().toUpperCase();
    const interval = query.interval.trim();
    const limit = query.limit ?? 1000;

    if (!symbol) throw new BadRequestException('Symbol is required');
    if (!interval) throw new BadRequestException('Interval is required');
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
      throw new BadRequestException(
        'Historical candle limit must be an integer between 1 and 5000',
      );
    }
    if (query.startTime && Number.isNaN(query.startTime.getTime())) {
      throw new BadRequestException('startTime must be a valid date');
    }
    if (query.endTime && Number.isNaN(query.endTime.getTime())) {
      throw new BadRequestException('endTime must be a valid date');
    }
    if (query.startTime && query.endTime && query.startTime > query.endTime) {
      throw new BadRequestException('startTime cannot be after endTime');
    }

    return this.prisma.historicalCandle.findMany({
      where: {
        exchange: query.exchange ?? ExchangeName.BINANCE,
        symbol,
        interval,
        openTime: {
          gte: query.startTime,
          lte: query.endTime,
        },
      },
      orderBy: { openTime: 'asc' },
      take: limit,
    });
  }
}
