import { useEffect, useMemo, useState } from 'react';
import { api, type TestnetPosition, type TradingPosition } from '../lib/api';

type Props = {
  token: string;
  initialPositionId?: string | null;
  initialMode?: 'PAPER' | 'TESTNET';
};

type Mode = 'ALL' | 'PAPER' | 'TESTNET';

type UnifiedPosition = {
  id: string;
  source: 'PAPER' | 'TESTNET';
  symbol: string;
  status: TradingPosition['status'];
  strategyName: string;
  strategyStatus?: string;
  totalQuantity: string;
  totalCostQuote: string;
  averageEntryPrice: string;
  realizedPnlQuote: string;
  dcaCount: number;
  maxDcaOrders: number;
  nextDcaPrice: string | null;
  takeProfitPrice: string | null;
  openedAt: string;
  subPositions: Array<{ id: string; level: number; status: string; quantity: string; costQuote: string; entryPrice: string; takeProfitPrice: string; realizedPnlQuote: string }>;
};

function money(value: string | number | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(numeric);
}

function number(value: string | number | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(numeric);
}

export function UnifiedPositionsPanel({ token, initialPositionId = null, initialMode }: Props) {
  const [paperPositions, setPaperPositions] = useState<TradingPosition[]>([]);
  const [testnetPositions, setTestnetPositions] = useState<TestnetPosition[]>([]);
  const [mode, setMode] = useState<Mode>(initialMode ?? 'ALL');
  const [openOnly, setOpenOnly] = useState(true);
  const [symbol, setSymbol] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(initialPositionId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [paper, testnet] = await Promise.all([
        api.listPaperPositions(token),
        api.listTestnetPositions(token, 250),
      ]);
      setPaperPositions(paper);
      setTestnetPositions(testnet);
      setLastUpdatedAt(new Date());
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to load positions');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(timer);
  }, [token]);

  useEffect(() => {
    if (initialPositionId) setExpandedId(initialPositionId);
  }, [initialPositionId]);

  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);

  const allPositions = useMemo<UnifiedPosition[]>(() => [
    ...paperPositions.map((position) => ({
      id: position.id,
      source: 'PAPER' as const,
      symbol: position.symbol,
      status: position.status,
      strategyName: position.strategy.name,
      strategyStatus: position.strategy.status,
      totalQuantity: position.totalQuantity,
      totalCostQuote: position.totalCostQuote,
      averageEntryPrice: position.averageEntryPrice,
      realizedPnlQuote: position.realizedPnlQuote,
      dcaCount: position.dcaCount,
      maxDcaOrders: position.strategy.maxDcaOrders,
      nextDcaPrice: position.nextDcaPrice,
      takeProfitPrice: position.takeProfitPrice,
      openedAt: position.openedAt,
      subPositions: position.subPositions,
    })),
    ...testnetPositions.map((position) => ({
      id: position.id,
      source: 'TESTNET' as const,
      symbol: position.symbol,
      status: position.status,
      strategyName: position.strategy.name,
      strategyStatus: position.strategy.status,
      totalQuantity: position.totalQuantity,
      totalCostQuote: position.totalCostQuote,
      averageEntryPrice: position.averageEntryPrice,
      realizedPnlQuote: position.realizedPnlQuote,
      dcaCount: position.dcaCount,
      maxDcaOrders: position.strategy.maxDcaOrders,
      nextDcaPrice: position.nextDcaPrice,
      takeProfitPrice: position.takeProfitPrice,
      openedAt: position.openedAt,
      subPositions: position.subPositions,
    })),
  ], [paperPositions, testnetPositions]);

  const filtered = useMemo(() => {
    const normalized = symbol.trim().toUpperCase();
    return allPositions.filter((position) => {
      const sourceMatches = mode === 'ALL' || position.source === mode;
      const statusMatches = !openOnly || position.status === 'OPEN';
      const symbolMatches = !normalized || position.symbol.includes(normalized);
      return sourceMatches && statusMatches && symbolMatches;
    });
  }, [allPositions, mode, openOnly, symbol]);

  const totals = useMemo(() => {
    const open = allPositions.filter((position) => position.status === 'OPEN');
    return {
      open: open.length,
      paper: allPositions.filter((position) => position.source === 'PAPER').length,
      testnet: allPositions.filter((position) => position.source === 'TESTNET').length,
      allocated: open.reduce((sum, position) => sum + Number(position.totalCostQuote), 0),
    };
  }, [allPositions]);

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/[0.08] via-white/[0.03] to-violet-400/[0.06] p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Unified position operations</p>
            <h3 className="mt-2 text-2xl font-semibold">Paper and Binance Testnet positions</h3>
            <p className="mt-2 text-sm text-slate-400">Automatically refreshes every 15 seconds. Live-money positions are not enabled.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['ALL', 'PAPER', 'TESTNET'] as Mode[]).map((item) => (
              <button key={item} onClick={() => setMode(item)} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${mode === item ? 'bg-cyan-400 text-slate-950' : 'border border-white/10 bg-white/[0.04] text-slate-300'}`}>{item === 'ALL' ? 'All' : item === 'PAPER' ? 'Paper' : 'Binance Testnet'}</button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Open positions" value={String(totals.open)} />
          <Metric label="Paper positions" value={String(totals.paper)} />
          <Metric label="Testnet positions" value={String(totals.testnet)} />
          <Metric label="Open allocated" value={money(totals.allocated)} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(180px,1fr)_auto_auto]">
          <input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="Filter symbol" className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none ring-cyan-400/40 focus:ring" />
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300"><input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} className="h-4 w-4 accent-cyan-400" />Open only</label>
          <button onClick={() => void load()} disabled={loading} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">{loading ? 'Refreshing…' : 'Refresh now'}</button>
        </div>
        <p className="mt-3 text-xs text-slate-500">Last updated: {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : '—'}</p>
      </div>

      {error && <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-10 text-center text-sm text-slate-500">Loading positions…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-10 text-center text-sm text-slate-500">No positions match the selected filters.</div>
      ) : (
        <div className="space-y-4">
          {filtered.map((position) => {
            const expanded = expandedId === position.id;
            return (
              <article id={`position-${position.id}`} key={`${position.source}-${position.id}`} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
                <div className="grid gap-4 p-5 xl:grid-cols-[1.2fr_0.9fr_0.9fr_0.9fr_auto] xl:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-lg font-semibold">{position.symbol}</h4>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${position.source === 'PAPER' ? 'bg-violet-400/15 text-violet-300' : 'bg-cyan-400/15 text-cyan-300'}`}>{position.source === 'PAPER' ? 'Paper' : 'Binance Testnet'}</span>
                      <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs text-emerald-300">{position.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{position.strategyName}</p>
                    <p className="mt-1 text-xs text-slate-600">Opened {new Date(position.openedAt).toLocaleString()}</p>
                  </div>
                  <Metric label="Allocated / quantity" value={`${money(position.totalCostQuote)} · ${number(position.totalQuantity)}`} />
                  <Metric label="Average entry" value={number(position.averageEntryPrice)} />
                  <Metric label="DCA progress" value={`${position.dcaCount}/${position.maxDcaOrders}`} />
                  <button onClick={() => setExpandedId(expanded ? null : position.id)} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200">{expanded ? 'Hide details' : 'View details'}</button>
                </div>
                {expanded && (
                  <div className="border-t border-white/10 p-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <Metric label="Next DCA" value={position.nextDcaPrice ? number(position.nextDcaPrice) : '—'} />
                      <Metric label="Take profit" value={position.takeProfitPrice ? number(position.takeProfitPrice) : '—'} />
                      <Metric label="Realized P&L" value={money(position.realizedPnlQuote)} />
                      <Metric label="Strategy state" value={position.strategyStatus ?? 'STOPPED'} />
                    </div>
                    <div className="mt-5">
                      <h5 className="text-sm font-semibold">Independent sub-positions</h5>
                      {position.subPositions.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-500">No independent levels have been opened.</p> : (
                        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="pb-3">Level</th><th className="pb-3">Status</th><th className="pb-3">Quantity</th><th className="pb-3">Cost</th><th className="pb-3">Entry</th><th className="pb-3">TP</th><th className="pb-3">P&L</th></tr></thead><tbody>{position.subPositions.map((sub) => <tr key={sub.id} className="border-t border-white/10"><td className="py-3">#{sub.level}</td><td className="py-3">{sub.status}</td><td className="py-3">{number(sub.quantity)}</td><td className="py-3">{money(sub.costQuote)}</td><td className="py-3">{number(sub.entryPrice)}</td><td className="py-3">{number(sub.takeProfitPrice)}</td><td className="py-3">{money(sub.realizedPnlQuote)}</td></tr>)}</tbody></table></div>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 font-semibold">{value}</p></div>;
}
