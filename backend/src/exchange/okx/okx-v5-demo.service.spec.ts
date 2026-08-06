import { OkxV5DemoService } from './okx-v5-demo.service';

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: jest.fn().mockResolvedValue(body) } as unknown as Response;
}

describe('OkxV5DemoService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('normalizes spot precision and exposes a partial fill', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ code: '0', data: [{ state: 'live', lotSz: '0.001', minSz: '0.001', tickSz: '0.10' }] }))
      .mockResolvedValueOnce(jsonResponse({ code: '0', data: [{ ordId: 'ok-1', clOrdId: 'client-1', sCode: '0', sMsg: '' }] }))
      .mockResolvedValueOnce(jsonResponse({ code: '0', data: [{ ordId: 'ok-1', clOrdId: 'client-1', instId: 'BTC-USDT', side: 'buy', ordType: 'limit', state: 'partially_filled', sz: '0.012', accFillSz: '0.005', avgPx: '10000', px: '10000.10' }] }));

    const service = new OkxV5DemoService();
    const result = await service.placeOrder({ apiKey: 'key', apiSecret: 'secret', passphrase: 'pass' }, {
      symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: 0.0129, price: 10000.19, clientOrderId: 'client-1',
    });

    expect(result).toEqual(expect.objectContaining({ symbol: 'BTC-USDT', status: 'PARTIALLY_FILLED', filledQuantity: '0.005', quoteAmount: '50' }));
    const placement = fetchMock.mock.calls[1];
    expect(JSON.parse(String((placement[1] as RequestInit).body))).toEqual(expect.objectContaining({ instId: 'BTC-USDT', sz: '0.012', px: '10000.1', clOrdId: 'client-1' }));
    expect((placement[1] as RequestInit).headers).toEqual(expect.objectContaining({ 'x-simulated-trading': '1', 'OK-ACCESS-KEY': 'key' }));
  });

  it('uses base currency sizing for spot market orders', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ code: '0', data: [{ state: 'live', lotSz: '0.01', minSz: '0.01', tickSz: '0.1' }] }))
      .mockResolvedValueOnce(jsonResponse({ code: '0', data: [{ ordId: 'ok-2', sCode: '0' }] }))
      .mockResolvedValueOnce(jsonResponse({ code: '0', data: [{ ordId: 'ok-2', clOrdId: 'client-2', instId: 'ETH-USDT', side: 'sell', ordType: 'market', state: 'filled', sz: '1.23', accFillSz: '1.23', avgPx: '2000', px: '' }] }));
    const service = new OkxV5DemoService();
    await service.placeOrder({ apiKey: 'key', apiSecret: 'secret', passphrase: 'pass' }, {
      symbol: 'ETHUSDT', side: 'SELL', type: 'MARKET', quantity: 1.239, clientOrderId: 'client-2',
    });
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual(expect.objectContaining({ sz: '1.23', tgtCcy: 'base_ccy' }));
  });
});
