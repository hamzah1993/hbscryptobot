import { Injectable } from '@nestjs/common';
import { BinanceLiveOrderService } from '../exchange/binance/binance-live-order.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RiskAwareLiveStrategyExecutionService } from './risk-aware-live-strategy-execution.service';

@Injectable()
export class LiveEmergencyExitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly liveOrders: BinanceLiveOrderService,
    private readonly execution: RiskAwareLiveStrategyExecutionService,
    private readonly notifications: NotificationsService,
  ) {}

  async exitUserPositions(userId: string) {
    const startedAt = new Date();

    // Pause first. Even if cancellation/close later fails, the scheduler cannot
    // create a new entry while the emergency workflow is resolving exposure.
    await this.prisma.tradingStrategy.updateMany({
      where: { userId, exchange: 'BINANCE', environment: 'LIVE', paperTrading: false, status: 'RUNNING' },
      data: { status: 'PAUSED' },
    });
    await this.prisma.strategyAction.updateMany({
      where: {
        userId, status: { in: ['PENDING', 'FAILED'] },
        strategy: { exchange: 'BINANCE', environment: 'LIVE', paperTrading: false },
      },
      data: {
        status: 'CANCELLED', retryable: false, nextRetryAt: null,
        errorMessage: 'Cancelled by Binance LIVE emergency exit', completedAt: startedAt,
      },
    });

    const pendingOrders = await this.prisma.tradingOrder.findMany({
      where: {
        userId, exchangeOrderId: { not: null }, status: { in: ['PENDING', 'PARTIALLY_FILLED'] },
        position: { strategy: { exchange: 'BINANCE', environment: 'LIVE', paperTrading: false } },
      },
      select: { id: true, exchangeOrderId: true, position: { select: { symbol: true } } },
    });
    const cancellationFailures: Array<{ tradingOrderId: string; error: string }> = [];
    for (const order of pendingOrders) {
      try {
        await this.liveOrders.cancelOrder(userId, order.position.symbol, order.exchangeOrderId!);
        // Reconcile executed quantity after cancellation before calculating the
        // close size. This prevents a partially-filled BUY from being ignored.
        await this.execution.syncOrder(userId, order.id);
      } catch (error) {
        cancellationFailures.push({
          tradingOrderId: order.id,
          error: error instanceof Error ? error.message : 'LIVE order cancellation/reconciliation failed',
        });
      }
    }

    const positions = await this.prisma.tradingPosition.findMany({
      where: { userId, status: 'OPEN', strategy: { exchange: 'BINANCE', environment: 'LIVE', paperTrading: false } },
      include: { subPositions: { where: { status: 'OPEN' }, orderBy: { level: 'desc' } } },
      orderBy: { openedAt: 'asc' },
    });
    const closeResults: Array<{ positionId: string; subPositionId?: string; outcome: 'SUBMITTED' | 'FAILED'; error?: string }> = [];
    for (const position of positions) {
      for (const subPosition of position.subPositions) {
        try {
          await this.execution.closePosition(userId, position.id, subPosition.id);
          closeResults.push({ positionId: position.id, subPositionId: subPosition.id, outcome: 'SUBMITTED' });
        } catch (error) {
          closeResults.push({ positionId: position.id, subPositionId: subPosition.id, outcome: 'FAILED', error: error instanceof Error ? error.message : 'LIVE emergency sub-position exit failed' });
        }
      }
      try {
        await this.execution.closePosition(userId, position.id);
        closeResults.push({ positionId: position.id, outcome: 'SUBMITTED' });
      } catch (error) {
        closeResults.push({ positionId: position.id, outcome: 'FAILED', error: error instanceof Error ? error.message : 'LIVE emergency parent exit failed' });
      }
    }

    await this.prisma.tradingStrategy.updateMany({
      where: { userId, exchange: 'BINANCE', environment: 'LIVE', paperTrading: false },
      data: { status: 'STOPPED' },
    });

    const failedCloses = closeResults.filter((item) => item.outcome === 'FAILED').length;
    const response = {
      environment: 'LIVE' as const,
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
      event: 'LIVE_EMERGENCY_EXIT', userId,
      severity: failedCloses || cancellationFailures.length ? 'CRITICAL' : 'WARNING',
      message: failedCloses || cancellationFailures.length
        ? 'Binance LIVE emergency exit completed with failures; strategies remain STOPPED.'
        : 'Binance LIVE emergency exit submitted all tracked exposure for market close; strategies are STOPPED.',
      metadata: { ...response, startedAt: startedAt.toISOString() },
    });
    return response;
  }
}
