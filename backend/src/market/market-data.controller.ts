import { BadRequestException, Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type {
  BinanceEnvironment,
  BinanceKlineInterval,
} from '../exchange/binance/binance.service';
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

  @Get('candles')
  getCandles(
    @Query('symbol') symbol = 'BTCUSDT',
    @Query('interval') interval: BinanceKlineInterval = '5m',
    @Query('limit') limit = '200',
    @Query('environment') environment: BinanceEnvironment = 'live',
  ) {
    return this.marketData.getCandles(
      symbol,
      interval,
      Number(limit),
      environment,
    );
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

  @Get('stream/prices')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  getStreamPrices(
    @Query('symbols') symbols = 'BTCUSDT',
    @Query('environment') environment: BinanceStreamEnvironment = 'testnet',
  ) {
    const normalizedSymbols = [...new Set(
      symbols
        .split(',')
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean),
    )];

    if (normalizedSymbols.length === 0 || normalizedSymbols.length > 20) {
      throw new BadRequestException('Provide between 1 and 20 market symbols');
    }
    if (normalizedSymbols.some((symbol) => !/^[A-Z0-9]{5,20}$/.test(symbol))) {
      throw new BadRequestException('Market symbols must contain only letters and numbers');
    }

    return {
      environment,
      prices: normalizedSymbols.map((symbol) => ({
        symbol,
        price: this.websocketMarketData.getLatestPrice(symbol, environment),
      })),
    };
  }
}
