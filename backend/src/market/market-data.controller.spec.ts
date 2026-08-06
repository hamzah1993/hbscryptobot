import { BadRequestException } from '@nestjs/common';
import { MarketDataController } from './market-data.controller';

describe('MarketDataController', () => {
  const marketData = {} as any;
  const websocketMarketData = {
    getLatestPrice: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns multiple streamed prices in one request and de-duplicates symbols', () => {
    websocketMarketData.getLatestPrice.mockImplementation((symbol: string) => ({
      symbol,
      price: symbol === 'BTCUSDT' ? 65_000 : 3_500,
      eventTime: 1,
      receivedAt: 1,
      environment: 'testnet',
    }));
    const controller = new MarketDataController(marketData, websocketMarketData as any);

    expect(controller.getStreamPrices(' btcusdt,ETHUSDT,BTCUSDT ', 'testnet')).toEqual({
      environment: 'testnet',
      prices: [
        { symbol: 'BTCUSDT', price: expect.objectContaining({ symbol: 'BTCUSDT', price: 65_000 }) },
        { symbol: 'ETHUSDT', price: expect.objectContaining({ symbol: 'ETHUSDT', price: 3_500 }) },
      ],
    });
    expect(websocketMarketData.getLatestPrice).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid streamed-price symbols', () => {
    const controller = new MarketDataController(marketData, websocketMarketData as any);

    expect(() => controller.getStreamPrices('BTC/USDT', 'testnet')).toThrow(BadRequestException);
  });

  it('caps a streamed-price batch at 20 symbols', () => {
    const controller = new MarketDataController(marketData, websocketMarketData as any);
    const symbols = Array.from({ length: 21 }, (_, index) => `PAIR${String(index).padStart(2, '0')}USDT`).join(',');

    expect(() => controller.getStreamPrices(symbols, 'testnet')).toThrow(BadRequestException);
  });
});
