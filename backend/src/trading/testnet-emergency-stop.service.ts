import { Injectable } from '@nestjs/common';
import { BinanceTestnetOrderService } from '../exchange/binance/binance-testnet-order.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TestnetEmergencyStopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly testnetOrders: BinanceTestnetOrderService,
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

      const actions = await tx.strategyAction.updateMany({
        where: {
          userId,
          status: 'PENDING',
          strategy: {
            environment: 'TESTNET',
            paperTrading: false,
          },
        },
        data: {
          status: 'FAILED',
          errorMessage: 'Cancelled by Testnet emergency stop',
          completedAt: stoppedAt,
        },
      });

      return {
        stoppedStrategies: strategies.count,
        cancelledPendingActions: actions.count,
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

    return {
      environment: 'TESTNET' as const,
      stoppedAt,
      ...result,
      unresolvedOrders: unresolvedOrders.length,
      cancelledOrders: orderResults.filter((item) => item.outcome === 'CANCELLED').length,
      failedOrderCancellations: orderResults.filter((item) => item.outcome === 'FAILED').length,
      orderResults,
    };
  }
}
