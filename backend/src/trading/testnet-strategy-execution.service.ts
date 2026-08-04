import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BinanceTestnetOrderService } from '../exchange/binance/binance-testnet-order.service';
import { PrismaService } from '../prisma/prisma.service';

export type ExecuteTestnetStrategyInput = {
  strategyId: string;
  side: 'BUY' | 'SELL';
  quantity: number;
};

@Injectable()
export class TestnetStrategyExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly testnetOrders: BinanceTestnetOrderService,
  ) {}

  async executeMarketOrder(userId: string, input: ExecuteTestnetStrategyInput) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new BadRequestException('Quantity must be a positive number');
    }

    const strategy = await this.prisma.tradingStrategy.findFirst({
      where: { id: input.strategyId, userId },
    });
    if (!strategy) throw new NotFoundException('Strategy not found');
    if (strategy.paperTrading) {
      throw new BadRequestException('Paper strategies cannot place Binance testnet orders');
    }
    if (strategy.environment !== 'TESTNET') {
      throw new BadRequestException('Only Binance testnet strategy execution is allowed');
    }
    if (strategy.status !== 'PAUSED') {
      throw new BadRequestException('Strategy must be PAUSED for a controlled testnet order');
    }

    const clientOrderId = `hbs-testnet-${randomUUID()}`;
    const order = await this.testnetOrders.placeMarketOrder(userId, {
      symbol: strategy.symbol,
      side: input.side,
      quantity: input.quantity,
      clientOrderId,
    });

    return {
      strategyId: strategy.id,
      symbol: strategy.symbol,
      environment: strategy.environment,
      paperTrading: strategy.paperTrading,
      clientOrderId,
      exchangeOrder: order,
    };
  }
}
