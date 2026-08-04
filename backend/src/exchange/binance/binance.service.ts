import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

export type BinanceEnvironment = 'testnet' | 'live';

export type BinanceMarketOrderParams = {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  clientOrderId?: string;
};

@Injectable()
export class BinanceService {
  constructor(private readonly config: ConfigService) {}

  private getBaseUrl(environment: BinanceEnvironment) {
    return environment === 'testnet'
      ? 'https://testnet.binance.vision'
      : 'https://api.binance.com';
  }

  async getServerTime(environment: BinanceEnvironment = 'testnet') {
    const response = await fetch(`${this.getBaseUrl(environment)}/api/v3/time`);
    if (!response.ok) throw new Error(`Binance time request failed: ${response.status}`);
    return response.json();
  }

  async getTickerPrice(symbol: string, environment: BinanceEnvironment = 'testnet') {
    const response = await fetch(
      `${this.getBaseUrl(environment)}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol.toUpperCase())}`,
    );
    if (!response.ok) throw new Error(`Binance ticker request failed: ${response.status}`);
    return response.json();
  }

  async getAccount(apiKey: string, apiSecret: string, environment: BinanceEnvironment = 'testnet') {
    return this.signedRequest('/api/v3/account', 'GET', {}, apiKey, apiSecret, environment);
  }

  async testOrder(
    params: { symbol: string; side: 'BUY' | 'SELL'; type: 'MARKET' | 'LIMIT'; quantity: string; price?: string; timeInForce?: 'GTC' | 'IOC' | 'FOK' },
    apiKey: string,
    apiSecret: string,
    environment: BinanceEnvironment = 'testnet',
  ) {
    const payload: Record<string, string> = {
      symbol: params.symbol.toUpperCase(),
      side: params.side,
      type: params.type,
      quantity: params.quantity,
    };
    if (params.type === 'LIMIT') {
      payload.price = params.price ?? '';
      payload.timeInForce = params.timeInForce ?? 'GTC';
    }
    return this.signedRequest('/api/v3/order/test', 'POST', payload, apiKey, apiSecret, environment);
  }

  async placeMarketOrder(
    params: BinanceMarketOrderParams,
    apiKey: string,
    apiSecret: string,
    environment: BinanceEnvironment = 'testnet',
  ) {
    if (environment !== 'testnet') {
      throw new BadRequestException('Live Binance order execution is disabled');
    }

    const quantity = Number(params.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('Order quantity must be positive');
    }

    const payload: Record<string, string> = {
      symbol: params.symbol.trim().toUpperCase(),
      side: params.side,
      type: 'MARKET',
      quantity: params.quantity,
      newOrderRespType: 'FULL',
    };

    if (params.clientOrderId) {
      payload.newClientOrderId = params.clientOrderId;
    }

    return this.signedRequest('/api/v3/order', 'POST', payload, apiKey, apiSecret, environment);
  }

  private async signedRequest(
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
    params: Record<string, string>,
    apiKey: string,
    apiSecret: string,
    environment: BinanceEnvironment,
  ) {
    const timestamp = Date.now().toString();
    const search = new URLSearchParams({ ...params, timestamp, recvWindow: '5000' });
    const signature = createHmac('sha256', apiSecret).update(search.toString()).digest('hex');
    search.set('signature', signature);

    const response = await fetch(`${this.getBaseUrl(environment)}${path}?${search.toString()}`, {
      method,
      headers: { 'X-MBX-APIKEY': apiKey },
    });
    const body = await response.json();
    if (!response.ok) {
      const message = typeof body?.msg === 'string' ? body.msg : `Binance request failed: ${response.status}`;
      throw new Error(message);
    }
    return body;
  }
}
