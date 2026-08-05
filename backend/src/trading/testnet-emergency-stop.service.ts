import { Injectable } from '@nestjs/common';
import { BinanceTestnetOrderService } from '../exchange/binance/binance-testnet-order.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TestnetEmergencyStopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly testnetOrders: BinanceTestnetOrderService,
    private readonly notifications: NotificationsService,
  ) {}

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

      const pendingActions = await tx.strategyAction.updateMany({
        where: {
          userId,
          status: 'PENDING',
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

      const scheduledRetries = await tx.strategyAction.updateMany({
        where: {
          userId,
          status: 'FAILED',
          retryable: true,
          strategy: {
            environment: 'TESTNET',
            paperTrading: false,
          },
        },
        data: {
          status: 'CANCELLED',
          retryable: false,
          nextRetryAt: null,
          errorMessage: 'Scheduled retry cancelled by Testnet emergency stop',
          completedAt: stoppedAt,
        },
      });

      return {
        stoppedStrategies: strategies.count,
        cancelledPendingActions: pendingActions.count,
        cancelledScheduledRetries: scheduledRetries.count,
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
        cancelledPendingActions: response.cancelledPendingActions,
        cancelledScheduledRetries: response.cancelledScheduledRetries,
        unresolvedOrders: response.unresolvedOrders,
        cancelledOrders: response.cancelledOrders,
        failedOrderCancellations: response.failedOrderCancellations,
      },
    });

    return response;
  }
}
