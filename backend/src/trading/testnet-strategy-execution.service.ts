import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BinanceTestnetOrderService } from '../exchange/binance/binance-testnet-order.service';
import { PrismaService } from '../prisma/prisma.service';
import { TestnetStrategyActionService } from './testnet-strategy-action.service';

export type ExecuteTestnetStrategyInput = {
  strategyId: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  actionType?: 'INITIAL_ENTRY' | 'DCA_ENTRY' | 'INDEPENDENT_ENTRY' | 'PARENT_EXIT' | 'INDEPENDENT_EXIT';
  actionKey?: string;
  level?: number | null;
  triggerPrice?: number | null;
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
  price?: string;
  fills?: BinanceOrderFill[];
};

@Injectable()
export class TestnetStrategyExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly testnetOrders: BinanceTestnetOrderService,
    private readonly strategyActions: TestnetStrategyActionService,
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

    const openPosition = await this.prisma.tradingPosition.findFirst({
      where: { strategyId: strategy.id, userId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });

    if (input.side === 'SELL') {
      if (!openPosition) throw new BadRequestException('No open testnet position is available to sell');
      if (input.quantity > Number(openPosition.totalQuantity)) {
        throw new BadRequestException('Sell quantity exceeds the open testnet position quantity');
      }
    }

    const actionKey = input.actionKey?.trim();
    const actionType = input.actionType;
    let claimedActionId: string | null = null;

    if (actionKey || actionType) {
      if (!actionKey || !actionType) {
        throw new BadRequestException('Both actionKey and actionType are required for idempotent execution');
      }

      const claim = await this.strategyActions.claim(userId, {
        strategyId: strategy.id,
        positionId: openPosition?.id ?? null,
        type: actionType,
        side: input.side,
        quantity: input.quantity,
        level: input.level ?? null,
        triggerPrice: input.triggerPrice ?? null,
        idempotencyKey: actionKey,
      });

      if (!claim.claimed) {
        return {
          strategyId: strategy.id,
          symbol: strategy.symbol,
          environment: strategy.environment,
          paperTrading: strategy.paperTrading,
          duplicate: true,
          action: claim.action,
        };
      }

      claimedActionId = claim.action.id;
    }

    const clientOrderId = `hbs-testnet-${randomUUID()}`;

    try {
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
        let position = openPosition;

        if (!position && input.side === 'BUY') {
          position = await tx.tradingPosition.create({
            data: {
              userId,
              strategyId: strategy.id,
              symbol: strategy.symbol,
              status: 'OPEN',
              totalQuantity: executedQuantity,
              totalCostQuote: quoteAmount,
              averageEntryPrice: averageFillPrice,
              realizedPnlQuote: 0,
              dcaCount: 0,
            },
          });
        } else if (position && input.side === 'BUY') {
          const previousQuantity = Number(position.totalQuantity);
          const previousCost = Number(position.totalCostQuote);
          const totalQuantity = previousQuantity + executedQuantity;
          const totalCostQuote = previousCost + quoteAmount;
          const averageEntryPrice = totalQuantity > 0 ? totalCostQuote / totalQuantity : 0;

          position = await tx.tradingPosition.update({
            where: { id: position.id },
            data: {
              totalQuantity,
              totalCostQuote,
              averageEntryPrice,
              dcaCount: position.dcaCount + 1,
            },
          });
        } else if (position && input.side === 'SELL') {
          const previousQuantity = Number(position.totalQuantity);
          const previousCost = Number(position.totalCostQuote);
          const soldQuantity = Math.min(executedQuantity, previousQuantity);
          const allocatedCost = previousQuantity > 0 ? (previousCost * soldQuantity) / previousQuantity : 0;
          const proceeds = quoteAmount > 0 ? quoteAmount : soldQuantity * averageFillPrice;
          const realizedPnlQuote = Number(position.realizedPnlQuote) + proceeds - allocatedCost;
          const remainingQuantity = Math.max(previousQuantity - soldQuantity, 0);
          const remainingCost = Math.max(previousCost - allocatedCost, 0);
          const closed = remainingQuantity <= 1e-12;

          position = await tx.tradingPosition.update({
            where: { id: position.id },
            data: {
              status: closed ? 'CLOSED' : 'OPEN',
              totalQuantity: closed ? 0 : remainingQuantity,
              totalCostQuote: closed ? 0 : remainingCost,
              averageEntryPrice: closed ? 0 : remainingCost / remainingQuantity,
              realizedPnlQuote,
              closedAt: closed ? new Date() : null,
              nextDcaPrice: closed ? null : position.nextDcaPrice,
              takeProfitPrice: closed ? null : position.takeProfitPrice,
            },
          });
        }

        if (!position) throw new BadRequestException('Unable to resolve a testnet trading position');

        const level =
          input.side === 'BUY'
            ? (await tx.tradingOrder.count({ where: { positionId: position.id, side: 'BUY' } })) + 1
            : Math.max(position.dcaCount + 1, 1);

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
            independent: actionType === 'INDEPENDENT_ENTRY' || actionType === 'INDEPENDENT_EXIT',
            quantity: input.quantity,
            price: averageFillPrice || null,
            filledQuantity: executedQuantity,
            quoteAmount,
            accountedFilledQuantity: executedQuantity,
            accountedQuoteAmount: quoteAmount,
            averageFillPrice: averageFillPrice || null,
          },
          include: { position: true },
        });
      });

      if (claimedActionId) {
        await this.strategyActions.markSubmitted(claimedActionId, savedOrder.id);
        if (status === 'FILLED') {
          await this.strategyActions.markCompleted(claimedActionId);
        }
      }

      return {
        strategyId: strategy.id,
        symbol: strategy.symbol,
        environment: strategy.environment,
        paperTrading: strategy.paperTrading,
        clientOrderId,
        savedOrder,
        exchangeOrder,
        actionId: claimedActionId,
      };
    } catch (error: unknown) {
      if (claimedActionId) {
        await this.strategyActions.markFailed(claimedActionId, error);
      }
      throw error;
    }
  }

  async syncOrder(userId: string, tradingOrderId: string) {
    const order = await this.prisma.tradingOrder.findFirst({
      where: { id: tradingOrderId, userId },
      include: { position: { include: { strategy: true } }, strategyAction: true },
    });
    if (!order) throw new NotFoundException('Trading order not found');
    if (!order.exchangeOrderId) {
      throw new BadRequestException('Trading order does not have a Binance exchange order ID');
    }
    if (order.position.strategy.paperTrading || order.position.strategy.environment !== 'TESTNET') {
      throw new BadRequestException('Only Binance testnet orders can be synchronized');
    }

    const exchangeOrder = (await this.testnetOrders.getOrder(
      userId,
      order.position.symbol,
      order.exchangeOrderId,
    )) as BinanceOrderResponse;

    const executedQuantity = Number(exchangeOrder.executedQty ?? 0);
    const quoteAmount = Number(exchangeOrder.cummulativeQuoteQty ?? 0);
    const averageFillPrice = this.calculateAverageFillPrice(exchangeOrder, executedQuantity, quoteAmount);
    const status = this.mapOrderStatus(exchangeOrder.status);
    const accountedFilledQuantity = Number(order.accountedFilledQuantity);
    const accountedQuoteAmount = Number(order.accountedQuoteAmount);
    const deltaQuantity = Math.max(executedQuantity - accountedFilledQuantity, 0);
    const deltaQuoteAmount = Math.max(quoteAmount - accountedQuoteAmount, 0);

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      if (deltaQuantity > 0) {
        const currentPosition = await tx.tradingPosition.findUnique({
          where: { id: order.positionId },
        });
        if (!currentPosition) throw new NotFoundException('Trading position not found');

        if (order.side === 'BUY') {
          const previousQuantity = Number(currentPosition.totalQuantity);
          const previousCost = Number(currentPosition.totalCostQuote);
          const totalQuantity = previousQuantity + deltaQuantity;
          const totalCostQuote = previousCost + deltaQuoteAmount;

          await tx.tradingPosition.update({
            where: { id: currentPosition.id },
            data: {
              status: 'OPEN',
              totalQuantity,
              totalCostQuote,
              averageEntryPrice: totalQuantity > 0 ? totalCostQuote / totalQuantity : 0,
              closedAt: null,
            },
          });
        } else {
          const previousQuantity = Number(currentPosition.totalQuantity);
          const previousCost = Number(currentPosition.totalCostQuote);
          const soldQuantity = Math.min(deltaQuantity, previousQuantity);
          const allocatedCost = previousQuantity > 0 ? (previousCost * soldQuantity) / previousQuantity : 0;
          const deltaAveragePrice = deltaQuantity > 0 && deltaQuoteAmount > 0
            ? deltaQuoteAmount / deltaQuantity
            : averageFillPrice;
          const proceeds = deltaQuoteAmount > 0 ? deltaQuoteAmount : soldQuantity * deltaAveragePrice;
          const remainingQuantity = Math.max(previousQuantity - soldQuantity, 0);
          const remainingCost = Math.max(previousCost - allocatedCost, 0);
          const closed = remainingQuantity <= 1e-12;

          await tx.tradingPosition.update({
            where: { id: currentPosition.id },
            data: {
              status: closed ? 'CLOSED' : 'OPEN',
              totalQuantity: closed ? 0 : remainingQuantity,
              totalCostQuote: closed ? 0 : remainingCost,
              averageEntryPrice: closed ? 0 : remainingCost / remainingQuantity,
              realizedPnlQuote: Number(currentPosition.realizedPnlQuote) + proceeds - allocatedCost,
              closedAt: closed ? new Date() : null,
              nextDcaPrice: closed ? null : currentPosition.nextDcaPrice,
              takeProfitPrice: closed ? null : currentPosition.takeProfitPrice,
            },
          });
        }
      }

      return tx.tradingOrder.update({
        where: { id: order.id },
        data: {
          status,
          filledQuantity: executedQuantity,
          quoteAmount,
          accountedFilledQuantity: executedQuantity,
          accountedQuoteAmount: quoteAmount,
          price: averageFillPrice || Number(exchangeOrder.price ?? 0) || null,
          averageFillPrice: averageFillPrice || null,
        },
        include: { position: true },
      });
    });

    if (order.strategyAction && status === 'FILLED') {
      await this.strategyActions.markCompleted(order.strategyAction.id);
    }

    return {
      updatedOrder,
      exchangeOrder,
      reconciliation: {
        deltaQuantity,
        deltaQuoteAmount,
      },
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
