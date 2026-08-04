import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BinanceTestnetOrderService } from '../exchange/binance/binance-testnet-order.service';
import { NotificationsService } from '../notifications/notifications.service';
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
  allowRunningStrategy?: boolean;
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
    private readonly notifications: NotificationsService,
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

    const isAutomaticRunningExecution = input.allowRunningStrategy === true && strategy.status === 'RUNNING';
    if (strategy.status !== 'PAUSED' && !isAutomaticRunningExecution) {
      throw new BadRequestException(
        'Strategy must be PAUSED for a controlled testnet order or RUNNING for an authorized automatic execution',
      );
    }

    const openPosition = await this.prisma.tradingPosition.findFirst({
      where: { strategyId: strategy.id, userId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });

    const actionKey = input.actionKey?.trim();
    const actionType = input.actionType;
    let independentSubPosition: Awaited<ReturnType<typeof this.prisma.tradingSubPosition.findUnique>> = null;

    if (actionType === 'INDEPENDENT_EXIT') {
      if (!openPosition) throw new BadRequestException('No open testnet position is available');
      const level = input.level ?? null;
      if (!level) throw new BadRequestException('Independent exit level is required');
      independentSubPosition = await this.prisma.tradingSubPosition.findUnique({
        where: { positionId_level: { positionId: openPosition.id, level } },
      });
      if (!independentSubPosition || independentSubPosition.status !== 'OPEN') {
        throw new BadRequestException('Open independent sub-position was not found');
      }
      if (input.quantity > Number(independentSubPosition.quantity)) {
        throw new BadRequestException('Sell quantity exceeds the independent sub-position quantity');
      }
    } else if (input.side === 'SELL') {
      if (!openPosition) throw new BadRequestException('No open testnet position is available to sell');
      if (input.quantity > Number(openPosition.totalQuantity)) {
        throw new BadRequestException('Sell quantity exceeds the open testnet position quantity');
      }
    }

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

      const executedQuantity = Number(exchangeOrder.executedQty ?? 0);
      const quoteAmount = Number(exchangeOrder.cummulativeQuoteQty ?? 0);
      const averageFillPrice = this.calculateAverageFillPrice(exchangeOrder, executedQuantity, quoteAmount);
      const status = this.mapOrderStatus(exchangeOrder.status);

      const savedOrder = await this.prisma.$transaction(async (tx) => {
        let position = openPosition;
        let subPositionId: string | null = independentSubPosition?.id ?? null;
        const independentEntry = actionType === 'INDEPENDENT_ENTRY' && input.side === 'BUY';
        const independentExit = actionType === 'INDEPENDENT_EXIT' && input.side === 'SELL';

        if (!position && input.side === 'BUY') {
          const parentTriggers = this.calculateParentTriggers(strategy, executedQuantity, quoteAmount, averageFillPrice, 0);
          position = await tx.tradingPosition.create({
            data: {
              userId,
              strategyId: strategy.id,
              symbol: strategy.symbol,
              status: 'OPEN',
              totalQuantity: independentEntry ? 0 : executedQuantity,
              totalCostQuote: independentEntry ? 0 : quoteAmount,
              averageEntryPrice: independentEntry ? 0 : averageFillPrice,
              realizedPnlQuote: 0,
              dcaCount: 0,
              nextDcaPrice: independentEntry ? null : parentTriggers.nextDcaPrice,
              takeProfitPrice: independentEntry ? null : parentTriggers.takeProfitPrice,
            },
          });
        } else if (position && input.side === 'BUY' && !independentEntry && executedQuantity > 0) {
          const previousQuantity = Number(position.totalQuantity);
          const previousCost = Number(position.totalCostQuote);
          const totalQuantity = previousQuantity + executedQuantity;
          const totalCostQuote = previousCost + quoteAmount;
          const averageEntryPrice = totalQuantity > 0 ? totalCostQuote / totalQuantity : 0;
          const dcaCount = position.dcaCount + 1;
          const parentTriggers = this.calculateParentTriggers(
            strategy,
            totalQuantity,
            totalCostQuote,
            averageEntryPrice,
            dcaCount,
          );

          position = await tx.tradingPosition.update({
            where: { id: position.id },
            data: {
              totalQuantity,
              totalCostQuote,
              averageEntryPrice,
              dcaCount,
              nextDcaPrice: parentTriggers.nextDcaPrice,
              takeProfitPrice: parentTriggers.takeProfitPrice,
            },
          });
        } else if (position && input.side === 'SELL' && !independentExit && executedQuantity > 0) {
          const previousQuantity = Number(position.totalQuantity);
          const previousCost = Number(position.totalCostQuote);
          const soldQuantity = Math.min(executedQuantity, previousQuantity);
          const allocatedCost = previousQuantity > 0 ? (previousCost * soldQuantity) / previousQuantity : 0;
          const proceeds = quoteAmount > 0 ? quoteAmount : soldQuantity * averageFillPrice;
          const realizedPnlQuote = Number(position.realizedPnlQuote) + proceeds - allocatedCost;
          const remainingQuantity = Math.max(previousQuantity - soldQuantity, 0);
          const remainingCost = Math.max(previousCost - allocatedCost, 0);
          const closed = remainingQuantity <= 1e-12;
          const remainingAverage = closed ? 0 : remainingCost / remainingQuantity;
          const parentTriggers = closed
            ? { nextDcaPrice: null, takeProfitPrice: null }
            : this.calculateParentTriggers(
                strategy,
                remainingQuantity,
                remainingCost,
                remainingAverage,
                position.dcaCount,
              );

          position = await tx.tradingPosition.update({
            where: { id: position.id },
            data: {
              status: closed ? 'CLOSED' : 'OPEN',
              totalQuantity: closed ? 0 : remainingQuantity,
              totalCostQuote: closed ? 0 : remainingCost,
              averageEntryPrice: remainingAverage,
              realizedPnlQuote,
              closedAt: closed ? new Date() : null,
              nextDcaPrice: parentTriggers.nextDcaPrice,
              takeProfitPrice: parentTriggers.takeProfitPrice,
            },
          });
        }

        if (!position) throw new BadRequestException('Unable to resolve a Testnet position for the order');

        if (independentEntry && executedQuantity > 0) {
          const level = input.level ?? 1;
          const takeProfitPrice = averageFillPrice * (1 + Number(strategy.takeProfitPercent) / 100);
          const existingSubPosition = await tx.tradingSubPosition.findUnique({
            where: { positionId_level: { positionId: position.id, level } },
          });
          const subPosition = existingSubPosition
            ? await tx.tradingSubPosition.update({
                where: { id: existingSubPosition.id },
                data: {
                  status: 'OPEN',
                  quantity: Number(existingSubPosition.quantity) + executedQuantity,
                  costQuote: Number(existingSubPosition.costQuote) + quoteAmount,
                  entryPrice:
                    (Number(existingSubPosition.costQuote) + quoteAmount) /
                    (Number(existingSubPosition.quantity) + executedQuantity),
                  takeProfitPrice,
                  closedAt: null,
                },
              })
            : await tx.tradingSubPosition.create({
                data: {
                  positionId: position.id,
                  level,
                  status: 'OPEN',
                  quantity: executedQuantity,
                  costQuote: quoteAmount,
                  entryPrice: averageFillPrice,
                  takeProfitPrice,
                },
              });
          subPositionId = subPosition.id;
        } else if (independentExit && independentSubPosition && executedQuantity > 0) {
          const previousQuantity = Number(independentSubPosition.quantity);
          const previousCost = Number(independentSubPosition.costQuote);
          const soldQuantity = Math.min(executedQuantity, previousQuantity);
          const allocatedCost = previousQuantity > 0 ? (previousCost * soldQuantity) / previousQuantity : 0;
          const proceeds = quoteAmount > 0 ? quoteAmount : soldQuantity * averageFillPrice;
          const remainingQuantity = Math.max(previousQuantity - soldQuantity, 0);
          const remainingCost = Math.max(previousCost - allocatedCost, 0);
          const closed = remainingQuantity <= 1e-12;
          await tx.tradingSubPosition.update({
            where: { id: independentSubPosition.id },
            data: {
              status: closed ? 'CLOSED' : 'OPEN',
              quantity: closed ? 0 : remainingQuantity,
              costQuote: closed ? 0 : remainingCost,
              entryPrice: closed ? 0 : remainingCost / remainingQuantity,
              realizedPnlQuote:
                Number(independentSubPosition.realizedPnlQuote) + proceeds - allocatedCost,
              closedAt: closed ? new Date() : null,
            },
          });
        }

        const order = await tx.tradingOrder.create({
          data: {
            userId,
            positionId: position.id,
            subPositionId,
            exchangeOrderId: exchangeOrder.orderId ? String(exchangeOrder.orderId) : null,
            clientOrderId: exchangeOrder.clientOrderId ?? clientOrderId,
            side: input.side,
            type: 'MARKET',
            status,
            level: input.level ?? (position.dcaCount + 1),
            independent: Boolean(independentEntry || independentExit),
            quantity: input.quantity,
            price: averageFillPrice || null,
            filledQuantity: executedQuantity,
            quoteAmount,
            averageFillPrice: averageFillPrice || null,
            accountedFilledQuantity: executedQuantity,
            accountedQuoteAmount: quoteAmount,
          },
          include: { position: true, subPosition: true },
        });

        if (claimedActionId) {
          await tx.strategyAction.update({
            where: { id: claimedActionId },
            data: {
              orderId: order.id,
              positionId: position.id,
              subPositionId,
              status: status === 'FILLED' ? 'COMPLETED' : 'SUBMITTED',
              completedAt: status === 'FILLED' ? new Date() : null,
            },
          });
        }

        return order;
      });

      this.notifications.publish({
        event: status === 'FILLED' ? 'TESTNET_ORDER_FILLED' : 'TESTNET_ORDER_SUBMITTED',
        message: status === 'FILLED'
          ? `Testnet ${input.side} market order filled for ${strategy.symbol}.`
          : `Testnet ${input.side} market order submitted for ${strategy.symbol}.`,
        severity: 'INFO',
        userId,
        strategyId: strategy.id,
        positionId: savedOrder.positionId,
        orderId: savedOrder.id,
        metadata: {
          actionId: claimedActionId,
          actionType: actionType ?? null,
          clientOrderId: savedOrder.clientOrderId,
          exchangeOrderId: savedOrder.exchangeOrderId,
          symbol: strategy.symbol,
          side: input.side,
          status,
          level: savedOrder.level,
          independent: savedOrder.independent,
          requestedQuantity: input.quantity,
          filledQuantity: executedQuantity,
          quoteAmount,
          averageFillPrice: averageFillPrice || null,
        },
      });

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

  async listOrders(userId: string, limit = 100) {
    return this.prisma.tradingOrder.findMany({
      where: {
        userId,
        position: {
          strategy: {
            environment: 'TESTNET',
            paperTrading: false,
          },
        },
      },
      include: {
        position: {
          select: {
            id: true,
            symbol: true,
            status: true,
            strategy: {
              select: {
                id: true,
                name: true,
                status: true,
                environment: true,
                paperTrading: true,
              },
            },
          },
        },
        subPosition: {
          select: {
            id: true,
            level: true,
            status: true,
          },
        },
        strategyAction: {
          select: {
            id: true,
            type: true,
            status: true,
            actionKey: true,
            triggerPrice: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  async listPositions(userId: string, limit = 100) {
    return this.prisma.tradingPosition.findMany({
      where: {
        userId,
        strategy: {
          environment: 'TESTNET',
          paperTrading: false,
        },
      },
      include: {
        strategy: {
          select: {
            id: true,
            name: true,
            symbol: true,
            status: true,
            environment: true,
            paperTrading: true,
            riskBudgetQuote: true,
            baseOrderQuote: true,
            maxDcaOrders: true,
            dcaStepPercent: true,
            dcaMultiplier: true,
            takeProfitPercent: true,
            independentFromLevel: true,
          },
        },
        subPositions: {
          orderBy: { level: 'asc' },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
      orderBy: { openedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  async syncOrder(userId: string, tradingOrderId: string) {
    const order = await this.prisma.tradingOrder.findFirst({
      where: { id: tradingOrderId, userId },
      include: { position: { include: { strategy: true } }, strategyAction: true, subPosition: true },
    });

    if (!order) throw new NotFoundException('Trading order not found');
    if (order.position.strategy.paperTrading || order.position.strategy.environment !== 'TESTNET') {
      throw new BadRequestException('Only Binance testnet orders can be synchronized');
    }
    if (!order.exchangeOrderId) {
      throw new BadRequestException('Trading order does not have an exchange order identifier');
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
    const previousStatus = order.status;

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.tradingOrder.update({
        where: { id: order.id },
        data: {
          status,
          filledQuantity: executedQuantity,
          quoteAmount,
          averageFillPrice: averageFillPrice || null,
          price: averageFillPrice || order.price,
        },
      });

      if (order.strategyAction) {
        await tx.strategyAction.update({
          where: { id: order.strategyAction.id },
          data: {
            status: status === 'FILLED' ? 'COMPLETED' : 'SUBMITTED',
            completedAt: status === 'FILLED' ? new Date() : null,
          },
        });
      }

      return { tradingOrder: updatedOrder, exchangeOrder };
    });

    if (status !== previousStatus) {
      const terminalFailure = status === 'REJECTED' || status === 'CANCELLED';
      this.notifications.publish({
        event: status === 'FILLED'
          ? 'TESTNET_ORDER_SYNC_FILLED'
          : terminalFailure
            ? 'TESTNET_ORDER_SYNC_TERMINAL'
            : 'TESTNET_ORDER_SYNC_UPDATED',
        message: status === 'FILLED'
          ? `Testnet order synchronization confirmed a fill for ${order.position.symbol}.`
          : terminalFailure
            ? `Testnet order synchronization ended with status ${status} for ${order.position.symbol}.`
            : `Testnet order synchronization updated status to ${status} for ${order.position.symbol}.`,
        severity: terminalFailure ? 'WARNING' : 'INFO',
        userId,
        strategyId: order.position.strategyId,
        positionId: order.positionId,
        orderId: order.id,
        metadata: {
          actionId: order.strategyAction?.id ?? null,
          symbol: order.position.symbol,
          side: order.side,
          previousStatus,
          status,
          clientOrderId: order.clientOrderId,
          exchangeOrderId: order.exchangeOrderId,
          filledQuantity: executedQuantity,
          quoteAmount,
          averageFillPrice: averageFillPrice || null,
        },
      });
    }

    return result;
  }

  private mapOrderStatus(status?: string) {
    switch (status?.toUpperCase()) {
      case 'FILLED':
        return 'FILLED' as const;
      case 'PARTIALLY_FILLED':
        return 'PARTIALLY_FILLED' as const;
      case 'CANCELED':
      case 'CANCELLED':
        return 'CANCELLED' as const;
      case 'REJECTED':
      case 'EXPIRED':
        return 'REJECTED' as const;
      case 'NEW':
      default:
        return 'PENDING' as const;
    }
  }

  private calculateAverageFillPrice(order: BinanceOrderResponse, executedQuantity: number, quoteAmount: number) {
    if (executedQuantity > 0 && quoteAmount > 0) return quoteAmount / executedQuantity;

    if (order.fills?.length) {
      const totals = order.fills.reduce(
        (result, fill) => {
          const price = Number(fill.price ?? 0);
          const quantity = Number(fill.qty ?? 0);
          if (!Number.isFinite(price) || !Number.isFinite(quantity)) return result;
          return {
            quantity: result.quantity + quantity,
            quote: result.quote + price * quantity,
          };
        },
        { quantity: 0, quote: 0 },
      );
      if (totals.quantity > 0) return totals.quote / totals.quantity;
    }

    const fallbackPrice = Number(order.price ?? 0);
    return Number.isFinite(fallbackPrice) ? fallbackPrice : 0;
  }

  private calculateParentTriggers(
    strategy: {
      dcaStepPercent: unknown;
      dcaMultiplier: unknown;
      takeProfitPercent: unknown;
    },
    quantity: number,
    costQuote: number,
    averageEntryPrice: number,
    dcaCount: number,
  ) {
    const dcaStepPercent = Number(strategy.dcaStepPercent);
    const dcaMultiplier = Number(strategy.dcaMultiplier);
    const takeProfitPercent = Number(strategy.takeProfitPercent);
    const nextStepMultiplier = Math.pow(dcaMultiplier, dcaCount);
    const nextDcaPrice = averageEntryPrice * (1 - (dcaStepPercent * nextStepMultiplier) / 100);
    const takeProfitPrice = averageEntryPrice * (1 + takeProfitPercent / 100);

    return {
      nextDcaPrice: quantity > 0 && costQuote > 0 ? nextDcaPrice : null,
      takeProfitPrice: quantity > 0 && costQuote > 0 ? takeProfitPrice : null,
    };
  }
}