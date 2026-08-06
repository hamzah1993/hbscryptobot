import { DemoExchangeExecutionService } from './demo-exchange-execution.service';
import type { NormalizedDemoOrder } from './demo-order.types';

const recovered: NormalizedDemoOrder = {
  exchange: 'BYBIT', exchangeOrderId: '100', clientOrderId: 'stable-1', symbol: 'BTCUSDT',
  side: 'BUY', type: 'LIMIT', status: 'FILLED', quantity: '0.01', filledQuantity: '0.01',
  quoteAmount: '100', averageFillPrice: '10000', price: '10000',
};

describe('DemoExchangeExecutionService', () => {
  it('reconciles a stable client id before retrying an uncertain placement', async () => {
    const bybit = {
      testConnection: jest.fn().mockResolvedValue({ connected: true, canTrade: true }),
      findOrderByClientOrderId: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(recovered),
      placeOrder: jest.fn().mockRejectedValueOnce(new Error('fetch failed: network timeout')),
    } as any;
    const service = new DemoExchangeExecutionService(
      { getBybit: jest.fn().mockResolvedValue({ apiKey: 'key', apiSecret: 'secret' }) } as any,
      bybit,
      {} as any,
    );
    (service as any).sleep = jest.fn().mockResolvedValue(undefined);

    const result = await service.placeOrder('user-1', 'BYBIT', {
      symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: 0.01, price: 10000, clientOrderId: 'stable-1',
    });

    expect(result).toEqual(expect.objectContaining({ exchangeOrderId: '100', duplicateRecovered: true, attemptCount: 2 }));
    expect(bybit.placeOrder).toHaveBeenCalledTimes(1);
    expect(bybit.findOrderByClientOrderId).toHaveBeenCalledTimes(2);
  });

  it('allows exactly three retries after the initial API failure', async () => {
    const bybit = {
      testConnection: jest.fn().mockResolvedValue({ connected: true, canTrade: true }),
      findOrderByClientOrderId: jest.fn().mockResolvedValue(null),
      placeOrder: jest.fn().mockRejectedValue(new Error('503 temporary exchange failure')),
    } as any;
    const service = new DemoExchangeExecutionService(
      { getBybit: jest.fn().mockResolvedValue({ apiKey: 'key', apiSecret: 'secret' }) } as any,
      bybit,
      {} as any,
    );
    (service as any).sleep = jest.fn().mockResolvedValue(undefined);

    await expect(service.placeOrder('user-1', 'BYBIT', {
      symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01, clientOrderId: 'stable-2',
    })).rejects.toThrow('503 temporary exchange failure');
    expect(bybit.placeOrder).toHaveBeenCalledTimes(4);
    expect((service as any).sleep).toHaveBeenCalledTimes(3);
  });

  it('does not retry validation failures', async () => {
    const service = new DemoExchangeExecutionService({} as any, {} as any, {} as any);
    await expect(service.placeOrder('user-1', 'BYBIT', {
      symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: 0.01, clientOrderId: 'stable-3',
    })).rejects.toThrow('positive price');
  });
});
