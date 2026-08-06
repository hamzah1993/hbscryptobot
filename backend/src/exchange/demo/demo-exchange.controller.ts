import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { DemoExchangeExecutionService } from './demo-exchange-execution.service';
import type { DemoExchange, DemoOrderInput } from './demo-order.types';

type AuthenticatedRequest = Request & { user: { sub: string } };

@Controller('exchange/demo')
@UseGuards(JwtAuthGuard)
export class DemoExchangeController {
  constructor(private readonly execution: DemoExchangeExecutionService) {}

  @Post(':exchange/test-connection')
  testConnection(@Req() request: AuthenticatedRequest, @Param('exchange') exchange: string) {
    return this.execution.testConnection(request.user.sub, this.exchange(exchange));
  }

  @Post(':exchange/orders')
  place(@Req() request: AuthenticatedRequest, @Param('exchange') exchange: string, @Body() body: DemoOrderInput) {
    return this.execution.placeOrder(request.user.sub, this.exchange(exchange), body);
  }

  @Get(':exchange/orders/by-client-id')
  findByClientId(
    @Req() request: AuthenticatedRequest,
    @Param('exchange') exchange: string,
    @Query('symbol') symbol: string,
    @Query('clientOrderId') clientOrderId: string,
  ) {
    return this.execution.findOrderByClientOrderId(request.user.sub, this.exchange(exchange), symbol, clientOrderId);
  }

  @Get(':exchange/orders/:orderId')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('exchange') exchange: string,
    @Param('orderId') orderId: string,
    @Query('symbol') symbol: string,
  ) {
    return this.execution.getOrder(request.user.sub, this.exchange(exchange), symbol, orderId);
  }

  @Post(':exchange/orders/:orderId/cancel')
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param('exchange') exchange: string,
    @Param('orderId') orderId: string,
    @Body() body: { symbol: string },
  ) {
    return this.execution.cancelOrder(request.user.sub, this.exchange(exchange), body.symbol, orderId);
  }

  private exchange(value: string): DemoExchange {
    return value.trim().toUpperCase() as DemoExchange;
  }
}
