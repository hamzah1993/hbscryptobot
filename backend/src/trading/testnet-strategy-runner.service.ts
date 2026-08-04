import { Injectable } from '@nestjs/common';
import { MarketDataService } from '../market/market-data.service';
import { PrismaService } from '../prisma/prisma.service';
import { TestnetStrategyExecutionService } from './testnet-strategy-execution.service';

export type TestnetStrategyRunnerAction =
  | 'OPEN'
  | 'DCA'
  | 'INDEPENDENT_ENTRY'
  | 'TAKE_PROFIT'
  | 'HOLD'
  | 'SKIP'
  | 'ERROR';

export type TestnetStrategyRunnerResult = {
  strategyId: string;
  symbol: string;
  action: TestnetStrategyRunnerAction;
  price?: number;
  quantity?: number;
  positionId?: string;
  message?: string;
};

@Injectable()
export class TestnetStrategyRunnerService {
  private readonly runningStrategies = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketData: MarketDataService,
    private readonly testnetExecution: TestnetStrategyExecutionService,
  ) {}

  async runUserStrategies(userId: string): Promise<TestnetStrategyRunnerResult[]> {
    const strategies = await this.prisma.tradingStrategy.findMany({
      where: {
        userId,
        status: 'RUNNING',
        paperTrading: false,
        environment: 'TESTNET',
      },
      include: {
        positions: {
          where: { status: 'OPEN' },
          orderBy: { openedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const results: TestnetStrategyRunnerResult[] = [];
    for (const strategy of strategies) {
      results.push(await this.runStrategy(userId, strategy));
    }
    return results;
  }

  private async runStrategy(userId: string, strategy: any): Promise<TestnetStrategyRunnerResult> {
    if (this.runningStrategies.has(strategy.id)) {
      return {
        strategyId: strategy.id,
        symbol: strategy.symbol,
        action: 'SKIP',
        message: 'Strategy tick is already in progress',
      };
    }

    this.runningStrategies.add(strategy.id);
    try {
      const quote = await this.marketData.getQuote(strategy.symbol, 'testnet');
      if (!Number.isFinite(quote.price) || quote.price <= 0) {
        throw new Error('Unable to calculate testnet quantity from the market price');
      }

      const openPosition = strategy.positions[0];
      if (!openPosition) {
        const baseOrderQuote = Number(strategy.baseOrderQuote);
        const riskBudgetQuote = Number(strategy.riskBudgetQuote);
        const quoteAmount = Math.min(baseOrderQuote, riskBudgetQuote);
        if (!Number.isFinite(quoteAmount) || quoteAmount <= 0) {
          throw new Error('Initial testnet quote amount must be greater than zero');
        }

        const quantity = quoteAmount / quote.price;
        const actionKey = `strategy:${strategy.id}:initial-entry`;
        const execution = await this.testnetExecution.executeMarketOrder(userId, {
          strategyId: strategy.id,
          side: 'BUY',
          quantity,
          actionType: 'INITIAL_ENTRY',
          actionKey,
          level: 1,
          triggerPrice: quote.price,
          allowRunningStrategy: true,
        });

        return {
          strategyId: strategy.id,
          symbol: strategy.symbol,
          action: execution.duplicate ? 'SKIP' : 'OPEN',
          price: quote.price,
          quantity,
          positionId: execution.savedOrder?.positionId,
          message: execution.duplicate ? 'Initial entry action was already claimed' : undefined,
        };
      }

      const totalQuantity = Number(openPosition.totalQuantity);
      const takeProfitPrice = Number(openPosition.takeProfitPrice ?? 0);
      if (
        Number.isFinite(totalQuantity) &&
        totalQuantity > 0 &&
        Number.isFinite(takeProfitPrice) &&
        takeProfitPrice > 0 &&
        quote.price >= takeProfitPrice
      ) {
        const actionKey = `strategy:${strategy.id}:position:${openPosition.id}:parent-exit`;
        const execution = await this.testnetExecution.executeMarketOrder(userId, {
          strategyId: strategy.id,
          side: 'SELL',
          quantity: totalQuantity,
          actionType: 'PARENT_EXIT',
          actionKey,
          level: Math.max(Number(openPosition.dcaCount) + 1, 1),
          triggerPrice: takeProfitPrice,
          allowRunningStrategy: true,
        });

        return {
          strategyId: strategy.id,
          symbol: strategy.symbol,
          action: execution.duplicate ? 'SKIP' : 'TAKE_PROFIT',
          price: quote.price,
          quantity: totalQuantity,
          positionId: openPosition.id,
          message: execution.duplicate ? 'Take-profit action was already claimed' : undefined,
        };
      }

      const dcaCount = Number(openPosition.dcaCount);
      const maxDcaOrders = Number(strategy.maxDcaOrders);
      const nextLevel = dcaCount + 2;
      const nextDcaPrice = Number(openPosition.nextDcaPrice ?? 0);

      if (dcaCount >= maxDcaOrders) {
        return {
          strategyId: strategy.id,
          symbol: strategy.symbol,
          action: 'HOLD',
          price: quote.price,
          positionId: openPosition.id,
          message: 'Maximum DCA orders reached',
        };
      }

      if (!Number.isFinite(nextDcaPrice) || nextDcaPrice <= 0 || quote.price > nextDcaPrice) {
        return {
          strategyId: strategy.id,
          symbol: strategy.symbol,
          action: 'HOLD',
          price: quote.price,
          positionId: openPosition.id,
          message: 'No testnet exit or DCA trigger has been reached',
        };
      }

      const multiplier = Number(strategy.dcaMultiplier);
      const baseOrderQuote = Number(strategy.baseOrderQuote);
      const requestedQuote = baseOrderQuote * Math.pow(multiplier, dcaCount + 1);
      const remainingBudget = Math.max(
        Number(strategy.riskBudgetQuote) - Number(openPosition.totalCostQuote),
        0,
      );
      const quoteAmount = Math.min(requestedQuote, remainingBudget);

      if (!Number.isFinite(quoteAmount) || quoteAmount <= 0) {
        return {
          strategyId: strategy.id,
          symbol: strategy.symbol,
          action: 'HOLD',
          price: quote.price,
          positionId: openPosition.id,
          message: 'No remaining risk budget is available for DCA',
        };
      }

      const quantity = quoteAmount / quote.price;
      const independentFromLevel = Number(strategy.independentFromLevel);
      const independent = nextLevel >= independentFromLevel;
      const actionType = independent ? 'INDEPENDENT_ENTRY' : 'DCA_ENTRY';
      const actionKey = independent
        ? `strategy:${strategy.id}:position:${openPosition.id}:independent-entry:${nextLevel}`
        : `strategy:${strategy.id}:position:${openPosition.id}:dca:${nextLevel}`;

      const execution = await this.testnetExecution.executeMarketOrder(userId, {
        strategyId: strategy.id,
        side: 'BUY',
        quantity,
        actionType,
        actionKey,
        level: nextLevel,
        triggerPrice: nextDcaPrice,
        allowRunningStrategy: true,
      });

      return {
        strategyId: strategy.id,
        symbol: strategy.symbol,
        action: execution.duplicate ? 'SKIP' : independent ? 'INDEPENDENT_ENTRY' : 'DCA',
        price: quote.price,
        quantity,
        positionId: openPosition.id,
        message: execution.duplicate
          ? independent
            ? 'Independent entry action was already claimed'
            : 'DCA action was already claimed'
          : undefined,
      };
    } catch (error) {
      return {
        strategyId: strategy.id,
        symbol: strategy.symbol,
        action: 'ERROR',
        message: error instanceof Error ? error.message : 'Testnet strategy tick failed',
      };
    } finally {
      this.runningStrategies.delete(strategy.id);
    }
  }
}
