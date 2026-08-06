import { BinanceTestnetOrderService } from './binance-testnet-order.service';

describe('BinanceTestnetOrderService client-order recovery', () => {
  function createService() {
    const binance = { getOrderByClientOrderId: jest.fn() } as any;
    const credentials = {
      getBinance: jest.fn().mockResolvedValue({ apiKey: 'test-key', apiSecret: 'test-secret' }),
    } as any;
    return {
      service: new BinanceTestnetOrderService(binance, credentials),
      binance,
    };
  }

  it('returns the exchange order when Binance recognizes the stable client id', async () => {
    const { service, binance } = createService();
    const exchangeOrder = { orderId: 123, status: 'FILLED', clientOrderId: 'hbs-stable' };
    binance.getOrderByClientOrderId.mockResolvedValue(exchangeOrder);

    await expect(service.findOrderByClientOrderId('user-1', 'btcusdt', 'hbs-stable'))
      .resolves.toBe(exchangeOrder);

    expect(binance.getOrderByClientOrderId).toHaveBeenCalledWith(
      'BTCUSDT',
      'hbs-stable',
      'test-key',
      'test-secret',
      'testnet',
    );
  });

  it('returns null only when Binance explicitly says the order does not exist', async () => {
    const { service, binance } = createService();
    binance.getOrderByClientOrderId.mockRejectedValue(new Error('Order does not exist.'));

    await expect(service.findOrderByClientOrderId('user-1', 'BTCUSDT', 'hbs-missing'))
      .resolves.toBeNull();
  });

  it('propagates an ambiguous lookup failure instead of allowing a blind resubmission', async () => {
    const { service, binance } = createService();
    binance.getOrderByClientOrderId.mockRejectedValue(new Error('Gateway timeout'));

    await expect(service.findOrderByClientOrderId('user-1', 'BTCUSDT', 'hbs-unknown'))
      .rejects.toThrow('Gateway timeout');
  });

  it('places entries as normalized GTC limit orders', async () => {
    const binance = {
      getSymbolInfo: jest.fn().mockResolvedValue({
        baseAsset: 'BTC', quoteAsset: 'USDT', filters: [
          { filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '100', stepSize: '0.001' },
          { filterType: 'PRICE_FILTER', tickSize: '0.10' },
          { filterType: 'MIN_NOTIONAL', minNotional: '5' },
        ],
      }),
      placeLimitOrder: jest.fn().mockResolvedValue({ orderId: 42, status: 'NEW' }),
    } as any;
    const credentials = { getBinance: jest.fn().mockResolvedValue({ apiKey: 'key', apiSecret: 'secret' }) } as any;
    const service = new BinanceTestnetOrderService(binance, credentials);

    await service.placeLimitOrder('user-1', { symbol: 'btcusdt', side: 'BUY', quantity: 0.1019, price: 100.19, clientOrderId: 'hbs-entry' });
    expect(binance.placeLimitOrder).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'BTCUSDT', side: 'BUY', quantity: '0.101', price: '100.1', clientOrderId: 'hbs-entry' }),
      'key', 'secret', 'testnet',
    );
  });
});
