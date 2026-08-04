import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ExchangeEnvironment } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ExchangeCredentialsService } from './exchange-credentials.service';

type AuthenticatedRequest = Request & { user: { sub: string } };

@Controller('exchange/credentials')
@UseGuards(JwtAuthGuard)
export class ExchangeCredentialsController {
  constructor(private readonly credentials: ExchangeCredentialsService) {}

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
    return this.credentials.upsertBinance(
      request.user.sub,
      body.apiKey,
      body.apiSecret,
      body.environment ?? ExchangeEnvironment.TESTNET,
    );
  }

  @Delete('binance/:environment')
  removeBinance(
    @Req() request: AuthenticatedRequest,
    @Param('environment') environment: ExchangeEnvironment,
  ) {
    return this.credentials.removeBinance(request.user.sub, environment);
  }
}
