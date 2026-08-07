import { BadRequestException, ConflictException } from '@nestjs/common';
import { LiveStrategyRiskService } from './live-strategy-risk.service';

describe('LiveStrategyRiskService', () => {
  const strategy = {
    id: 'live-1', symbol: 'BTCUSDT', exchange: 'BINANCE', environment: 'LIVE', mode: 'BINANCE_LIVE', paperTrading: false,
    riskBudgetQuote: 1000, maxOrderQuote: 500, maxStrategyExposureQuote: 800,
    maxOpenParentPositions: 1, maxOpenIndependentPositions: 20, maxIndependentExposureQuote: null,
    maxDailyRealizedLossQuote: 100, maxOpenPairs: 5, cooldownMinutes: 0,
  };

  function createService(ceiling: number | null = 100) {
    const prisma = {
      tradingPosition: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      tradingOrder: { findMany: jest.fn().mockResolvedValue([]) },
      tradingSubPosition: { findMany: jest.fn().mockResolvedValue([]) },
      liveTradingSafetyProfile: { findUnique: jest.fn().mockResolvedValue(ceiling === null ? null : { capitalCeilingQuote: ceiling }) },
    } as any;
    return { service: new LiveStrategyRiskService(prisma), prisma };
  }

  it('requires a user-wide LIVE capital ceiling before a new entry', async () => {
    const { service } = createService(null);
    await expect(service.assertCanExecute('user-1', strategy, null, 'INITIAL_ENTRY', 50))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('enforces the user-wide LIVE capital ceiling before a new entry', async () => {
    const { service } = createService(100);
    await expect(service.assertCanExecute('user-1', strategy, null, 'INITIAL_ENTRY', 100)).resolves.toBeUndefined();
    await expect(service.assertCanExecute('user-1', strategy, null, 'INITIAL_ENTRY', 100.01))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps risk-reducing exits available without requiring a capital-ceiling lookup', async () => {
    const { service, prisma } = createService(null);
    const openPosition = { id: 'position-1', totalCostQuote: 900 };
    await expect(service.assertCanExecute('user-1', strategy, openPosition, 'PARENT_EXIT', 900)).resolves.toBeUndefined();
    expect(prisma.liveTradingSafetyProfile.findUnique).not.toHaveBeenCalled();
  });
});
