import { ProductionReadinessService } from './production-readiness.service';

describe('ProductionReadinessService', () => {
  function createService(latencies: number[], options: { unresolved?: number; liveFlag?: string } = {}) {
    const prisma = {
      tradingOrder: { findMany: jest.fn().mockResolvedValue(latencies.map((executionLatencyMs, index) => ({ executionLatencyMs, createdAt: new Date(index) }))) },
      strategyAction: { count: jest.fn().mockResolvedValueOnce(options.unresolved ?? 0).mockResolvedValueOnce(0) },
      exchangeCredential: { groupBy: jest.fn().mockResolvedValue([
        { exchange: 'BINANCE', environment: 'TESTNET', _count: { _all: 1 } },
        { exchange: 'BYBIT', environment: 'TESTNET', _count: { _all: 1 } },
        { exchange: 'OKX', environment: 'TESTNET', _count: { _all: 1 } },
      ]) },
      liveTradingSafetyProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any;
    const health = { snapshot: jest.fn().mockReturnValue({
      scheduler: 'HEALTHY', orderSync: 'HEALTHY', retryScheduler: 'HEALTHY', redis: 'AVAILABLE',
      lastStrategyTickAt: null, lastOrderSyncAt: null, lastRetryTickAt: null, lastError: null,
    }) } as any;
    const config = { get: jest.fn().mockReturnValue(options.liveFlag) } as any;
    const notifications = { getSettings: jest.fn().mockResolvedValue({
      email: { enabled: false, address: 'owner@example.com', minimumSeverity: 'WARNING', providerConfigured: true },
      telegram: { enabled: false, chatId: '', minimumSeverity: 'WARNING', providerConfigured: false },
    }) } as any;
    return new ProductionReadinessService(prisma, health, config, notifications);
  }

  it('reports p95 execution evidence and the exact 1 + 3 retry policy', async () => {
    const result = await createService([100, 120, 140, 150, 160, 170, 180, 190, 200, 250]).snapshot('user-1');
    expect(result.executionEvidence).toEqual(expect.objectContaining({
      sampleCount: 10, p95Ms: 250, maxMs: 250, targetMs: 500, overTargetCount: 0, meetsTarget: true,
      retryPolicy: { initialAttempt: 1, retries: 3, totalAttempts: 4, backoff: 'exponential' },
    }));
    expect(result.productionHardeningReady).toBe(true);
  });

  it('keeps live money blocked even if the feature flag is set', async () => {
    const result = await createService([100, 120, 140, 150, 160, 170, 180, 190, 200, 250], { liveFlag: 'true' }).snapshot('user-1');
    expect(result.liveChecks.liveFeatureFlag).toBe(true);
    expect(result.liveChecks.liveRoutingImplemented).toBe(true);
    expect(result.liveChecks.explicitLiveConfirmationImplemented).toBe(true);
    expect(result.liveConfirmationAvailable).toBe(false);
    expect(result.liveMoneyReady).toBe(false);
  });

  it('unlocks the LIVE confirmation once the flag, LIVE credentials and a ceiling exist, despite hardening gaps', async () => {
    const service = createService([100, 200, 600], { unresolved: 1, liveFlag: 'true' });
    const prisma = (service as any).prisma;
    prisma.exchangeCredential.groupBy.mockResolvedValue([{ exchange: 'BINANCE', environment: 'LIVE', _count: { _all: 1 } }]);
    prisma.liveTradingSafetyProfile.findUnique.mockResolvedValue({ capitalCeilingQuote: 10, confirmedAt: null, confirmationVersion: null });
    const result = await service.snapshot('user-1');
    expect(result.productionHardeningReady).toBe(false);
    expect(result.liveConfirmationAvailable).toBe(true);
    expect(result.liveMoneyReady).toBe(false);
  });

  it('fails hardening when p95 latency breaches 500 ms or actions are unresolved', async () => {
    const result = await createService([100, 200, 600], { unresolved: 1 }).snapshot('user-1');
    expect(result.executionEvidence.meetsTarget).toBe(false);
    expect(result.hardeningChecks.noUnresolvedExchangeActions).toBe(false);
    expect(result.productionHardeningReady).toBe(false);
  });
});
