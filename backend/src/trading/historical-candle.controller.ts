import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  BinanceHistoricalCandleImporterService,
  type BinanceHistoricalCandleImportRequest,
} from './binance-historical-candle-importer.service';
import { HistoricalCandleQueryService } from './historical-candle-query.service';

@Controller('historical-candles')
@UseGuards(JwtAuthGuard)
export class HistoricalCandleController {
  constructor(
    private readonly importer: BinanceHistoricalCandleImporterService,
    private readonly queryService: HistoricalCandleQueryService,
  ) {}

  @Post('binance/import')
  importBinanceCandles(@Body() body: BinanceHistoricalCandleImportRequest) {
    return this.importer.import(body);
  }

  @Get()
  listCandles(
    @Query('symbol') symbol?: string,
    @Query('interval') interval?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('limit') limit?: string,
  ) {
    if (!symbol) throw new BadRequestException('Symbol is required');
    if (!interval) throw new BadRequestException('Interval is required');

    return this.queryService.list({
      symbol,
      interval,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      limit: limit === undefined ? undefined : Number(limit),
    });
  }
}
