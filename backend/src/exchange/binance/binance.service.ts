import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

export type BinanceEnvironment = 'testnet' | 'live';

export type BinanceMarketOrderParams = {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  clientOrderId?: string;
};

export type BinanceLimitOrderParams = BinanceMarketOrderParams & { price: string };

export type BinanceSymbolFilter = {
  filterType: string;
  minQty?: string;
  maxQty?: string;
  stepSize?: string;
  tickSize?: string;
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

export type BinanceKlineQuery = {
  startTime?: number;
  endTime?: number;
};

const DEFAULT_HTTP_TIMEOUT_MS = 10_000;

@Injectable()
export class BinanceService {
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    const configured = Number(process.env.BINANCE_HTTP_TIMEOUT_MS);
    this.timeoutMs = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_HTTP_TIMEOUT_MS;
  }

  /** Every Binance call is bounded so a hung request cannot stall the schedulers. */
  private async http(url: string, init: RequestInit = {}) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new HttpException(`Binance request timed out after ${this.timeoutMs} ms`, HttpStatus.REQUEST_TIMEOUT);
      }
      const reason = (error as { cause?: unknown } | null)?.cause;
      const cause = reason instanceof Error ? `: ${reason.message}` : '';
      throw new HttpException(`Binance network error${cause}`, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  private getBaseUrl(environment: BinanceEnvironment) {
    return environment === 'testnet'
      ? 'https://testnet.binance.vision'
      : 'https://api.binance.com';
  }

  async getServerTime(environment: BinanceEnvironment = 'testnet') {
    const response = await this.http(`${this.getBaseUrl(environment)}/api/v3/time`);
    if (!response.ok) throw new Error(`Binance time request failed: ${response.status}`);
    return response.json();
  }

  async getTickerPrice(symbol: string, environment: BinanceEnvironment = 'testnet') {
    const response = await this.http(
      `${this.getBaseUrl(environment)}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol.toUpperCase())}`,
    );
    if (!response.ok) throw new Error(`Binance ticker request failed: ${response.status}`);
    return response.json();
  }

  /** 24-hour rolling statistics for every spot symbol (request weight 80). */
  async get24hTickers(environment: BinanceEnvironment = 'live') {
    const response = await this.http(`${this.getBaseUrl(environment)}/api/v3/ticker/24hr`);
    if (!response.ok) throw new Error(`Binance 24h ticker request failed: ${response.status}`);
    return response.json() as Promise<Array<{ symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string }>>;
  }

  /** Base and quote assets of every currently tradable spot symbol. */
  async getTradingSymbols(environment: BinanceEnvironment = 'live') {
    const response = await this.http(`${this.getBaseUrl(environment)}/api/v3/exchangeInfo?permissions=SPOT&symbolStatus=TRADING`);
    if (!response.ok) throw new Error(`Binance exchange info request failed: ${response.status}`);
    const body = await response.json() as { symbols: Array<{ symbol: string; baseAsset: string; quoteAsset: string }> };
    return body.symbols.map(({ symbol, baseAsset, quoteAsset }) => ({ symbol, baseAsset, quoteAsset }));
  }

  async getKlines(
    symbol: string,
    interval: BinanceKlineInterval = '5m',
    limit = 200,
    environment: BinanceEnvironment = 'live',
    query: BinanceKlineQuery = {},
  ): Promise<BinanceKline[]> {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) throw new BadRequestException('Symbol is required');
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new BadRequestException('Kline limit must be an integer between 1 and 1000');
    }

    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        throw new BadRequestException(`${name} must be a non-negative integer timestamp`);
      }
    }
    if (
      query.startTime !== undefined &&
      query.endTime !== undefined &&
      query.startTime > query.endTime
    ) {
      throw new BadRequestException('Kline startTime cannot be after endTime');
    }

    const search = new URLSearchParams({
      symbol: normalized,
      interval,
      limit: String(limit),
    });
    if (query.startTime !== undefined) {
      search.set('startTime', String(query.startTime));
    }
    if (query.endTime !== undefined) {
      search.set('endTime', String(query.endTime));
    }

    const response = await this.http(`${this.getBaseUrl(environment)}/api/v3/klines?${search.toString()}`);
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

    const response = await this.http(
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

  async getApiKeyPermissions(apiKey: string, apiSecret: string) {
    return this.signedRequest('/sapi/v1/account/apiRestrictions', 'GET', {}, apiKey, apiSecret, 'live');
  }

  async getOrder(
    symbol: string,
    orderId: string,
    apiKey: string,
    apiSecret: string,
    environment: BinanceEnvironment = 'testnet',
  ) {
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

  async getOrderByClientOrderId(
    symbol: string,
    clientOrderId: string,
    apiKey: string,
    apiSecret: string,
    environment: BinanceEnvironment = 'testnet',
  ) {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) throw new BadRequestException('Symbol is required');
    if (!clientOrderId.trim()) throw new BadRequestException('Client order ID is required');

    return this.signedRequest(
      '/api/v3/order',
      'GET',
      { symbol: normalized, origClientOrderId: clientOrderId.trim() },
      apiKey,
      apiSecret,
      environment,
    );
  }

  /** Trades of one order, including each fill's commission (request weight 5). */
  async getOrderTrades(
    symbol: string,
    orderId: string,
    apiKey: string,
    apiSecret: string,
    environment: BinanceEnvironment = 'testnet',
  ) {
    return this.signedRequest(
      '/api/v3/myTrades',
      'GET',
      { symbol: symbol.trim().toUpperCase(), orderId: orderId.trim() },
      apiKey,
      apiSecret,
      environment,
    ) as Promise<Array<{ price: string; qty: string; quoteQty: string; commission: string; commissionAsset: string }>>;
  }

  async cancelOrder(
    symbol: string,
    orderId: string,
    apiKey: string,
    apiSecret: string,
    environment: BinanceEnvironment = 'testnet',
  ) {
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

  async placeLimitOrder(
    params: BinanceLimitOrderParams,
    apiKey: string,
    apiSecret: string,
    environment: BinanceEnvironment = 'testnet',
  ) {
    if (!Number.isFinite(Number(params.quantity)) || Number(params.quantity) <= 0) throw new BadRequestException('Order quantity must be positive');
    if (!Number.isFinite(Number(params.price)) || Number(params.price) <= 0) throw new BadRequestException('Limit price must be positive');

    const payload: Record<string, string> = {
      symbol: params.symbol.trim().toUpperCase(), side: params.side, type: 'LIMIT',
      quantity: params.quantity, price: params.price, timeInForce: 'GTC', newOrderRespType: 'FULL',
    };
    if (params.clientOrderId) payload.newClientOrderId = params.clientOrderId;
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

    const response = await this.http(`${this.getBaseUrl(environment)}${path}?${search.toString()}`, {
      method,
      headers: { 'X-MBX-APIKEY': apiKey },
    });
    // Binance's edge can answer with HTML (e.g. a 502 page); never let that surface as a SyntaxError.
    const body: any = await response.json().catch(() => null);
    if (!response.ok) {
      const message = typeof body?.msg === 'string' ? body.msg : `Binance request failed: ${response.status}`;
      // Rate limits (429/418) and Binance server errors keep their status so
      // callers can retry them; for an order, a 5xx means "status unknown".
      if (response.status === 429 || response.status === 418) {
        throw new HttpException(`Binance rate limit: ${message}`, HttpStatus.TOO_MANY_REQUESTS);
      }
      if (response.status >= 500) {
        throw new HttpException(`Binance temporarily unavailable (${response.status}): ${message}`, HttpStatus.SERVICE_UNAVAILABLE);
      }
      // A rejected signed request is normally a user-actionable credential,
      // permission, IP-whitelist, timestamp, or order validation error.  Do
      // not turn Binance's 4xx response into an opaque NestJS 500.
      throw new BadRequestException(`Binance: ${message}`);
    }
    if (body === null) {
      throw new HttpException('Binance returned an unreadable response', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }
}
