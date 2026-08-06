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
});
