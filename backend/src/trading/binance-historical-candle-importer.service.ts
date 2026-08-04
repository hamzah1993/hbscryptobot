import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BinanceService,
  type BinanceKlineInterval,
} from '../exchange/binance/binance.service';
import { HistoricalCandleIngestionService } from './historical-candle-ingestion.service';

export type BinanceHistoricalCandleImportRequest = {
  symbol: string;
  interval?: BinanceKlineInterval;
  limit?: number;
  startTime?: number;
  endTime?: number;
};

export type BinanceHistoricalCandleImportResult = {
  symbol: string;
  interval: BinanceKlineInterval;
  requested: number;
  imported: number;
  startTime?: number;
  endTime?: number;
};

@Injectable()
export class BinanceHistoricalCandleImporterService {
  constructor(
    private readonly binance: BinanceService,
    private readonly ingestion: HistoricalCandleIngestionService,
  ) {}

  async import(request: BinanceHistoricalCandleImportRequest): Promise<BinanceHistoricalCandleImportResult> {
    const symbol = request.symbol.trim().toUpperCase();
    if (!symbol) throw new BadRequestException('Symbol is required');

    const interval = request.interval ?? '5m';
    const limit = request.limit ?? 200;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new BadRequestException('Candle import limit must be an integer between 1 and 1000');
    }

    const klines = await this.binance.getKlines(symbol, interval, limit, 'live', {
      startTime: request.startTime,
      endTime: request.endTime,
    });
    const imported = await this.ingestion.upsertMany(
      klines.map((kline) => ({
        symbol,
        interval,
        openTime: new Date(kline.openTime),
        closeTime: new Date(kline.closeTime),
        open: kline.open,
        high: kline.high,
        low: kline.low,
        close: kline.close,
        volume: kline.volume,
      })),
    );

    return {
      symbol,
      interval,
      requested: limit,
      imported,
      startTime: request.startTime,
      endTime: request.endTime,
    };
  }
}
