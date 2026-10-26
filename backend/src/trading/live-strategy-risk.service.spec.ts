import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { LiveStrategyRiskService } from './live-strategy-risk.service';
import { LIVE_CONFIRMATION_VERSION } from './live-trading-safety.service';

describe('LiveStrategyRiskService', () => {
  const strategy = {
    id: 'live-1', symbol: 'BTCUSDT', exchange: 'BINANCE', environment: 'LIVE', mode: 'BINANCE_LIVE', paperTrading: false,
    riskBudgetQuote: 1000, maxOrderQuote: 500, maxStrategyExposureQuote: 800,
    maxOpenParentPositions: 1, maxOpenIndependentPositions: 20, maxIndependentExposureQuote: null,
    maxDailyRealizedLossQuote: 100, maxOpenPairs: 5, cooldownMinutes: 0,
  };

  function createService(
    ceiling: number | null = 100,
    options: { liveFlag?: string; confirmed?: boolean; billingError?: Error } = {},
  ) {
    const confirmed = options.confirmed ?? true;
    const prisma = {
      tradingPosition: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      tradingOrder: { findMany: jest.fn().mockResolvedValue([]) },
      tradingSubPosition: { findMany: jest.fn().mockResolvedValue([]) },
      liveTradingSafetyProfile: {
        findUnique: jest.fn().mockResolvedValue(ceiling === null ? null : {
          capitalCeilingQuote: ceiling,
          confirmedAt: confirmed ? new Date() : null,
          confirmationVersion: confirmed ? LIVE_CONFIRMATION_VERSION : null,
        }),
      },
    } as any;
    const config = { get: jest.fn().mockReturnValue('liveFlag' in options ? options.liveFlag : 'true') } as any;
    const billing = {
      assertCanOpenLiveEntry: options.billingError
        ? jest.fn().mockRejectedValue(options.billingError)
        : jest.fn().mockResolvedValue(undefined),
    } as any;
    return { service: new LiveStrategyRiskService(prisma, config, billing), prisma, billing };
  }

  it('blocks entries without an active membership and minimum balance', async () => {
    const { service } = createService(100, { billingError: new ConflictException('An active membership is required to open new LIVE trades') });
    await expect(service.assertCanExecute('user-1', strategy, null, 'INITIAL_ENTRY', 10))
      .rejects.toThrow('active membership');
  });

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

  it('blocks entries when ENABLE_LIVE_TRADING is not true', async () => {
    for (const liveFlag of [undefined, 'false', 'TRUE ']) {
      const { service } = createService(100, { liveFlag });
      await expect(service.assertCanExecute('user-1', strategy, null, 'INITIAL_ENTRY', 10))
        .rejects.toBeInstanceOf(ServiceUnavailableException);
    }
  });

  it('blocks entries until the current LIVE confirmation is recorded', async () => {
    const { service } = createService(100, { confirmed: false });
    await expect(service.assertCanExecute('user-1', strategy, null, 'INITIAL_ENTRY', 10))
      .rejects.toThrow('Confirm Binance LIVE trading');
  });

  it('rejects entries whose value cannot be determined instead of skipping risk limits', async () => {
    const { service } = createService(100);
    for (const estimate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(service.assertCanExecute('user-1', strategy, null, 'INITIAL_ENTRY', estimate))
        .rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(service.assertCanExecute('user-1', strategy, { id: 'p-1', totalCostQuote: 10 }, undefined, 0))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps risk-reducing exits available even with live entries disabled and no ceiling', async () => {
    const { service, prisma, billing } = createService(null, { liveFlag: 'false', confirmed: false, billingError: new ConflictException('no membership') });
    const openPosition = { id: 'position-1', totalCostQuote: 900 };
    await expect(service.assertCanExecute('user-1', strategy, openPosition, 'PARENT_EXIT', 900)).resolves.toBeUndefined();
    await expect(service.assertCanExecute('user-1', strategy, openPosition, 'INDEPENDENT_EXIT', 0)).resolves.toBeUndefined();
    expect(prisma.liveTradingSafetyProfile.findUnique).not.toHaveBeenCalled();
    expect(billing.assertCanOpenLiveEntry).not.toHaveBeenCalled();
  });
});
