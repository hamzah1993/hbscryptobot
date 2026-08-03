import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BinanceService, type BinanceEnvironment } from './binance.service';

@Controller('exchange/binance')
@UseGuards(JwtAuthGuard)
export class BinanceController {
  constructor(private readonly binance: BinanceService) {}

  @Get('time')
  getTime(@Query('environment') environment: BinanceEnvironment = 'testnet') {
    return this.binance.getServerTime(environment);
  }

  @Get('ticker')
  getTicker(
    @Query('symbol') symbol = 'BTCUSDT',
    @Query('environment') environment: BinanceEnvironment = 'testnet',
  ) {
    return this.binance.getTickerPrice(symbol, environment);
  }

  @Post('account/test')
  getAccount(
    @Body() body: { apiKey: string; apiSecret: string; environment?: BinanceEnvironment },
  ) {
    return this.binance.getAccount(body.apiKey, body.apiSecret, body.environment ?? 'testnet');
  }

  @Post('order/test')
  testOrder(
    @Body()
    body: {
      apiKey: string;
      apiSecret: string;
      environment?: BinanceEnvironment;
      symbol: string;
      side: 'BUY' | 'SELL';
      type: 'MARKET' | 'LIMIT';
      quantity: string;
      price?: string;
      timeInForce?: 'GTC' | 'IOC' | 'FOK';
    },
  ) {
    const { apiKey, apiSecret, environment = 'testnet', ...order } = body;
    return this.binance.testOrder(order, apiKey, apiSecret, environment);
  }
}
