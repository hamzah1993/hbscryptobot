import { TestnetStrategyExecutionRouterService } from './testnet-strategy-execution-router.service';

describe('TestnetStrategyExecutionRouterService', () => {
  const input = { strategyId: 'strategy-1', side: 'BUY' as const, quantity: 1 };

  function serviceFor(exchange: 'BINANCE' | 'BYBIT' | 'OKX') {
    const prisma = { tradingStrategy: { findFirst: jest.fn().mockResolvedValue({ exchange, environment: 'TESTNET', paperTrading: false }) } } as any;
    const binance = { executeMarketOrder: jest.fn().mockResolvedValue({ exchange: 'BINANCE', environment: 'TESTNET', ok: true }) } as any;
    const binanceLive = { executeMarketOrder: jest.fn().mockResolvedValue({ exchange: 'BINANCE', environment: 'LIVE', ok: true }) } as any;
    return { service: new TestnetStrategyExecutionRouterService(prisma, binance, binanceLive), binance, binanceLive };
  }

  it('routes a verified Binance Testnet strategy through the established execution service', async () => {
    const { service, binance } = serviceFor('BINANCE');
    await expect(service.executeMarketOrder('user-1', input)).resolves.toEqual({ exchange: 'BINANCE', environment: 'TESTNET', ok: true });
    expect(binance.executeMarketOrder).toHaveBeenCalledWith('user-1', input);
  });

  it('routes Binance LIVE only through the guarded live execution service', async () => {
    const prisma = { tradingStrategy: { findFirst: jest.fn().mockResolvedValue({ exchange: 'BINANCE', environment: 'LIVE', paperTrading: false }) } } as any;
    const binance = { executeMarketOrder: jest.fn() } as any;
    const binanceLive = { executeMarketOrder: jest.fn().mockResolvedValue({ environment: 'LIVE', ok: true }) } as any;
    const service = new TestnetStrategyExecutionRouterService(prisma, binance, binanceLive);
    await expect(service.executeMarketOrder('user-1', input)).resolves.toEqual({ environment: 'LIVE', ok: true });
    expect(binance.executeMarketOrder).not.toHaveBeenCalled();
    expect(binanceLive.executeMarketOrder).toHaveBeenCalledWith('user-1', input);
  });

  it.each(['BYBIT', 'OKX'] as const)('keeps %s strategy execution locked before credential-backed E2E verification', async (exchange) => {
    const { service, binance } = serviceFor(exchange);
    await expect(service.executeMarketOrder('user-1', input)).rejects.toThrow('credential-backed Demo/Testnet E2E verification');
    expect(binance.executeMarketOrder).not.toHaveBeenCalled();
  });
});
