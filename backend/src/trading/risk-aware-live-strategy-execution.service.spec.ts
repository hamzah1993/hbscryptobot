import { ServiceUnavailableException } from '@nestjs/common';
import { RiskAwareLiveStrategyExecutionService } from './risk-aware-live-strategy-execution.service';
import { TestnetStrategyExecutionService } from './testnet-strategy-execution.service';

describe('RiskAwareLiveStrategyExecutionService', () => {
  const strategy = { id: 'live-1', userId: 'user-1', symbol: 'BTCUSDT' };

  function createService(options: { openPosition?: any; price?: number; quoteError?: Error } = {}) {
    const prisma = {
      tradingStrategy: { findFirst: jest.fn().mockResolvedValue(strategy) },
      tradingPosition: { findFirst: jest.fn().mockResolvedValue(options.openPosition ?? null) },
    } as any;
    const liveRisk = { assertCanExecute: jest.fn().mockResolvedValue(undefined) } as any;
    const marketData = {
      getQuote: options.quoteError
        ? jest.fn().mockRejectedValue(options.quoteError)
        : jest.fn().mockResolvedValue({ price: options.price ?? 50_000 }),
    } as any;
    const service = new RiskAwareLiveStrategyExecutionService(
      prisma, {} as any, {} as any, {} as any, liveRisk, {} as any, marketData,
    );
    const baseExecute = jest
      .spyOn(TestnetStrategyExecutionService.prototype, 'executeMarketOrder')
      .mockResolvedValue({ submitted: true } as any);
    return { service, liveRisk, marketData, baseExecute };
  }

  afterEach(() => jest.restoreAllMocks());

  it('prices a manual market BUY from the live quote when no price is supplied', async () => {
    const { service, liveRisk, marketData } = createService({ price: 50_000 });
    await service.executeMarketOrder('user-1', { strategyId: 'live-1', side: 'BUY', quantity: 2, orderType: 'MARKET' });
    expect(marketData.getQuote).toHaveBeenCalledWith('BTCUSDT', 'live', true);
    expect(liveRisk.assertCanExecute).toHaveBeenCalledWith('user-1', strategy, null, 'INITIAL_ENTRY', 100_000, false);
  });

  it('ignores an understated client price for a market BUY', async () => {
    const { service, liveRisk } = createService({ price: 50_000 });
    await service.executeMarketOrder('user-1', {
      strategyId: 'live-1', side: 'BUY', quantity: 2, orderType: 'MARKET', triggerPrice: 0.0001, plannedQuoteAmount: 0.0002,
    });
    expect(liveRisk.assertCanExecute.mock.calls[0][4]).toBe(100_000);
  });

  it('never estimates below the planned quote amount', async () => {
    const { service, liveRisk } = createService({ price: 9.9 });
    await service.executeMarketOrder('user-1', {
      strategyId: 'live-1', side: 'BUY', quantity: 1, orderType: 'MARKET', actionType: 'INITIAL_ENTRY', actionKey: 'k', plannedQuoteAmount: 10,
    });
    expect(liveRisk.assertCanExecute.mock.calls[0][4]).toBe(10);
  });

  it('values a LIMIT BUY at its limit price without a quote lookup', async () => {
    const { service, liveRisk, marketData } = createService();
    await service.executeMarketOrder('user-1', { strategyId: 'live-1', side: 'BUY', quantity: 3, orderType: 'LIMIT', limitPrice: 10 });
    expect(marketData.getQuote).not.toHaveBeenCalled();
    expect(liveRisk.assertCanExecute.mock.calls[0][4]).toBe(30);
  });

  it('fails closed when the live price is unavailable for a market BUY', async () => {
    const { service, liveRisk, baseExecute } = createService({ quoteError: new Error('timeout') });
    await expect(service.executeMarketOrder('user-1', { strategyId: 'live-1', side: 'BUY', quantity: 1, orderType: 'MARKET' }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(liveRisk.assertCanExecute).not.toHaveBeenCalled();
    expect(baseExecute).not.toHaveBeenCalled();
  });

  it('classifies a manual SELL as an exit and does not need a live quote', async () => {
    const openPosition = { id: 'p-1', averageEntryPrice: 100, totalQuantity: 1 };
    const { service, liveRisk, marketData } = createService({ openPosition, quoteError: new Error('down') });
    await service.executeMarketOrder('user-1', { strategyId: 'live-1', side: 'SELL', quantity: 1, orderType: 'MARKET' });
    expect(marketData.getQuote).not.toHaveBeenCalled();
    expect(liveRisk.assertCanExecute).toHaveBeenCalledWith('user-1', strategy, openPosition, 'PARENT_EXIT', 100, false);
  });
});
