import { useEffect, useMemo, useState } from 'react';
import { api, type TestnetOrder, type TestnetPosition, type TradingOrder, type TradingPosition } from '../lib/api';

type Props = { token: string; mode: 'PAPER' | 'TESTNET' };

type HistoryOrder = {
  id: string;
  side: 'BUY' | 'SELL';
  level: number;
  independent: boolean;
  status: string;
  quantity: string;
  quoteAmount: string;
  averageFillPrice: string | null;
  feeQuote?: string | null;
  createdAt: string;
};

type HistoryCycle = {
  id: string;
  environment: 'PAPER' | 'TESTNET';
  symbol: string;
  strategyName: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  realizedPnl: number;
  fees: number;
  orders: HistoryOrder[];
};

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const number = (value: string | number | null | undefined) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(numeric) : '—';
};

function realized(position: TradingPosition | TestnetPosition) {
  return Number(position.realizedPnlQuote) + position.subPositions.reduce((sum, sub) => sum + Number(sub.realizedPnlQuote), 0);
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function TradeHistoryPanel({ token, mode }: Props) {
  const [paper, setPaper] = useState<TradingPosition[]>([]);
  const [testnet, setTestnet] = useState<TestnetPosition[]>([]);
  const [testnetOrders, setTestnetOrders] = useState<TestnetOrder[]>([]);
  const [symbol, setSymbol] = useState('');
  const [closedOnly, setClosedOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      if (mode === 'PAPER') {
        setPaper(await api.listPaperPositions(token));
      } else {
        const [positions, orders] = await Promise.all([
          api.listTestnetPositions(token, 500),
          api.listTestnetOrders(token, 500),
        ]);
        setTestnet(positions);
        setTestnetOrders(orders);
      }
      setError(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to load trade history');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, mode]);

  const cycles = useMemo<HistoryCycle[]>(() => {
    if (mode === 'PAPER') {
      return paper.map((position) => ({
        id: position.id,
        environment: 'PAPER',
        symbol: position.symbol,
        strategyName: position.strategy.name,
        status: position.status,
        openedAt: position.openedAt,
        closedAt: position.closedAt,
        realizedPnl: realized(position),
        fees: position.orders.reduce((sum, order) => sum + Number(order.feeQuote ?? 0), 0),
        orders: position.orders.map((order: TradingOrder) => ({
          ...order,
          status: 'FILLED',
          quantity: order.quoteAmount && order.averageFillPrice ? String(Number(order.quoteAmount) / Number(order.averageFillPrice)) : '0',
        })),
      }));
    }
    const ordersByPosition = new Map<string, TestnetOrder[]>();
    for (const order of testnetOrders) {
      const current = ordersByPosition.get(order.positionId) ?? [];
      current.push(order);
      ordersByPosition.set(order.positionId, current);
    }
    return testnet.map((position) => {
      const orders = (ordersByPosition.get(position.id) ?? []).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return {
        id: position.id,
        environment: 'TESTNET' as const,
        symbol: position.symbol,
        strategyName: position.strategy.name,
        status: position.status,
        openedAt: position.openedAt,
        closedAt: position.closedAt,
        realizedPnl: realized(position),
        fees: orders.reduce((sum, order) => sum + Number(order.feeQuote ?? 0), 0),
        orders,
      };
    });
  }, [mode, paper, testnet, testnetOrders]);

  const filtered = useMemo(() => {
    const wanted = symbol.trim().toUpperCase();
    return cycles.filter((cycle) => (!wanted || cycle.symbol.includes(wanted)) && (!closedOnly || cycle.status === 'CLOSED'));
  }, [cycles, symbol, closedOnly]);

  const totals = useMemo(() => ({
    cycles: filtered.length,
    closed: filtered.filter((cycle) => cycle.status === 'CLOSED').length,
    pnl: filtered.reduce((sum, cycle) => sum + cycle.realizedPnl, 0),
    fees: filtered.reduce((sum, cycle) => sum + cycle.fees, 0),
  }), [filtered]);

  function exportCsv() {
    const header = ['environment', 'cycleId', 'strategy', 'symbol', 'cycleStatus', 'cycleOpenedAt', 'cycleClosedAt', 'cycleRealizedPnlQuote', 'orderId', 'orderCreatedAt', 'side', 'level', 'independent', 'orderStatus', 'quantity', 'averageFillPrice', 'quoteAmount', 'feeQuote'];
    const rows = filtered.flatMap((cycle) => cycle.orders.length ? cycle.orders.map((order) => [
      cycle.environment, cycle.id, cycle.strategyName, cycle.symbol, cycle.status, cycle.openedAt, cycle.closedAt ?? '', cycle.realizedPnl,
      order.id, order.createdAt, order.side, order.level, order.independent, order.status, order.quantity, order.averageFillPrice ?? '', order.quoteAmount, order.feeQuote ?? '',
    ]) : [[cycle.environment, cycle.id, cycle.strategyName, cycle.symbol, cycle.status, cycle.openedAt, cycle.closedAt ?? '', cycle.realizedPnl, '', '', '', '', '', '', '', '', '', '']]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `hbs-${mode.toLowerCase()}-trade-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return <section className="mt-6 space-y-5">
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/[0.08] via-white/[0.03] to-violet-400/[0.06] p-5 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">{mode === 'PAPER' ? 'Paper' : 'Binance Spot Testnet'}</p><h3 className="mt-2 text-2xl font-semibold">Trade cycle history</h3><p className="mt-2 text-sm text-slate-400">Review complete campaigns and every order inside each cycle. Realized P&amp;L includes independent legs.</p></div><button onClick={exportCsv} disabled={!filtered.length} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-40">Export visible CSV</button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Cycles" value={String(totals.cycles)} /><Metric label="Completed" value={String(totals.closed)} /><Metric label="Realized P&L" value={money(totals.pnl)} /><Metric label="Recorded fees" value={money(totals.fees)} /></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(180px,1fr)_auto_auto]"><input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="Filter symbol" className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none ring-cyan-400/40 focus:ring" /><label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm"><input type="checkbox" checked={closedOnly} onChange={(event) => setClosedOnly(event.target.checked)} className="accent-cyan-400" />Completed only</label><button onClick={() => void load()} disabled={loading} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold">Refresh</button></div>
    </div>
    {error && <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
    {loading ? <div className="rounded-2xl border border-white/10 p-10 text-center text-sm text-slate-500">Loading history…</div> : filtered.length === 0 ? <div className="rounded-2xl border border-white/10 p-10 text-center text-sm text-slate-500">No trade cycles match these filters.</div> : <div className="space-y-3">{filtered.map((cycle) => {
      const expanded = expandedId === cycle.id;
      return <article key={cycle.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]"><button onClick={() => setExpandedId(expanded ? null : cycle.id)} className="grid w-full gap-3 p-4 text-left sm:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_1fr_auto] xl:items-center"><div><div className="flex items-center gap-2"><span className="font-semibold">{cycle.symbol}</span><span className="rounded-full bg-cyan-400/10 px-2 py-1 text-xs text-cyan-200">{cycle.environment}</span><span className="rounded-full bg-white/[0.06] px-2 py-1 text-xs">{cycle.status}</span></div><p className="mt-1 text-xs text-slate-500">{cycle.strategyName} · {new Date(cycle.openedAt).toLocaleString()}</p></div><Metric label="Orders" value={String(cycle.orders.length)} /><Metric label="Realized P&L" value={money(cycle.realizedPnl)} /><Metric label="Recorded fees" value={money(cycle.fees)} /><span className="text-sm font-semibold text-cyan-300">{expanded ? 'Hide' : 'Details'}</span></button>{expanded && <div className="border-t border-white/10 p-4"><div className="grid gap-2 md:hidden">{cycle.orders.map((order) => <OrderCard key={order.id} order={order} />)}</div><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="pb-3">Time</th><th className="pb-3">Side</th><th className="pb-3">Level</th><th className="pb-3">Status</th><th className="pb-3 text-right">Quantity</th><th className="pb-3 text-right">Average</th><th className="pb-3 text-right">Quote</th><th className="pb-3 text-right">Fee</th></tr></thead><tbody>{cycle.orders.map((order) => <tr key={order.id} className="border-t border-white/10"><td className="py-3">{new Date(order.createdAt).toLocaleString()}</td><td className="py-3">{order.side}</td><td className="py-3">#{order.level}{order.independent ? ' · Independent' : ''}</td><td className="py-3">{order.status}</td><td className="py-3 text-right">{number(order.quantity)}</td><td className="py-3 text-right">{number(order.averageFillPrice)}</td><td className="py-3 text-right">{money(Number(order.quoteAmount))}</td><td className="py-3 text-right">{order.feeQuote == null ? '—' : money(Number(order.feeQuote))}</td></tr>)}</tbody></table></div></div>}</article>;
    })}</div>}
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3"><p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1.5 font-semibold">{value}</p></div>; }
function OrderCard({ order }: { order: HistoryOrder }) { return <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4"><div className="flex justify-between"><span className="font-semibold">{order.side} · #{order.level}{order.independent ? ' Independent' : ''}</span><span className="text-xs text-slate-400">{order.status}</span></div><div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Average" value={number(order.averageFillPrice)} /><Metric label="Quote" value={money(Number(order.quoteAmount))} /><Metric label="Quantity" value={number(order.quantity)} /><Metric label="Fee" value={order.feeQuote == null ? '—' : money(Number(order.feeQuote))} /></div><p className="mt-3 text-xs text-slate-500">{new Date(order.createdAt).toLocaleString()}</p></div>; }
