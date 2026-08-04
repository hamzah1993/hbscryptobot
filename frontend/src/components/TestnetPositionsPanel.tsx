import { useEffect, useMemo, useState } from 'react';
import { api, type TestnetPosition } from '../lib/api';

type Props = {
  token: string;
};

function formatNumber(value: string | number | null | undefined, maximumFractionDigits = 8) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(number);
}

function formatMoney(value: string | number | null | undefined) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(number);
}

function positionStatusClass(status: TestnetPosition['status']) {
  switch (status) {
    case 'OPEN':
      return 'bg-emerald-400/15 text-emerald-300';
    case 'CLOSING':
      return 'bg-amber-400/15 text-amber-300';
    case 'ERROR':
      return 'bg-rose-400/15 text-rose-300';
    default:
      return 'bg-slate-400/10 text-slate-300';
  }
}

export function TestnetPositionsPanel({ token }: Props) {
  const [positions, setPositions] = useState<TestnetPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState('');
  const [openOnly, setOpenOnly] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadPositions() {
    setLoading(true);
    setError(null);
    try {
      setPositions(await api.listTestnetPositions(token, 250));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to load Testnet positions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPositions();
  }, [token]);

  const filteredPositions = useMemo(() => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    return positions.filter((position) => {
      const symbolMatches = !normalizedSymbol || position.symbol.includes(normalizedSymbol);
      const statusMatches = !openOnly || position.status === 'OPEN';
      return symbolMatches && statusMatches;
    });
  }, [positions, symbol, openOnly]);

  const totals = useMemo(() => {
    const openPositions = positions.filter((position) => position.status === 'OPEN');
    return {
      open: openPositions.length,
      allocated: openPositions.reduce((sum, position) => sum + Number(position.totalCostQuote), 0),
      realized: positions.reduce((sum, position) => sum + Number(position.realizedPnlQuote), 0),
      independent: positions.reduce(
        (sum, position) => sum + position.subPositions.filter((item) => item.status === 'OPEN').length,
        0,
      ),
    };
  }, [positions]);

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/[0.08] via-white/[0.03] to-violet-400/[0.06] p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Binance Spot Testnet</p>
            <h3 className="mt-2 text-2xl font-semibold">Testnet positions</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Monitor parent DCA positions, independent sub-positions, trigger levels and realized performance from persisted Testnet fills.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(180px,1fr)_auto_auto]">
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="Filter symbol"
              aria-label="Filter positions by symbol"
              className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none ring-cyan-400/40 placeholder:text-slate-600 focus:ring"
            />
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={openOnly}
                onChange={(event) => setOpenOnly(event.target.checked)}
                className="h-4 w-4 accent-cyan-400"
              />
              Open only
            </label>
            <button
              onClick={() => void loadPositions()}
              disabled={loading}
              className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Open parents</p>
            <p className="mt-2 text-xl font-semibold text-cyan-300">{totals.open}</p>
          </article>
          <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Allocated quote</p>
            <p className="mt-2 text-xl font-semibold">{formatMoney(totals.allocated)}</p>
          </article>
          <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Realized P&amp;L</p>
            <p className={`mt-2 text-xl font-semibold ${totals.realized >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {formatMoney(totals.realized)}
            </p>
          </article>
          <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Open independent legs</p>
            <p className="mt-2 text-xl font-semibold text-violet-300">{totals.independent}</p>
          </article>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-10 text-center text-sm text-slate-500">
          Loading Testnet positions…
        </div>
      ) : filteredPositions.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-10 text-center text-sm text-slate-500">
          No positions match the selected filters.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPositions.map((position) => {
            const expanded = expandedId === position.id;
            const openIndependent = position.subPositions.filter((item) => item.status === 'OPEN').length;
            const recentOrder = position.orders[0];

            return (
              <article key={position.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
                <div className="grid gap-4 p-5 xl:grid-cols-[1.1fr_0.9fr_0.9fr_0.8fr_0.9fr_auto] xl:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-lg font-semibold">{position.symbol}</h4>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${positionStatusClass(position.status)}`}>
                        {position.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{position.strategy.name}</p>
                    <p className="mt-1 text-xs text-slate-600">Opened {new Date(position.openedAt).toLocaleString()}</p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">Allocated / quantity</p>
                    <p className="mt-2 font-semibold">{formatMoney(position.totalCostQuote)}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatNumber(position.totalQuantity)} units</p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">Average entry</p>
                    <p className="mt-2 font-semibold">{formatNumber(position.averageEntryPrice)}</p>
                    <p className="mt-1 text-xs text-slate-400">DCA {position.dcaCount}/{position.strategy.maxDcaOrders}</p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">Independent legs</p>
                    <p className="mt-2 font-semibold text-violet-300">{openIndependent}/{position.subPositions.length}</p>
                    <p className="mt-1 text-xs text-slate-400">From level #{position.strategy.independentFromLevel ?? 5}</p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">Realized P&amp;L</p>
                    <p className={`mt-2 font-semibold ${Number(position.realizedPnlQuote) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {formatMoney(position.realizedPnlQuote)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Latest order {recentOrder?.status ?? '—'}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : position.id)}
                    className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200"
                  >
                    {expanded ? 'Hide details' : 'View details'}
                  </button>
                </div>

                {expanded && (
                  <div className="border-t border-white/10 p-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                        <p className="text-xs text-slate-500">Next DCA trigger</p>
                        <p className="mt-2 font-semibold text-cyan-300">{position.nextDcaPrice ? formatNumber(position.nextDcaPrice) : '—'}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                        <p className="text-xs text-slate-500">Parent take profit</p>
                        <p className="mt-2 font-semibold text-emerald-300">{position.takeProfitPrice ? formatNumber(position.takeProfitPrice) : '—'}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                        <p className="text-xs text-slate-500">Risk budget</p>
                        <p className="mt-2 font-semibold">{formatMoney(position.strategy.riskBudgetQuote)}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                        <p className="text-xs text-slate-500">Strategy state</p>
                        <p className="mt-2 font-semibold">{position.strategy.status ?? 'STOPPED'}</p>
                      </div>
                    </div>

                    <div className="mt-5">
                      <h5 className="text-sm font-semibold">Independent sub-positions</h5>
                      {position.subPositions.length === 0 ? (
                        <p className="mt-3 rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-500">
                          No independent levels have been opened.
                        </p>
                      ) : (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full min-w-[820px] text-left text-sm">
                            <thead className="text-xs uppercase tracking-wider text-slate-500">
                              <tr>
                                <th className="pb-3">Level</th>
                                <th className="pb-3">Status</th>
                                <th className="pb-3">Quantity</th>
                                <th className="pb-3">Cost</th>
                                <th className="pb-3">Entry</th>
                                <th className="pb-3">Take profit</th>
                                <th className="pb-3">Realized P&amp;L</th>
                              </tr>
                            </thead>
                            <tbody>
                              {position.subPositions.map((subPosition) => (
                                <tr key={subPosition.id} className="border-t border-white/10">
                                  <td className="py-3 font-medium">#{subPosition.level}</td>
                                  <td className="py-3">
                                    <span className={`rounded-full px-2.5 py-1 text-xs ${subPosition.status === 'OPEN' ? 'bg-violet-400/10 text-violet-300' : 'bg-emerald-400/10 text-emerald-300'}`}>
                                      {subPosition.status}
                                    </span>
                                  </td>
                                  <td className="py-3">{formatNumber(subPosition.quantity)}</td>
                                  <td className="py-3">{formatMoney(subPosition.costQuote)}</td>
                                  <td className="py-3">{formatNumber(subPosition.entryPrice)}</td>
                                  <td className="py-3">{formatNumber(subPosition.takeProfitPrice)}</td>
                                  <td className={`py-3 font-medium ${Number(subPosition.realizedPnlQuote) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                                    {formatMoney(subPosition.realizedPnlQuote)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
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
