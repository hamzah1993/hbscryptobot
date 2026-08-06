import { BadRequestException } from '@nestjs/common';
import { TestnetStrategyRiskService } from './testnet-strategy-risk.service';

describe('TestnetStrategyRiskService fixed budget', () => {
  const strategy = {
    id: 'strategy-1',
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
});
