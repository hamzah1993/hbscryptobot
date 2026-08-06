import { useEffect, useMemo, useState } from 'react';
import {
  api,
  type BinanceAccountTestResponse,
  type BinanceTestnetBalancesResponse,
  type ExchangeCredentialSummary,
} from '../lib/api';

type Props = {
  token: string;
};

function formatDate(value?: string) {
  if (!value) return 'Not connected';
  return new Date(value).toLocaleString();
}

export function ExchangeAccountsPanel({ token }: Props) {
  const [credentials, setCredentials] = useState<ExchangeCredentialSummary[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [account, setAccount] = useState<BinanceAccountTestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const selectedCredential = useMemo(
    () => credentials.find((credential) => credential.environment === 'TESTNET'),
    [credentials],
  );

  function applyBalances(result: BinanceTestnetBalancesResponse) {
    setAccount((current) => ({
      ...(current ?? {}),
      canTrade: result.canTrade,
      canWithdraw: false,
      accountType: current?.accountType ?? 'SPOT',
      balances: result.balances.map((balance) => ({
        asset: balance.asset,
        free: String(balance.free),
        locked: String(balance.locked),
      })),
    }));
    setLastUpdatedAt(new Date());
  }

  async function refreshAccount(options: { announce?: boolean; clearOnFailure?: boolean } = {}) {
    setTesting(true);
    if (options.announce) setMessage(null);
    setError(null);
    try {
      const [connection, balances] = await Promise.all([
        api.testBinanceTestnetConnection(token),
        api.getBinanceTestnetBalances(token),
      ]);
      setAccount({
        canTrade: connection.canTrade,
        canWithdraw: false,
        accountType: connection.accountType ?? 'SPOT',
        balances: balances.balances.map((balance) => ({
          asset: balance.asset,
          free: String(balance.free),
          locked: String(balance.locked),
        })),
      });
      setLastUpdatedAt(new Date());
      if (options.announce) setMessage('Binance Testnet connection and balances refreshed');
    } catch (reason: unknown) {
      if (options.clearOnFailure) setAccount(null);
      setError(reason instanceof Error ? reason.message : 'Unable to refresh Binance Testnet account');
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.listExchangeCredentials(token)
      .then(async (items) => {
        if (cancelled) return;
        setCredentials(items);
        if (items.some((item) => item.environment === 'TESTNET')) {
          try {
            const [connection, balances] = await Promise.all([
              api.testBinanceTestnetConnection(token),
              api.getBinanceTestnetBalances(token),
            ]);
            if (cancelled) return;
            setAccount({
              canTrade: connection.canTrade,
              canWithdraw: false,
              accountType: connection.accountType ?? 'SPOT',
              balances: balances.balances.map((balance) => ({ asset: balance.asset, free: String(balance.free), locked: String(balance.locked) })),
            });
            setLastUpdatedAt(new Date());
          } catch (reason: unknown) {
            if (!cancelled) setError(reason instanceof Error ? reason.message : 'Saved credentials could not be verified');
          }
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load exchange accounts');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!selectedCredential) return;
    const timer = window.setInterval(() => {
      api.getBinanceTestnetBalances(token)
        .then(applyBalances)
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Automatic balance refresh failed'));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [token, selectedCredential?.id]);

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
      const saved = await api.saveBinanceTestnetCredentials(token, {
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
      });
      setCredentials((current) => [saved, ...current.filter((item) => item.environment !== 'TESTNET')]);
      setApiKey('');
      setApiSecret('');
      setMessage('Binance Testnet credentials saved securely');
      await refreshAccount({ clearOnFailure: true });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to save Binance credentials');
    } finally {
      setSaving(false);
    }
  }

  async function deleteCredentials() {
    if (!selectedCredential) return;
    if (!window.confirm('Delete the saved Binance Testnet credentials?')) return;

    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      await api.deleteBinanceCredentials(token, 'TESTNET');
      setCredentials((current) => current.filter((item) => item.environment !== 'TESTNET'));
      setAccount(null);
      setLastUpdatedAt(null);
      setMessage('Saved Testnet credentials deleted');
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

  return (
    <section className="mt-6 space-y-6">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/[0.08] via-white/[0.03] to-violet-400/[0.06] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Exchange security</p>
            <h3 className="mt-2 text-2xl font-semibold">Binance Testnet account</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Balances restore automatically whenever this page opens and refresh every 30 seconds. Live account management remains disabled.</p>
          </div>
          <span className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200">Testnet only</span>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Connection</p><p className={`mt-2 text-lg font-semibold ${account ? 'text-emerald-300' : selectedCredential ? 'text-cyan-300' : 'text-slate-300'}`}>{loading ? 'Loading…' : connectionStatus}</p><p className="mt-2 text-xs text-slate-500">{formatDate(selectedCredential?.updatedAt)}</p></article>
          <article className="rounded-2xl border border-white/10 bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Trading permission</p><p className={`mt-2 text-lg font-semibold ${account?.canTrade ? 'text-emerald-300' : 'text-slate-300'}`}>{tradingStatus}</p><p className="mt-2 text-xs text-slate-500">Account type: {account?.accountType ?? 'Unknown'}</p></article>
          <article className="rounded-2xl border border-white/10 bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Withdrawals</p><p className="mt-2 text-lg font-semibold text-emerald-300">Disabled</p><p className="mt-2 text-xs text-slate-500">Testnet credentials cannot move real funds.</p></article>
          <article className="rounded-2xl border border-white/10 bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Non-zero assets</p><p className="mt-2 text-lg font-semibold text-cyan-300">{account ? nonZeroBalances.length : '—'}</p><p className="mt-2 text-xs text-slate-500">{availableAssets} available · {lockedAssets} locked</p></article>
        </div>
      </div>

      {message && <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">{error}{account && <span className="ml-2 text-slate-300">Last successful balances remain visible.</span>}</div>}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={saveCredentials} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <h4 className="text-lg font-semibold">{selectedCredential ? 'Replace credentials' : 'Connect Binance Testnet'}</h4>
          <p className="mt-1 text-sm text-slate-400">Enter a dedicated Binance Spot Testnet API key. Saving replaces the existing Testnet key.</p>
          <label className="mt-5 block text-sm text-slate-300">API key<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" spellCheck={false} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 outline-none ring-cyan-400/40 placeholder:text-slate-600 focus:ring" placeholder="Paste Binance Testnet API key" /></label>
          <label className="mt-4 block text-sm text-slate-300">API secret<input value={apiSecret} onChange={(event) => setApiSecret(event.target.value)} type="password" autoComplete="new-password" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 outline-none ring-cyan-400/40 placeholder:text-slate-600 focus:ring" placeholder="Paste Binance Testnet API secret" /></label>
          <div className="mt-5 flex flex-wrap gap-3">
            <button disabled={saving} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{saving ? 'Saving…' : selectedCredential ? 'Replace credentials' : 'Save credentials'}</button>
            <button type="button" disabled={!selectedCredential || testing} onClick={() => void refreshAccount({ announce: true })} className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-semibold text-emerald-200 disabled:opacity-40">{testing ? 'Refreshing…' : 'Refresh connection & balances'}</button>
            <button type="button" disabled={!selectedCredential || deleting} onClick={() => void deleteCredentials()} className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm font-semibold text-rose-200 disabled:opacity-40">{deleting ? 'Deleting…' : 'Delete'}</button>
          </div>
        </form>

        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-lg font-semibold">Balance details</h4><p className="mt-1 text-sm text-slate-400">Restored automatically from the saved Testnet account.</p></div><span className={`rounded-full px-3 py-1 text-xs font-medium ${account?.canTrade ? 'bg-emerald-400/15 text-emerald-300' : 'bg-slate-400/10 text-slate-400'}`}>{account ? account.canTrade ? 'Trading enabled' : 'Trading unavailable' : 'Not connected'}</span></div>
          <p className="mt-3 text-xs text-slate-500">Last refreshed: {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : '—'}</p>
          {account ? <div className="mt-5">{nonZeroBalances.length ? <div className="max-h-80 overflow-auto rounded-xl border border-white/10"><table className="w-full min-w-[520px] text-left text-sm"><thead className="sticky top-0 bg-[#0b1728] text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Asset</th><th className="px-4 py-3 text-right">Available</th><th className="px-4 py-3 text-right">Locked</th><th className="px-4 py-3 text-right">Total</th></tr></thead><tbody>{nonZeroBalances.map((balance) => { const available = Number(balance.free); const locked = Number(balance.locked); return <tr key={balance.asset} className="border-t border-white/10"><td className="px-4 py-3 font-semibold">{balance.asset}</td><td className="px-4 py-3 text-right text-emerald-300">{balance.free}</td><td className="px-4 py-3 text-right text-amber-300">{balance.locked}</td><td className="px-4 py-3 text-right">{(available + locked).toFixed(8).replace(/\.?0+$/, '')}</td></tr>; })}</tbody></table></div> : <p className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">No non-zero balances returned.</p>}</div> : <div className="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">Save Testnet credentials. Balances will load automatically afterward.</div>}
        </section>
      </div>
    </section>
  );
}
