import { BacktestTradeType } from '@prisma/client';
import { BacktestDcaSimulatorService } from './backtest-dca-simulator.service';
import type { EntrySignalConfig } from './entry-signal';
import { RecoveryStrategyService } from './recovery-strategy.service';

const bar = (open: number, close: number, high = Math.max(open, close), low = Math.min(open, close)) => ({ open, close, high, low });
const flat = (count: number, price = 100) => Array.from({ length: count }, () => bar(price, price, price + 0.1, price - 0.1));

const signalConfig: EntrySignalConfig = {
  dipPercent: 3, dipLookbackMinutes: 60, confirmTimeframe: '5m', confirmRule: 'CLOSE_ABOVE_PREV_HIGH', confirmCandles: 1, rsiMax: null,
};

describe('BacktestDcaSimulatorService dip entry and stop-loss', () => {
  const simulator = new BacktestDcaSimulatorService(new RecoveryStrategyService());
  const base = {
    initialCapital: 1000, maxEntries: 4, priceDeviationPercent: 3, volumeMultiplier: 1, takeProfitPercent: 1.5,
    riskBudgetQuote: 100, baseOrderQuote: 10, continuousCycles: true, signalConfig,
  };

  // Flat, a slide to 96, a bounce candle closing above the previous high, then a rally past the take profit.
  const dipAndRally = [...flat(14), bar(100, 99), bar(99, 98), bar(98, 96.5), bar(96.5, 96, 96.6, 95.8), bar(96, 96.8, 96.9, 95.9), bar(96.8, 97.5), bar(97.5, 98.5)];

  it('buys immediately without the dip rule, and only at the bounce with it', () => {
    const immediate = simulator.simulate({ ...base, candles: dipAndRally });
    expect(immediate.trades![0].price).toBe('100.000000000000');

    const dip = simulator.simulate({ ...base, candles: dipAndRally, dipEntry: true });
    const [entry, exit] = dip.trades!;
    expect(entry).toMatchObject({ type: BacktestTradeType.PARENT_ENTRY, price: '96.800000000000' });
    expect(exit).toMatchObject({ type: BacktestTradeType.PARENT_EXIT, price: '98.500000000000' });
    expect(Number(exit.realizedPnlQuote)).toBeGreaterThan(0);
    expect(dip.cycleCount).toBe(1);
  });

  it('never buys when no dip happens', () => {
    const result = simulator.simulate({ ...base, candles: [...flat(30), bar(100, 101, 101.2, 99.9)], dipEntry: true });
    expect(result.trades).toHaveLength(0);
    expect(result.returnPercent).toBe('0.000000');
  });

  it('sells the whole basket at the stop-loss and starts a new cycle', () => {
    // Buys at 100, 96.5 and 92 (average about 96); a 5% stop sits near 91.3, hit at 88.
    const crash = [...flat(3), bar(100, 99), bar(99, 96.5), bar(96.5, 94), bar(94, 92), bar(92, 88), bar(88, 88)];
    const result = simulator.simulate({ ...base, candles: crash, stopLossPercent: 5 });
    expect(result.stopLossCount).toBe(1);
    const exits = result.trades!.filter((trade) => trade.type === BacktestTradeType.PARENT_EXIT);
    expect(exits).toHaveLength(1);
    expect(Number(exits[0].realizedPnlQuote)).toBeLessThan(0);
    expect(result.cycleCount).toBeGreaterThanOrEqual(1);
  });

  it('keeps buying down a crash with unlimited levels and no stop-loss, and never sells at a loss', () => {
    // 100 → 75 in 1% steps, then back up to 90: equal 10 USDT buys every 3% lower until the budget is used.
    const down = Array.from({ length: 25 }, (_, i) => bar(100 - i, 99 - i));
    const up = Array.from({ length: 15 }, (_, i) => bar(75 + i, 76 + i));
    const result = simulator.simulate({ ...base, maxEntries: 200, candles: [...flat(3), ...down, ...up] });
    const entries = result.trades!.filter((trade) => trade.type !== BacktestTradeType.PARENT_EXIT);
    const exits = result.trades!.filter((trade) => trade.type === BacktestTradeType.PARENT_EXIT);
    expect(entries.length).toBeGreaterThan(4);
    expect(entries.reduce((sum, trade) => sum + Number(trade.quoteAmount ?? 0), 0)).toBeLessThanOrEqual(100.000001);
    expect(result.stopLossCount).toBe(0);
    expect(exits.length).toBeGreaterThanOrEqual(1);
    for (const exit of exits) expect(Number(exit.realizedPnlQuote)).toBeGreaterThan(0);
  });

  it('requires full candles for the dip rule', () => {
    expect(() => simulator.simulate({ ...base, candles: [{ close: 100 }], dipEntry: true })).toThrow('open/high/low/close');
  });
});
