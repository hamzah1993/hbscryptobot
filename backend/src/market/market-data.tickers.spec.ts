import { MarketDataService } from './market-data.service';

describe('MarketDataService.getTickers', () => {
  function createService() {
    const binance = {
      get24hTickers: jest.fn().mockResolvedValue([
        { symbol: 'ETHUSDT', lastPrice: '3000.5', priceChangePercent: '-1.2', quoteVolume: '1000' },
        { symbol: 'BTCUSDT', lastPrice: '65000', priceChangePercent: '2.5', quoteVolume: '5000' },
        { symbol: 'ETHBTC', lastPrice: '0.05', priceChangePercent: '0.1', quoteVolume: '10' },
        { symbol: 'DEADUSDT', lastPrice: '0.00000000', priceChangePercent: '0', quoteVolume: '0' },
        { symbol: 'DELISTEDUSDT', lastPrice: '1.0', priceChangePercent: '0', quoteVolume: '0' },
      ]),
      getTradingSymbols: jest.fn().mockResolvedValue([
        { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
        { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
        { symbol: 'ETHBTC', baseAsset: 'ETH', quoteAsset: 'BTC' },
        { symbol: 'DEADUSDT', baseAsset: 'DEAD', quoteAsset: 'USDT' },
      ]),
    };
    return { service: new MarketDataService(binance as any), binance };
  }

  it('returns tradable symbols for the quote asset, sorted by base asset', async () => {
    const { service } = createService();
    const result = await service.getTickers('USDT');
    expect(result.map((item) => item.symbol)).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(result[1]).toEqual({ symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', lastPrice: 3000.5, priceChangePercent: -1.2, quoteVolume: 1000 });
    expect((await service.getTickers('BTC')).map((item) => item.symbol)).toEqual(['ETHBTC']);
  });

  it('shares one Binance request across callers within the cache window', async () => {
    const { service, binance } = createService();
    await Promise.all([service.getTickers('USDT'), service.getTickers('BTC'), service.getTickers('USDT')]);
    await service.getTickers('ETH');
    expect(binance.get24hTickers).toHaveBeenCalledTimes(1);
  });

  it('serves the last snapshot during a Binance outage', async () => {
    const { service, binance } = createService();
    const first = await service.getTickers('USDT');
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    binance.get24hTickers.mockRejectedValueOnce(new Error('timeout'));
    await expect(service.getTickers('USDT')).resolves.toEqual(first);
    jest.restoreAllMocks();
  });
});
