import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import { assertMaximum, assertMinimum, floorToStep, normalizeClientOrderId } from '../demo/exchange-number-normalizer';
import type { DemoCredentials, DemoExchangeOrderAdapter, DemoOrderInput, DemoOrderStatus, NormalizedDemoOrder } from '../demo/demo-order.types';

type OkxEnvelope = { code?: string; msg?: string; data?: any[] };

@Injectable()
export class OkxV5DemoService implements DemoExchangeOrderAdapter {
  private readonly baseUrl = 'https://www.okx.com';

  async testConnection(credentials: DemoCredentials) {
    const body = await this.privateRequest(credentials, 'GET', '/api/v5/account/config');
    const account = body.data?.[0] ?? null;
    const permissions = String(account?.perm ?? '').split(',').map((item) => item.trim()).filter(Boolean);
    return { connected: true, exchange: 'OKX', environment: 'DEMO', canTrade: permissions.includes('trade'), permissions, account };
  }

  async placeOrder(credentials: DemoCredentials, input: DemoOrderInput) {
    const symbol = this.symbol(input.symbol);
    const clientOrderId = normalizeClientOrderId(input.clientOrderId, 32);
    const instrument = await this.instrument(symbol);
    const quantity = floorToStep(input.quantity, String(instrument.lotSz ?? '0'), 'OKX quantity');
    assertMinimum(quantity, instrument.minSz, 'OKX quantity');
    assertMaximum(quantity, input.type === 'MARKET' ? instrument.maxMktSz : instrument.maxLmtSz, 'OKX quantity');
    let price: string | undefined;
    if (input.type === 'LIMIT') {
      if (!Number.isFinite(Number(input.price)) || Number(input.price) <= 0) throw new BadRequestException('Limit price is required');
      price = floorToStep(Number(input.price), String(instrument.tickSz ?? '0'), 'OKX limit price');
    }

    const payload: Record<string, string> = {
      instId: symbol, tdMode: 'cash', side: input.side.toLowerCase(),
      ordType: input.type === 'LIMIT' ? 'limit' : 'market', sz: quantity, clOrdId: clientOrderId,
    };
    if (input.type === 'MARKET') payload.tgtCcy = 'base_ccy';
    if (price) payload.px = price;
    const placed = await this.privateRequest(credentials, 'POST', '/api/v5/trade/order', payload);
    const result = placed.data?.[0];
    if (!result || result.sCode !== '0' || !result.ordId) throw new Error(`OKX place order failed: ${result?.sMsg ?? placed.msg ?? 'unknown error'}`);
    return this.getOrder(credentials, symbol, String(result.ordId));
  }

  async getOrder(credentials: DemoCredentials, symbolInput: string, orderId: string) {
    const symbol = this.symbol(symbolInput);
    const body = await this.privateRequest(credentials, 'GET', '/api/v5/trade/order', { instId: symbol, ordId: orderId.trim() });
    const order = body.data?.[0];
    if (!order) throw new BadRequestException('OKX order was not found');
    return this.normalize(order);
  }

  async findOrderByClientOrderId(credentials: DemoCredentials, symbolInput: string, clientOrderId: string) {
    const symbol = this.symbol(symbolInput);
    const normalizedId = normalizeClientOrderId(clientOrderId, 32);
    try {
      const body = await this.privateRequest(credentials, 'GET', '/api/v5/trade/order', { instId: symbol, clOrdId: normalizedId });
      return body.data?.[0] ? this.normalize(body.data[0]) : null;
    } catch (error) {
      if (/order.*not.*exist|51603/i.test(error instanceof Error ? error.message : String(error))) return null;
      throw error;
    }
  }

  async cancelOrder(credentials: DemoCredentials, symbolInput: string, orderId: string) {
    const symbol = this.symbol(symbolInput);
    const body = await this.privateRequest(credentials, 'POST', '/api/v5/trade/cancel-order', { instId: symbol, ordId: orderId.trim() });
    const result = body.data?.[0];
    if (!result || result.sCode !== '0') throw new Error(`OKX cancel order failed: ${result?.sMsg ?? body.msg ?? 'unknown error'}`);
    return this.getOrder(credentials, symbol, orderId);
  }

  private async instrument(symbol: string) {
    const response = await fetch(`${this.baseUrl}/api/v5/public/instruments?instType=SPOT&instId=${encodeURIComponent(symbol)}`);
    const body = await response.json() as OkxEnvelope;
    this.assertSuccess(response, body, 'instrument');
    const instrument = body.data?.[0];
    if (!instrument || instrument.state !== 'live') throw new BadRequestException(`OKX symbol ${symbol} is not available for trading`);
    return instrument;
  }

  private async privateRequest(credentials: DemoCredentials, method: 'GET' | 'POST', path: string, params: Record<string, string> = {}) {
    if (!credentials.passphrase) throw new BadRequestException('OKX API passphrase is required');
    const query = new URLSearchParams(params).toString();
    const requestPath = `${path}${method === 'GET' && query ? `?${query}` : ''}`;
    const bodyText = method === 'POST' ? JSON.stringify(params) : '';
    const timestamp = new Date().toISOString();
    const signature = createHmac('sha256', credentials.apiSecret).update(`${timestamp}${method}${requestPath}${bodyText}`).digest('base64');
    const response = await fetch(`${this.baseUrl}${requestPath}`, {
      method,
      headers: {
        'OK-ACCESS-KEY': credentials.apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': credentials.passphrase,
        'x-simulated-trading': '1',
        'Content-Type': 'application/json',
      },
      body: method === 'POST' ? bodyText : undefined,
    });
    const body = await response.json() as OkxEnvelope;
    this.assertSuccess(response, body, path);
    return body;
  }

  private assertSuccess(response: Response, body: OkxEnvelope, operation: string) {
    if (!response.ok || body.code !== '0') throw new Error(`OKX ${operation} failed (${body.code ?? response.status}): ${body.msg ?? response.status}`);
  }

  private normalize(order: any): NormalizedDemoOrder {
    const filled = String(order.accFillSz ?? '0');
    const average = Number(order.avgPx ?? 0) > 0 ? String(order.avgPx) : null;
    const quote = average ? String(Number(filled) * Number(average)) : '0';
    return {
      exchange: 'OKX', exchangeOrderId: String(order.ordId ?? ''), clientOrderId: String(order.clOrdId ?? ''),
      symbol: String(order.instId ?? ''), side: String(order.side).toLowerCase() === 'sell' ? 'SELL' : 'BUY',
      type: String(order.ordType).toLowerCase() === 'limit' ? 'LIMIT' : 'MARKET', status: this.status(order.state),
      quantity: String(order.sz ?? '0'), filledQuantity: filled, quoteAmount: quote, averageFillPrice: average,
      price: Number(order.px ?? 0) > 0 ? String(order.px) : null,
    };
  }

  private status(value: string): DemoOrderStatus {
    if (value === 'filled') return 'FILLED';
    if (value === 'partially_filled') return 'PARTIALLY_FILLED';
    if (value === 'canceled') return 'CANCELLED';
    if (value === 'mmp_canceled') return 'CANCELLED';
    return 'PENDING';
  }

  private symbol(value: string) {
    const clean = value.trim().toUpperCase();
    if (!clean) throw new BadRequestException('Symbol is required');
    if (clean.includes('-')) return clean;
    const quotes = ['USDT', 'USDC', 'BTC', 'ETH'];
    const quote = quotes.find((candidate) => clean.endsWith(candidate) && clean.length > candidate.length);
    if (!quote) throw new BadRequestException('OKX spot symbol must include a supported quote asset');
    return `${clean.slice(0, -quote.length)}-${quote}`;
  }
}
