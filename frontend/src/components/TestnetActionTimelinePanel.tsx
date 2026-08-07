import { useEffect, useMemo, useState } from 'react';
import {
  api,
  type TestnetAction,
  type TestnetActionStatus,
  type TestnetActionType,
} from '../lib/api';

type Props = {
  token: string;
  environment?: 'TESTNET' | 'LIVE';
};

const actionTypes: Array<'ALL' | TestnetActionType> = [
  'ALL',
  'INITIAL_ENTRY',
  'DCA_ENTRY',
  'INDEPENDENT_ENTRY',
  'PARENT_EXIT',
  'INDEPENDENT_EXIT',
];

const actionStatuses: Array<'ALL' | TestnetActionStatus> = [
  'ALL',
  'PENDING',
  'SUBMITTED',
  'COMPLETED',
  'FAILED',
];

function formatNumber(value: string | number | null | undefined, maximumFractionDigits = 8) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(number);
}

function actionTypeClass(type: TestnetActionType) {
  switch (type) {
    case 'INITIAL_ENTRY':
      return 'bg-cyan-400/15 text-cyan-300';
    case 'DCA_ENTRY':
      return 'bg-violet-400/15 text-violet-300';
    case 'INDEPENDENT_ENTRY':
      return 'bg-fuchsia-400/15 text-fuchsia-300';
    case 'PARENT_EXIT':
      return 'bg-emerald-400/15 text-emerald-300';
    case 'INDEPENDENT_EXIT':
      return 'bg-teal-400/15 text-teal-300';
  }
}

function statusClass(status: TestnetActionStatus) {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-400/15 text-emerald-300';
    case 'SUBMITTED':
      return 'bg-cyan-400/15 text-cyan-300';
    case 'FAILED':
      return 'bg-rose-400/15 text-rose-300';
    default:
      return 'bg-amber-400/15 text-amber-300';
  }
}

function duration(action: TestnetAction) {
  if (!action.completedAt) return null;
  const milliseconds = new Date(action.completedAt).getTime() - new Date(action.createdAt).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
  if (milliseconds < 1000) return `${milliseconds} ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)} s`;
  return `${(milliseconds / 60_000).toFixed(1)} min`;
}

export function TestnetActionTimelinePanel({ token, environment = 'TESTNET' }: Props) {
  const [actions, setActions] = useState<TestnetAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState('');
  const [type, setType] = useState<'ALL' | TestnetActionType>('ALL');
  const [status, setStatus] = useState<'ALL' | TestnetActionStatus>('ALL');

  async function loadActions() {
    setLoading(true);
    setError(null);
    try {
      setActions(environment === 'LIVE' ? await api.listLiveActions(token, 250) : await api.listTestnetActions(token, 250));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : `Unable to load ${environment === 'LIVE' ? 'LIVE' : 'Testnet'} actions`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadActions();
  }, [token, environment]);

  useEffect(() => {
    const interval = window.setInterval(() => void loadActions(), 15_000);
    return () => window.clearInterval(interval);
  }, [token, environment]);

  const filteredActions = useMemo(() => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    return actions.filter((action) => {
      const symbolMatches = !normalizedSymbol || action.strategy.symbol.includes(normalizedSymbol);
      const typeMatches = type === 'ALL' || action.type === type;
      const statusMatches = status === 'ALL' || action.status === status;
      return symbolMatches && typeMatches && statusMatches;
    });
  }, [actions, symbol, type, status]);

  const totals = useMemo(() => ({
    total: actions.length,
    pending: actions.filter((action) => action.status === 'PENDING' || action.status === 'SUBMITTED').length,
    completed: actions.filter((action) => action.status === 'COMPLETED').length,
    failed: actions.filter((action) => action.status === 'FAILED').length,
  }), [actions]);

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/[0.08] via-white/[0.03] to-violet-400/[0.06] p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Binance Spot {environment === 'LIVE' ? 'LIVE' : 'Testnet'}</p>
            <h3 className="mt-2 text-2xl font-semibold">Strategy action timeline</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Trace every automated initial entry, DCA, independent leg and take-profit action from trigger to exchange fill.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(170px,1fr)_190px_190px_auto]">
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="Filter symbol"
              aria-label="Filter actions by symbol"
              className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none ring-cyan-400/40 placeholder:text-slate-600 focus:ring"
            />
            <select
              value={type}
              onChange={(event) => setType(event.target.value as 'ALL' | TestnetActionType)}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none ring-cyan-400/40 focus:ring"
            >
              {actionTypes.map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
            </select>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as 'ALL' | TestnetActionStatus)}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none ring-cyan-400/40 focus:ring"
            >
              {actionStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <button
              onClick={() => void loadActions()}
              disabled={loading}
              className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Total actions</p><p className="mt-2 text-xl font-semibold">{totals.total}</p></article>
          <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">In progress</p><p className="mt-2 text-xl font-semibold text-amber-300">{totals.pending}</p></article>
          <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Completed</p><p className="mt-2 text-xl font-semibold text-emerald-300">{totals.completed}</p></article>
          <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Failed</p><p className="mt-2 text-xl font-semibold text-rose-300">{totals.failed}</p></article>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Loading strategy actions…</div>
        ) : filteredActions.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">No strategy actions match the selected filters.</div>
        ) : (
          <ol className="space-y-0">
            {filteredActions.map((action, index) => {
              const actionDuration = duration(action);
              return (
                <li key={action.id} className="relative grid gap-4 pb-6 pl-10 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                  {index < filteredActions.length - 1 && <span className="absolute left-[14px] top-8 h-[calc(100%-1rem)] w-px bg-white/10" />}
                  <span className={`absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 ${action.status === 'FAILED' ? 'bg-rose-400/20 text-rose-300' : action.status === 'COMPLETED' ? 'bg-emerald-400/20 text-emerald-300' : 'bg-cyan-400/20 text-cyan-300'}`}>
                    {action.status === 'FAILED' ? '!' : action.status === 'COMPLETED' ? '✓' : '•'}
                  </span>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${actionTypeClass(action.type)}`}>{action.type.replace(/_/g, ' ')}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(action.status)}`}>{action.status}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${action.side === 'BUY' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'}`}>{action.side}</span>
                    </div>
                    <h4 className="mt-3 font-semibold">{action.strategy.symbol} · {action.strategy.name}</h4>
                    <p className="mt-1 text-xs text-slate-500">{new Date(action.createdAt).toLocaleString()}</p>
                    {action.errorMessage && <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{action.errorMessage}</p>}
                  </div>

                  <dl className="grid gap-3 rounded-xl border border-white/10 bg-slate-950/25 p-4 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-slate-500">Level / scope</dt><dd className="mt-1">{action.level ? `#${action.level}` : 'Parent'}{action.independent ? ' · Independent' : ''}</dd></div>
                    <div><dt className="text-xs text-slate-500">Trigger price</dt><dd className="mt-1">{action.triggerPrice ? formatNumber(action.triggerPrice) : '—'}</dd></div>
                    <div><dt className="text-xs text-slate-500">Requested quantity</dt><dd className="mt-1">{formatNumber(action.quantity)}</dd></div>
                    <div><dt className="text-xs text-slate-500">Requested quote</dt><dd className="mt-1">{formatNumber(action.quoteAmount)}</dd></div>
                    <div><dt className="text-xs text-slate-500">Filled quantity</dt><dd className="mt-1">{formatNumber(action.order?.filledQuantity)}</dd></div>
                    <div><dt className="text-xs text-slate-500">Average fill</dt><dd className="mt-1">{formatNumber(action.order?.averageFillPrice)}</dd></div>
                    <div><dt className="text-xs text-slate-500">Exchange order</dt><dd className="mt-1 break-all text-xs text-slate-300">{action.order?.exchangeOrderId ?? '—'}</dd></div>
                    <div><dt className="text-xs text-slate-500">Duration</dt><dd className="mt-1">{actionDuration ?? (action.status === 'FAILED' ? 'Failed' : 'In progress')}</dd></div>
                  </dl>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
