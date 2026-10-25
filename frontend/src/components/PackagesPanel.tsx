import { useCallback, useEffect, useState } from 'react';
import { api, type PackageSubscription, type TradingPackage } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';

const money = (value: number) => `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;

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
        ? `Subscribed to ${pkg.name}. Your LIVE capital ceiling is now ${money(result.capitalCeilingQuote)}. Confirm LIVE trading on the LIVE overview, then start the bot below.`
        : `Subscribed to ${pkg.name}. Start the bot below when you are ready.`);
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
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">{pkg.symbol}</p>
        <h3 className="mt-2 text-xl font-semibold">{pkg.name}</h3>
        <p className="mt-1 text-2xl font-semibold text-slate-100">{money(pkg.amountQuote)}</p>
        {pkg.description && <p className="mt-3 text-sm text-slate-400">{pkg.description}</p>}
        <dl className="mt-4 space-y-1 text-xs text-slate-400">
          <div className="flex justify-between"><dt>Take profit</dt><dd>{String(pkg.strategyTemplate.takeProfitPercent ?? '—')}%</dd></div>
          <div className="flex justify-between"><dt>DCA levels</dt><dd>{String(pkg.strategyTemplate.maxDcaOrders ?? '—')}</dd></div>
          <div className="flex justify-between"><dt>Daily loss stop</dt><dd>{pkg.strategyTemplate.maxDailyRealizedLossQuote ? money(Number(pkg.strategyTemplate.maxDailyRealizedLossQuote)) : 'None'}</dd></div>
        </dl>
        <button type="button" disabled={busy || activeByPackage.has(pkg.id)} onClick={() => setPendingPackage(pkg)} className="mt-5 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-40">{activeByPackage.has(pkg.id) ? 'Subscribed' : 'Subscribe'}</button>
      </article>)}
      {packages.length === 0 && <p className="text-sm text-slate-500">No packages are available yet.</p>}
    </div>

    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <h3 className="text-lg font-semibold">My packages</h3>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="pb-3">Package</th><th>Amount</th><th>Bot</th><th>Realized P&amp;L</th><th>Open</th><th>Actions</th></tr></thead>
        <tbody>{subscriptions.map((item) => {
          const pnl = item.performance.realizedPnlQuote;
          const active = item.status === 'ACTIVE';
          const strategy = item.strategy;
          return <tr key={item.id} className="border-t border-white/10">
            <td className="py-4"><p className="font-semibold">{item.package.name}</p><p className="text-xs text-slate-500">{active ? `Since ${new Date(item.startedAt).toLocaleDateString()}` : `Cancelled ${item.cancelledAt ? new Date(item.cancelledAt).toLocaleDateString() : ''}`}</p></td>
            <td>{money(item.amountQuote)}</td>
            <td>{strategy?.status ?? '—'}</td>
            <td className={pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{money(pnl)} <span className="text-xs text-slate-500">({item.performance.realizedReturnPercent.toFixed(2)}%)</span></td>
            <td>{item.performance.openPositions ? money(item.performance.openPositionCostQuote) : '—'}</td>
            <td>{active && strategy && <div className="flex flex-wrap gap-2">
              {strategy.status !== 'RUNNING'
                ? <button type="button" disabled={busy} onClick={() => void run(() => api.setStrategyStatus(token, strategy.id, 'RUNNING'), 'Unable to start the bot')} className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-emerald-200">Start</button>
                : <button type="button" disabled={busy} onClick={() => void run(() => api.setStrategyStatus(token, strategy.id, 'STOPPED'), 'Unable to stop the bot')} className="rounded-lg border border-white/10 px-3 py-1.5">Stop</button>}
              <button type="button" disabled={busy || strategy.status === 'RUNNING'} onClick={() => void run(() => api.cancelPackageSubscription(token, item.id), 'Unable to cancel the subscription')} className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-rose-200 disabled:opacity-40">Cancel</button>
            </div>}</td>
          </tr>;
        })}</tbody>
      </table>{subscriptions.length === 0 && <p className="py-5 text-sm text-slate-500">You have not subscribed to a package yet.</p>}</div>
      <p className="mt-3 text-xs text-slate-500">Stop the bot and close any open position before cancelling. Bots trade only after you confirm LIVE trading and press Start.</p>
    </div>

    <ConfirmDialog
      open={Boolean(pendingPackage)}
      title={`Subscribe to ${pendingPackage?.name ?? ''}?`}
      description={`A Binance LIVE bot with a ${pendingPackage ? money(pendingPackage.amountQuote) : ''} risk budget will be created on your own Binance account. It stays stopped until you confirm LIVE trading and start it. Make sure that much USDT is available in your Binance spot wallet.`}
      confirmLabel="Subscribe"
      busy={busy}
      onCancel={() => setPendingPackage(null)}
      onConfirm={() => void subscribe()}
    />
  </section>;
}
