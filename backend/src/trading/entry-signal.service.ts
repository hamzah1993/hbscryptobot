import { Injectable } from '@nestjs/common';
import type { BinanceEnvironment, BinanceKlineInterval } from '../exchange/binance/binance.service';
import { MarketDataService } from '../market/market-data.service';
import {
  MAX_SIGNAL_CANDLES, evaluateEntrySignal, requiredCandles,
  type ConfirmRule, type ConfirmTimeframe, type EntrySignalConfig, type SignalCandle, type SignalResult,
} from './entry-signal';

const CANDLE_CACHE_TTL_MS = 15_000;

type StrategyEntrySettings = {
  dipPercent: unknown; dipLookbackMinutes: number; confirmTimeframe: string;
  confirmRule: string; confirmCandles: number; rsiMax: unknown;
};

/** Live evaluation of the dip-and-confirmation entry rule on closed Binance candles. */
@Injectable()
export class EntrySignalService {
  private readonly cache = new Map<string, { at: number; candles: SignalCandle[] }>();
  private readonly inFlight = new Map<string, Promise<SignalCandle[]>>();

  constructor(private readonly marketData: MarketDataService) {}

  configFrom(strategy: StrategyEntrySettings): EntrySignalConfig {
    return {
      dipPercent: Number(strategy.dipPercent),
      dipLookbackMinutes: Number(strategy.dipLookbackMinutes),
      confirmTimeframe: strategy.confirmTimeframe as ConfirmTimeframe,
      confirmRule: strategy.confirmRule as ConfirmRule,
      confirmCandles: Number(strategy.confirmCandles),
      rsiMax: strategy.rsiMax === null || strategy.rsiMax === undefined ? null : Number(strategy.rsiMax),
    };
  }

  async check(strategy: StrategyEntrySettings & { symbol: string }, environment: BinanceEnvironment, requireDip: boolean): Promise<SignalResult> {
    const config = this.configFrom(strategy);
    const needed = Math.min(requiredCandles(config) + 2, MAX_SIGNAL_CANDLES);
    const candles = await this.closedCandles(strategy.symbol, config.confirmTimeframe, needed, environment);
    return evaluateEntrySignal(candles, config, { requireDip });
  }

  /** Closed candles only (the still-forming candle is dropped), shared across bots for a few seconds. */
  private async closedCandles(symbol: string, timeframe: ConfirmTimeframe, count: number, environment: BinanceEnvironment) {
    const key = `${environment}:${symbol.toUpperCase()}:${timeframe}:${count}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CANDLE_CACHE_TTL_MS) return cached.candles;
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = (async () => {
      try {
        const raw = await this.marketData.getCandles(symbol, timeframe as BinanceKlineInterval, count + 1, environment);
        const now = Date.now();
        const candles = raw.candles
          .filter((candle) => candle.closeTime <= now)
          .map(({ open, high, low, close }) => ({ open, high, low, close }));
        this.cache.set(key, { at: now, candles });
        return candles;
      } finally {
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, request);
    return request;
  }
}
