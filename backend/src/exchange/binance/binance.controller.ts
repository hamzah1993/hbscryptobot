import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ExchangeEnvironment } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ExchangeCredentialsService } from '../credentials/exchange-credentials.service';
import { BinanceService, type BinanceEnvironment } from './binance.service';

type AuthenticatedRequest = Request & { user: { sub: string } };

@Controller('exchange/binance')
@UseGuards(JwtAuthGuard)
export class BinanceController {
  constructor(
    private readonly binance: BinanceService,
    private readonly credentials: ExchangeCredentialsService,
  ) {}

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
  async getAccount(
    @Req() request: AuthenticatedRequest,
    @Body() body: { environment?: BinanceEnvironment },
  ) {
    const environment = body.environment ?? 'testnet';
    const credentialEnvironment =
      environment === 'live' ? ExchangeEnvironment.LIVE : ExchangeEnvironment.TESTNET;
    const credential = await this.credentials.getBinance(request.user.sub, credentialEnvironment);
    return this.binance.getAccount(
      credential.apiKey,
      credential.apiSecret,
      environment,
    );
  }

  @Post('order/test')
  async testOrder(
    @Req() request: AuthenticatedRequest,
    @Body()
    body: {
      environment?: BinanceEnvironment;
      symbol: string;
      side: 'BUY' | 'SELL';
      type: 'MARKET' | 'LIMIT';
      quantity: string;
      price?: string;
      timeInForce?: 'GTC' | 'IOC' | 'FOK';
    },
  ) {
    const { environment = 'testnet', ...order } = body;
    const credentialEnvironment =
      environment === 'live' ? ExchangeEnvironment.LIVE : ExchangeEnvironment.TESTNET;
    const credential = await this.credentials.getBinance(request.user.sub, credentialEnvironment);
    return this.binance.testOrder(
      order,
      credential.apiKey,
      credential.apiSecret,
      environment,
    );
  }
}
