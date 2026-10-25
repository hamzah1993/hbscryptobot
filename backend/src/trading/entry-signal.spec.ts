import { evaluateEntrySignal, requiredCandles, rsiSeries, type EntrySignalConfig, type SignalCandle } from './entry-signal';

const candle = (open: number, close: number, high = Math.max(open, close), low = Math.min(open, close)): SignalCandle => ({ open, close, high, low });
const flat = (count: number, price = 100) => Array.from({ length: count }, () => candle(price, price, price + 0.1, price - 0.1));

const config: EntrySignalConfig = {
  dipPercent: 3, dipLookbackMinutes: 60, confirmTimeframe: '5m', confirmRule: 'CLOSE_ABOVE_PREV_HIGH', confirmCandles: 1, rsiMax: null,
};

describe('entry signal', () => {
  // 12 flat candles near 100, then a slide to 96, then the bounce candle(s).
  const slide = [candle(100, 99), candle(99, 98), candle(98, 96.5), candle(96.5, 96, 96.6, 95.8)];

  it('needs enough history', () => {
    expect(evaluateEntrySignal(flat(5), config).ok).toBe(false);
    expect(requiredCandles(config)).toBe(14);
  });

  it('does not buy without a dip, even on a strong green candle', () => {
    const result = evaluateEntrySignal([...flat(14), candle(100, 101, 101.2, 99.9)], config);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Waiting for a 3% drop');
  });

  it('does not buy a dip until a candle confirms the bounce', () => {
    expect(evaluateEntrySignal([...flat(12), ...slide], config).reason).toBe('Waiting for a green candle');
    const weakGreen = candle(96, 96.3, 96.4, 95.9);
    expect(evaluateEntrySignal([...flat(12), ...slide, weakGreen], config).reason).toContain('closes above the previous high');
  });

  it('buys after a dip when a green candle closes above the previous high', () => {
    const bounce = candle(96, 96.8, 96.9, 95.9);
    expect(evaluateEntrySignal([...flat(12), ...slide, bounce], config)).toEqual({ ok: true, reason: 'Bounce confirmed' });
  });

  it('accepts any green close with GREEN_CLOSE', () => {
    const weakGreen = candle(96, 96.3, 96.4, 95.9);
    expect(evaluateEntrySignal([...flat(12), ...slide, weakGreen], { ...config, confirmRule: 'GREEN_CLOSE' }).ok).toBe(true);
  });

  it('requires N green candles in a row with CONSECUTIVE_GREEN', () => {
    const rule = { ...config, confirmRule: 'CONSECUTIVE_GREEN' as const, confirmCandles: 2 };
    expect(evaluateEntrySignal([...flat(12), ...slide, candle(96, 96.4)], rule).ok).toBe(false);
    expect(evaluateEntrySignal([...flat(12), ...slide, candle(96, 96.4), candle(96.4, 96.9)], rule).ok).toBe(true);
  });

  it('checks only the confirmation when the dip is not required (DCA)', () => {
    expect(evaluateEntrySignal([...flat(3), candle(100, 100.5, 100.6, 99.9)], config, { requireDip: false }).ok).toBe(true);
  });

  it('applies the optional RSI filter', () => {
    // Choppy market, then a 3.8% dip whose RSI bottoms at about 34.6, then a bounce.
    const wick = (open: number, close: number) => candle(open, close, Math.max(open, close) + 0.05, Math.min(open, close) - 0.05);
    const history: SignalCandle[] = [];
    let price = 100;
    for (let index = 0; index < 40; index += 1) { const next = price + (index % 2 ? 0.6 : -0.6); history.push(wick(price, next)); price = next; }
    for (const step of [-1.2, 0.4, -1.3, 0.3, -1.1, -0.9]) { const next = price + step; history.push(wick(price, next)); price = next; }
    history.push(wick(price, price + 1.2));

    expect(evaluateEntrySignal(history, { ...config, rsiMax: null }).ok).toBe(true);
    expect(evaluateEntrySignal(history, { ...config, rsiMax: 40 }).ok).toBe(true);
    expect(evaluateEntrySignal(history, { ...config, rsiMax: 30 }).reason).toBe('Waiting for RSI to reach 30 or below (lowest 34.6)');
  });

  it('computes Wilder RSI', () => {
    const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    expect(rsiSeries(closes)[14]).toBeCloseTo(70.46, 1);
  });
});
