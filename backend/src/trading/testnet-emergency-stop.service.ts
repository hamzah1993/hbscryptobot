import { Injectable } from '@nestjs/common';
import { BinanceTestnetOrderService } from '../exchange/binance/binance-testnet-order.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TestnetStrategyExecutionService } from './testnet-strategy-execution.service';

@Injectable()
export class TestnetEmergencyStopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly testnetOrders: BinanceTestnetOrderService,
    private readonly notifications: NotificationsService,
    private readonly testnetExecution: TestnetStrategyExecutionService,
  ) {}

  async exitUserPositions(userId: string) {
    const startedAt = new Date();
    await this.prisma.tradingStrategy.updateMany({
      where: { userId, environment: 'TESTNET', paperTrading: false, exchange: 'BINANCE', status: 'RUNNING' },
      data: { status: 'PAUSED' },
    });

    // Cancel pending work/orders first. closePosition refuses to trade through
    // unresolved exchange state, which is exactly what an emergency path needs.
    await this.prisma.strategyAction.updateMany({
      where: {
        userId,
        status: { in: ['PENDING', 'FAILED'] },
        strategy: { environment: 'TESTNET', paperTrading: false, exchange: 'BINANCE' },
      },
      data: {
        status: 'CANCELLED', retryable: false, nextRetryAt: null,
        errorMessage: 'Cancelled by Testnet emergency exit', completedAt: startedAt,
      },
    });

    const pendingOrders = await this.prisma.tradingOrder.findMany({
      where: {
        userId, exchangeOrderId: { not: null }, status: { in: ['PENDING', 'PARTIALLY_FILLED'] },
        position: { strategy: { environment: 'TESTNET', paperTrading: false, exchange: 'BINANCE' } },
      },
      select: { id: true, exchangeOrderId: true, position: { select: { symbol: true } } },
    });
    const cancellationFailures: Array<{ tradingOrderId: string; error: string }> = [];
    for (const order of pendingOrders) {
      try {
        const result = await this.testnetOrders.cancelOrder(userId, order.position.symbol, order.exchangeOrderId! ) as { status?: string };
        const status = String(result.status ?? '').toUpperCase();
        if (status === 'CANCELED' || status === 'CANCELLED') {
          await this.prisma.tradingOrder.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
        } else if (status === 'FILLED') {
          await this.prisma.tradingOrder.update({ where: { id: order.id }, data: { status: 'FILLED' } });
        }
      } catch (error) {
        cancellationFailures.push({ tradingOrderId: order.id, error: error instanceof Error ? error.message : 'Order cancellation failed' });
      }
    }

    const positions = await this.prisma.tradingPosition.findMany({
      where: { userId, status: 'OPEN', strategy: { environment: 'TESTNET', paperTrading: false, exchange: 'BINANCE' } },
      include: { subPositions: { where: { status: 'OPEN' }, orderBy: { level: 'desc' } } },
      orderBy: { openedAt: 'asc' },
    });
    const closeResults: Array<{ positionId: string; subPositionId?: string; outcome: 'SUBMITTED' | 'FAILED'; error?: string }> = [];
    for (const position of positions) {
      for (const subPosition of position.subPositions) {
        try {
          await this.testnetExecution.closePosition(userId, position.id, subPosition.id);
          closeResults.push({ positionId: position.id, subPositionId: subPosition.id, outcome: 'SUBMITTED' });
        } catch (error) {
          closeResults.push({ positionId: position.id, subPositionId: subPosition.id, outcome: 'FAILED', error: error instanceof Error ? error.message : 'Emergency sub-position exit failed' });
        }
      }
      try {
        await this.testnetExecution.closePosition(userId, position.id);
        closeResults.push({ positionId: position.id, outcome: 'SUBMITTED' });
      } catch (error) {
        closeResults.push({ positionId: position.id, outcome: 'FAILED', error: error instanceof Error ? error.message : 'Emergency parent exit failed' });
      }
    }

    await this.prisma.tradingStrategy.updateMany({
      where: { userId, environment: 'TESTNET', paperTrading: false, exchange: 'BINANCE' },
      data: { status: 'STOPPED' },
    });

    const failedCloses = closeResults.filter((item) => item.outcome === 'FAILED').length;
    const response = {
      environment: 'TESTNET' as const,
      exchange: 'BINANCE' as const,
      startedAt,
      positionsFound: positions.length,
      exitOrdersSubmitted: closeResults.length - failedCloses,
      failedCloses,
      cancellationFailures: cancellationFailures.length,
      closeResults,
      reentryBlocked: true,
    };
    this.notifications.publish({
      event: 'TESTNET_EMERGENCY_EXIT', userId,
      severity: failedCloses || cancellationFailures.length ? 'CRITICAL' : 'WARNING',
      message: failedCloses || cancellationFailures.length ? 'Testnet emergency exit completed with failures.' : 'Testnet emergency exit submitted all open exposure for market close.',
      metadata: { ...response, startedAt: startedAt.toISOString() },
    });
    return response;
  }

  async stopUserStrategies(userId: string) {
    const stoppedAt = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const strategies = await tx.tradingStrategy.updateMany({
        where: {
          userId,
          environment: 'TESTNET',
          paperTrading: false,
          status: { in: ['RUNNING', 'PAUSED'] },
        },
        data: { status: 'STOPPED' },
      });

      const actions = await tx.strategyAction.updateMany({
        where: {
          userId,
          status: { in: ['PENDING', 'FAILED'] },
          strategy: {
            environment: 'TESTNET',
            paperTrading: false,
          },
        },
        data: {
          status: 'CANCELLED',
          retryable: false,
          nextRetryAt: null,
          errorMessage: 'Cancelled by Testnet emergency stop',
          completedAt: stoppedAt,
        },
      });

      return {
        stoppedStrategies: strategies.count,
        cancelledPendingOrRetryableActions: actions.count,
      };
    });

    const unresolvedOrders = await this.prisma.tradingOrder.findMany({
      where: {
        userId,
        exchangeOrderId: { not: null },
        status: { in: ['PENDING', 'PARTIALLY_FILLED'] },
        position: {
          strategy: {
            environment: 'TESTNET',
            paperTrading: false,
          },
        },
      },
      select: {
        id: true,
        exchangeOrderId: true,
        position: { select: { symbol: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const orderResults = await Promise.all(unresolvedOrders.map(async (order) => {
      const exchangeOrderId = order.exchangeOrderId;
      if (!exchangeOrderId) {
        return { tradingOrderId: order.id, outcome: 'SKIPPED' as const };
      }

      try {
        const exchangeOrder = await this.testnetOrders.cancelOrder(
          userId,
          order.position.symbol,
          exchangeOrderId,
        ) as { status?: string };
        const exchangeStatus = exchangeOrder.status?.toUpperCase();
        const status = exchangeStatus === 'CANCELED' || exchangeStatus === 'CANCELLED'
          ? 'CANCELLED'
          : exchangeStatus === 'FILLED'
            ? 'FILLED'
            : undefined;

        if (status) {
          await this.prisma.tradingOrder.update({
            where: { id: order.id },
            data: { status },
          });
        }

        return {
          tradingOrderId: order.id,
          exchangeOrderId,
          outcome: status === 'FILLED' ? 'ALREADY_FILLED' as const : 'CANCELLED' as const,
          exchangeStatus: exchangeStatus ?? null,
        };
      } catch (error: unknown) {
        return {
          tradingOrderId: order.id,
          exchangeOrderId,
          outcome: 'FAILED' as const,
          error: error instanceof Error ? error.message : 'Unknown cancellation error',
        };
      }
    }));

    const response = {
      environment: 'TESTNET' as const,
      stoppedAt,
      ...result,
      unresolvedOrders: unresolvedOrders.length,
      cancelledOrders: orderResults.filter((item) => item.outcome === 'CANCELLED').length,
      failedOrderCancellations: orderResults.filter((item) => item.outcome === 'FAILED').length,
      orderResults,
    };

    this.notifications.publish({
      event: 'TESTNET_EMERGENCY_STOP',
      message: response.failedOrderCancellations > 0
        ? 'Testnet emergency stop completed with order cancellation failures.'
        : 'Testnet emergency stop completed.',
      severity: response.failedOrderCancellations > 0 ? 'CRITICAL' : 'WARNING',
      userId,
      metadata: {
        stoppedAt: stoppedAt.toISOString(),
        stoppedStrategies: response.stoppedStrategies,
        cancelledPendingOrRetryableActions: response.cancelledPendingOrRetryableActions,
        unresolvedOrders: response.unresolvedOrders,
        cancelledOrders: response.cancelledOrders,
        failedOrderCancellations: response.failedOrderCancellations,
      },
    });

    return response;
  }
}
