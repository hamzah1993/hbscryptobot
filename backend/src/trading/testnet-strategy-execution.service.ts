import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BinanceTestnetOrderService } from '../exchange/binance/binance-testnet-order.service';
import { PrismaService } from '../prisma/prisma.service';

export type ExecuteTestnetStrategyInput = {
  strategyId: string;
  side: 'BUY' | 'SELL';
  quantity: number;
};

type BinanceOrderFill = {
  price?: string;
  qty?: string;
};

type BinanceOrderResponse = {
  orderId?: number | string;
  clientOrderId?: string;
  status?: string;
  executedQty?: string;
  cummulativeQuoteQty?: string;
  fills?: BinanceOrderFill[];
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
    const exchangeOrder = (await this.testnetOrders.placeMarketOrder(userId, {
      symbol: strategy.symbol,
      side: input.side,
      quantity: input.quantity,
      clientOrderId,
    })) as BinanceOrderResponse;

    const executedQuantity = Number(exchangeOrder.executedQty ?? input.quantity);
    const quoteAmount = Number(exchangeOrder.cummulativeQuoteQty ?? 0);
    const averageFillPrice = this.calculateAverageFillPrice(exchangeOrder, executedQuantity, quoteAmount);
    const status = this.mapOrderStatus(exchangeOrder.status);

    const savedOrder = await this.prisma.$transaction(async (tx) => {
      let position = await tx.tradingPosition.findFirst({
        where: { strategyId: strategy.id, userId, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
      });

      if (!position) {
        position = await tx.tradingPosition.create({
          data: {
            userId,
            strategyId: strategy.id,
            symbol: strategy.symbol,
            status: input.side === 'BUY' ? 'OPEN' : 'CLOSED',
            totalQuantity: input.side === 'BUY' ? executedQuantity : 0,
            totalCostQuote: input.side === 'BUY' ? quoteAmount : 0,
            averageEntryPrice: input.side === 'BUY' ? averageFillPrice : 0,
            realizedPnlQuote: 0,
            dcaCount: 0,
            closedAt: input.side === 'SELL' ? new Date() : null,
          },
        });
      }

      const level = (await tx.tradingOrder.count({ where: { positionId: position.id, side: 'BUY' } })) + 1;

      return tx.tradingOrder.create({
        data: {
          userId,
          positionId: position.id,
          exchangeOrderId: exchangeOrder.orderId ? String(exchangeOrder.orderId) : null,
          clientOrderId: exchangeOrder.clientOrderId ?? clientOrderId,
          side: input.side,
          type: 'MARKET',
          status,
          level,
          independent: false,
          quantity: input.quantity,
          price: averageFillPrice || null,
          filledQuantity: executedQuantity,
          quoteAmount,
          averageFillPrice: averageFillPrice || null,
        },
        include: { position: true },
      });
    });

    return {
      strategyId: strategy.id,
      symbol: strategy.symbol,
      environment: strategy.environment,
      paperTrading: strategy.paperTrading,
      clientOrderId,
      savedOrder,
      exchangeOrder,
    };
  }

  private calculateAverageFillPrice(
    order: BinanceOrderResponse,
    executedQuantity: number,
    quoteAmount: number,
  ) {
    if (executedQuantity > 0 && quoteAmount > 0) return quoteAmount / executedQuantity;

    const fills = order.fills ?? [];
    const fillQuantity = fills.reduce((sum, fill) => sum + Number(fill.qty ?? 0), 0);
    if (fillQuantity <= 0) return 0;

    const fillQuote = fills.reduce(
      (sum, fill) => sum + Number(fill.price ?? 0) * Number(fill.qty ?? 0),
      0,
    );
    return fillQuote / fillQuantity;
  }

  private mapOrderStatus(status?: string) {
    switch (status) {
      case 'FILLED':
        return 'FILLED' as const;
      case 'PARTIALLY_FILLED':
        return 'PARTIALLY_FILLED' as const;
      case 'CANCELED':
      case 'CANCELLED':
      case 'EXPIRED':
        return 'CANCELLED' as const;
      case 'REJECTED':
        return 'REJECTED' as const;
      case 'NEW':
      case 'PENDING_NEW':
        return 'PENDING' as const;
      default:
        return 'FAILED' as const;
    }
  }
}
