import { Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { BinanceEnvironment } from '../exchange/binance/binance.service';
import {
  BinanceWebsocketMarketDataService,
  type BinanceStreamEnvironment,
} from './binance-websocket-market-data.service';
import { MarketDataService } from './market-data.service';

@Controller('market-data')
@UseGuards(JwtAuthGuard)
export class MarketDataController {
  constructor(
    private readonly marketData: MarketDataService,
    private readonly websocketMarketData: BinanceWebsocketMarketDataService,
  ) {}

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

  @Post('stream/subscribe')
  subscribe(
    @Query('symbol') symbol = 'BTCUSDT',
    @Query('environment') environment: BinanceStreamEnvironment = 'testnet',
  ) {
    return this.websocketMarketData.subscribe(symbol, environment);
  }

  @Delete('stream/subscribe')
  unsubscribe(
    @Query('symbol') symbol = 'BTCUSDT',
    @Query('environment') environment: BinanceStreamEnvironment = 'testnet',
  ) {
    return this.websocketMarketData.unsubscribe(symbol, environment);
  }

  @Get('stream/status')
  getStreamStatus(
    @Query('symbol') symbol = 'BTCUSDT',
    @Query('environment') environment: BinanceStreamEnvironment = 'testnet',
  ) {
    return this.websocketMarketData.getStatus(symbol, environment);
  }

  @Get('stream/price')
  getStreamPrice(
    @Query('symbol') symbol = 'BTCUSDT',
    @Query('environment') environment: BinanceStreamEnvironment = 'testnet',
  ) {
    return {
      symbol: symbol.trim().toUpperCase(),
      environment,
      price: this.websocketMarketData.getLatestPrice(symbol, environment),
    };
  }
}
