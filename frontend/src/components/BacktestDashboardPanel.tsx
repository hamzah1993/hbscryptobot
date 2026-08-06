import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  api,
  type BacktestReport,
  type BacktestRun,
  type BacktestStrategyMode,
  type BinanceKlineInterval,
  type TradingStrategy,
} from '../lib/api';

type Props = {
  token: string;
};

const intervals: BinanceKlineInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const strategyModes: Array<{ value: BacktestStrategyMode; label: string }> = [
  { value: 'BASELINE', label: 'Baseline (no DCA)' },
  { value: 'DCA_ONLY', label: 'DCA Only' },
  { value: 'DCA_SUB_POSITIONS', label: 'DCA + Sub-Positions' },
];

function strategyModeLabel(mode: BacktestStrategyMode) {
  return strategyModes.find((item) => item.value === mode)?.label ?? mode;
}

function formatNumber(value: string | number | null | undefined, digits = 2) {
  if (value === null || value === undefined) return '—';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
}

function statusClass(status: BacktestRun['status']) {
  if (status === 'COMPLETED') return 'bg-emerald-400/10 text-emerald-300';
  if (status === 'FAILED') return 'bg-rose-400/10 text-rose-300';
  if (status === 'RUNNING') return 'bg-cyan-400/10 text-cyan-300';
  return 'bg-amber-400/10 text-amber-300';
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function BacktestDashboardPanel({ token }: Props) {
  const [strategies, setStrategies] = useState<TradingStrategy[]>([]);
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [comparisonRunIds, setComparisonRunIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<BacktestReport[]>([]);
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [comparisonBusy, setComparisonBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState<'trades' | 'equity' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    strategyId: '',
    symbol: 'BTCUSDT',
    interval: '5m' as BinanceKlineInterval,
    startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    endTime: new Date().toISOString().slice(0, 16),
    initialCapital: '1000',
    strategyMode: 'DCA_SUB_POSITIONS' as BacktestStrategyMode,
  });

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [strategyRows, runRows] = await Promise.all([
        api.listStrategies(token),
        api.listBacktests(token, 100),
      ]);
      setStrategies(strategyRows);
      setRuns(runRows);
      if (!form.strategyId && strategyRows[0]) {
        setForm((current) => ({
          ...current,
          strategyId: strategyRows[0].id,
          symbol: strategyRows[0].symbol,
        }));
      }
      if (!selectedRunId && runRows[0]) setSelectedRunId(runRows[0].id);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to load backtests');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [token]);

  useEffect(() => {
    if (!selectedRunId) {
      setReport(null);
      return;
    }
    let cancelled = false;
    api.getBacktestReport(token, selectedRunId)
      .then((value) => {
        if (!cancelled) setReport(value);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load report');
      });
    return () => {
      cancelled = true;
    };
  }, [token, selectedRunId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const run = await api.createBacktest(token, {
        strategyId: form.strategyId,
        symbol: form.symbol,
        interval: form.interval,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
        initialCapital: Number(form.initialCapital),
        strategyMode: form.strategyMode,
      });
      const completed = await api.startBacktest(token, run.id);
      setSelectedRunId(completed.id);
      await refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to run backtest');
    } finally {
      setBusy(false);
    }
  }

  function toggleComparisonRun(runId: string) {
    setComparison([]);
    setComparisonRunIds((current) => {
      if (current.includes(runId)) return current.filter((id) => id !== runId);
      if (current.length >= 10) return current;
      return [...current, runId];
    });
  }

  async function compareSelectedRuns() {
    if (comparisonRunIds.length < 2) return;
    setComparisonBusy(true);
    setError(null);
    try {
      setComparison(await api.compareBacktests(token, comparisonRunIds));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to compare backtests');
    } finally {
      setComparisonBusy(false);
    }
  }

  async function exportSelected(kind: 'trades' | 'equity') {
    if (!selectedRunId || !report) return;
    setExportBusy(kind);
    setError(null);
    try {
      const content = kind === 'trades'
        ? await api.exportBacktestTradesCsv(token, selectedRunId)
        : await api.exportBacktestEquityCsv(token, selectedRunId);
      downloadCsv(`${report.run.symbol}-${report.run.interval}-${selectedRunId}-${kind}.csv`, content);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : `Unable to export ${kind} CSV`);
    } finally {
      setExportBusy(null);
    }
  }

  const chartPoints = report?.run.equityPoints ?? [];
  const chartPath = useMemo(() => {
    if (chartPoints.length < 2) return '';
    const values = chartPoints.map((point) => Number(point.equityQuote));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * 100;
        const y = 100 - ((value - min) / range) * 100;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }, [chartPoints]);

  return (
    <div className="mt-6 space-y-6">
      {error && <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Run a strategy backtest</h3>
            <p className="mt-1 text-sm text-slate-400">Historical Binance candles only. No live orders are placed.</p>
          </div>
          <button type="button" onClick={() => void refresh()} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300">Refresh</button>
        </div>

        <form onSubmit={submit} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <select
            value={form.strategyId}
            onChange={(event) => {
              const strategy = strategies.find((item) => item.id === event.target.value);
              setForm((current) => ({ ...current, strategyId: event.target.value, symbol: strategy?.symbol ?? current.symbol }));
            }}
            required
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm"
          >
            <option value="">Select strategy</option>
            {strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}
          </select>
          <select value={form.strategyMode} onChange={(event) => setForm({ ...form, strategyMode: event.target.value as BacktestStrategyMode })} className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm" aria-label="Strategy mode">
            {strategyModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
          </select>
          <input value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value.toUpperCase() })} required className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm" placeholder="BTCUSDT" />
          <select value={form.interval} onChange={(event) => setForm({ ...form, interval: event.target.value as BinanceKlineInterval })} className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm">
            {intervals.map((interval) => <option key={interval}>{interval}</option>)}
          </select>
          <input type="datetime-local" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} required className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm" />
          <input type="datetime-local" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} required className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm" />
          <div className="flex gap-2">
            <input type="number" min="1" step="0.01" value={form.initialCapital} onChange={(event) => setForm({ ...form, initialCapital: event.target.value })} required className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm" />
            <button disabled={busy || !form.strategyId} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? 'Running…' : 'Run'}</button>
          </div>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.65fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Backtest runs</h3>
              <p className="mt-1 text-xs text-slate-500">Select 2–10 runs for comparison.</p>
            </div>
            <button
              type="button"
              disabled={comparisonRunIds.length < 2 || comparisonBusy}
              onClick={() => void compareSelectedRuns()}
              className="rounded-lg bg-violet-400 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"
            >
              {comparisonBusy ? 'Comparing…' : `Compare (${comparisonRunIds.length})`}
            </button>
          </div>
          <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {loading ? <p className="text-sm text-slate-400">Loading…</p> : runs.length === 0 ? <p className="text-sm text-slate-400">No backtests yet.</p> : runs.map((run) => (
              <article key={run.id} className={`rounded-xl border p-3 ${selectedRunId === run.id ? 'border-cyan-400/40 bg-cyan-400/10' : 'border-white/10 bg-slate-950/20'}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={comparisonRunIds.includes(run.id)}
                    onChange={() => toggleComparisonRun(run.id)}
                    aria-label={`Select ${run.symbol} ${run.interval} for comparison`}
                    className="mt-1 h-4 w-4 accent-violet-400"
                  />
                  <button type="button" onClick={() => setSelectedRunId(run.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{run.symbol} · {run.interval}</span>
                      <span className={`rounded-full px-2 py-1 text-[11px] ${statusClass(run.status)}`}>{run.status}</span>
                    </div>
                    <p className="mt-2 text-xs text-violet-300">{strategyModeLabel(run.strategyMode)}</p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(run.createdAt).toLocaleString()}</p>
                    <p className="mt-2 text-sm text-slate-300">Return {formatNumber(run.returnPercent, 3)}%</p>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {comparison.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-violet-400/20 bg-violet-400/[0.04]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div><h3 className="font-semibold">Run comparison</h3><p className="mt-1 text-xs text-slate-500">Metrics are shown in the requested selection order.</p></div>
                <button type="button" onClick={() => setComparison([])} className="text-xs text-slate-400">Close</button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-950/30 text-xs text-slate-500"><tr><th className="px-4 py-3">Mode</th><th className="px-4 py-3">Return</th><th className="px-4 py-3">Drawdown</th><th className="px-4 py-3">Max deployed</th><th className="px-4 py-3">Underwater</th><th className="px-4 py-3">Fees</th><th className="px-4 py-3">Win rate</th><th className="px-4 py-3">Profit factor</th><th className="px-4 py-3">Ending capital</th></tr></thead>
                  <tbody>{comparison.map((item) => <tr key={item.run.id} className="border-t border-white/5"><td className="px-4 py-3"><button type="button" onClick={() => setSelectedRunId(item.run.id)} className="font-medium text-cyan-300">{strategyModeLabel(item.run.strategyMode)}</button><p className="mt-1 text-xs text-slate-500">{item.run.symbol} · {item.run.interval}</p></td><td className="px-4 py-3">{formatNumber(item.run.returnPercent, 3)}%</td><td className="px-4 py-3">{formatNumber(item.run.maxDrawdownPercent, 3)}%</td><td className="px-4 py-3">${formatNumber(item.analytics.maximumCapitalDeployedQuote)}</td><td className="px-4 py-3">{formatNumber(item.analytics.longestUnderwaterMinutes)}m</td><td className="px-4 py-3">${formatNumber(item.analytics.totalFeesQuote)}</td><td className="px-4 py-3">{formatNumber(item.analytics.winRatePercent, 3)}%</td><td className="px-4 py-3">{item.analytics.profitFactor ?? '—'}</td><td className="px-4 py-3">${formatNumber(item.run.endingCapital)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}

          {!report ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-slate-400">Select a run to view analytics.</div>
          ) : (
            <>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" disabled={exportBusy !== null} onClick={() => void exportSelected('trades')} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-50">{exportBusy === 'trades' ? 'Exporting…' : 'Download trades CSV'}</button>
                <button type="button" disabled={exportBusy !== null} onClick={() => void exportSelected('equity')} className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-sm font-semibold text-violet-200 disabled:opacity-50">{exportBusy === 'equity' ? 'Exporting…' : 'Download equity CSV'}</button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Ending capital', `$${formatNumber(report.run.endingCapital)}`],
                  ['Return', `${formatNumber(report.run.returnPercent, 3)}%`],
                  ['Max drawdown', `${formatNumber(report.run.maxDrawdownPercent, 3)}%`],
                  ['Win rate', `${formatNumber(report.analytics.winRatePercent, 3)}%`],
                  ['Completed exits', String(report.analytics.completedExitCount)],
                  ['Profit factor', report.analytics.profitFactor ?? '—'],
                  ['Peak equity', `$${formatNumber(report.analytics.peakEquityQuote)}`],
                  ['Max DCA level', String(report.analytics.maximumDcaLevelUsed)],
                  ['Max capital deployed', `$${formatNumber(report.analytics.maximumCapitalDeployedQuote)}`],
                  ['Fees paid', `$${formatNumber(report.analytics.totalFeesQuote)}`],
                  ['Longest underwater', `${formatNumber(report.analytics.longestUnderwaterMinutes)} min`],
                  ['Avg recovery', report.analytics.averageRecoveryMinutes === null ? '—' : `${formatNumber(report.analytics.averageRecoveryMinutes)} min`],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-2 text-xl font-semibold">{value}</p>
                  </article>
                ))}
              </div>

              <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">Equity curve</h3>
                  <span className="text-xs text-slate-500">{chartPoints.length} points</span>
                </div>
                <div className="mt-5 h-64 rounded-xl border border-white/10 bg-slate-950/30 p-4">
                  {chartPath ? (
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
                      <path d={chartPath} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="text-cyan-300" />
                    </svg>
                  ) : <div className="grid h-full place-items-center text-sm text-slate-500">Not enough equity points</div>}
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
                <div className="border-b border-white/10 px-5 py-4"><h3 className="font-semibold">Trade history</h3></div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-950/30 text-xs text-slate-500"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Level</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Quote</th><th className="px-4 py-3">P&L</th></tr></thead>
                    <tbody>
                      {report.run.trades.map((trade) => (
                        <tr key={trade.id} className="border-t border-white/5">
                          <td className="px-4 py-3 text-slate-400">{new Date(trade.executedAt).toLocaleString()}</td>
                          <td className="px-4 py-3">{trade.type.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-3">{trade.level}</td>
                          <td className="px-4 py-3">{formatNumber(trade.price, 8)}</td>
                          <td className="px-4 py-3">{formatNumber(trade.quoteAmount)}</td>
                          <td className={`px-4 py-3 ${Number(trade.realizedPnlQuote ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{trade.realizedPnlQuote === null ? '—' : formatNumber(trade.realizedPnlQuote)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
