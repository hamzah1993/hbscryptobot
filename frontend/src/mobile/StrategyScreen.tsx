import { ChevronRight, Play, Square } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api, type PackageBotStatus, type TradingPackage } from '../lib/api';
import { Card, ConfirmSheet, Empty, ErrorNote, PrimaryButton, SecondaryButton, money, signed, usePolling } from './ui';

const statusStyle: Record<PackageBotStatus, string> = {
  RUNNING: 'bg-emerald-50 text-emerald-700',
  PARTIAL: 'bg-amber-50 text-amber-700',
  STOPPED: 'bg-slate-100 text-slate-600',
};
const statusLabel: Record<PackageBotStatus, string> = { RUNNING: 'Running', PARTIAL: 'Partly running', STOPPED: 'Stopped' };

export function StrategyScreen() {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<TradingPackage | null>(null);
  const { data, refresh } = usePolling(async () => {
    const [packages, subscriptions, billing] = await Promise.all([api.listPackages(token!), api.listPackageSubscriptions(token!), api.getBilling(token!)]);
    return { packages, subscriptions, billing };
  }, 30_000);

  async function run(action: () => Promise<unknown>, fallback: string, done?: string) {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); if (done) setNotice(done); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : fallback); }
    finally { setBusy(false); }
  }

  const active = new Set(data?.subscriptions.filter((item) => item.status === 'ACTIVE').map((item) => item.packageId));
  const mine = data?.subscriptions.filter((item) => item.status === 'ACTIVE') ?? [];

  return <>
    <header className="sticky top-0 z-20 bg-[#f4f5f7]/95 px-4 py-4 text-center backdrop-blur"><h1 className="text-lg font-semibold">Strategy</h1></header>
    <main className="space-y-3 px-3">
      <ErrorNote message={error} />
      {notice && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
      {data && !data.billing.trading.allowed && <Link to="/assets" className="flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800"><span className="flex-1">{data.billing.trading.reason}</span><ChevronRight className="h-4 w-4" /></Link>}

      <h2 className="px-1 pt-1 text-sm font-semibold text-slate-500">My packages</h2>
      {mine.length === 0 && <Card><Empty>You have no active package yet. Pick one below.</Empty></Card>}
      {mine.map((item) => {
        const pnl = item.performance.realizedPnlQuote;
        return <Card key={item.id}>
          <div className="flex items-start justify-between">
            <div><p className="font-semibold">{item.package.name}</p><p className="text-xs text-slate-400">{money(item.amountQuote)} · since {new Date(item.startedAt).toLocaleDateString()}</p></div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle[item.botStatus]}`}>{statusLabel[item.botStatus]}</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div><p className="text-xs text-slate-400">Realized P&amp;L</p><p className={`mt-1 font-semibold ${pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{signed(pnl)}</p></div>
            <div><p className="text-xs text-slate-400">Return</p><p className={`mt-1 font-semibold ${pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{signed(item.performance.realizedReturnPercent)}%</p></div>
            <div><p className="text-xs text-slate-400">In trade</p><p className="mt-1 font-semibold">{item.performance.openPositionCostQuote.toFixed(2)}</p></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {item.botStatus !== 'RUNNING'
              ? <PrimaryButton disabled={busy} onClick={() => void run(() => api.setPackageBotStatus(token!, item.id, 'start'), 'Unable to start the package')} className="flex items-center justify-center gap-1.5"><Play className="h-4 w-4" />Start</PrimaryButton>
              : <SecondaryButton disabled={busy} onClick={() => void run(() => api.setPackageBotStatus(token!, item.id, 'stop'), 'Unable to stop the package')} className="flex items-center justify-center gap-1.5"><Square className="h-4 w-4" />Stop</SecondaryButton>}
            <SecondaryButton disabled={busy || item.botStatus !== 'STOPPED'} onClick={() => void run(() => api.cancelPackageSubscription(token!, item.id), 'Unable to cancel', 'Subscription cancelled.')} className="text-rose-600">Cancel</SecondaryButton>
          </div>
        </Card>;
      })}

      <h2 className="px-1 pt-2 text-sm font-semibold text-slate-500">Packages</h2>
      {data && data.packages.length === 0 && <Card><Empty>No packages are available yet.</Empty></Card>}
      {data?.packages.map((pkg) => <Card key={pkg.id}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><p className="font-semibold">{pkg.name}</p>{pkg.description && <p className="mt-0.5 text-sm text-slate-500">{pkg.description}</p>}</div>
          <p className="shrink-0 text-lg font-bold text-teal-700">{pkg.amountQuote.toLocaleString()} <span className="text-xs font-medium text-slate-400">USDT</span></p>
        </div>
        <PrimaryButton disabled={busy || active.has(pkg.id)} onClick={() => setPending(pkg)} className="mt-4 w-full">{active.has(pkg.id) ? 'Subscribed' : 'Subscribe'}</PrimaryButton>
      </Card>)}

      <Link to="/pro" className="flex items-center justify-between rounded-2xl bg-white px-4 py-4 text-sm shadow-sm">
        <span><span className="font-semibold">Prefer your own settings?</span><span className="block text-slate-500">Create and manage your own bots in the full dashboard.</span></span>
        <ChevronRight className="h-4 w-4 text-slate-400" />
      </Link>
      <p className="px-2 pb-2 text-xs leading-5 text-slate-400">Packages trade with real funds on your own Binance account. Trading can lose money; past results do not guarantee future returns.</p>
    </main>

    <ConfirmSheet
      open={Boolean(pending)}
      title={`Subscribe to ${pending?.name ?? ''}?`}
      message={`${pending ? money(pending.amountQuote) : ''} will be traded by managed bots on your own Binance account. They stay stopped until you confirm LIVE trading and press Start. Keep that much USDT in your Binance spot wallet.`}
      confirmLabel="Subscribe"
      busy={busy}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const pkg = pending!;
        void run(async () => {
          const result = await api.subscribeToPackage(token!, pkg.id);
          setPending(null);
          if (result.confirmationRequired) setNotice(`Subscribed to ${pkg.name}. Confirm LIVE trading under Assets, then press Start.`);
          else setNotice(`Subscribed to ${pkg.name}. Press Start when you are ready.`);
        }, 'Subscription failed');
      }}
    />
  </>;
}
