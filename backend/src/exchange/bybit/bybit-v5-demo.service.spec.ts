import { BybitV5DemoService } from './bybit-v5-demo.service';

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: jest.fn().mockResolvedValue(body) } as unknown as Response;
}

describe('BybitV5DemoService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('normalizes quantity/price and exposes a partial fill', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ retCode: 0, result: { list: [{ status: 'Trading', lotSizeFilter: { basePrecision: '0.001', minOrderQty: '0.001', minOrderAmt: '5' }, priceFilter: { tickSize: '0.10' } }] } }))
      .mockResolvedValueOnce(jsonResponse({ retCode: 0, result: { orderId: 'by-1', orderLinkId: 'client-1' } }))
      .mockResolvedValueOnce(jsonResponse({ retCode: 0, result: { list: [{ orderId: 'by-1', orderLinkId: 'client-1', symbol: 'BTCUSDT', side: 'Buy', orderType: 'Limit', orderStatus: 'PartiallyFilled', qty: '0.012', cumExecQty: '0.005', cumExecValue: '50', avgPrice: '10000', price: '10000.10' }] } }));

    const service = new BybitV5DemoService();
    const result = await service.placeOrder({ apiKey: 'key', apiSecret: 'secret' }, {
      symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: 0.0129, price: 10000.19, clientOrderId: 'client-1',
    });

    expect(result).toEqual(expect.objectContaining({ status: 'PARTIALLY_FILLED', filledQuantity: '0.005', quoteAmount: '50' }));
    const placement = fetchMock.mock.calls[1];
    expect(JSON.parse(String((placement[1] as RequestInit).body))).toEqual(expect.objectContaining({ qty: '0.012', price: '10000.1', orderLinkId: 'client-1' }));
    expect((placement[1] as RequestInit).headers).toEqual(expect.objectContaining({ 'X-BAPI-API-KEY': 'key' }));
  });

  it('cancels and reconciles the final cancelled state', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ retCode: 0, result: { orderId: 'by-2' } }))
      .mockResolvedValueOnce(jsonResponse({ retCode: 0, result: { list: [{ orderId: 'by-2', orderLinkId: 'client-2', symbol: 'ETHUSDT', side: 'Buy', orderType: 'Limit', orderStatus: 'Cancelled', qty: '1', cumExecQty: '0.2', cumExecValue: '400', avgPrice: '2000', price: '1900' }] } }));
    const service = new BybitV5DemoService();
    const result = await service.cancelOrder({ apiKey: 'key', apiSecret: 'secret' }, 'ETHUSDT', 'by-2');
    expect(result.status).toBe('CANCELLED');
    expect(result.filledQuantity).toBe('0.2');
  });

  it('forces spot market quantity to base-coin units and checks minimum notional', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ retCode: 0, result: { list: [{ status: 'Trading', lotSizeFilter: { basePrecision: '0.001', minOrderQty: '0.001', minOrderAmt: '5', maxMarketOrderQty: '10' }, priceFilter: { tickSize: '0.10' } }] } }))
      .mockResolvedValueOnce(jsonResponse({ retCode: 0, result: { list: [{ lastPrice: '10000' }] } }))
      .mockResolvedValueOnce(jsonResponse({ retCode: 0, result: { orderId: 'by-3' } }))
      .mockResolvedValueOnce(jsonResponse({ retCode: 0, result: { list: [{ orderId: 'by-3', orderLinkId: 'client-3', symbol: 'BTCUSDT', side: 'Buy', orderType: 'Market', orderStatus: 'Filled', qty: '0.002', cumExecQty: '0.002', cumExecValue: '20', avgPrice: '10000', price: '' }] } }));
    const service = new BybitV5DemoService();
    await service.placeOrder({ apiKey: 'key', apiSecret: 'secret' }, {
      symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.0029, clientOrderId: 'client-3',
    });
    expect(JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))).toEqual(expect.objectContaining({ qty: '0.002', marketUnit: 'baseCoin' }));
  });
});
