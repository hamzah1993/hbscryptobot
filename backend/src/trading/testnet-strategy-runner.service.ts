import { Injectable } from '@nestjs/common';
import { MarketDataService } from '../market/market-data.service';
import { PrismaService } from '../prisma/prisma.service';
import { TestnetStrategyExecutionService } from './testnet-strategy-execution.service';

export type TestnetStrategyRunnerAction = 'OPEN' | 'HOLD' | 'SKIP' | 'ERROR';

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
      const openPosition = strategy.positions[0];
      if (openPosition) {
        return {
          strategyId: strategy.id,
          symbol: strategy.symbol,
          action: 'HOLD',
          positionId: openPosition.id,
          message: 'Initial testnet position is already open',
        };
      }

      const quote = await this.marketData.getQuote(strategy.symbol, 'testnet');
      if (!Number.isFinite(quote.price) || quote.price <= 0) {
        throw new Error('Unable to calculate initial testnet quantity from the market price');
      }

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
