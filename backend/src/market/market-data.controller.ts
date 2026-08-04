import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
  ) {
    return this.marketData.getQuote(symbol, environment);
  }
}
