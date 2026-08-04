import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

const navigation = ['Overview', 'Bots', 'Positions', 'Strategies', 'Exchange accounts', 'Trade history'];

const stats = [
  { label: 'Portfolio value', value: '$24,860.40', change: '+3.8% this month' },
  { label: 'Today’s P&L', value: '+$186.72', change: '+0.76%' },
  { label: 'Running bots', value: '3', change: '2 paper · 1 live' },
  { label: 'Open positions', value: '7', change: '4 profitable' },
];

const positions = [
  { pair: 'BTC/USDT', mode: 'Paper', invested: '$3,200', pnl: '+$142.28', progress: 72 },
  { pair: 'ETH/USDT', mode: 'Live', invested: '$1,850', pnl: '+$48.61', progress: 54 },
  { pair: 'SOL/USDT', mode: 'Paper', invested: '$920', pnl: '-$13.42', progress: 31 },
];

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [activeNav, setActiveNav] = useState('Overview');
  const [mode, setMode] = useState<'paper' | 'live'>('paper');

  const initials = useMemo(
    () => user?.fullName?.split(' ').map((name) => name[0]).join('').slice(0, 2).toUpperCase() || 'HB',
    [user?.fullName],
  );

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
              <button
                key={item}
                onClick={() => setActiveNav(item)}
                className={`rounded-xl px-4 py-3 text-left text-sm transition ${activeNav === item ? 'bg-cyan-400 text-slate-950' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
              >
                {item}
              </button>
            ))}
          </nav>

          <div className="mt-7 hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 lg:block">
            <p className="text-sm font-medium">Risk protection active</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">Daily loss guard, allocated capital limits, and encrypted credentials are enabled.</p>
          </div>
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
              <button className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20">Create bot</button>
              <button onClick={logout} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm font-semibold">{initials}</button>
            </div>
          </header>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <article key={stat.label} className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 shadow-xl shadow-black/10">
                <p className="text-sm text-slate-400">{stat.label}</p>
                <p className="mt-3 text-2xl font-semibold">{stat.value}</p>
                <p className="mt-2 text-xs text-emerald-300">{stat.change}</p>
              </article>
            ))}
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">Portfolio performance</h3>
                  <p className="mt-1 text-sm text-slate-400">Last 30 days across all active strategies</p>
                </div>
                <button className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">30 days</button>
              </div>

              <div className="mt-8 h-64 rounded-2xl border border-dashed border-cyan-300/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_45%)] p-5">
                <div className="flex h-full items-end gap-2">
                  {[38, 52, 45, 66, 58, 74, 62, 81, 77, 88, 82, 94].map((height, index) => (
                    <div key={index} className="flex-1 rounded-t-lg bg-gradient-to-t from-cyan-500/25 to-cyan-300" style={{ height: `${height}%` }} />
                  ))}
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Quick setup</h3>
                  <p className="mt-1 text-sm text-slate-400">Launch safely in four steps</p>
                </div>
                <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">{mode === 'paper' ? 'Paper mode' : 'Live mode'}</span>
              </div>
              <div className="mt-6 space-y-3">
                {['Connect Binance account', 'Choose trading pair', 'Configure DCA & risk', 'Review and start bot'].map((item, index) => (
                  <button key={item} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-left hover:border-cyan-300/30 hover:bg-white/[0.05]">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-cyan-400/10 text-sm font-semibold text-cyan-300">{index + 1}</span>
                    <span className="text-sm">{item}</span>
                  </button>
                ))}
              </div>
            </article>
          </section>

          <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Active positions</h3>
                <p className="mt-1 text-sm text-slate-400">Monitor allocation, DCA progress, and unrealized P&L</p>
              </div>
              <button className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300">View all positions</button>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="pb-3 font-medium">Pair</th>
                    <th className="pb-3 font-medium">Mode</th>
                    <th className="pb-3 font-medium">Invested</th>
                    <th className="pb-3 font-medium">DCA progress</th>
                    <th className="pb-3 font-medium">Unrealized P&L</th>
                    <th className="pb-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => (
                    <tr key={position.pair} className="border-t border-white/10">
                      <td className="py-4 font-medium">{position.pair}</td>
                      <td className="py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${position.mode === 'Live' ? 'bg-rose-400/10 text-rose-300' : 'bg-cyan-400/10 text-cyan-300'}`}>{position.mode}</span></td>
                      <td className="py-4 text-slate-300">{position.invested}</td>
                      <td className="py-4">
                        <div className="h-2 w-32 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-cyan-300" style={{ width: `${position.progress}%` }} />
                        </div>
                      </td>
                      <td className={`py-4 font-medium ${position.pnl.startsWith('+') ? 'text-emerald-300' : 'text-rose-300'}`}>{position.pnl}</td>
                      <td className="py-4"><button className="rounded-lg border border-white/10 px-3 py-2 text-xs">Manage</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
