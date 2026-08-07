import { useEffect, useMemo, useState } from 'react';
import {
  api,
  type BinanceAccountTestResponse,
  type BinanceTestnetBalancesResponse,
  type DemoExchange,
  type ExchangeCredentialSummary,
  type ExchangeEnvironment,
} from '../lib/api';

type Props = { token: string };
type Exchange = 'BINANCE' | DemoExchange;

const exchanges: Array<{ value: Exchange; label: string; environment: string; description: string }> = [
  { value: 'BINANCE', label: 'Binance', environment: 'Testnet', description: 'Binance Spot Testnet' },
  { value: 'BYBIT', label: 'Bybit', environment: 'Testnet', description: 'Bybit V5 Testnet' },
  { value: 'OKX', label: 'OKX', environment: 'Demo', description: 'OKX V5 Demo Trading' },
];

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString() : 'Not connected';
}

function exchangeMeta(exchange: Exchange) {
  return exchanges.find((item) => item.value === exchange) ?? exchanges[0];
}

export function ExchangeAccountsPanel({ token }: Props) {
  const [credentials, setCredentials] = useState<ExchangeCredentialSummary[]>([]);
  const [selectedExchange, setSelectedExchange] = useState<Exchange>('BINANCE');
  const [selectedEnvironment, setSelectedEnvironment] = useState<ExchangeEnvironment>('TESTNET');
  const [formOpen, setFormOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [account, setAccount] = useState<BinanceAccountTestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [tested, setTested] = useState<Record<string, boolean | null>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const binanceCredential = useMemo(
    () => credentials.find((credential) => credential.exchange === 'BINANCE' && credential.environment === 'TESTNET'),
    [credentials],
  );
  const selectedCredential = credentials.find(
    (credential) => credential.exchange === selectedExchange && credential.environment === (selectedExchange === 'BINANCE' ? selectedEnvironment : 'TESTNET'),
  );

  const binanceLiveCredential = useMemo(
    () => credentials.find((credential) => credential.exchange === 'BINANCE' && credential.environment === 'LIVE'),
    [credentials],
  );

  function applyBalances(result: BinanceTestnetBalancesResponse) {
    setAccount((current) => ({
      ...(current ?? {}),
      canTrade: result.canTrade,
      canWithdraw: false,
      accountType: current?.accountType ?? 'SPOT',
      balances: result.balances.map((balance) => ({ asset: balance.asset, free: String(balance.free), locked: String(balance.locked) })),
    }));
    setLastUpdatedAt(new Date());
  }

  async function refreshCredentials() {
    const items = await api.listExchangeCredentials(token);
    setCredentials(items);
    return items;
  }

  async function testConnection(exchange: Exchange, announce = true, environment: ExchangeEnvironment = 'TESTNET') {
    const actualEnvironment = exchange === 'BINANCE' ? environment : 'TESTNET';
    const testKey = `${exchange}-${actualEnvironment}`;
    setBusy(`test-${testKey}`);
    setError(null);
    if (announce) setMessage(null);
    try {
      if (exchange === 'BINANCE') {
        if (actualEnvironment === 'LIVE') {
          const connection = await api.testBinanceLiveConnection(token);
          setTested((current) => ({ ...current, [testKey]: connection.connected && connection.canTrade && connection.spotEnabled && !connection.canWithdraw }));
        } else {
          const [connection, balances] = await Promise.all([
            api.testBinanceTestnetConnection(token),
            api.getBinanceTestnetBalances(token),
          ]);
          setAccount({
            canTrade: connection.canTrade,
            canWithdraw: false,
            accountType: connection.accountType ?? 'SPOT',
            balances: balances.balances.map((balance) => ({ asset: balance.asset, free: String(balance.free), locked: String(balance.locked) })),
          });
          setLastUpdatedAt(new Date());
          setTested((current) => ({ ...current, [testKey]: true }));
        }
      } else {
        const result = await api.testDemoExchangeConnection(token, exchange);
        setTested((current) => ({ ...current, [testKey]: result.connected }));
      }
      if (announce) setMessage(`${exchangeMeta(exchange).label} ${actualEnvironment === 'LIVE' ? 'LIVE' : exchangeMeta(exchange).environment} connected successfully.`);
    } catch (reason: unknown) {
      setTested((current) => ({ ...current, [testKey]: false }));
      if (exchange === 'BINANCE' && actualEnvironment === 'TESTNET') setAccount(null);
      setError(reason instanceof Error ? reason.message : `${exchangeMeta(exchange).label} connection failed`);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refreshCredentials()
      .then((items) => {
        if (cancelled) return;
        if (items.some((item) => item.exchange === 'BINANCE' && item.environment === 'TESTNET')) {
          void testConnection('BINANCE', false);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load exchange accounts');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!binanceCredential) return;
    const timer = window.setInterval(() => {
      api.getBinanceTestnetBalances(token)
        .then(applyBalances)
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Automatic Binance balance refresh failed'));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [token, binanceCredential?.id]);

  function openForm(exchange: Exchange = 'BINANCE', environment: ExchangeEnvironment = 'TESTNET') {
    setSelectedExchange(exchange);
    setSelectedEnvironment(exchange === 'BINANCE' ? environment : 'TESTNET');
    setApiKey('');
    setApiSecret('');
    setPassphrase('');
    setError(null);
    setMessage(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setApiKey('');
    setApiSecret('');
    setPassphrase('');
  }

  async function saveCredentials(event: React.FormEvent) {
    event.preventDefault();
    if (!apiKey.trim() || !apiSecret.trim() || (selectedExchange === 'OKX' && !passphrase.trim())) {
      setError(selectedExchange === 'OKX' ? 'API key, API secret, and passphrase are required' : 'API key and API secret are required');
      return;
    }
    setBusy('save');
    setError(null);
    setMessage(null);
    try {
      if (selectedExchange === 'BINANCE') {
        await api.saveBinanceCredentials(token, { apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), environment: selectedEnvironment });
      } else if (selectedExchange === 'BYBIT') {
        await api.saveBybitTestnetCredentials(token, { apiKey: apiKey.trim(), apiSecret: apiSecret.trim() });
      } else {
        await api.saveOkxDemoCredentials(token, { apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), passphrase: passphrase.trim() });
      }
      await refreshCredentials();
      setTested((current) => ({ ...current, [`${selectedExchange}-${selectedExchange === 'BINANCE' ? selectedEnvironment : 'TESTNET'}`]: null }));
      setMessage(`${exchangeMeta(selectedExchange).label} ${selectedExchange === 'BINANCE' && selectedEnvironment === 'LIVE' ? 'LIVE' : exchangeMeta(selectedExchange).environment} credentials saved securely.`);
      closeForm();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to save exchange credentials');
    } finally {
      setBusy(null);
    }
  }

  async function removeCredentials(exchange: Exchange) {
    const meta = exchangeMeta(exchange);
    if (!window.confirm(`Remove the saved ${meta.label} ${meta.environment} credentials?`)) return;
    setBusy(`delete-${exchange}`);
    setError(null);
    setMessage(null);
    try {
      if (exchange === 'BINANCE') await api.deleteBinanceCredentials(token, 'TESTNET');
      else await api.deleteDemoExchangeCredentials(token, exchange);
      await refreshCredentials();
      setTested((current) => ({ ...current, [exchange]: null }));
      if (exchange === 'BINANCE') { setAccount(null); setLastUpdatedAt(null); }
      setMessage(`${meta.label} ${meta.environment} account removed.`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : `Unable to remove ${meta.label} credentials`);
    } finally {
      setBusy(null);
    }
  }

  async function removeBinanceLiveCredentials() {
    if (!window.confirm('Remove the saved Binance LIVE credentials?')) return;
    setBusy('delete-BINANCE-LIVE');
    setError(null);
    try {
      await api.deleteBinanceCredentials(token, 'LIVE');
      await refreshCredentials();
      setTested((current) => ({ ...current, 'BINANCE-LIVE': null }));
      setMessage('Binance LIVE account removed.');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to remove Binance LIVE credentials');
    } finally {
      setBusy(null);
    }
  }

  const nonZeroBalances = account?.balances?.filter((balance) => Number(balance.free) > 0 || Number(balance.locked) > 0) ?? [];
  const meta = exchangeMeta(selectedExchange);

  return (
    <section className="mt-6 space-y-6">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/[0.08] via-white/[0.03] to-violet-400/[0.06] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Exchange Accounts</p>
            <h3 className="mt-2 text-2xl font-semibold">Connected exchanges</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Add Testnet or Demo API credentials here. The global Paper / Testnet / Live selector remains on the dashboard.</p>
          </div>
          <button type="button" onClick={() => openForm()} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950">+ Add Exchange Account</button>
        </div>
      </div>

      {message && <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">{error}</div>}

      {formOpen && (
        <form onSubmit={saveCredentials} className="rounded-2xl border border-cyan-400/25 bg-white/[0.04] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div><h4 className="text-xl font-semibold">{selectedCredential ? 'Replace API credentials' : 'Add Exchange Account'}</h4><p className="mt-1 text-sm text-slate-400">Choose the exchange and environment, then save the API credentials.</p></div>
            <button type="button" onClick={closeForm} className="text-sm font-semibold text-slate-400 hover:text-white">Close</button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-300">Exchange
              <select value={selectedExchange} onChange={(event) => setSelectedExchange(event.target.value as Exchange)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none ring-cyan-400/40 focus:ring">
                {exchanges.map((exchange) => <option key={exchange.value} value={exchange.value}>{exchange.label}</option>)}
              </select>
            </label>
            <label className="text-sm text-slate-300">Environment
              <select value={selectedExchange === 'BINANCE' ? selectedEnvironment : 'TESTNET'} onChange={(event) => setSelectedEnvironment(event.target.value as ExchangeEnvironment)} disabled={selectedExchange !== 'BINANCE'} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-slate-300 outline-none ring-cyan-400/40 focus:ring">
                <option value="TESTNET">{meta.environment}</option>
                {selectedExchange === 'BINANCE' && <option value="LIVE">Live</option>}
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-500">{selectedExchange === 'BINANCE' && selectedEnvironment === 'LIVE' ? 'Binance Spot LIVE. The API key must permit Spot trading and must NOT permit withdrawals. Saving credentials does not activate real-money execution.' : meta.description}</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-300">API key<input required value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" spellCheck={false} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 outline-none ring-cyan-400/40 focus:ring" /></label>
            <label className="text-sm text-slate-300">API secret<input required value={apiSecret} onChange={(event) => setApiSecret(event.target.value)} type="password" autoComplete="new-password" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 outline-none ring-cyan-400/40 focus:ring" /></label>
          </div>
          {selectedExchange === 'OKX' && <label className="mt-4 block text-sm text-slate-300">API passphrase<input required value={passphrase} onChange={(event) => setPassphrase(event.target.value)} type="password" autoComplete="new-password" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 outline-none ring-cyan-400/40 focus:ring" /></label>}
          <div className="mt-5 flex gap-3">
            <button disabled={busy !== null} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy === 'save' ? 'Saving…' : selectedCredential ? 'Replace API' : 'Save Account'}</button>
            <button type="button" onClick={closeForm} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {exchanges.map((exchange) => {
          const credential = credentials.find((item) => item.exchange === exchange.value && item.environment === 'TESTNET');
          const state = tested[`${exchange.value}-TESTNET`];
          const status = state === true ? 'Connected' : state === false ? 'Connection failed' : credential ? 'Saved' : 'Not configured';
          return (
            <article key={exchange.value} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <div className="flex items-start justify-between gap-3">
                <div><h4 className="text-lg font-semibold">{exchange.label}</h4><p className="mt-1 text-sm text-slate-400">{exchange.environment}</p></div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${state === true ? 'bg-emerald-400/15 text-emerald-300' : state === false ? 'bg-rose-400/15 text-rose-300' : credential ? 'bg-cyan-400/15 text-cyan-300' : 'bg-slate-400/10 text-slate-400'}`}>{status}</span>
              </div>
              <p className="mt-4 text-xs text-slate-500">{credential ? `Updated ${formatDate(credential.updatedAt)}` : exchange.description}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {credential ? <>
                  <button type="button" disabled={busy !== null} onClick={() => void testConnection(exchange.value)} className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-40">{busy === `test-${exchange.value}-TESTNET` ? 'Testing…' : 'Test Connection'}</button>
                  <button type="button" disabled={busy !== null} onClick={() => openForm(exchange.value)} className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-40">Replace API</button>
                  <button type="button" disabled={busy !== null} onClick={() => void removeCredentials(exchange.value)} className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-40">{busy === `delete-${exchange.value}` ? 'Removing…' : 'Remove'}</button>
                </> : <button type="button" onClick={() => openForm(exchange.value)} className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200">Connect</button>}
              </div>
            </article>
          );
        })}
      </div>

      <article className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.05] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Binance LIVE</p>
            <h4 className="mt-2 text-lg font-semibold">Real-money account credentials</h4>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Credential onboarding is available after the Binance Testnet W2W pass. Keys are validated against Binance LIVE before storage. Spot trading is required and withdrawal permission is rejected.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${tested['BINANCE-LIVE'] === true ? 'bg-emerald-400/15 text-emerald-300' : binanceLiveCredential ? 'bg-amber-300/15 text-amber-200' : 'bg-slate-400/10 text-slate-400'}`}>{tested['BINANCE-LIVE'] === true ? 'Verified' : binanceLiveCredential ? 'Saved' : 'Not configured'}</span>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {binanceLiveCredential ? <>
            <button type="button" disabled={busy !== null} onClick={() => void testConnection('BINANCE', true, 'LIVE')} className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-40">{busy === 'test-BINANCE-LIVE' ? 'Testing…' : 'Test Connection'}</button>
            <button type="button" disabled={busy !== null} onClick={() => openForm('BINANCE', 'LIVE')} className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-40">Replace API</button>
            <button type="button" disabled={busy !== null} onClick={() => void removeBinanceLiveCredentials()} className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-40">{busy === 'delete-BINANCE-LIVE' ? 'Removing…' : 'Remove'}</button>
          </> : <button type="button" onClick={() => openForm('BINANCE', 'LIVE')} className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-100">Add Binance LIVE API</button>}
        </div>
      </article>

      {binanceCredential && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h4 className="text-lg font-semibold">Binance Testnet balances</h4><p className="mt-1 text-sm text-slate-400">Balances refresh automatically every 30 seconds while this page is open.</p></div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${account?.canTrade ? 'bg-emerald-400/15 text-emerald-300' : 'bg-slate-400/10 text-slate-400'}`}>{account?.canTrade ? 'Trading enabled' : account ? 'Trading unavailable' : 'Not tested'}</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">Last refreshed: {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : '—'}</p>
          {loading ? <p className="mt-5 text-sm text-slate-400">Loading account…</p> : account && nonZeroBalances.length ? <div className="mt-5 max-h-80 overflow-auto rounded-xl border border-white/10"><table className="w-full min-w-[520px] text-left text-sm"><thead className="sticky top-0 bg-[#0b1728] text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Asset</th><th className="px-4 py-3 text-right">Available</th><th className="px-4 py-3 text-right">Locked</th><th className="px-4 py-3 text-right">Total</th></tr></thead><tbody>{nonZeroBalances.map((balance) => { const available = Number(balance.free); const locked = Number(balance.locked); return <tr key={balance.asset} className="border-t border-white/10"><td className="px-4 py-3 font-semibold">{balance.asset}</td><td className="px-4 py-3 text-right text-emerald-300">{balance.free}</td><td className="px-4 py-3 text-right text-amber-300">{balance.locked}</td><td className="px-4 py-3 text-right">{(available + locked).toFixed(8).replace(/\.?0+$/, '')}</td></tr>; })}</tbody></table></div> : <p className="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">{account ? 'No non-zero balances returned.' : 'Use Test Connection to load balances.'}</p>}
        </section>
      )}

      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-5 text-sm text-amber-100"><span className="font-semibold">LIVE execution remains locked.</span> Saving a Binance LIVE key does not place orders or activate bots. Capital ceiling, readiness checks, explicit acknowledgement, and the server-side execution gate must pass first.</div>
    </section>
  );
}
