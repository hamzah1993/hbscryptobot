import { Injectable } from '@nestjs/common';
import {
  BinanceService,
  type BinanceEnvironment,
  type BinanceKlineInterval,
} from '../exchange/binance/binance.service';

export type MarketQuote = {
  symbol: string;
  price: number;
  environment: BinanceEnvironment;
  fetchedAt: string;
  source: 'binance' | 'cache';
};

export type MarketCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
};

type CachedQuote = Omit<MarketQuote, 'source'> & { expiresAt: number };

export const MARKET_LIST_QUOTES = ['USDT', 'BTC', 'ETH', 'USDC'] as const;
export type MarketListQuote = (typeof MARKET_LIST_QUOTES)[number];

export type MarketTicker = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  lastPrice: number;
  priceChangePercent: number;
  quoteVolume: number;
};

const TICKERS_TTL_MS = 5_000;
const SYMBOLS_TTL_MS = 60 * 60_000;

@Injectable()
export class MarketDataService {
  private readonly cache = new Map<string, CachedQuote>();
  private readonly defaultTtlMs = 2_000;
  private tickers: { at: number; data: MarketTicker[] } | null = null;
  private tickersInFlight: Promise<MarketTicker[]> | null = null;
  private symbols: { at: number; data: Map<string, { baseAsset: string; quoteAsset: string }> } | null = null;

  constructor(private readonly binance: BinanceService) {}

  /**
   * Binance LIVE spot market list for one quote asset. All users share one
   * cached snapshot, so Binance sees at most one 24h-ticker request per 5 s.
   */
  async getTickers(quote: MarketListQuote) {
    const all = await this.getAllTickers();
    return all.filter((ticker) => ticker.quoteAsset === quote);
  }

  private async getAllTickers() {
    if (this.tickers && Date.now() - this.tickers.at < TICKERS_TTL_MS) return this.tickers.data;
    this.tickersInFlight ??= (async () => {
      try {
        const [raw, symbols] = await Promise.all([this.binance.get24hTickers('live'), this.getSymbolMap()]);
        const data: MarketTicker[] = [];
        for (const item of raw) {
          const info = symbols.get(item.symbol);
          const lastPrice = Number(item.lastPrice);
          if (!info || !(lastPrice > 0)) continue;
          data.push({
            symbol: item.symbol,
            baseAsset: info.baseAsset,
            quoteAsset: info.quoteAsset,
            lastPrice,
            priceChangePercent: Number(item.priceChangePercent),
            quoteVolume: Number(item.quoteVolume),
          });
        }
        data.sort((a, b) => a.baseAsset.localeCompare(b.baseAsset));
        this.tickers = { at: Date.now(), data };
        return data;
      } catch (error) {
        // Serve the last good snapshot through a brief Binance outage.
        if (this.tickers) return this.tickers.data;
        throw error;
      } finally {
        this.tickersInFlight = null;
      }
    })();
    return this.tickersInFlight;
  }

  private async getSymbolMap() {
    if (this.symbols && Date.now() - this.symbols.at < SYMBOLS_TTL_MS) return this.symbols.data;
    const list = await this.binance.getTradingSymbols('live');
    const data = new Map(list.map((item) => [item.symbol, { baseAsset: item.baseAsset, quoteAsset: item.quoteAsset }]));
    this.symbols = { at: Date.now(), data };
    return data;
  }

  async getQuote(
    symbol: string,
    environment: BinanceEnvironment = 'testnet',
    forceRefresh = false,
  ): Promise<MarketQuote> {
    const normalized = this.normalizeSymbol(symbol);
    const key = this.cacheKey(normalized, environment);
    const cached = this.cache.get(key);

    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      return {
        symbol: cached.symbol,
        price: cached.price,
        environment: cached.environment,
        fetchedAt: cached.fetchedAt,
        source: 'cache',
      };
    }

    const ticker = await this.binance.getTickerPrice(normalized, environment) as {
      symbol?: string;
      price?: string;
    };
    const price = Number(ticker.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Binance returned an invalid market price');
    }

    const fetchedAt = new Date().toISOString();
    const quote: CachedQuote = {
      symbol: ticker.symbol ?? normalized,
      price,
      environment,
      fetchedAt,
      expiresAt: Date.now() + this.defaultTtlMs,
    };
    this.cache.set(key, quote);

    return {
      symbol: quote.symbol,
      price: quote.price,
      environment: quote.environment,
      fetchedAt: quote.fetchedAt,
      source: 'binance',
    };
  }

  async getCandles(
    symbol: string,
    interval: BinanceKlineInterval = '5m',
    limit = 200,
    environment: BinanceEnvironment = 'live',
  ) {
    const normalized = this.normalizeSymbol(symbol);
    const klines = await this.binance.getKlines(normalized, interval, limit, environment);

    const candles = klines.map((kline): MarketCandle => {
      const candle = {
        time: Math.floor(kline.openTime / 1000),
        open: Number(kline.open),
        high: Number(kline.high),
        low: Number(kline.low),
        close: Number(kline.close),
        volume: Number(kline.volume),
        closeTime: kline.closeTime,
      };

      if (
        !Number.isInteger(candle.time) ||
        ![candle.open, candle.high, candle.low, candle.close, candle.volume, candle.closeTime]
          .every(Number.isFinite)
      ) {
        throw new Error('Binance returned invalid market candle data');
      }

      return candle;
    });

    return {
      symbol: normalized,
      interval,
      environment,
      candles,
    };
  }

  getCachedQuotes() {
    const now = Date.now();
    return Array.from(this.cache.values())
      .filter((quote) => quote.expiresAt > now)
      .map(({ expiresAt: _expiresAt, ...quote }) => ({ ...quote, source: 'cache' as const }));
  }

  clearCache(symbol?: string, environment?: BinanceEnvironment) {
    if (!symbol && !environment) {
      const cleared = this.cache.size;
      this.cache.clear();
      return { cleared };
    }

    const normalized = symbol ? this.normalizeSymbol(symbol) : undefined;
    let cleared = 0;

    for (const [key, quote] of this.cache.entries()) {
      const matchesSymbol = !normalized || quote.symbol === normalized;
      const matchesEnvironment = !environment || quote.environment === environment;
      if (matchesSymbol && matchesEnvironment) {
        this.cache.delete(key);
        cleared += 1;
      }
    }

    return { cleared };
  }

  private normalizeSymbol(symbol: string) {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) throw new Error('Symbol is required');
    return normalized;
  }

  private cacheKey(symbol: string, environment: BinanceEnvironment) {
    return `${environment}:${symbol}`;
  }
}
