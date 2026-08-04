import { Controller, Delete, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { BinanceEnvironment } from '../exchange/binance/binance.service';
import { MarketDataService } from './market-data.service';

@Controller('market-data')
@UseGuards(JwtAuthGuard)
export class MarketDataController {
  constructor(private readonly marketData: MarketDataService) {}

  @Get('quote')
  getQuote(
    @Query('symbol') symbol = 'BTCUSDT',
    @Query('environment') environment: BinanceEnvironment = 'testnet',
    @Query('refresh') refresh = 'false',
  ) {
    return this.marketData.getQuote(symbol, environment, refresh === 'true');
  }

  @Get('cache')
  getCachedQuotes() {
    return this.marketData.getCachedQuotes();
  }

  @Delete('cache')
  clearCache(
    @Query('symbol') symbol?: string,
    @Query('environment') environment?: BinanceEnvironment,
  ) {
    return this.marketData.clearCache(symbol, environment);
  }
}
