import { Injectable } from '@nestjs/common';
import { BinanceService, type BinanceEnvironment } from '../exchange/binance/binance.service';

export type MarketQuote = {
  symbol: string;
  price: number;
  environment: BinanceEnvironment;
  fetchedAt: string;
  source: 'binance' | 'cache';
};

type CachedQuote = Omit<MarketQuote, 'source'> & { expiresAt: number };

@Injectable()
export class MarketDataService {
  private readonly cache = new Map<string, CachedQuote>();
  private readonly defaultTtlMs = 2_000;

  constructor(private readonly binance: BinanceService) {}

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
