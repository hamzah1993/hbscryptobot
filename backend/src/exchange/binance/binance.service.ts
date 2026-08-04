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

export type BinanceSymbolFilter = {
  filterType: string;
  minQty?: string;
  maxQty?: string;
  stepSize?: string;
  minNotional?: string;
  notional?: string;
  applyToMarket?: boolean;
  applyMinToMarket?: boolean;
};

export type BinanceSymbolInfo = {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  filters: BinanceSymbolFilter[];
};

export type BinanceKlineInterval =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '8h'
  | '12h'
  | '1d'
  | '3d'
  | '1w'
  | '1M';

export type BinanceKline = {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
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

  async getKlines(
    symbol: string,
    interval: BinanceKlineInterval = '5m',
    limit = 200,
    environment: BinanceEnvironment = 'live',
  ): Promise<BinanceKline[]> {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) throw new BadRequestException('Symbol is required');
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new BadRequestException('Kline limit must be an integer between 1 and 1000');
    }

    const search = new URLSearchParams({
      symbol: normalized,
      interval,
      limit: String(limit),
    });
    const response = await fetch(`${this.getBaseUrl(environment)}/api/v3/klines?${search.toString()}`);
    const body = await response.json();
    if (!response.ok) {
      const message = typeof body?.msg === 'string' ? body.msg : `Binance klines request failed: ${response.status}`;
      throw new Error(message);
    }
    if (!Array.isArray(body)) throw new Error('Binance klines response is invalid');

    return body.map((item: unknown) => {
      if (!Array.isArray(item) || item.length < 7) {
        throw new Error('Binance kline item is invalid');
      }
      return {
        openTime: Number(item[0]),
        open: String(item[1]),
        high: String(item[2]),
        low: String(item[3]),
        close: String(item[4]),
        volume: String(item[5]),
        closeTime: Number(item[6]),
      };
    });
  }

  async getSymbolInfo(
    symbol: string,
    environment: BinanceEnvironment = 'testnet',
  ): Promise<BinanceSymbolInfo> {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) throw new BadRequestException('Symbol is required');

    const response = await fetch(
      `${this.getBaseUrl(environment)}/api/v3/exchangeInfo?symbol=${encodeURIComponent(normalized)}`,
    );
    const body = await response.json();
    if (!response.ok) {
      const message = typeof body?.msg === 'string' ? body.msg : `Binance exchange info request failed: ${response.status}`;
      throw new Error(message);
    }

    const info = body?.symbols?.[0] as BinanceSymbolInfo | undefined;
    if (!info) throw new BadRequestException(`Binance symbol ${normalized} was not found`);
    if (info.status !== 'TRADING') {
      throw new BadRequestException(`Binance symbol ${normalized} is not available for trading`);
    }
    return info;
  }

  async getAccount(apiKey: string, apiSecret: string, environment: BinanceEnvironment = 'testnet') {
    return this.signedRequest('/api/v3/account', 'GET', {}, apiKey, apiSecret, environment);
  }

  async getOrder(
    symbol: string,
    orderId: string,
    apiKey: string,
    apiSecret: string,
    environment: BinanceEnvironment = 'testnet',
  ) {
    if (environment !== 'testnet') {
      throw new BadRequestException('Live Binance order lookup is disabled');
    }

    const normalized = symbol.trim().toUpperCase();
    if (!normalized) throw new BadRequestException('Symbol is required');
    if (!orderId.trim()) throw new BadRequestException('Exchange order ID is required');

    return this.signedRequest(
      '/api/v3/order',
      'GET',
      { symbol: normalized, orderId: orderId.trim() },
      apiKey,
      apiSecret,
      environment,
    );
  }

  async cancelOrder(
    symbol: string,
    orderId: string,
    apiKey: string,
    apiSecret: string,
    environment: BinanceEnvironment = 'testnet',
  ) {
    if (environment !== 'testnet') {
      throw new BadRequestException('Live Binance order cancellation is disabled');
    }

    const normalized = symbol.trim().toUpperCase();
    if (!normalized) throw new BadRequestException('Symbol is required');
    if (!orderId.trim()) throw new BadRequestException('Exchange order ID is required');

    return this.signedRequest(
      '/api/v3/order',
      'DELETE',
      { symbol: normalized, orderId: orderId.trim() },
      apiKey,
      apiSecret,
      environment,
    );
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
