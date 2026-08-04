import { useEffect, useMemo, useState } from 'react';
import {
  api,
  type BinanceAccountTestResponse,
  type ExchangeCredentialSummary,
  type ExchangeEnvironment,
} from '../lib/api';

type Props = {
  token: string;
};

const environments: ExchangeEnvironment[] = ['TESTNET', 'LIVE'];

function formatDate(value?: string) {
  if (!value) return 'Not connected';
  return new Date(value).toLocaleString();
}

export function ExchangeAccountsPanel({ token }: Props) {
  const [credentials, setCredentials] = useState<ExchangeCredentialSummary[]>([]);
  const [environment, setEnvironment] = useState<ExchangeEnvironment>('TESTNET');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [account, setAccount] = useState<BinanceAccountTestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedCredential = useMemo(
    () => credentials.find((credential) => credential.environment === environment),
    [credentials, environment],
  );

  async function loadCredentials() {
    setLoading(true);
    setError(null);
    try {
      setCredentials(await api.listExchangeCredentials(token));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to load exchange accounts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCredentials();
  }, [token]);

  useEffect(() => {
    setAccount(null);
    setMessage(null);
    setError(null);
    setApiKey('');
    setApiSecret('');
  }, [environment]);

  async function saveCredentials(event: React.FormEvent) {
    event.preventDefault();
    if (!apiKey.trim() || !apiSecret.trim()) {
      setError('Both API key and API secret are required');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await api.saveBinanceCredentials(token, {
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        environment,
      });
      setCredentials((current) => [saved, ...current.filter((item) => item.environment !== environment)]);
      setApiKey('');
      setApiSecret('');
      setMessage(`${environment === 'TESTNET' ? 'Testnet' : 'Live'} credentials saved securely`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to save Binance credentials');
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await api.testBinanceConnection(token, environment);
      setAccount(response);
      setMessage(`Binance ${environment === 'TESTNET' ? 'Testnet' : 'Live'} connection succeeded`);
    } catch (reason: unknown) {
      setAccount(null);
      setError(reason instanceof Error ? reason.message : 'Binance connection test failed');
    } finally {
      setTesting(false);
    }
  }

  async function deleteCredentials() {
    if (!selectedCredential) return;
    const confirmed = window.confirm(`Delete the saved Binance ${environment.toLowerCase()} credentials?`);
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      await api.deleteBinanceCredentials(token, environment);
      setCredentials((current) => current.filter((item) => item.environment !== environment));
      setAccount(null);
      setMessage('Saved credentials deleted');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete Binance credentials');
    } finally {
      setDeleting(false);
    }
  }

  const nonZeroBalances = account?.balances?.filter((balance) => Number(balance.free) > 0 || Number(balance.locked) > 0) ?? [];
  const availableAssets = nonZeroBalances.filter((balance) => Number(balance.free) > 0).length;
  const lockedAssets = nonZeroBalances.filter((balance) => Number(balance.locked) > 0).length;
  const connectionStatus = account ? 'Connected' : selectedCredential ? 'Credentials saved' : 'Not connected';
  const tradingStatus = account ? (account.canTrade ? 'Enabled' : 'Unavailable') : 'Not tested';
  const withdrawalStatus = account ? (account.canWithdraw ? 'Enabled' : 'Disabled') : 'Not tested';

  return (
    <section className="mt-6 space-y-6">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/[0.08] via-white/[0.03] to-violet-400/[0.06] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Exchange security</p>
            <h3 className="mt-2 text-2xl font-semibold">Binance accounts</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Credentials are encrypted on the backend and are never returned to the browser. Use Binance keys without withdrawal permission.
            </p>
          </div>
          <div className="flex rounded-xl border border-white/10 bg-slate-950/30 p-1">
            {environments.map((item) => (
              <button
                key={item}
                onClick={() => setEnvironment(item)}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${environment === item ? item === 'LIVE' ? 'bg-rose-400 text-slate-950' : 'bg-cyan-400 text-slate-950' : 'text-slate-400'}`}
              >
                {item === 'TESTNET' ? 'Testnet' : 'Live'}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Connection</p>
            <p className={`mt-2 text-lg font-semibold ${account ? 'text-emerald-300' : selectedCredential ? 'text-cyan-300' : 'text-slate-300'}`}>
              {loading ? 'Loading…' : connectionStatus}
            </p>
            <p className="mt-2 text-xs text-slate-500">{formatDate(selectedCredential?.updatedAt)}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Trading permission</p>
            <p className={`mt-2 text-lg font-semibold ${account?.canTrade ? 'text-emerald-300' : 'text-slate-300'}`}>{tradingStatus}</p>
            <p className="mt-2 text-xs text-slate-500">Account type: {account?.accountType ?? 'Unknown'}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Withdrawals</p>
            <p className={`mt-2 text-lg font-semibold ${account?.canWithdraw ? 'text-rose-300' : account ? 'text-emerald-300' : 'text-slate-300'}`}>{withdrawalStatus}</p>
            <p className="mt-2 text-xs text-slate-500">Withdrawal access should remain disabled.</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Non-zero assets</p>
            <p className="mt-2 text-lg font-semibold text-cyan-300">{account ? nonZeroBalances.length : '—'}</p>
            <p className="mt-2 text-xs text-slate-500">{availableAssets} available · {lockedAssets} locked</p>
          </article>
        </div>
      </div>

      {message && <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={saveCredentials} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <h4 className="text-lg font-semibold">{selectedCredential ? 'Replace credentials' : 'Connect Binance'}</h4>
          <p className="mt-1 text-sm text-slate-400">
            Enter a dedicated {environment === 'TESTNET' ? 'Spot Testnet' : 'live Spot'} API key. Saving replaces the existing key for this environment.
          </p>

          {environment === 'LIVE' && (
            <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100">
              Live order execution remains disabled. Do not grant withdrawal permission, and use IP restrictions whenever possible.
            </div>
          )}

          <label className="mt-5 block text-sm text-slate-300">
            API key
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 outline-none ring-cyan-400/40 placeholder:text-slate-600 focus:ring"
              placeholder="Paste Binance API key"
            />
          </label>

          <label className="mt-4 block text-sm text-slate-300">
            API secret
            <input
              value={apiSecret}
              onChange={(event) => setApiSecret(event.target.value)}
              type="password"
              autoComplete="new-password"
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 outline-none ring-cyan-400/40 placeholder:text-slate-600 focus:ring"
              placeholder="Paste Binance API secret"
            />
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <button disabled={saving} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">
              {saving ? 'Saving…' : selectedCredential ? 'Replace credentials' : 'Save credentials'}
            </button>
            <button
              type="button"
              disabled={!selectedCredential || testing}
              onClick={testConnection}
              className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-semibold text-emerald-200 disabled:opacity-40"
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            <button
              type="button"
              disabled={!selectedCredential || deleting}
              onClick={deleteCredentials}
              className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm font-semibold text-rose-200 disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </form>

        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-lg font-semibold">Balance details</h4>
              <p className="mt-1 text-sm text-slate-400">Available and locked balances returned by the Binance account test.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${account?.canTrade ? 'bg-emerald-400/15 text-emerald-300' : 'bg-slate-400/10 text-slate-400'}`}>
              {account ? account.canTrade ? 'Trading enabled' : 'Trading unavailable' : 'Not tested'}
            </span>
          </div>

          {account ? (
            <div className="mt-5">
              {nonZeroBalances.length ? (
                <div className="max-h-80 overflow-auto rounded-xl border border-white/10">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="sticky top-0 bg-[#0b1728] text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Asset</th>
                        <th className="px-4 py-3 text-right">Available</th>
                        <th className="px-4 py-3 text-right">Locked</th>
                        <th className="px-4 py-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nonZeroBalances.map((balance) => {
                        const available = Number(balance.free);
                        const locked = Number(balance.locked);
                        return (
                          <tr key={balance.asset} className="border-t border-white/10">
                            <td className="px-4 py-3 font-semibold">{balance.asset}</td>
                            <td className="px-4 py-3 text-right text-emerald-300">{balance.free}</td>
                            <td className="px-4 py-3 text-right text-amber-300">{balance.locked}</td>
                            <td className="px-4 py-3 text-right">{(available + locked).toFixed(8).replace(/\.?0+$/, '')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">No non-zero balances returned.</p>
              )}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
              Save credentials and run a connection test to load account status and balances.
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
