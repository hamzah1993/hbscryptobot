import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ExchangeAccountsPanel } from '../components/ExchangeAccountsPanel';

/** API Binding: connect Binance (LIVE or Testnet) and the demo exchanges. Used by the mobile "Mine" menu. */
export function ExchangeAccountsPage() {
  const { token, user, logout } = useAuth();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">HBS Trading</p>
            <h1 className="text-xl font-semibold">API Binding</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link className="rounded-lg border border-slate-700 px-3 py-2 hover:border-cyan-500" to="/mine">Back</Link>
            <span className="hidden text-slate-400 sm:inline">{user?.email}</span>
            <button className="rounded-lg border border-slate-700 px-3 py-2 hover:border-rose-500" onClick={logout}>Log out</button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        {token && <ExchangeAccountsPanel token={token} />}
      </div>
    </main>
  );
}
