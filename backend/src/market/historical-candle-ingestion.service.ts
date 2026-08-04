import { Injectable } from '@nestjs/common';
import { ExchangeName, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type HistoricalCandleInput = {
  exchange?: ExchangeName;
  symbol: string;
  interval: string;
  openTime: Date;
  closeTime: Date;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: string | number;
};

@Injectable()
export class HistoricalCandleIngestionService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertMany(candles: HistoricalCandleInput[]): Promise<number> {
    if (candles.length === 0) return 0;

    const normalized = candles.map((candle) => ({
      exchange: candle.exchange ?? ExchangeName.BINANCE,
      symbol: candle.symbol.trim().toUpperCase(),
      interval: candle.interval.trim(),
      openTime: candle.openTime,
      closeTime: candle.closeTime,
      open: new Prisma.Decimal(candle.open),
      high: new Prisma.Decimal(candle.high),
      low: new Prisma.Decimal(candle.low),
      close: new Prisma.Decimal(candle.close),
      volume: new Prisma.Decimal(candle.volume),
    }));

    await this.prisma.$transaction(
      normalized.map((candle) =>
        this.prisma.historicalCandle.upsert({
          where: {
            exchange_symbol_interval_openTime: {
              exchange: candle.exchange,
              symbol: candle.symbol,
              interval: candle.interval,
              openTime: candle.openTime,
            },
          },
          create: candle,
          update: {
            closeTime: candle.closeTime,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
          },
        }),
      ),
    );

    return normalized.length;
  }
}
