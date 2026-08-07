import { BadRequestException } from '@nestjs/common';
import { TestnetStrategyRiskService } from './testnet-strategy-risk.service';

describe('TestnetStrategyRiskService fixed budget', () => {
  const strategy = {
    id: 'strategy-1',
    exchange: 'BINANCE',
    mode: 'BINANCE_TESTNET',
    environment: 'TESTNET',
    paperTrading: false,
    riskBudgetQuote: 1000,
    maxOrderQuote: null,
    maxStrategyExposureQuote: null,
    maxOpenParentPositions: 1,
    maxOpenIndependentPositions: 20,
    maxIndependentExposureQuote: null,
    maxDailyRealizedLossQuote: null,
  };

  it('counts open independent exposure against the same fixed risk budget', async () => {
    const prisma = {
      tradingSubPosition: {
        findMany: jest.fn().mockResolvedValue([{ costQuote: 250 }, { costQuote: 150 }]),
      },
    } as any;
    const service = new TestnetStrategyRiskService(prisma);
    const position = { id: 'position-1', totalCostQuote: 500 };

    await expect(service.assertCanExecute(
      'user-1', strategy, position, 'RECOVERY_DCA_ENTRY', 101,
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.assertCanExecute(
      'user-1', strategy, position, 'RECOVERY_DCA_ENTRY', 100,
    )).resolves.toBeUndefined();
  });

  it('allows an order exactly at the fixed-budget boundary and rejects any amount above it', async () => {
    const prisma = {
      tradingSubPosition: { findMany: jest.fn().mockResolvedValue([{ costQuote: 200 }]) },
    } as any;
    const service = new TestnetStrategyRiskService(prisma);
    const position = { id: 'position-1', totalCostQuote: 700 };

    await expect(service.assertCanExecute(
      'user-1', strategy, position, 'DCA_ENTRY', 100,
    )).resolves.toBeUndefined();
    await expect(service.assertCanExecute(
      'user-1', strategy, position, 'DCA_ENTRY', 100.01,
    )).rejects.toThrow('Order would exceed the configured fixed risk budget');
  });

  it('blocks a new distinct pair when the per-user open-pair ceiling is reached', async () => {
    const prisma = {
      tradingPosition: {
        findMany: jest.fn().mockResolvedValue(Array.from({ length: 5 }, (_, index) => ({ symbol: `PAIR${index}USDT` }))),
      },
    } as any;
    const service = new TestnetStrategyRiskService(prisma);
    await expect(service.assertCanExecute('user-1', {
      ...strategy, symbol: 'BTCUSDT', maxOpenPairs: 5, cooldownMinutes: 0,
    }, null, 'INITIAL_ENTRY', 100)).rejects.toThrow('Maximum simultaneously open pairs reached');
  });

  it('blocks a new cycle until the configured post-TP cooldown expires', async () => {
    const prisma = {
      tradingPosition: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ closedAt: new Date(Date.now() - 30 * 60_000) }),
      },
    } as any;
    const service = new TestnetStrategyRiskService(prisma);
    await expect(service.assertCanExecute('user-1', {
      ...strategy, symbol: 'BTCUSDT', maxOpenPairs: 5, cooldownMinutes: 60,
    }, null, 'INITIAL_ENTRY', 100)).rejects.toThrow('post-take-profit cooldown');
  });
});
