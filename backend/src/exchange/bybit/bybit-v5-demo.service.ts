import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import { assertMaximum, assertMinimum, floorToStep, normalizeClientOrderId } from '../demo/exchange-number-normalizer';
import type { DemoCredentials, DemoExchangeOrderAdapter, DemoOrderInput, DemoOrderStatus, NormalizedDemoOrder } from '../demo/demo-order.types';

type BybitEnvelope = { retCode?: number; retMsg?: string; result?: any };

@Injectable()
export class BybitV5DemoService implements DemoExchangeOrderAdapter {
  private readonly baseUrl = 'https://api-testnet.bybit.com';
  private readonly recvWindow = '5000';

  async testConnection(credentials: DemoCredentials) {
    const [account, apiKeyInfo] = await Promise.all([
      this.privateRequest(credentials, 'GET', '/v5/account/info'),
      this.privateRequest(credentials, 'GET', '/v5/user/query-api'),
    ]);
    const spotPermissions = Array.isArray(apiKeyInfo.result?.permissions?.Spot) ? apiKeyInfo.result.permissions.Spot : [];
    const readOnly = Number(apiKeyInfo.result?.readOnly ?? 1) !== 0;
    return {
      connected: true,
      exchange: 'BYBIT',
      environment: 'TESTNET',
      canTrade: !readOnly && spotPermissions.includes('SpotTrade'),
      readOnly,
      spotPermissions,
      account: account.result ?? null,
    };
  }

  async placeOrder(credentials: DemoCredentials, input: DemoOrderInput) {
    const symbol = this.symbol(input.symbol);
    const clientOrderId = normalizeClientOrderId(input.clientOrderId, 36);
    const instrument = await this.instrument(symbol);
    const lot = instrument.lotSizeFilter ?? {};
    const priceFilter = instrument.priceFilter ?? {};
    const quantity = floorToStep(input.quantity, lot.basePrecision ?? lot.qtyStep ?? '0', 'Bybit quantity');
    assertMinimum(quantity, lot.minOrderQty, 'Bybit quantity');
    assertMaximum(quantity, input.type === 'MARKET' ? lot.maxMarketOrderQty : lot.maxOrderQty, 'Bybit quantity');
    let price: string | undefined;
    if (input.type === 'LIMIT') {
      if (!Number.isFinite(Number(input.price)) || Number(input.price) <= 0) throw new BadRequestException('Limit price is required');
      price = floorToStep(Number(input.price), priceFilter.tickSize ?? '0', 'Bybit limit price');
      const minAmount = Number(lot.minOrderAmt ?? 0);
      if (Number.isFinite(minAmount) && minAmount > 0 && Number(quantity) * Number(price) < minAmount) {
        throw new BadRequestException(`Bybit order value must be at least ${lot.minOrderAmt}`);
      }
    } else {
      const minAmount = Number(lot.minOrderAmt ?? 0);
      if (Number.isFinite(minAmount) && minAmount > 0) {
        const marketPrice = await this.marketPrice(symbol);
        if (Number(quantity) * marketPrice < minAmount) {
          throw new BadRequestException(`Bybit order value must be at least ${lot.minOrderAmt}`);
        }
      }
    }

    const payload: Record<string, string> = {
      category: 'spot', symbol, side: input.side === 'BUY' ? 'Buy' : 'Sell',
      orderType: input.type === 'LIMIT' ? 'Limit' : 'Market', qty: quantity, orderLinkId: clientOrderId,
    };
    if (input.type === 'MARKET') payload.marketUnit = 'baseCoin';
    if (price) { payload.price = price; payload.timeInForce = 'GTC'; }
    const placed = await this.privateRequest(credentials, 'POST', '/v5/order/create', payload);
    const orderId = String(placed.result?.orderId ?? '');
    if (!orderId) throw new Error('Bybit accepted the request without returning an order ID');
    return (await this.getOrder(credentials, symbol, orderId));
  }

  async getOrder(credentials: DemoCredentials, symbolInput: string, orderId: string) {
    const symbol = this.symbol(symbolInput);
    const body = await this.privateRequest(credentials, 'GET', '/v5/order/realtime', { category: 'spot', symbol, orderId: orderId.trim() });
    let order = body.result?.list?.[0];
    if (!order) {
      const history = await this.privateRequest(credentials, 'GET', '/v5/order/history', { category: 'spot', symbol, orderId: orderId.trim(), limit: '1' });
      order = history.result?.list?.[0];
    }
    if (!order) throw new BadRequestException('Bybit order was not found');
    return this.normalize(order);
  }

  async findOrderByClientOrderId(credentials: DemoCredentials, symbolInput: string, clientOrderId: string) {
    const symbol = this.symbol(symbolInput);
    const body = await this.privateRequest(credentials, 'GET', '/v5/order/realtime', {
      category: 'spot', symbol, orderLinkId: normalizeClientOrderId(clientOrderId, 36),
    });
    let order = body.result?.list?.[0];
    if (!order) {
      const history = await this.privateRequest(credentials, 'GET', '/v5/order/history', {
        category: 'spot', symbol, orderLinkId: normalizeClientOrderId(clientOrderId, 36), limit: '1',
      });
      order = history.result?.list?.[0];
    }
    return order ? this.normalize(order) : null;
  }

  async cancelOrder(credentials: DemoCredentials, symbolInput: string, orderId: string) {
    const symbol = this.symbol(symbolInput);
    await this.privateRequest(credentials, 'POST', '/v5/order/cancel', { category: 'spot', symbol, orderId: orderId.trim() });
    return this.getOrder(credentials, symbol, orderId);
  }

  private async instrument(symbol: string) {
    const response = await fetch(`${this.baseUrl}/v5/market/instruments-info?category=spot&symbol=${encodeURIComponent(symbol)}`);
    const body = await response.json() as BybitEnvelope;
    this.assertSuccess(response, body, 'instrument');
    const instrument = body.result?.list?.[0];
    if (!instrument || instrument.status !== 'Trading') throw new BadRequestException(`Bybit symbol ${symbol} is not available for trading`);
    return instrument;
  }

  private async marketPrice(symbol: string) {
    const response = await fetch(`${this.baseUrl}/v5/market/tickers?category=spot&symbol=${encodeURIComponent(symbol)}`);
    const body = await response.json() as BybitEnvelope;
    this.assertSuccess(response, body, 'ticker');
    const price = Number(body.result?.list?.[0]?.lastPrice ?? 0);
    if (!Number.isFinite(price) || price <= 0) throw new BadRequestException(`Bybit price for ${symbol} is unavailable`);
    return price;
  }

  private async privateRequest(credentials: DemoCredentials, method: 'GET' | 'POST', path: string, params: Record<string, string> = {}) {
    const timestamp = Date.now().toString();
    const query = new URLSearchParams(params).toString();
    const bodyText = method === 'POST' ? JSON.stringify(params) : '';
    const signaturePayload = `${timestamp}${credentials.apiKey}${this.recvWindow}${method === 'GET' ? query : bodyText}`;
    const signature = createHmac('sha256', credentials.apiSecret).update(signaturePayload).digest('hex');
    const url = `${this.baseUrl}${path}${method === 'GET' && query ? `?${query}` : ''}`;
    const response = await fetch(url, {
      method,
      headers: {
        'X-BAPI-API-KEY': credentials.apiKey,
        'X-BAPI-SIGN': signature,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': this.recvWindow,
        'Content-Type': 'application/json',
      },
      body: method === 'POST' ? bodyText : undefined,
    });
    const body = await response.json() as BybitEnvelope;
    this.assertSuccess(response, body, path);
    return body;
  }

  private assertSuccess(response: Response, body: BybitEnvelope, operation: string) {
    if (!response.ok || Number(body.retCode ?? 0) !== 0) {
      throw new Error(`Bybit ${operation} failed (${body.retCode ?? response.status}): ${body.retMsg ?? response.status}`);
    }
  }

  private normalize(order: any): NormalizedDemoOrder {
    const quantity = String(order.qty ?? '0');
    const filled = String(order.cumExecQty ?? '0');
    const quote = String(order.cumExecValue ?? '0');
    const average = Number(order.avgPrice ?? 0) > 0 ? String(order.avgPrice) : (Number(filled) > 0 ? String(Number(quote) / Number(filled)) : null);
    return {
      exchange: 'BYBIT', exchangeOrderId: String(order.orderId ?? ''), clientOrderId: String(order.orderLinkId ?? ''),
      symbol: String(order.symbol ?? ''), side: String(order.side).toLowerCase() === 'sell' ? 'SELL' : 'BUY',
      type: String(order.orderType).toLowerCase() === 'limit' ? 'LIMIT' : 'MARKET', status: this.status(order.orderStatus),
      quantity, filledQuantity: filled, quoteAmount: quote, averageFillPrice: average,
      price: Number(order.price ?? 0) > 0 ? String(order.price) : null,
    };
  }

  private status(value: string): DemoOrderStatus {
    if (value === 'Filled') return 'FILLED';
    if (value === 'PartiallyFilled') return 'PARTIALLY_FILLED';
    if (['Cancelled', 'Deactivated'].includes(value)) return 'CANCELLED';
    if (value === 'Rejected') return 'REJECTED';
    return 'PENDING';
  }

  private symbol(value: string) {
    const symbol = value.trim().toUpperCase().replace('-', '');
    if (!symbol) throw new BadRequestException('Symbol is required');
    return symbol;
  }
}
