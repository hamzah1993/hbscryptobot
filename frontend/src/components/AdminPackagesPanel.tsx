import { useCallback, useEffect, useState } from 'react';
import { api, type AdminTradingPackage, type PackageStrategyTemplate } from '../lib/api';

const EXAMPLE_TEMPLATE: PackageStrategyTemplate = {
  baseOrderQuote: 10,
  maxDcaOrders: 3,
  dcaStepPercent: 3,
  dcaMultiplier: 1,
  dcaMultipliers: [1, 1.5, 2],
  takeProfitPercent: 1.5,
  independentFromLevel: 3,
  maxDailyRealizedLossQuote: 10,
};

type FormState = { id: string | null; name: string; description: string; amountQuote: string; symbol: string; template: string; active: boolean; sortOrder: string };

const emptyForm = (): FormState => ({
  id: null, name: '', description: '', amountQuote: '', symbol: 'BTCUSDT',
  template: JSON.stringify(EXAMPLE_TEMPLATE, null, 2), active: true, sortOrder: '0',
});

export function AdminPackagesPanel({ token, adminSessionToken }: { token: string; adminSessionToken: string }) {
  const [packages, setPackages] = useState<AdminTradingPackage[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setPackages(await api.listAdminPackages(token, adminSessionToken)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load packages'); }
  }, [token, adminSessionToken]);

  useEffect(() => { void refresh(); }, [refresh]);

  function edit(pkg: AdminTradingPackage) {
    setForm({
      id: pkg.id, name: pkg.name, description: pkg.description ?? '', amountQuote: String(pkg.amountQuote), symbol: pkg.symbol,
      template: JSON.stringify(pkg.strategyTemplate, null, 2), active: pkg.active, sortOrder: String(pkg.sortOrder),
    });
    setError(null);
  }

  async function save() {
    if (!form) return;
    let strategyTemplate: PackageStrategyTemplate;
    try { strategyTemplate = JSON.parse(form.template) as PackageStrategyTemplate; }
    catch { setError('Strategy template must be valid JSON'); return; }
    const payload = {
      name: form.name, description: form.description, amountQuote: Number(form.amountQuote), symbol: form.symbol,
      strategyTemplate, active: form.active, sortOrder: Number(form.sortOrder) || 0,
    };
    setBusy(true); setError(null);
    try {
      if (form.id) await api.updateAdminPackage(token, adminSessionToken, form.id, payload);
      else await api.createAdminPackage(token, adminSessionToken, payload);
      setForm(null);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save the package'); }
    finally { setBusy(false); }
  }

  const input = 'mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-400/40';

  return <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-xl font-semibold">Trading packages</h2><p className="mt-1 text-sm text-slate-400">Each subscription creates a Binance LIVE bot on the subscriber's own account. Edits apply to new subscriptions only.</p></div>
      <button type="button" onClick={() => { setForm(emptyForm()); setError(null); }} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950">New package</button>
    </div>
    {error && <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

    <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
      <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="pb-3">Package</th><th>Amount</th><th>Symbol</th><th>Status</th><th>Subscribers</th><th>Active capital</th><th /></tr></thead>
      <tbody>{packages.map((pkg) => <tr key={pkg.id} className="border-t border-white/10">
        <td className="py-4 font-semibold">{pkg.name}</td>
        <td>{pkg.amountQuote} USDT</td>
        <td>{pkg.symbol}</td>
        <td className={pkg.active ? 'text-emerald-300' : 'text-slate-500'}>{pkg.active ? 'Active' : 'Hidden'}</td>
        <td>{pkg.activeSubscriptions}</td>
        <td>{pkg.activeCapitalQuote} USDT</td>
        <td><button type="button" onClick={() => edit(pkg)} className="rounded-lg border border-white/10 px-3 py-1.5">Edit</button></td>
      </tr>)}</tbody>
    </table>{packages.length === 0 && <p className="py-5 text-sm text-slate-500">No packages yet.</p>}</div>

    {form && <div className="mt-5 grid gap-4 rounded-xl border border-white/10 bg-slate-950/30 p-4 md:grid-cols-2">
      <label className="text-sm text-slate-300">Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={input} /></label>
      <label className="text-sm text-slate-300">Amount (USDT)<input type="number" min="1" step="1" value={form.amountQuote} onChange={(event) => setForm({ ...form, amountQuote: event.target.value })} className={input} /></label>
      <label className="text-sm text-slate-300">Symbol<input value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value })} className={input} /></label>
      <label className="text-sm text-slate-300">Sort order<input type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} className={input} /></label>
      <label className="text-sm text-slate-300 md:col-span-2">Description<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={input} /></label>
      <label className="text-sm text-slate-300 md:col-span-2">Strategy template (JSON)<textarea rows={12} value={form.template} onChange={(event) => setForm({ ...form, template: event.target.value })} className={`${input} font-mono text-xs`} /></label>
      <p className="text-xs text-slate-500 md:col-span-2">The risk budget and exposure limit always equal the package amount. Keep the base order above Binance's minimum order value (about 5 USDT).</p>
      <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />Visible to users</label>
      <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setForm(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm">Cancel</button><button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? 'Saving…' : form.id ? 'Save changes' : 'Create package'}</button></div>
    </div>}
  </section>;
}
