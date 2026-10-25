import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { MaintenanceService } from '../admin/maintenance.service';
import { BinanceLiveOrderService } from '../exchange/binance/binance-live-order.service';
import { MarketDataService } from '../market/market-data.service';
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
    private readonly marketData: MarketDataService,
    private readonly maintenance?: MaintenanceService,
  ) {
    // The environment-aware order adapters expose the same normalized surface.
    super(livePrisma, liveOrders, strategyActions, notifications, recoveryStrategy);
  }

  override async executeMarketOrder(userId: string, input: ExecuteTestnetStrategyInput) {
    if (await this.maintenance?.isActive()) throw new ServiceUnavailableException('Trading is paused for system maintenance');
    const strategy = await this.livePrisma.tradingStrategy.findFirst({ where: { id: input.strategyId, userId } });
    if (!strategy) throw new NotFoundException('Strategy not found');
    const openPosition = await this.livePrisma.tradingPosition.findFirst({
      where: { strategyId: strategy.id, userId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });

    // A manual SELL only reduces exposure (the base service rejects a SELL
    // without an open position), so it is classified as an exit for risk checks.
    const riskActionType = input.actionType
      ?? (input.side === 'SELL' ? 'PARENT_EXIT' : !openPosition ? 'INITIAL_ENTRY' : undefined);
    const estimatedOrderQuote = input.side === 'BUY'
      ? await this.estimateBuyQuote(strategy.symbol, input)
      : this.estimateSellQuote(input, openPosition);

    await this.liveRisk.assertCanExecute(
      userId,
      strategy,
      openPosition,
      riskActionType,
      estimatedOrderQuote,
      Boolean(input.retryActionId),
    );
    return super.executeMarketOrder(userId, input);
  }

  /**
   * Values a LIVE BUY from server-side prices only. A client-supplied price is
   * never trusted: a missing or understated price would otherwise let the order
   * bypass every quote-denominated risk limit. The larger of the planned amount
   * and the priced quantity is used so exposure is never understated.
   */
  private async estimateBuyQuote(symbol: string, input: ExecuteTestnetStrategyInput) {
    let referencePrice: number;
    if (input.orderType === 'LIMIT') {
      referencePrice = Number(input.limitPrice);
    } else {
      try {
        referencePrice = (await this.marketData.getQuote(symbol, 'live', true)).price;
      } catch (error) {
        throw new ServiceUnavailableException(
          `Binance LIVE price is unavailable; entry rejected (${error instanceof Error ? error.message : String(error)})`,
        );
      }
    }
    const pricedQuote = Number(input.quantity) * referencePrice;
    const plannedQuote = Number(input.plannedQuoteAmount ?? 0);
    return Math.max(
      Number.isFinite(pricedQuote) ? pricedQuote : 0,
      Number.isFinite(plannedQuote) ? plannedQuote : 0,
    );
  }

  private estimateSellQuote(input: ExecuteTestnetStrategyInput, openPosition: { averageEntryPrice?: unknown } | null) {
    const estimatedPrice = Number(input.triggerPrice ?? openPosition?.averageEntryPrice ?? 0);
    return Number.isFinite(estimatedPrice) && estimatedPrice > 0 ? input.quantity * estimatedPrice : 0;
  }
}
