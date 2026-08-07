import { Injectable, NotFoundException } from '@nestjs/common';
import { BinanceLiveOrderService } from '../exchange/binance/binance-live-order.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { LiveStrategyRiskService } from './live-strategy-risk.service';
import { RecoveryStrategyService } from './recovery-strategy.service';
import { ExecuteTestnetStrategyInput, TestnetStrategyExecutionService } from './testnet-strategy-execution.service';
import { TestnetStrategyActionService } from './testnet-strategy-action.service';

@Injectable()
export class RiskAwareLiveStrategyExecutionService extends TestnetStrategyExecutionService {
  protected override get executionEnvironment(): 'LIVE' {
    return 'LIVE';
  }

  constructor(
    private readonly livePrisma: PrismaService,
    liveOrders: BinanceLiveOrderService,
    strategyActions: TestnetStrategyActionService,
    notifications: NotificationsService,
    private readonly liveRisk: LiveStrategyRiskService,
    recoveryStrategy: RecoveryStrategyService,
  ) {
    // The environment-aware order adapters expose the same normalized surface.
    super(livePrisma, liveOrders, strategyActions, notifications, recoveryStrategy);
  }

  override async executeMarketOrder(userId: string, input: ExecuteTestnetStrategyInput) {
    const strategy = await this.livePrisma.tradingStrategy.findFirst({ where: { id: input.strategyId, userId } });
    if (!strategy) throw new NotFoundException('Strategy not found');
    const openPosition = await this.livePrisma.tradingPosition.findFirst({
      where: { strategyId: strategy.id, userId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });
    const estimatedPrice = Number(input.triggerPrice ?? openPosition?.averageEntryPrice ?? 0);
    const plannedQuoteAmount = Number(input.plannedQuoteAmount ?? 0);
    const estimatedOrderQuote = Number.isFinite(plannedQuoteAmount) && plannedQuoteAmount > 0
      ? plannedQuoteAmount
      : Number.isFinite(estimatedPrice) && estimatedPrice > 0
        ? input.quantity * estimatedPrice
        : 0;

    await this.liveRisk.assertCanExecute(
      userId,
      strategy,
      openPosition,
      input.actionType ?? (input.side === 'BUY' && !openPosition ? 'INITIAL_ENTRY' : undefined),
      estimatedOrderQuote,
      Boolean(input.retryActionId),
    );
    return super.executeMarketOrder(userId, input);
  }
}
