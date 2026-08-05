import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  api,
  type BinanceTestnetBalancesResponse,
  type BinanceTestnetConnectionResponse,
  type ExchangeCredentialSummary,
} from '../lib/api';

const emptyConnection: BinanceTestnetConnectionResponse = {
  connected: false,
  exchange: 'BINANCE',
  environment: 'TESTNET',
  canTrade: false,
  accountType: null,
};

export function ExchangeAccountsPage() {
  const { token, user, logout } = useAuth();
  const [credentials, setCredentials] = useState<ExchangeCredentialSummary[]>([]);
  const [balances, setBalances] = useState<BinanceTestnetBalancesResponse | null>(null);
  const [connection, setConnection] = useState<BinanceTestnetConnectionResponse>(emptyConnection);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const testnetCredential = useMemo(
    () => credentials.find((item) => item.exchange === 'BINANCE' && item.environment === 'TESTNET') ?? null,
    [credentials],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.listExchangeCredentials(token);
      setCredentials(result);
      if (result.some((item) => item.exchange === 'BINANCE' && item.environment === 'TESTNET')) {
        const balanceResult = await api.getBinanceTestnetBalances(token).catch(() => null);
        if (balanceResult) setBalances(balanceResult);
      } else {
        setBalances(null);
        setConnection(emptyConnection);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load exchange accounts');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveCredentials(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setBusy('save');
    setMessage(null);
    setError(null);
    try {
      await api.saveBinanceTestnetCredentials(token, { apiKey, apiSecret });
      setApiKey('');
      setApiSecret('');
      setMessage(testnetCredential ? 'Binance Testnet credentials replaced.' : 'Binance Testnet credentials saved.');
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save credentials');
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    if (!token) return;
    setBusy('test');
    setMessage(null);
    setError(null);
    try {
      const result = await api.testBinanceTestnetConnection(token);
      setConnection(result);
      setMessage('Binance Testnet connection succeeded.');
    } catch (requestError) {
      setConnection(emptyConnection);
      setError(requestError instanceof Error ? requestError.message : 'Connection test failed');
    } finally {
      setBusy(null);
    }
  }

  async function loadBalances() {
    if (!token) return;
    setBusy('balances');
    setMessage(null);
    setError(null);
    try {
      const result = await api.getBinanceTestnetBalances(token);
      setBalances(result);
      setMessage('Testnet balances refreshed.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load balances');
    } finally {
      setBusy(null);
    }
  }

  async function removeCredentials() {
    if (!token || !window.confirm('Remove the saved Binance Testnet credentials?')) return;
    setBusy('delete');
    setMessage(null);
    setError(null);
    try {
      await api.deleteBinanceCredentials(token, 'TESTNET');
      setCredentials([]);
      setBalances(null);
      setConnection(emptyConnection);
      setMessage('Binance Testnet credentials removed.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to remove credentials');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">HBS Trading</p>
            <h1 className="text-xl font-semibold">Exchange Accounts</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link className="rounded-lg border border-slate-700 px-3 py-2 hover:border-cyan-500" to="/">Dashboard</Link>
            <span className="hidden text-slate-400 sm:inline">{user?.email}</span>
            <button className="rounded-lg border border-slate-700 px-3 py-2 hover:border-rose-500" onClick={logout}>Log out</button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:px-8">
        <div className="space-y-6">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
            <h2 className="font-semibold text-amber-200">Binance Spot Testnet only</h2>
            <p className="mt-2 text-sm text-amber-100/80">
              This screen never enables Binance Live trading. Use a dedicated Binance Spot Testnet API key and secret.
            </p>
          </div>

          <form className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl" onSubmit={saveCredentials}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">API credentials</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Secrets are encrypted by the backend and are never returned to the browser.
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${testnetCredential ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                {testnetCredential ? 'Saved' : 'Not configured'}
              </span>
            </div>

            <label className="mt-6 block text-sm font-medium text-slate-300">
              API key
              <input
                autoComplete="off"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Paste Binance Testnet API key"
                required
                type="text"
                value={apiKey}
              />
            </label>
            <label className="mt-4 block text-sm font-medium text-slate-300">
              API secret
              <input
                autoComplete="new-password"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
                onChange={(event) => setApiSecret(event.target.value)}
                placeholder="Paste Binance Testnet API secret"
                required
                type="password"
                value={apiSecret}
              />
            </label>

            <div className="mt-6 flex flex-wrap gap-3">
              <button className="rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50" disabled={busy !== null} type="submit">
                {busy === 'save' ? 'Saving…' : testnetCredential ? 'Replace credentials' : 'Save credentials'}
              </button>
              <button className="rounded-xl border border-slate-700 px-4 py-3 font-semibold disabled:opacity-50" disabled={!testnetCredential || busy !== null} onClick={testConnection} type="button">
                {busy === 'test' ? 'Testing…' : 'Test connection'}
              </button>
              <button className="rounded-xl border border-slate-700 px-4 py-3 font-semibold disabled:opacity-50" disabled={!testnetCredential || busy !== null} onClick={loadBalances} type="button">
                {busy === 'balances' ? 'Refreshing…' : 'Refresh balances'}
              </button>
              <button className="rounded-xl border border-rose-500/60 px-4 py-3 font-semibold text-rose-300 disabled:opacity-50" disabled={!testnetCredential || busy !== null} onClick={removeCredentials} type="button">
                {busy === 'delete' ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </form>

          {(message || error) && (
            <div className={`rounded-xl border p-4 text-sm ${error ? 'border-rose-500/40 bg-rose-500/10 text-rose-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}>
              {error ?? message}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold">Connection status</h2>
            <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <Status label="Environment" value="TESTNET" />
              <Status label="Credential" value={testnetCredential ? 'Configured' : 'Missing'} />
              <Status label="Connection" value={connection.connected ? 'Connected' : 'Not tested'} />
              <Status label="Trading permission" value={connection.connected ? (connection.canTrade ? 'Enabled' : 'Disabled') : 'Unknown'} />
              <Status label="Account type" value={connection.accountType ?? 'Unknown'} />
              <Status label="Last credential update" value={testnetCredential ? new Date(testnetCredential.updatedAt).toLocaleString() : '—'} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Non-zero balances</h2>
                <p className="mt-1 text-sm text-slate-400">Free and locked Binance Testnet assets.</p>
              </div>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">{balances?.balances.length ?? 0} assets</span>
            </div>

            {loading ? (
              <p className="mt-6 text-sm text-slate-400">Loading exchange account…</p>
            ) : !testnetCredential ? (
              <p className="mt-6 rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">Save Testnet credentials to view balances.</p>
            ) : !balances?.balances.length ? (
              <p className="mt-6 rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">No non-zero Testnet balances were returned.</p>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="pb-3">Asset</th><th className="pb-3 text-right">Free</th><th className="pb-3 text-right">Locked</th><th className="pb-3 text-right">Total</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {balances.balances.map((balance) => (
                      <tr key={balance.asset}>
                        <td className="py-4 font-semibold">{balance.asset}</td>
                        <td className="py-4 text-right tabular-nums text-slate-300">{formatNumber(balance.free)}</td>
                        <td className="py-4 text-right tabular-nums text-slate-300">{formatNumber(balance.locked)}</td>
                        <td className="py-4 text-right tabular-nums font-semibold">{formatNumber(balance.free + balance.locked)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-950 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 font-medium text-slate-200">{value}</p>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(value);
}
