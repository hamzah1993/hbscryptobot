import { useEffect, useMemo, useState } from 'react';
import { api, type StrategyStatus, type TakeProfitTarget, type TestnetPosition, type TradingPosition } from '../lib/api';

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
  strategyId: string;
  strategyName: string;
  strategyStatus?: StrategyStatus;
  totalQuantity: string;
  totalCostQuote: string;
  averageEntryPrice: string;
  realizedPnlQuote: string;
  dcaCount: number;
  recoveryMode: boolean;
  recoveryDcaCount: number;
  recoveryAnchorPrice: string | null;
  recoveryTakeProfitPrice: string | null;
  maxDcaOrders: number;
  independentFromLevel: number;
  recoveryMaxOrders: number;
  nextDcaPrice: string | null;
  takeProfitPrice: string | null;
  openedAt: string;
  orders: Array<{ id: string; status?: string }>;
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
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<Mode>(initialMode ?? 'ALL');
  const [openOnly, setOpenOnly] = useState(true);
  const [symbol, setSymbol] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(initialPositionId);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingTp, setEditingTp] = useState<{ positionId: string; target: TakeProfitTarget; subPositionId?: string; label: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [paper, testnet] = await Promise.all([
        api.listPaperPositions(token),
        api.listTestnetPositions(token, 250),
      ]);
      setPaperPositions(paper);
      setTestnetPositions(testnet);
      setLastUpdatedAt(new Date());
      setError(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to load positions');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 5000);
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
      strategyId: position.strategy.id,
      strategyName: position.strategy.name,
      strategyStatus: position.strategy.status,
      totalQuantity: position.totalQuantity,
      totalCostQuote: position.totalCostQuote,
      averageEntryPrice: position.averageEntryPrice,
      realizedPnlQuote: position.realizedPnlQuote,
      dcaCount: position.dcaCount,
      recoveryMode: position.recoveryMode,
      recoveryDcaCount: position.recoveryDcaCount,
      recoveryAnchorPrice: position.recoveryAnchorPrice,
      recoveryTakeProfitPrice: position.recoveryTakeProfitPrice,
      maxDcaOrders: position.strategy.maxDcaOrders,
      independentFromLevel: position.strategy.independentFromLevel ?? 5,
      recoveryMaxOrders: position.strategy.recoveryMaxOrders ?? 5,
      nextDcaPrice: position.nextDcaPrice,
      takeProfitPrice: position.takeProfitPrice,
      openedAt: position.openedAt,
      orders: position.orders,
      subPositions: position.subPositions,
    })),
    ...testnetPositions.map((position) => ({
      id: position.id,
      source: 'TESTNET' as const,
      symbol: position.symbol,
      status: position.status,
      strategyId: position.strategy.id,
      strategyName: position.strategy.name,
      strategyStatus: position.strategy.status,
      totalQuantity: position.totalQuantity,
      totalCostQuote: position.totalCostQuote,
      averageEntryPrice: position.averageEntryPrice,
      realizedPnlQuote: position.realizedPnlQuote,
      dcaCount: position.dcaCount,
      recoveryMode: position.recoveryMode,
      recoveryDcaCount: position.recoveryDcaCount,
      recoveryAnchorPrice: position.recoveryAnchorPrice,
      recoveryTakeProfitPrice: position.recoveryTakeProfitPrice,
      maxDcaOrders: position.strategy.maxDcaOrders,
      independentFromLevel: position.strategy.independentFromLevel ?? 5,
      recoveryMaxOrders: position.strategy.recoveryMaxOrders ?? 5,
      nextDcaPrice: position.nextDcaPrice,
      takeProfitPrice: position.takeProfitPrice,
      openedAt: position.openedAt,
      orders: position.orders,
      subPositions: position.subPositions,
    })),
  ], [paperPositions, testnetPositions]);

  useEffect(() => {
    const symbols = [...new Set(allPositions.filter((position) => position.status === 'OPEN').map((position) => position.symbol))];
    if (symbols.length === 0) return;
    let cancelled = false;
    const refresh = async () => {
      const results = await Promise.allSettled(symbols.map(async (currentSymbol) => {
        const streamed = await api.getStreamedMarketPrice(token, currentSymbol, 'testnet');
        if (streamed?.price && Number.isFinite(streamed.price)) return [currentSymbol, streamed.price] as const;
        const candles = await api.getMarketCandles(token, currentSymbol, '1m', 1, 'testnet');
        const latestCandle = candles.candles[candles.candles.length - 1];
        return [currentSymbol, latestCandle?.close ?? 0] as const;
      }));
      if (cancelled) return;
      setPrices((current) => {
        const next = { ...current };
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value[1] > 0) next[result.value[0]] = result.value[1];
        }
        return next;
      });
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, allPositions]);

  const filtered = useMemo(() => {
    const normalized = symbol.trim().toUpperCase();
    return allPositions.filter((position) => {
      const sourceMatches = mode === 'ALL' || position.source === mode;
      const statusMatches = !openOnly || position.status === 'OPEN';
      const symbolMatches = !normalized || position.symbol.includes(normalized);
      return sourceMatches && statusMatches && symbolMatches;
    });
  }, [allPositions, mode, openOnly, symbol]);

  async function changeStatus(position: UnifiedPosition, status: StrategyStatus) {
    const label = status === 'PAUSED' ? 'pause' : status === 'RUNNING' ? 'resume' : 'stop';
    if (!window.confirm(`${label[0].toUpperCase()}${label.slice(1)} bot “${position.strategyName}”? This changes future automation only and does not close the position.`)) return;
    setBusyId(position.id);
    try {
      await api.setStrategyStatus(token, position.strategyId, status);
      await load(true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : `Unable to ${label} bot`);
    } finally {
      setBusyId(null);
    }
  }

  async function closePaper(position: UnifiedPosition) {
    const currentPrice = prices[position.symbol] ?? Number(position.averageEntryPrice);
    if (!window.confirm(`Close Paper position ${position.symbol} now at approximately ${currentPrice}? This realizes the current simulated P&L.`)) return;
    setBusyId(position.id);
    try {
      await api.closePaperPosition(token, position.id, currentPrice);
      await load(true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to close Paper position');
    } finally {
      setBusyId(null);
    }
  }

  async function closeTestnet(position: UnifiedPosition, subPositionId?: string) {
    const currentPrice = prices[position.symbol] ?? Number(position.averageEntryPrice);
    const subPosition = subPositionId ? position.subPositions.find((item) => item.id === subPositionId) : null;
    const quantity = Number(subPosition?.quantity ?? position.totalQuantity);
    const estimatedValue = quantity * currentPrice;
    const target = subPosition ? `independent level #${subPosition.level}` : 'parent position';
    if (!window.confirm(`Close ${target} for ${position.symbol}?\n\nQuantity: ${number(quantity)}\nEstimated value: ${money(estimatedValue)}\n\nThis submits a Binance Testnet SELL market order. The bot must be paused and no order may be pending.`)) return;
    setBusyId(subPositionId ?? position.id);
    try {
      await api.closeTestnetPosition(token, position.id, subPositionId);
      await load(true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to close Testnet position');
    } finally {
      setBusyId(null);
    }
  }

  async function syncTestnet(position: UnifiedPosition) {
    const pending = position.orders.filter((order) => order.status === 'PENDING' || order.status === 'PARTIALLY_FILLED');
    if (pending.length === 0) {
      setError('This Testnet position has no pending orders to sync.');
      return;
    }
    setBusyId(position.id);
    try {
      await Promise.all(pending.map((order) => api.syncTestnetOrder(token, order.id)));
      await load(true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to sync Testnet orders');
    } finally {
      setBusyId(null);
    }
  }

  function beginTakeProfitEdit(
    position: UnifiedPosition,
    target: TakeProfitTarget,
    currentValue: string | null,
    subPositionId?: string,
  ) {
    const label = target === 'PARENT'
      ? 'Parent take profit'
      : target === 'RECOVERY'
        ? 'Recovery global take profit'
        : `Independent take profit`;
    setEditingTp({ positionId: position.id, target, subPositionId, label, value: currentValue ?? '' });
    setError(null);
  }

  async function saveTakeProfit(position: UnifiedPosition) {
    if (!editingTp || editingTp.positionId !== position.id) return;
    const takeProfitPrice = Number(editingTp.value);
    if (!Number.isFinite(takeProfitPrice) || takeProfitPrice <= 0) {
      setError('Take-profit price must be greater than zero.');
      return;
    }

    const payload = {
      target: editingTp.target,
      takeProfitPrice,
      ...(editingTp.subPositionId ? { subPositionId: editingTp.subPositionId } : {}),
    };
    const operationId = editingTp.subPositionId ?? position.id;
    setBusyId(operationId);
    try {
      if (position.source === 'PAPER') {
        await api.updatePaperPositionTakeProfit(token, position.id, payload);
      } else {
        await api.updateTestnetPositionTakeProfit(token, position.id, payload);
      }
      setEditingTp(null);
      await load(true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to update take profit');
    } finally {
      setBusyId(null);
    }
  }

  const totals = useMemo(() => {
    const open = allPositions.filter((position) => position.status === 'OPEN');
    const unrealized = open.reduce((sum, position) => {
      const currentPrice = prices[position.symbol] ?? Number(position.averageEntryPrice);
      const independentQuantity = position.subPositions
        .filter((subPosition) => subPosition.status === 'OPEN')
        .reduce((quantity, subPosition) => quantity + Number(subPosition.quantity), 0);
      const independentCost = position.subPositions
        .filter((subPosition) => subPosition.status === 'OPEN')
        .reduce((cost, subPosition) => cost + Number(subPosition.costQuote), 0);
      return sum + currentPrice * (Number(position.totalQuantity) + independentQuantity) - (Number(position.totalCostQuote) + independentCost);
    }, 0);
    const realized = allPositions.reduce(
      (sum, position) => sum + Number(position.realizedPnlQuote) + position.subPositions.reduce((subSum, sub) => subSum + Number(sub.realizedPnlQuote), 0),
      0,
    );
    return {
      open: open.length,
      paper: allPositions.filter((position) => position.source === 'PAPER').length,
      testnet: allPositions.filter((position) => position.source === 'TESTNET').length,
      unrealized,
      realized,
    };
  }, [allPositions, prices]);

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/[0.08] via-white/[0.03] to-violet-400/[0.06] p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Unified position operations</p>
            <h3 className="mt-2 text-2xl font-semibold">Paper and Binance Testnet positions</h3>
            <p className="mt-2 text-sm text-slate-400">Prices and P&amp;L update every second; filled position state refreshes every 5 seconds. Live-money positions remain disabled.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['ALL', 'PAPER', 'TESTNET'] as Mode[]).map((item) => (
              <button key={item} onClick={() => setMode(item)} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${mode === item ? 'bg-cyan-400 text-slate-950' : 'border border-white/10 bg-white/[0.04] text-slate-300'}`}>{item === 'ALL' ? 'All' : item === 'PAPER' ? 'Paper' : 'Binance Testnet'}</button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Open positions" value={String(totals.open)} />
          <Metric label="Paper positions" value={String(totals.paper)} />
          <Metric label="Testnet positions" value={String(totals.testnet)} />
          <Metric label="Unrealized P&L" value={money(totals.unrealized)} />
          <Metric label="Realized P&L" value={money(totals.realized)} />
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
            const currentPrice = prices[position.symbol] ?? Number(position.averageEntryPrice);
            const openIndependent = position.subPositions.filter((subPosition) => subPosition.status === 'OPEN');
            const independentQuantity = openIndependent.reduce((sum, subPosition) => sum + Number(subPosition.quantity), 0);
            const independentCost = openIndependent.reduce((sum, subPosition) => sum + Number(subPosition.costQuote), 0);
            const basketQuantity = Number(position.totalQuantity) + independentQuantity;
            const basketCost = Number(position.totalCostQuote) + independentCost;
            const currentValue = currentPrice * basketQuantity;
            const unrealized = position.status === 'OPEN' ? currentValue - basketCost : 0;
            const realized = Number(position.realizedPnlQuote) + position.subPositions.reduce((sum, sub) => sum + Number(sub.realizedPnlQuote), 0);
            const total = unrealized + realized;
            const activeTakeProfit = position.recoveryMode ? Number(position.recoveryTakeProfitPrice ?? 0) : Number(position.takeProfitPrice ?? 0);
            const tpDistancePercent = activeTakeProfit > 0 && currentPrice > 0 ? ((activeTakeProfit - currentPrice) / currentPrice) * 100 : null;
            const hasPendingOrder = position.orders.some((order) => order.status === 'PENDING' || order.status === 'PARTIALLY_FILLED');
            return (
              <article id={`position-${position.id}`} key={`${position.source}-${position.id}`} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
                <div className="grid gap-4 p-5 xl:grid-cols-[1.2fr_0.9fr_0.9fr_0.9fr_auto] xl:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-lg font-semibold">{position.symbol}</h4>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${position.source === 'PAPER' ? 'bg-violet-400/15 text-violet-300' : 'bg-cyan-400/15 text-cyan-300'}`}>{position.source === 'PAPER' ? 'Paper' : 'Binance Testnet'}</span>
                      <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs text-emerald-300">{position.status}</span>
                      {position.recoveryMode && <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-300">RECOVERY</span>}
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{position.strategyName}</p>
                    <p className="mt-1 text-xs text-slate-600">Opened {new Date(position.openedAt).toLocaleString()}</p>
                  </div>
                  <Metric label="Current price" value={number(currentPrice)} />
                  <Metric label="Unrealized P&L" value={money(unrealized)} />
                  <Metric label="Total P&L" value={money(total)} />
                  <button onClick={() => setExpandedId(expanded ? null : position.id)} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200">{expanded ? 'Hide details' : 'View details'}</button>
                </div>
                {expanded && (
                  <div className="border-t border-white/10 p-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <Metric label="Average entry" value={number(position.averageEntryPrice)} />
                      <Metric label="Basket quantity" value={number(basketQuantity)} />
                      <Metric label="Current value" value={money(currentValue)} />
                      <Metric label="Basket cost" value={money(basketCost)} />
                      <Metric label="Next DCA" value={position.nextDcaPrice ? number(position.nextDcaPrice) : '—'} />
                      <Metric label="Take profit" value={position.takeProfitPrice ? number(position.takeProfitPrice) : '—'} />
                      <Metric label="Distance to active TP" value={tpDistancePercent === null ? '—' : `${tpDistancePercent.toFixed(2)}%`} />
                      <Metric label="Recovery orders" value={position.recoveryMode ? String(position.recoveryDcaCount) : '—'} />
                      <Metric label="Recovery global TP" value={position.recoveryTakeProfitPrice ? number(position.recoveryTakeProfitPrice) : '—'} />
                      <Metric label="Recovery anchor" value={position.recoveryAnchorPrice ? number(position.recoveryAnchorPrice) : '—'} />
                      <Metric label="Realized P&L" value={money(realized)} />
                      <Metric label="Strategy state" value={position.strategyStatus ?? 'STOPPED'} />
                    </div>

                    <PositionFlow position={position} />

                    <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                      <h5 className="text-sm font-semibold">Manual controls</h5>
                      <p className="mt-2 text-xs leading-5 text-slate-500">Pause and stop affect future bot actions only. Closing a position is a separate confirmed action.</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button disabled={busyId === position.id || position.strategyStatus === 'PAUSED'} onClick={() => void changeStatus(position, 'PAUSED')} className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200 disabled:opacity-40">Pause bot</button>
                        <button disabled={busyId === position.id || position.strategyStatus === 'RUNNING'} onClick={() => void changeStatus(position, 'RUNNING')} className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 disabled:opacity-40">Resume bot</button>
                        <button disabled={busyId === position.id || position.strategyStatus === 'STOPPED'} onClick={() => void changeStatus(position, 'STOPPED')} className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-200 disabled:opacity-40">Stop bot</button>
                        {position.source === 'PAPER' && position.status === 'OPEN' && <button disabled={busyId === position.id} onClick={() => void closePaper(position)} className="rounded-xl bg-rose-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">Close Paper position</button>}
                        {position.source === 'TESTNET' && position.status === 'OPEN' && <button disabled={busyId === position.id || position.strategyStatus !== 'PAUSED' || hasPendingOrder} onClick={() => void closeTestnet(position)} className="rounded-xl bg-rose-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">Close Testnet parent</button>}
                        {position.source === 'TESTNET' && <button disabled={busyId === position.id} onClick={() => void syncTestnet(position)} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-40">Sync pending orders</button>}
                        {position.status === 'OPEN' && !position.recoveryMode && <button disabled={busyId === position.id || (position.source === 'TESTNET' && (position.strategyStatus !== 'PAUSED' || hasPendingOrder))} onClick={() => beginTakeProfitEdit(position, 'PARENT', position.takeProfitPrice)} className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-sm font-semibold text-violet-200 disabled:opacity-40">Edit parent TP</button>}
                        {position.status === 'OPEN' && position.recoveryMode && <button disabled={busyId === position.id || (position.source === 'TESTNET' && (position.strategyStatus !== 'PAUSED' || hasPendingOrder))} onClick={() => beginTakeProfitEdit(position, 'RECOVERY', position.recoveryTakeProfitPrice)} className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-sm font-semibold text-violet-200 disabled:opacity-40">Edit global TP</button>}
                      </div>
                      {position.source === 'TESTNET' && position.strategyStatus !== 'PAUSED' && <p className="mt-3 text-xs text-amber-200">Pause the bot before submitting a manual Testnet close.</p>}
                      {position.source === 'TESTNET' && hasPendingOrder && <p className="mt-3 text-xs text-amber-200">A Testnet order is pending or partially filled. Sync it before closing.</p>}
                      {editingTp?.positionId === position.id && !editingTp.subPositionId && (
                        <div className="mt-4 rounded-xl border border-violet-400/20 bg-violet-400/[0.06] p-4">
                          <label className="text-sm font-medium text-slate-200">{editingTp.label} price
                            <input autoFocus type="number" min="0.00000001" step="any" value={editingTp.value} onChange={(event) => setEditingTp({ ...editingTp, value: event.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 outline-none ring-violet-400/40 focus:ring" />
                          </label>
                          <div className="mt-3 flex gap-2">
                            <button disabled={busyId === position.id} onClick={() => void saveTakeProfit(position)} className="rounded-lg bg-violet-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">Save TP</button>
                            <button disabled={busyId === position.id} onClick={() => setEditingTp(null)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 disabled:opacity-40">Cancel</button>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">This overrides the TP for this open position only. Bot defaults for future positions are unchanged.</p>
                        </div>
                      )}
                    </div>

                    <div className="mt-5">
                      <h5 className="text-sm font-semibold">Independent sub-positions</h5>
                      {position.subPositions.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-500">No independent levels have been opened.</p> : (
                        <><div className="mt-3 grid gap-3 md:hidden">{position.subPositions.map((sub) => <div key={sub.id} className="rounded-xl border border-white/10 bg-slate-950/35 p-4"><div className="flex items-center justify-between"><p className="font-semibold">Independent #{sub.level}</p><span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs">{sub.status}</span></div><div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Entry" value={number(sub.entryPrice)} /><Metric label="TP" value={number(sub.takeProfitPrice)} /><Metric label="Cost" value={money(sub.costQuote)} /><Metric label="Realized P&L" value={money(sub.realizedPnlQuote)} /></div><div className="mt-3 flex gap-2">{sub.status === 'OPEN' && !position.recoveryMode && <button disabled={busyId === sub.id || (position.source === 'TESTNET' && (position.strategyStatus !== 'PAUSED' || hasPendingOrder))} onClick={() => beginTakeProfitEdit(position, 'INDEPENDENT', sub.takeProfitPrice, sub.id)} className="rounded-lg border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-xs font-semibold text-violet-200 disabled:opacity-40">Edit TP</button>}{position.source === 'TESTNET' && sub.status === 'OPEN' && <button disabled={busyId === sub.id || position.strategyStatus !== 'PAUSED' || hasPendingOrder} onClick={() => void closeTestnet(position, sub.id)} className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-40">Close leg</button>}</div></div>)}</div><div className="mt-3 hidden overflow-x-auto md:block"><table className="w-full min-w-[920px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="pb-3">Level</th><th className="pb-3">Status</th><th className="pb-3">Quantity</th><th className="pb-3">Cost</th><th className="pb-3">Entry</th><th className="pb-3">TP</th><th className="pb-3">P&L</th><th className="pb-3">Control</th></tr></thead><tbody>{position.subPositions.map((sub) => <tr key={sub.id} className="border-t border-white/10"><td className="py-3">#{sub.level}</td><td className="py-3">{sub.status}</td><td className="py-3">{number(sub.quantity)}</td><td className="py-3">{money(sub.costQuote)}</td><td className="py-3">{number(sub.entryPrice)}</td><td className="py-3">{editingTp?.subPositionId === sub.id ? <div className="flex min-w-[240px] gap-2"><input autoFocus type="number" min="0.00000001" step="any" value={editingTp.value} onChange={(event) => setEditingTp({ ...editingTp, value: event.target.value })} className="w-32 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1.5 outline-none ring-violet-400/40 focus:ring" /><button disabled={busyId === sub.id} onClick={() => void saveTakeProfit(position)} className="rounded-lg bg-violet-400 px-2.5 py-1.5 text-xs font-semibold text-slate-950">Save</button><button onClick={() => setEditingTp(null)} className="rounded-lg border border-white/10 px-2 py-1.5 text-xs">Cancel</button></div> : number(sub.takeProfitPrice)}</td><td className="py-3">{money(sub.realizedPnlQuote)}</td><td className="py-3"><div className="flex gap-2">{sub.status === 'OPEN' && !position.recoveryMode && <button disabled={busyId === sub.id || (position.source === 'TESTNET' && (position.strategyStatus !== 'PAUSED' || hasPendingOrder))} onClick={() => beginTakeProfitEdit(position, 'INDEPENDENT', sub.takeProfitPrice, sub.id)} className="rounded-lg border border-violet-400/30 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-200 disabled:opacity-40">Edit TP</button>}{position.source === 'TESTNET' && sub.status === 'OPEN' ? <button disabled={busyId === sub.id || position.strategyStatus !== 'PAUSED' || hasPendingOrder} onClick={() => void closeTestnet(position, sub.id)} className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-xs font-semibold text-rose-200 disabled:opacity-40">Close leg</button> : null}</div></td></tr>)}</tbody></table></div></>
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

function PositionFlow({ position }: { position: UnifiedPosition }) {
  const maxLevel = position.maxDcaOrders + 1;
  const completedThrough = position.dcaCount + 1;
  const openByLevel = new Map(position.subPositions.map((subPosition) => [subPosition.level, subPosition]));
  const normalLevels = Array.from({ length: maxLevel }, (_, index) => index + 1);

  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h5 className="text-sm font-semibold">Position flow</h5>
          <p className="mt-1 text-xs text-slate-500">Main basket → independent levels → Recovery basket</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${position.recoveryMode ? 'bg-amber-400/15 text-amber-300' : 'bg-cyan-400/10 text-cyan-300'}`}>
          {position.recoveryMode ? 'RECOVERY ACTIVE' : `NEXT LEVEL #${Math.min(completedThrough + 1, maxLevel)}`}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {normalLevels.map((level) => {
          const independent = level >= position.independentFromLevel;
          const subPosition = openByLevel.get(level);
          const completed = level <= completedThrough;
          const state = independent
            ? subPosition?.status === 'OPEN' ? 'Open' : subPosition?.status === 'CLOSED' ? 'Exited' : completed ? 'Filled' : 'Waiting'
            : completed ? 'Filled' : 'Waiting';
          const active = !position.recoveryMode && !completed && level === completedThrough + 1;
          return (
            <div key={level} className={`rounded-xl border px-3 py-2 text-xs ${active ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200' : completed ? 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200' : 'border-white/10 bg-white/[0.025] text-slate-500'}`}>
              <span className="font-semibold">#{level} {independent ? 'Independent' : 'Main'}</span>
              <span className="ml-2 opacity-75">{state}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <span className="mr-1 text-xs font-semibold text-amber-300">Recovery</span>
        {Array.from({ length: position.recoveryMaxOrders }, (_, index) => index + 1).map((level) => {
          const filled = level <= position.recoveryDcaCount;
          const active = position.recoveryMode && level === position.recoveryDcaCount + 1;
          return (
            <span key={level} className={`rounded-lg border px-2.5 py-1.5 text-xs ${filled ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : active ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200' : 'border-white/10 text-slate-600'}`}>
              R{level} {filled ? 'Filled' : active ? 'Waiting' : 'Queued'}
            </span>
          );
        })}
        <span className={`rounded-lg border px-2.5 py-1.5 text-xs ${position.recoveryMode ? 'border-violet-400/30 bg-violet-400/10 text-violet-200' : 'border-white/10 text-slate-600'}`}>
          Global TP {position.recoveryTakeProfitPrice ? number(position.recoveryTakeProfitPrice) : '—'}
        </span>
      </div>
    </div>
  );
}
