import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, type TradingPosition } from '../lib/api';

const navigation = ['Overview', 'Bots', 'Positions', 'Strategies', 'Exchange accounts', 'Trade history'];

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function DashboardPage() {
  const { user, token, logout } = useAuth();
  const [activeNav, setActiveNav] = useState('Overview');
  const [mode, setMode] = useState<'paper' | 'live'>('paper');
  const [positions, setPositions] = useState<TradingPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    api.listPaperPositions(token)
      .then(setPositions)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load positions'))
      .finally(() => setLoading(false));
  }, [token]);

  const openPositions = positions.filter((position) => position.status === 'OPEN');
  const invested = openPositions.reduce((sum, position) => sum + Number(position.totalCostQuote), 0);
  const realizedPnl = positions.reduce((sum, position) => sum + Number(position.realizedPnlQuote), 0);
  const runningBots = new Set(openPositions.map((position) => position.strategy.id)).size;

  const initials = useMemo(
    () => user?.fullName?.split(' ').map((name) => name[0]).join('').slice(0, 2).toUpperCase() || 'HB',
    [user?.fullName],
  );

  const stats = [
    { label: 'Allocated capital', value: money(invested), change: `${openPositions.length} open position${openPositions.length === 1 ? '' : 's'}` },
    { label: 'Realized P&L', value: money(realizedPnl), change: realizedPnl >= 0 ? 'Paper trading gains' : 'Paper trading loss' },
    { label: 'Running bots', value: String(runningBots), change: 'Paper strategies with open positions' },
    { label: 'Trade records', value: String(positions.length), change: 'Open and closed positions' },
  ];

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-white/10 bg-[#0a1728] px-5 py-5 lg:min-h-screen lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between lg:block">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-400">HBS Trading</p>
              <h1 className="mt-2 text-xl font-semibold">Control Center</h1>
            </div>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">Systems online</span>
          </div>

          <nav className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {navigation.map((item) => (
              <button key={item} onClick={() => setActiveNav(item)} className={`rounded-xl px-4 py-3 text-left text-sm transition ${activeNav === item ? 'bg-cyan-400 text-slate-950' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
                {item}
              </button>
            ))}
          </nav>
        </aside>

        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <header className="flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-slate-400">Welcome back, {user?.fullName}</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight">Trading dashboard</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
                <button onClick={() => setMode('paper')} className={`rounded-lg px-3 py-2 text-sm ${mode === 'paper' ? 'bg-cyan-400 text-slate-950' : 'text-slate-400'}`}>Paper</button>
                <button onClick={() => setMode('live')} className={`rounded-lg px-3 py-2 text-sm ${mode === 'live' ? 'bg-rose-400 text-slate-950' : 'text-slate-400'}`}>Live</button>
              </div>
              <button className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950">Create bot</button>
              <button onClick={logout} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm font-semibold">{initials}</button>
            </div>
          </header>

          {error && <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <article key={stat.label} className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5">
                <p className="text-sm text-slate-400">{stat.label}</p>
                <p className="mt-3 text-2xl font-semibold">{loading ? '—' : stat.value}</p>
                <p className="mt-2 text-xs text-cyan-300">{stat.change}</p>
              </article>
            ))}
          </section>

          <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
            <div>
              <h3 className="text-lg font-semibold">Paper trading positions</h3>
              <p className="mt-1 text-sm text-slate-400">Live data from the trading database</p>
            </div>

            {loading ? (
              <div className="mt-6 rounded-xl border border-dashed border-white/10 p-10 text-center text-slate-400">Loading positions…</div>
            ) : positions.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-white/10 p-10 text-center text-slate-400">No paper positions yet. Create a strategy and open a simulated trade.</div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[840px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-slate-500">
                    <tr><th className="pb-3">Pair</th><th className="pb-3">Status</th><th className="pb-3">Invested</th><th className="pb-3">Average entry</th><th className="pb-3">DCA</th><th className="pb-3">Take profit</th><th className="pb-3">Realized P&L</th></tr>
                  </thead>
                  <tbody>
                    {positions.map((position) => (
                      <tr key={position.id} className="border-t border-white/10">
                        <td className="py-4 font-medium">{position.symbol}</td>
                        <td className="py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${position.status === 'OPEN' ? 'bg-cyan-400/10 text-cyan-300' : 'bg-slate-400/10 text-slate-300'}`}>{position.status}</span></td>
                        <td className="py-4">{money(Number(position.totalCostQuote))}</td>
                        <td className="py-4">{money(Number(position.averageEntryPrice))}</td>
                        <td className="py-4">{position.dcaCount}/{position.strategy.maxDcaOrders}</td>
                        <td className="py-4">{position.takeProfitPrice ? money(Number(position.takeProfitPrice)) : '—'}</td>
                        <td className={`py-4 font-medium ${Number(position.realizedPnlQuote) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{money(Number(position.realizedPnlQuote))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
