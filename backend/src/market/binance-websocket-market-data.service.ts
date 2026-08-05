import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { WebSocket } from 'ws';

export type BinanceStreamEnvironment = 'testnet' | 'live';

type StreamState = {
  socket: WebSocket | null;
  reconnectTimer: NodeJS.Timeout | null;
  reconnectAttempts: number;
  stopped: boolean;
};

type BinanceTickerMessage = {
  e?: string;
  s?: string;
  c?: string;
  E?: number;
};

export type StreamedMarketPrice = {
  symbol: string;
  price: number;
  eventTime: number;
  receivedAt: number;
  environment: BinanceStreamEnvironment;
};

@Injectable()
export class BinanceWebsocketMarketDataService implements OnModuleDestroy {
  private readonly logger = new Logger(BinanceWebsocketMarketDataService.name);
  private readonly streams = new Map<string, StreamState>();
  private readonly latestPrices = new Map<string, StreamedMarketPrice>();

  subscribe(symbol: string, environment: BinanceStreamEnvironment = 'testnet') {
    const normalized = this.normalizeSymbol(symbol);
    const key = this.key(normalized, environment);
    const existing = this.streams.get(key);

    if (existing && !existing.stopped) {
      return this.getStatus(normalized, environment);
    }

    const state: StreamState = {
      socket: null,
      reconnectTimer: null,
      reconnectAttempts: 0,
      stopped: false,
    };
    this.streams.set(key, state);
    this.connect(normalized, environment, state);
    return this.getStatus(normalized, environment);
  }

  unsubscribe(symbol: string, environment: BinanceStreamEnvironment = 'testnet') {
    const normalized = this.normalizeSymbol(symbol);
    const key = this.key(normalized, environment);
    const state = this.streams.get(key);
    if (!state) return { unsubscribed: false };

    state.stopped = true;
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.socket?.close();
    this.streams.delete(key);
    return { unsubscribed: true };
  }

  getLatestPrice(symbol: string, environment: BinanceStreamEnvironment = 'testnet') {
    const normalized = this.normalizeSymbol(symbol);
    return this.latestPrices.get(this.key(normalized, environment)) ?? null;
  }

  getStatus(symbol: string, environment: BinanceStreamEnvironment = 'testnet') {
    const normalized = this.normalizeSymbol(symbol);
    const state = this.streams.get(this.key(normalized, environment));
    const readyState = state?.socket?.readyState;

    return {
      symbol: normalized,
      environment,
      subscribed: Boolean(state && !state.stopped),
      connected: readyState === 1,
      reconnectAttempts: state?.reconnectAttempts ?? 0,
      latestPrice: this.getLatestPrice(normalized, environment),
    };
  }

  onModuleDestroy() {
    for (const [key, state] of this.streams) {
      state.stopped = true;
      if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
      state.socket?.close();
      this.streams.delete(key);
    }
  }

  private connect(
    symbol: string,
    environment: BinanceStreamEnvironment,
    state: StreamState,
  ) {
    if (state.stopped) return;

    const stream = `${symbol.toLowerCase()}@ticker`;
    const baseUrl = environment === 'testnet'
      ? 'wss://stream.testnet.binance.vision/ws'
      : 'wss://stream.binance.com:9443/ws';
    const socket = new WebSocket(`${baseUrl}/${stream}`);
    state.socket = socket;

    socket.on('open', () => {
      state.reconnectAttempts = 0;
      this.logger.log(`Connected Binance ${environment} ticker stream for ${symbol}`);
    });

    socket.on('message', (payload) => {
      try {
        const message = JSON.parse(payload.toString()) as BinanceTickerMessage;
        const price = Number(message.c);
        if (!Number.isFinite(price) || price <= 0) return;

        this.latestPrices.set(this.key(symbol, environment), {
          symbol: message.s?.toUpperCase() ?? symbol,
          price,
          eventTime: Number(message.E ?? Date.now()),
          receivedAt: Date.now(),
          environment,
        });
      } catch (error) {
        this.logger.warn(
          `Invalid Binance websocket payload for ${symbol}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });

    socket.on('error', (error) => {
      this.logger.warn(`Binance websocket error for ${symbol}: ${error.message}`);
    });

    socket.on('close', () => {
      state.socket = null;
      if (state.stopped) return;
      this.scheduleReconnect(symbol, environment, state);
    });
  }

  private scheduleReconnect(
    symbol: string,
    environment: BinanceStreamEnvironment,
    state: StreamState,
  ) {
    state.reconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** Math.min(state.reconnectAttempts - 1, 5), 30_000);

    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      this.connect(symbol, environment, state);
    }, delay);

    this.logger.warn(
      `Reconnecting Binance ${environment} ticker stream for ${symbol} in ${delay}ms`,
    );
  }

  private normalizeSymbol(symbol: string) {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) throw new Error('Symbol is required');
    return normalized;
  }

  private key(symbol: string, environment: BinanceStreamEnvironment) {
    return `${environment}:${symbol}`;
  }
}
