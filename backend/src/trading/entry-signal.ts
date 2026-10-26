/**
 * Dip-and-confirmation entry rule, shared by the live runner and backtests so
 * both make exactly the same decision from the same closed candles.
 *
 * Buy when the price has dropped at least `dipPercent` below the highest
 * price of the last `dipLookbackMinutes`, and the latest closed candle(s) on
 * `confirmTimeframe` confirm a bounce according to `confirmRule`, optionally
 * only after RSI(14) dipped to `rsiMax` or below.
 */
export const ENTRY_MODES = ['IMMEDIATE', 'DIP_CONFIRMATION'] as const;
export const CONFIRM_RULES = ['GREEN_CLOSE', 'CLOSE_ABOVE_PREV_HIGH', 'CONSECUTIVE_GREEN'] as const;
export const CONFIRM_TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h'] as const;

export type EntryMode = (typeof ENTRY_MODES)[number];
export type ConfirmRule = (typeof CONFIRM_RULES)[number];
export type ConfirmTimeframe = (typeof CONFIRM_TIMEFRAMES)[number];

export type EntrySignalConfig = {
  dipPercent: number;
  dipLookbackMinutes: number;
  confirmTimeframe: ConfirmTimeframe;
  confirmRule: ConfirmRule;
  confirmCandles: number;
  rsiMax: number | null;
};

export type SignalCandle = { open: number; high: number; low: number; close: number };
export type SignalResult = { ok: boolean; reason: string };

export const RSI_PERIOD = 14;
/** Binance returns at most 1000 klines per request; keep a margin for confirmation and RSI warm-up. */
export const MAX_SIGNAL_CANDLES = 950;

const TIMEFRAME_MINUTES: Record<ConfirmTimeframe, number> = { '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30, '1h': 60 };

export function timeframeMinutes(timeframe: ConfirmTimeframe) {
  return TIMEFRAME_MINUTES[timeframe];
}

function confirmationCount(config: Pick<EntrySignalConfig, 'confirmRule' | 'confirmCandles'>) {
  return config.confirmRule === 'CONSECUTIVE_GREEN' ? Math.max(1, Math.floor(config.confirmCandles)) : 1;
}

function lookbackCandles(config: Pick<EntrySignalConfig, 'dipLookbackMinutes' | 'confirmTimeframe'>) {
  return Math.max(1, Math.ceil(config.dipLookbackMinutes / timeframeMinutes(config.confirmTimeframe)));
}

/** Number of closed candles the rule needs to decide. */
export function requiredCandles(config: EntrySignalConfig) {
  const base = lookbackCandles(config) + confirmationCount(config) + 1;
  return config.rsiMax === null ? base : Math.max(base, RSI_PERIOD * 3 + confirmationCount(config) + 4);
}

/** Wilder's RSI for every candle; entries before the warm-up period are null. */
export function rsiSeries(closes: number[], period = RSI_PERIOD): Array<number | null> {
  const result: Array<number | null> = closes.map(() => null);
  if (closes.length <= period) return result;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = closes[index] - closes[index - 1];
    if (change >= 0) gain += change; else loss -= change;
  }
  gain /= period; loss /= period;
  const value = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  result[period] = value();
  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
    result[index] = value();
  }
  return result;
}

/** Checks only the bounce confirmation on the latest closed candle(s). */
export function confirmationMet(closed: SignalCandle[], config: Pick<EntrySignalConfig, 'confirmRule' | 'confirmCandles'>): SignalResult {
  const count = confirmationCount(config);
  if (closed.length < count + 1) return { ok: false, reason: 'Not enough closed candles yet' };
  const recent = closed.slice(-count);
  if (!recent.every((candle) => candle.close > candle.open)) {
    return { ok: false, reason: count > 1 ? `Waiting for ${count} green candles in a row` : 'Waiting for a green candle' };
  }
  if (config.confirmRule === 'CLOSE_ABOVE_PREV_HIGH') {
    const last = closed[closed.length - 1];
    const previous = closed[closed.length - 2];
    if (!(last.close > previous.high)) return { ok: false, reason: 'Waiting for a green candle that closes above the previous high' };
  }
  return { ok: true, reason: 'Bounce confirmed' };
}

/** Full entry decision on closed candles, oldest first. Pass `requireDip: false` to check only the confirmation (DCA). */
export function evaluateEntrySignal(closed: SignalCandle[], config: EntrySignalConfig, options: { requireDip?: boolean } = {}): SignalResult {
  const requireDip = options.requireDip ?? true;
  const count = confirmationCount(config);
  if (closed.length < (requireDip ? requiredCandles(config) : count + 1)) {
    return { ok: false, reason: 'Not enough closed candles yet' };
  }

  if (requireDip) {
    const confirmStart = closed.length - count;
    const window = closed.slice(Math.max(0, confirmStart - lookbackCandles(config)), confirmStart);
    const recentHigh = Math.max(...window.map((candle) => candle.high));
    // The bounce must start from the dip: the lowest point is the candle before
    // the confirmation candle(s) or the confirmation candles themselves.
    const bounceLow = Math.min(...closed.slice(confirmStart - 1).map((candle) => candle.low));
    const dropPercent = recentHigh > 0 ? ((recentHigh - bounceLow) / recentHigh) * 100 : 0;
    if (dropPercent < config.dipPercent) {
      return { ok: false, reason: `Waiting for a ${config.dipPercent}% drop (currently ${dropPercent.toFixed(2)}% below the recent high)` };
    }
  }

  if (config.rsiMax !== null) {
    const rsi = rsiSeries(closed.map((candle) => candle.close));
    const recent = rsi.slice(-(count + 4)).filter((value): value is number => value !== null);
    const lowest = recent.length ? Math.min(...recent) : null;
    if (lowest === null || lowest > config.rsiMax) {
      return { ok: false, reason: `Waiting for RSI to reach ${config.rsiMax} or below${lowest === null ? '' : ` (lowest ${lowest.toFixed(1)})`}` };
    }
  }

  return confirmationMet(closed, config);
}
