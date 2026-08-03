import { useAuth } from '../auth/AuthContext';

const stats = [
  ['Portfolio value', '$0.00'],
  ['Today’s P&L', '$0.00'],
  ['Running bots', '0'],
  ['Open positions', '0'],
];

export function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-10 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">HBS Trading</p>
            <h1 className="mt-2 text-3xl font-semibold">Crypto Bot Dashboard</h1>
            <p className="mt-2 text-sm text-slate-400">Signed in as {user?.fullName} ({user?.email})</p>
          </div>
          <div className="flex gap-3">
            <button className="rounded-xl bg-emerald-500 px-4 py-2 font-medium text-slate-950">Create bot</button>
            <button onClick={logout} className="rounded-xl border border-slate-700 px-4 py-2 font-medium">Sign out</button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {stats.map(([label, value]) => (
            <article key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Platform status</h2>
            <div className="mt-5 rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
              Authentication is active. Exchange, bot, and strategy modules are next.
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Quick actions</h2>
            <div className="mt-4 space-y-3">
              <button className="w-full rounded-xl border border-slate-700 px-4 py-3 text-left">Connect exchange</button>
              <button className="w-full rounded-xl border border-slate-700 px-4 py-3 text-left">Configure strategy</button>
              <button className="w-full rounded-xl border border-slate-700 px-4 py-3 text-left">Open trade history</button>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
