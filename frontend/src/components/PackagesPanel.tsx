import { useCallback, useEffect, useState } from 'react';
import { api, type PackageBotStatus, type PackageSubscription, type TradingPackage } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';

const money = (value: number) => `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
const statusLabel: Record<PackageBotStatus, string> = { RUNNING: 'Running', PARTIAL: 'Partly running', STOPPED: 'Stopped' };

export function PackagesPanel({ token, onOpenLiveOverview }: { token: string; onOpenLiveOverview: () => void }) {
  const [packages, setPackages] = useState<TradingPackage[]>([]);
  const [subscriptions, setSubscriptions] = useState<PackageSubscription[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingPackage, setPendingPackage] = useState<TradingPackage | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextPackages, nextSubscriptions] = await Promise.all([api.listPackages(token), api.listPackageSubscriptions(token)]);
      setPackages(nextPackages); setSubscriptions(nextSubscriptions); setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load packages'); }
  }, [token]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : fallback); }
    finally { setBusy(false); }
  }

  async function subscribe() {
    const pkg = pendingPackage;
    if (!pkg) return;
    await run(async () => {
      const result = await api.subscribeToPackage(token, pkg.id);
      setPendingPackage(null);
      setNotice(result.confirmationRequired
        ? `Subscribed to ${pkg.name}. Your LIVE capital ceiling is now ${money(result.capitalCeilingQuote)}. Confirm LIVE trading on the LIVE overview, then press Start below.`
        : `Subscribed to ${pkg.name}. Press Start below when you are ready.`);
    }, 'Subscription failed');
  }

  const activeByPackage = new Set(subscriptions.filter((item) => item.status === 'ACTIVE').map((item) => item.packageId));

  return <section className="mt-6 space-y-6">
    <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.05] p-5 text-sm leading-6 text-amber-100">
      Packages trade with real funds on <strong>your own Binance account</strong> through the API key you connected. Your money never leaves your account, and every profit or loss is yours alone. Trading can lose money; past results do not guarantee future returns. Use an API key with withdrawals disabled.
    </div>
    {error && <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
    {notice && <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{notice} <button type="button" onClick={onOpenLiveOverview} className="ml-1 underline">Open LIVE overview</button></div>}

    <div className="grid gap-4 md:grid-cols-3">
      {packages.map((pkg) => <article key={pkg.id} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <h3 className="text-xl font-semibold">{pkg.name}</h3>
        <p className="mt-1 text-2xl font-semibold text-slate-100">{money(pkg.amountQuote)}</p>
        {pkg.description && <p className="mt-3 flex-1 text-sm text-slate-400">{pkg.description}</p>}
        <button type="button" disabled={busy || activeByPackage.has(pkg.id)} onClick={() => setPendingPackage(pkg)} className="mt-5 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-40">{activeByPackage.has(pkg.id) ? 'Subscribed' : 'Subscribe'}</button>
      </article>)}
      {packages.length === 0 && <p className="text-sm text-slate-500">No packages are available yet.</p>}
    </div>

    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <h3 className="text-lg font-semibold">My packages</h3>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="pb-3">Package</th><th>Amount</th><th>Status</th><th>Realized P&amp;L</th><th>Open</th><th>Actions</th></tr></thead>
        <tbody>{subscriptions.map((item) => {
          const pnl = item.performance.realizedPnlQuote;
          const active = item.status === 'ACTIVE';
          return <tr key={item.id} className="border-t border-white/10">
            <td className="py-4"><p className="font-semibold">{item.package.name}</p><p className="text-xs text-slate-500">{active ? `Since ${new Date(item.startedAt).toLocaleDateString()}` : `Cancelled ${item.cancelledAt ? new Date(item.cancelledAt).toLocaleDateString() : ''}`}</p></td>
            <td>{money(item.amountQuote)}</td>
            <td>{active ? statusLabel[item.botStatus] : 'Cancelled'}</td>
            <td className={pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{money(pnl)} <span className="text-xs text-slate-500">({item.performance.realizedReturnPercent.toFixed(2)}%)</span></td>
            <td>{item.performance.openPositions ? money(item.performance.openPositionCostQuote) : '—'}</td>
            <td>{active && <div className="flex flex-wrap gap-2">
              {item.botStatus !== 'RUNNING' && <button type="button" disabled={busy} onClick={() => void run(() => api.setPackageBotStatus(token, item.id, 'start'), 'Unable to start the package')} className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-emerald-200">Start</button>}
              {item.botStatus !== 'STOPPED' && <button type="button" disabled={busy} onClick={() => void run(() => api.setPackageBotStatus(token, item.id, 'stop'), 'Unable to stop the package')} className="rounded-lg border border-white/10 px-3 py-1.5">Stop</button>}
              <button type="button" disabled={busy || item.botStatus !== 'STOPPED'} onClick={() => void run(() => api.cancelPackageSubscription(token, item.id), 'Unable to cancel the subscription')} className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-rose-200 disabled:opacity-40">Cancel</button>
            </div>}</td>
          </tr>;
        })}</tbody>
      </table>{subscriptions.length === 0 && <p className="py-5 text-sm text-slate-500">You have not subscribed to a package yet.</p>}</div>
      <p className="mt-3 text-xs text-slate-500">Stop the package and close any open position before cancelling. Packages trade only after you confirm LIVE trading and press Start. Prefer your own settings? Create your own bot from the Bots page instead.</p>
    </div>

    <ConfirmDialog
      open={Boolean(pendingPackage)}
      title={`Subscribe to ${pendingPackage?.name ?? ''}?`}
      description={`${pendingPackage ? money(pendingPackage.amountQuote) : ''} will be traded by managed bots on your own Binance account. They stay stopped until you confirm LIVE trading and press Start. Make sure that much USDT is available in your Binance spot wallet.`}
      confirmLabel="Subscribe"
      busy={busy}
      onCancel={() => setPendingPackage(null)}
      onConfirm={() => void subscribe()}
    />
  </section>;
}
