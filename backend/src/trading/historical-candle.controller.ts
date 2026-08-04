import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  BinanceHistoricalCandleImporterService,
  type BinanceHistoricalCandleImportRequest,
} from './binance-historical-candle-importer.service';

@Controller('historical-candles')
@UseGuards(JwtAuthGuard)
export class HistoricalCandleController {
  constructor(
    private readonly importer: BinanceHistoricalCandleImporterService,
  ) {}

  @Post('binance/import')
  importBinanceCandles(@Body() body: BinanceHistoricalCandleImportRequest) {
    return this.importer.import(body);
  }
}
