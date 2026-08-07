import { BadRequestException, ConflictException } from '@nestjs/common';
import { LiveStrategyRiskService } from './live-strategy-risk.service';

describe('LiveStrategyRiskService', () => {
  const strategy = {
    id: 'live-1', symbol: 'BTCUSDT', exchange: 'BINANCE', environment: 'LIVE', mode: 'BINANCE_LIVE', paperTrading: false,
    riskBudgetQuote: 1000, maxOrderQuote: 500, maxStrategyExposureQuote: 800,
    maxOpenParentPositions: 1, maxOpenIndependentPositions: 20, maxIndependentExposureQuote: null,
    maxDailyRealizedLossQuote: 100, maxOpenPairs: 5, cooldownMinutes: 0,
  };

  function createService(liveMoneyReady: boolean, ceiling = 100) {
    const prisma = {
      tradingPosition: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      tradingOrder: { findMany: jest.fn().mockResolvedValue([]) },
      tradingSubPosition: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const readiness = { snapshot: jest.fn().mockResolvedValue({
      liveMoneyReady,
      liveSafetyProfile: { capitalCeilingQuote: ceiling },
    }) } as any;
    return { service: new LiveStrategyRiskService(prisma, readiness), readiness };
  }

  it('blocks new LIVE exposure whenever the current readiness gate is not green', async () => {
    const { service } = createService(false);
    await expect(service.assertCanExecute('user-1', strategy, null, 'INITIAL_ENTRY', 50))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('enforces the user-wide LIVE capital ceiling before a new entry', async () => {
    const { service } = createService(true, 100);
    await expect(service.assertCanExecute('user-1', strategy, null, 'INITIAL_ENTRY', 100)).resolves.toBeUndefined();
    await expect(service.assertCanExecute('user-1', strategy, null, 'INITIAL_ENTRY', 100.01))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps risk-reducing exits available after readiness degrades', async () => {
    const { service, readiness } = createService(false);
    const openPosition = { id: 'position-1', totalCostQuote: 900 };
    await expect(service.assertCanExecute('user-1', strategy, openPosition, 'PARENT_EXIT', 900)).resolves.toBeUndefined();
    expect(readiness.snapshot).not.toHaveBeenCalled();
  });
});
