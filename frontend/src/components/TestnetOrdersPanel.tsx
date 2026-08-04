import { useEffect, useMemo, useState } from 'react';
import { api, type TestnetOrder, type TestnetOrderStatus } from '../lib/api';

type Props = {
  token: string;
};

const statuses: Array<'ALL' | TestnetOrderStatus> = [
  'ALL',
  'PENDING',
  'PARTIALLY_FILLED',
  'FILLED',
  'REJECTED',
  'CANCELLED',
];

function formatNumber(value: string | null | undefined, maximumFractionDigits = 8) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(number);
}

function statusClass(status: TestnetOrderStatus) {
  switch (status) {
    case 'FILLED':
      return 'bg-emerald-400/15 text-emerald-300';
    case 'PARTIALLY_FILLED':
      return 'bg-amber-400/15 text-amber-300';
    case 'REJECTED':
    case 'CANCELLED':
      return 'bg-rose-400/15 text-rose-300';
    default:
      return 'bg-cyan-400/15 text-cyan-300';
  }
}

export function TestnetOrdersPanel({ token }: Props) {
  const [orders, setOrders] = useState<TestnetOrder[]>([]);
  const [status, setStatus] = useState<'ALL' | TestnetOrderStatus>('ALL');
  const [symbol, setSymbol] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadOrders() {
    setLoading(true);
    setError(null);
    try {
      setOrders(await api.listTestnetOrders(token, 250));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to load Testnet orders');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, [token]);

  const filteredOrders = useMemo(() => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    return orders.filter((order) => {
      const statusMatches = status === 'ALL' || order.status === status;
      const symbolMatches = !normalizedSymbol || order.position.symbol.includes(normalizedSymbol);
      return statusMatches && symbolMatches;
    });
  }, [orders, status, symbol]);

  async function syncOrder(order: TestnetOrder) {
    setSyncingId(order.id);
    setError(null);
    setMessage(null);
    try {
      const response = await api.syncTestnetOrder(token, order.id);
      setOrders((current) => current.map((item) => (
        item.id === order.id ? response.tradingOrder : item
      )));
      setMessage(
        `Order synchronized: +${formatNumber(String(response.deltaQuantity))} filled, +${formatNumber(String(response.deltaQuoteAmount))} quote`,
      );
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to synchronize Testnet order');
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/[0.08] via-white/[0.03] to-violet-400/[0.06] p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Binance Spot Testnet</p>
            <h3 className="mt-2 text-2xl font-semibold">Testnet orders</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Review strategy actions, exchange fill progress and independent DCA orders. Manual synchronization reads the latest order state from Binance Testnet.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(180px,1fr)_190px_auto]">
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="Filter symbol"
              aria-label="Filter orders by symbol"
              className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none ring-cyan-400/40 placeholder:text-slate-600 focus:ring"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as 'ALL' | TestnetOrderStatus)}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none ring-cyan-400/40 focus:ring"
            >
              {statuses.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}
            </select>
            <button
              onClick={() => void loadOrders()}
              disabled={loading}
              className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Loaded</p>
            <p className="mt-2 text-xl font-semibold">{orders.length}</p>
          </article>
          <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Visible</p>
            <p className="mt-2 text-xl font-semibold text-cyan-300">{filteredOrders.length}</p>
          </article>
          <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Unresolved</p>
            <p className="mt-2 text-xl font-semibold text-amber-300">
              {orders.filter((order) => order.status === 'PENDING' || order.status === 'PARTIALLY_FILLED').length}
            </p>
          </article>
        </div>
      </div>

      {message && <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading Testnet orders…</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No orders match the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-slate-950/50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Strategy</th>
                  <th className="px-4 py-3">Side / level</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Fill progress</th>
                  <th className="px-4 py-3 text-right">Average</th>
                  <th className="px-4 py-3 text-right">Quote</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3 text-right">Sync</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const requested = Number(order.quantity);
                  const filled = Number(order.filledQuantity);
                  const fillPercent = requested > 0 ? Math.min((filled / requested) * 100, 100) : 0;
                  const unresolved = order.status === 'PENDING' || order.status === 'PARTIALLY_FILLED';

                  return (
                    <tr key={order.id} className="border-t border-white/10 align-top">
                      <td className="px-4 py-4">
                        <p className="font-semibold">{order.position.symbol}</p>
                        <p className="mt-1 max-w-44 truncate text-xs text-slate-500" title={order.clientOrderId}>{order.clientOrderId}</p>
                        <p className="mt-1 text-xs text-slate-600">{new Date(order.createdAt).toLocaleString()}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium">{order.position.strategy.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{order.position.strategy.status ?? 'STOPPED'} · TESTNET</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${order.side === 'BUY' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'}`}>{order.side}</span>
                        <p className="mt-2 text-xs text-slate-400">Level #{order.level}</p>
                        {order.independent && <p className="mt-1 text-xs text-violet-300">Independent leg</p>}
                      </td>
                      <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(order.status)}`}>{order.status.replace('_', ' ')}</span></td>
                      <td className="px-4 py-4">
                        <div className="h-2 w-36 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-cyan-400" style={{ width: `${fillPercent}%` }} />
                        </div>
                        <p className="mt-2 text-xs text-slate-400">{formatNumber(order.filledQuantity)} / {formatNumber(order.quantity)} ({fillPercent.toFixed(1)}%)</p>
                      </td>
                      <td className="px-4 py-4 text-right">{order.averageFillPrice ? formatNumber(order.averageFillPrice) : '—'}</td>
                      <td className="px-4 py-4 text-right">{formatNumber(order.quoteAmount)}</td>
                      <td className="px-4 py-4">
                        <p className="text-xs font-medium text-slate-300">{order.strategyAction?.type?.replace(/_/g, ' ') ?? 'Manual order'}</p>
                        <p className="mt-1 text-xs text-slate-500">{order.strategyAction?.status ?? 'No action record'}</p>
                        {order.strategyAction?.triggerPrice && <p className="mt-1 text-xs text-cyan-300">Trigger {formatNumber(order.strategyAction.triggerPrice)}</p>}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => void syncOrder(order)}
                          disabled={syncingId === order.id || !order.exchangeOrderId}
                          className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40 ${unresolved ? 'bg-cyan-400 text-slate-950' : 'border border-white/10 bg-white/[0.04] text-slate-300'}`}
                        >
                          {syncingId === order.id ? 'Syncing…' : 'Sync'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
