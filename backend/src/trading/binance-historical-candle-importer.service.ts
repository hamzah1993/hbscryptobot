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
  maxPages?: number;
};

export type BinanceHistoricalCandleImportResult = {
  symbol: string;
  interval: BinanceKlineInterval;
  requestedPerPage: number;
  imported: number;
  pages: number;
  startTime?: number;
  endTime?: number;
};

@Injectable()
export class BinanceHistoricalCandleImporterService {
  constructor(
    private readonly binance: BinanceService,
    private readonly ingestion: HistoricalCandleIngestionService,
  ) {}

  async import(
    request: BinanceHistoricalCandleImportRequest,
  ): Promise<BinanceHistoricalCandleImportResult> {
    const symbol = request.symbol.trim().toUpperCase();
    if (!symbol) throw new BadRequestException('Symbol is required');

    const interval = request.interval ?? '5m';
    const limit = request.limit ?? 200;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new BadRequestException(
        'Candle import limit must be an integer between 1 and 1000',
      );
    }

    const maxPages = request.maxPages ?? 1;
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) {
      throw new BadRequestException(
        'Candle import maxPages must be an integer between 1 and 100',
      );
    }

    let cursor = request.startTime;
    let imported = 0;
    let pages = 0;

    while (pages < maxPages) {
      const klines = await this.binance.getKlines(
        symbol,
        interval,
        limit,
        'live',
        {
          startTime: cursor,
          endTime: request.endTime,
        },
      );

      if (klines.length === 0) break;

      imported += await this.ingestion.upsertMany(
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
      pages += 1;

      if (klines.length < limit) break;

      const nextCursor = klines[klines.length - 1].closeTime + 1;
      if (
        nextCursor <= (cursor ?? -1) ||
        (request.endTime !== undefined && nextCursor > request.endTime)
      ) {
        break;
      }
      cursor = nextCursor;
    }

    return {
      symbol,
      interval,
      requestedPerPage: limit,
      imported,
      pages,
      startTime: request.startTime,
      endTime: request.endTime,
    };
  }
}
