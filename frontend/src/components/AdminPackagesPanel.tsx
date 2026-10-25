import { useCallback, useEffect, useState } from 'react';
import { api, type AdminPackageStrategy, type AdminTradingPackage, type StrategyBacktestResult, type StrategyField } from '../lib/api';
import { BacktestResultTable, StrategySettingsForm, toFormValues, toSettings, type StrategyFormValues } from './StrategySettingsForm';

type StrategyForm = { id: string | null; name: string; symbol: string; values: StrategyFormValues; active: boolean };
type BacktestForm = { days: string; capitalQuote: string };
type AllocationRow = { templateId: string; allocationPercent: string };
type PackageForm = { id: string | null; name: string; description: string; amountQuote: string; active: boolean; sortOrder: string; allocations: AllocationRow[] };

const input = 'mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-400/40';
const primary = 'rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50';
const secondary = 'rounded-xl border border-white/10 px-4 py-2.5 text-sm';

export function AdminPackagesPanel({ token, adminSessionToken }: { token: string; adminSessionToken: string }) {
  const [strategies, setStrategies] = useState<AdminPackageStrategy[]>([]);
  const [packages, setPackages] = useState<AdminTradingPackage[]>([]);
  const [fields, setFields] = useState<StrategyField[]>([]);
  const [strategyForm, setStrategyForm] = useState<StrategyForm | null>(null);
  const [packageForm, setPackageForm] = useState<PackageForm | null>(null);
  const [backtestForm, setBacktestForm] = useState<BacktestForm>({ days: '30', capitalQuote: '1000' });
  const [backtest, setBacktest] = useState<StrategyBacktestResult | null>(null);
  const [backtesting, setBacktesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextStrategies, nextPackages, nextFields] = await Promise.all([
        api.listAdminPackageStrategies(token, adminSessionToken),
        api.listAdminPackages(token, adminSessionToken),
        api.getAdminStrategyFields(token, adminSessionToken),
      ]);
      setStrategies(nextStrategies); setPackages(nextPackages); setFields(nextFields);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load packages'); }
  }, [token, adminSessionToken]);

  function openStrategy(strategy: AdminPackageStrategy | null) {
    setStrategyForm(strategy
      ? { id: strategy.id, name: strategy.name, symbol: strategy.symbol, values: toFormValues(fields, strategy.strategyTemplate), active: strategy.active }
      : { id: null, name: '', symbol: 'BTCUSDT', values: toFormValues(fields), active: true });
    setBacktest(null);
    setError(null);
  }

  async function runBacktest() {
    if (!strategyForm) return;
    const { settings, error: formError } = toSettings(fields, strategyForm.values);
    if (formError) { setError(formError); return; }
    setBacktesting(true); setError(null); setBacktest(null);
    try {
      setBacktest(await api.backtestAdminStrategy(token, adminSessionToken, {
        symbol: strategyForm.symbol, strategyTemplate: settings, days: Number(backtestForm.days), capitalQuote: Number(backtestForm.capitalQuote),
      }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Backtest failed'); }
    finally { setBacktesting(false); }
  }

  useEffect(() => { void refresh(); }, [refresh]);

  async function run(action: () => Promise<unknown>, onDone: () => void) {
    setBusy(true); setError(null);
    try { await action(); onDone(); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save'); }
    finally { setBusy(false); }
  }

  function saveStrategy() {
    if (!strategyForm) return;
    const { settings: strategyTemplate, error: formError } = toSettings(fields, strategyForm.values);
    if (formError) { setError(formError); return; }
    const payload = { name: strategyForm.name, symbol: strategyForm.symbol, strategyTemplate, active: strategyForm.active };
    void run(
      () => strategyForm.id
        ? api.updateAdminPackageStrategy(token, adminSessionToken, strategyForm.id, payload)
        : api.createAdminPackageStrategy(token, adminSessionToken, payload),
      () => setStrategyForm(null),
    );
  }

  function savePackage() {
    if (!packageForm) return;
    const payload = {
      name: packageForm.name, description: packageForm.description, amountQuote: Number(packageForm.amountQuote),
      active: packageForm.active, sortOrder: Number(packageForm.sortOrder) || 0,
      strategies: packageForm.allocations.filter((row) => row.templateId).map((row) => ({ templateId: row.templateId, allocationPercent: Number(row.allocationPercent) })),
    };
    void run(
      () => packageForm.id
        ? api.updateAdminPackage(token, adminSessionToken, packageForm.id, payload)
        : api.createAdminPackage(token, adminSessionToken, payload),
      () => setPackageForm(null),
    );
  }

  const allocationTotal = packageForm?.allocations.reduce((sum, row) => sum + (Number(row.allocationPercent) || 0), 0) ?? 0;
  const updateRow = (index: number, patch: Partial<AllocationRow>) => packageForm && setPackageForm({
    ...packageForm, allocations: packageForm.allocations.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
  });

  return <>
    {error && <div className="mt-6 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-xl font-semibold">Package strategies</h2><p className="mt-1 text-sm text-slate-400">Predefined bot settings used inside packages. Users never see these. Changes apply to new subscriptions only.</p></div>
        <button type="button" disabled={!fields.length} onClick={() => openStrategy(null)} className={primary}>New strategy</button>
      </div>
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="pb-3">Strategy</th><th>Symbol</th><th>Entry</th><th>First buy</th><th>Take profit</th><th>Stop-loss</th><th>Status</th><th>Used in</th><th /></tr></thead>
        <tbody>{strategies.map((strategy) => <tr key={strategy.id} className="border-t border-white/10">
          <td className="py-4 font-semibold">{strategy.name}</td>
          <td>{strategy.symbol}</td>
          <td className="text-slate-300">{strategy.strategyTemplate.entryMode === 'DIP_CONFIRMATION' ? `Dip ${String(strategy.strategyTemplate.dipPercent ?? 3)}% + ${String(strategy.strategyTemplate.confirmTimeframe ?? '5m')}` : 'Immediate'}</td>
          <td>{String(strategy.strategyTemplate.baseOrderQuote)} USDT</td>
          <td>{String(strategy.strategyTemplate.takeProfitPercent)}%</td>
          <td>{strategy.strategyTemplate.stopLossPercent ? `${String(strategy.strategyTemplate.stopLossPercent)}%` : 'Off'}</td>
          <td className={strategy.active ? 'text-emerald-300' : 'text-slate-500'}>{strategy.active ? 'Active' : 'Inactive'}</td>
          <td className="text-slate-400">{strategy.packages.map((item) => item.name).join(', ') || '—'}</td>
          <td><button type="button" disabled={!fields.length} onClick={() => openStrategy(strategy)} className="rounded-lg border border-white/10 px-3 py-1.5">Edit</button></td>
        </tr>)}</tbody>
      </table>{strategies.length === 0 && <p className="py-5 text-sm text-slate-500">No strategies yet. Create strategies first, then assign them to packages.</p>}</div>

      {strategyForm && <div className="mt-5 grid gap-4 rounded-xl border border-white/10 bg-slate-950/30 p-4 md:grid-cols-2">
        <label className="text-sm text-slate-300">Name<input value={strategyForm.name} onChange={(event) => setStrategyForm({ ...strategyForm, name: event.target.value })} className={input} /></label>
        <label className="text-sm text-slate-300">Symbol<input value={strategyForm.symbol} onChange={(event) => setStrategyForm({ ...strategyForm, symbol: event.target.value })} className={input} /></label>
        <div className="md:col-span-2"><StrategySettingsForm fields={fields} values={strategyForm.values} onChange={(values) => setStrategyForm({ ...strategyForm, values })} /></div>
        <p className="text-xs text-slate-500 md:col-span-2">Each bot's budget and exposure limit come from its package allocation. Changes apply to new subscriptions only.</p>

        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4 md:col-span-2">
          <p className="text-sm font-semibold text-slate-200">Backtest these settings</p>
          <p className="mt-1 text-xs text-slate-400">Runs the settings above, saved or not, on Binance history and compares them with the same settings without the dip and DCA confirmation rules.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-300">Days<input type="number" min="1" max="365" value={backtestForm.days} onChange={(event) => setBacktestForm({ ...backtestForm, days: event.target.value })} className={`${input} w-28`} /></label>
            <label className="text-sm text-slate-300">Capital (USDT)<input type="number" min="10" value={backtestForm.capitalQuote} onChange={(event) => setBacktestForm({ ...backtestForm, capitalQuote: event.target.value })} className={`${input} w-36`} /></label>
            <button type="button" disabled={backtesting} onClick={() => void runBacktest()} className={primary}>{backtesting ? 'Running…' : 'Run backtest'}</button>
          </div>
          {backtest && <BacktestResultTable result={backtest} />}
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={strategyForm.active} onChange={(event) => setStrategyForm({ ...strategyForm, active: event.target.checked })} />Active</label>
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setStrategyForm(null)} className={secondary}>Cancel</button><button type="button" disabled={busy} onClick={saveStrategy} className={primary}>{busy ? 'Saving…' : strategyForm.id ? 'Save strategy' : 'Create strategy'}</button></div>
      </div>}
    </section>

    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-xl font-semibold">Trading packages</h2><p className="mt-1 text-sm text-slate-400">Each subscription creates one Binance LIVE bot per strategy on the subscriber's own account. Edits apply to new subscriptions only.</p></div>
        <button type="button" disabled={!strategies.some((strategy) => strategy.active)} onClick={() => { setPackageForm({ id: null, name: '', description: '', amountQuote: '', active: true, sortOrder: '0', allocations: [{ templateId: '', allocationPercent: '100' }] }); setError(null); }} className={primary}>New package</button>
      </div>
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="pb-3">Package</th><th>Amount</th><th>Strategies</th><th>Status</th><th>Subscribers</th><th>Active capital</th><th /></tr></thead>
        <tbody>{packages.map((pkg) => <tr key={pkg.id} className="border-t border-white/10 align-top">
          <td className="py-4 font-semibold">{pkg.name}</td>
          <td className="py-4">{pkg.amountQuote} USDT</td>
          <td className="py-4 text-slate-300">{pkg.strategies.map((item) => <div key={item.templateId}>{item.name} · {item.allocationPercent}% <span className="text-slate-500">({item.budgetQuote} USDT)</span>{!item.active && <span className="text-amber-300"> inactive</span>}</div>)}</td>
          <td className={`py-4 ${pkg.active ? 'text-emerald-300' : 'text-slate-500'}`}>{pkg.active ? 'Visible' : 'Hidden'}</td>
          <td className="py-4">{pkg.activeSubscriptions}</td>
          <td className="py-4">{pkg.activeCapitalQuote} USDT</td>
          <td className="py-4"><button type="button" onClick={() => { setPackageForm({ id: pkg.id, name: pkg.name, description: pkg.description ?? '', amountQuote: String(pkg.amountQuote), active: pkg.active, sortOrder: String(pkg.sortOrder), allocations: pkg.strategies.map((item) => ({ templateId: item.templateId, allocationPercent: String(item.allocationPercent) })) }); setError(null); }} className="rounded-lg border border-white/10 px-3 py-1.5">Edit</button></td>
        </tr>)}</tbody>
      </table>{packages.length === 0 && <p className="py-5 text-sm text-slate-500">No packages yet.</p>}</div>

      {packageForm && <div className="mt-5 grid gap-4 rounded-xl border border-white/10 bg-slate-950/30 p-4 md:grid-cols-2">
        <label className="text-sm text-slate-300">Name<input value={packageForm.name} onChange={(event) => setPackageForm({ ...packageForm, name: event.target.value })} className={input} /></label>
        <label className="text-sm text-slate-300">Amount (USDT)<input type="number" min="1" step="1" value={packageForm.amountQuote} onChange={(event) => setPackageForm({ ...packageForm, amountQuote: event.target.value })} className={input} /></label>
        <label className="text-sm text-slate-300 md:col-span-2">Description shown to users<input value={packageForm.description} onChange={(event) => setPackageForm({ ...packageForm, description: event.target.value })} className={input} /></label>
        <div className="md:col-span-2">
          <p className="text-sm text-slate-300">Strategies</p>
          <div className="mt-2 space-y-2">{packageForm.allocations.map((row, index) => <div key={index} className="flex gap-2">
            <select value={row.templateId} onChange={(event) => updateRow(index, { templateId: event.target.value })} className={`${input} mt-0 flex-1`}>
              <option value="">Choose a strategy…</option>
              {strategies.filter((strategy) => strategy.active || strategy.id === row.templateId).map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.name} ({strategy.symbol})</option>)}
            </select>
            <input type="number" min="0.01" max="100" step="0.01" value={row.allocationPercent} onChange={(event) => updateRow(index, { allocationPercent: event.target.value })} className={`${input} mt-0 w-28`} aria-label="Allocation percent" />
            <span className="self-center text-sm text-slate-400">%</span>
            <button type="button" disabled={packageForm.allocations.length === 1} onClick={() => setPackageForm({ ...packageForm, allocations: packageForm.allocations.filter((_, rowIndex) => rowIndex !== index) })} className="rounded-lg border border-white/10 px-3 text-sm disabled:opacity-30">Remove</button>
          </div>)}</div>
          <div className="mt-2 flex items-center justify-between">
            <button type="button" onClick={() => setPackageForm({ ...packageForm, allocations: [...packageForm.allocations, { templateId: '', allocationPercent: '' }] })} className="text-sm text-cyan-300">+ Add strategy</button>
            <span className={`text-sm ${Math.abs(allocationTotal - 100) < 0.001 ? 'text-emerald-300' : 'text-amber-300'}`}>Total {Number(allocationTotal.toFixed(2))}% (must be 100%)</span>
          </div>
        </div>
        <label className="text-sm text-slate-300">Sort order<input type="number" value={packageForm.sortOrder} onChange={(event) => setPackageForm({ ...packageForm, sortOrder: event.target.value })} className={input} /></label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-300"><input type="checkbox" checked={packageForm.active} onChange={(event) => setPackageForm({ ...packageForm, active: event.target.checked })} />Visible to users</label>
        <div className="flex justify-end gap-2 md:col-span-2"><button type="button" disabled={busy} onClick={() => setPackageForm(null)} className={secondary}>Cancel</button><button type="button" disabled={busy} onClick={savePackage} className={primary}>{busy ? 'Saving…' : packageForm.id ? 'Save package' : 'Create package'}</button></div>
      </div>}
    </section>
  </>;
}
