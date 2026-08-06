import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ExchangeEnvironment, ExchangeName } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ExchangeAccountManagementService } from './exchange-account-management.service';
import { ExchangeCredentialsService } from './exchange-credentials.service';

type AuthenticatedRequest = Request & { user: { sub: string } };

@Controller('exchange/credentials')
@UseGuards(JwtAuthGuard)
export class ExchangeCredentialsController {
  constructor(
    private readonly credentials: ExchangeCredentialsService,
    private readonly accounts: ExchangeAccountManagementService,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.credentials.list(request.user.sub);
  }

  @Post('binance')
  upsertBinance(
    @Req() request: AuthenticatedRequest,
    @Body()
    body: {
      apiKey: string;
      apiSecret: string;
      environment?: ExchangeEnvironment;
    },
  ) {
    this.accounts.assertTestnetOnly(body.environment);
    return this.credentials.upsertBinance(
      request.user.sub,
      body.apiKey,
      body.apiSecret,
      ExchangeEnvironment.TESTNET,
    );
  }

  @Post('binance/testnet/test-connection')
  testBinanceTestnetConnection(@Req() request: AuthenticatedRequest) {
    return this.accounts.testBinanceTestnetConnection(request.user.sub);
  }

  @Post('bybit')
  upsertBybit(
    @Req() request: AuthenticatedRequest,
    @Body() body: { apiKey: string; apiSecret: string },
  ) {
    return this.credentials.upsertBybit(
      request.user.sub,
      body.apiKey,
      body.apiSecret,
      ExchangeEnvironment.TESTNET,
    );
  }

  @Post('okx')
  upsertOkx(
    @Req() request: AuthenticatedRequest,
    @Body() body: { apiKey: string; apiSecret: string; passphrase: string },
  ) {
    return this.credentials.upsertOkx(
      request.user.sub,
      body.apiKey,
      body.apiSecret,
      body.passphrase,
      ExchangeEnvironment.TESTNET,
    );
  }

  @Get('binance/testnet/balances')
  getBinanceTestnetBalances(@Req() request: AuthenticatedRequest) {
    return this.accounts.getBinanceTestnetBalances(request.user.sub);
  }

  @Delete('binance/:environment')
  removeBinance(
    @Req() request: AuthenticatedRequest,
    @Param('environment') environment: ExchangeEnvironment,
  ) {
    this.accounts.assertTestnetOnly(environment);
    return this.credentials.removeBinance(
      request.user.sub,
      ExchangeEnvironment.TESTNET,
    );
  }

  @Delete(':exchange/demo')
  removeDemo(
    @Req() request: AuthenticatedRequest,
    @Param('exchange') exchange: string,
  ) {
    const normalized = exchange.trim().toUpperCase();
    if (normalized !== 'BYBIT' && normalized !== 'OKX') {
      throw new BadRequestException('Only Bybit and OKX Demo credentials can be removed here');
    }
    return this.credentials.removeExchange(
      request.user.sub,
      normalized === 'BYBIT' ? ExchangeName.BYBIT : ExchangeName.OKX,
      ExchangeEnvironment.TESTNET,
    );
  }
}
