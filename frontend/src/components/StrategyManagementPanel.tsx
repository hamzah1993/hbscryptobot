import { FormEvent, useEffect, useState } from 'react';
import { api, type TradingStrategy } from '../lib/api';

type Props = { token: string; onChanged?: () => void };

type EditForm = {
  name: string;
  riskBudgetQuote: number;
  baseOrderQuote: number;
  maxDcaOrders: number;
  dcaStepPercent: number;
  dcaMultiplier: number;
  takeProfitPercent: number;
  independentFromLevel: number;
};

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

async function strategyRequest<T>(token: string, path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message ?? 'Request failed');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const toForm = (strategy: TradingStrategy): EditForm => ({
  name: strategy.name,
  riskBudgetQuote: Number(strategy.riskBudgetQuote),
  baseOrderQuote: Number(strategy.baseOrderQuote ?? 0),
  maxDcaOrders: strategy.maxDcaOrders,
  dcaStepPercent: Number(strategy.dcaStepPercent ?? 0),
  dcaMultiplier: Number(strategy.dcaMultiplier ?? 1),
  takeProfitPercent: Number(strategy.takeProfitPercent ?? 0),
  independentFromLevel: Number(strategy.independentFromLevel ?? 5),
});

export function StrategyManagementPanel({ token, onChanged }: Props) {
  const [strategies, setStrategies] = useState<TradingStrategy[]>([]);
  const [editing, setEditing] = useState<TradingStrategy | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try { setStrategies(await api.listStrategies(token)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load bots'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [token]);

  function beginEdit(strategy: TradingStrategy) {
    setEditing(strategy);
    setForm(toForm(strategy));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || !form) return;
    setBusyId(editing.id);
    setError(null);
    try {
      await strategyRequest<TradingStrategy>(token, `/strategies/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      setEditing(null);
      setForm(null);
      await load();
      onChanged?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update bot'); }
    finally { setBusyId(null); }
  }

  async function remove(strategy: TradingStrategy) {
    if (!window.confirm(`Delete bot “${strategy.name}”? This cannot be undone.`)) return;
    setBusyId(strategy.id);
    setError(null);
    try {
      await strategyRequest<unknown>(token, `/strategies/${strategy.id}`, { method: 'DELETE' });
      await load();
      onChanged?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to delete bot'); }
    finally { setBusyId(null); }
  }

  async function setStatus(strategy: TradingStrategy, status: 'RUNNING' | 'PAUSED' | 'STOPPED') {
    setBusyId(strategy.id);
    try {
      await api.setStrategyStatus(token, strategy.id, status);
      await load();
      onChanged?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to change bot status'); }
    finally { setBusyId(null); }
  }

  return <section className="mt-6 space-y-4">
    <div className="flex items-end justify-between rounded-2xl border border-white/10 bg-white/[0.035] p-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Bot management</p><h3 className="mt-2 text-2xl font-semibold">Your strategies</h3><p className="mt-2 text-sm text-slate-400">View, edit, pause, stop, or delete every bot you created.</p></div>
      <button onClick={() => void load()} disabled={loading} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    {error && <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
    {!loading && strategies.length === 0 && <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-10 text-center text-slate-500">No bots created yet.</div>}
    <div className="grid gap-4 xl:grid-cols-2">{strategies.map((s) => <article key={s.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h4 className="text-lg font-semibold">{s.name}</h4><span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-300">{s.status ?? 'STOPPED'}</span></div><p className="mt-2 text-sm text-slate-400">{s.symbol} · {s.paperTrading ? 'Paper' : s.environment === 'TESTNET' ? s.exchange === 'OKX' ? 'OKX Demo' : `${s.exchange ?? 'BINANCE'} Testnet` : 'Live disabled'}</p></div><button onClick={() => void remove(s)} disabled={busyId === s.id} className="text-sm font-semibold text-rose-300">Delete</button></div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><Stat label="Risk budget" value={`$${s.riskBudgetQuote}`} /><Stat label="Base order" value={`$${s.baseOrderQuote ?? 0}`} /><Stat label="DCA levels" value={String(s.maxDcaOrders)} /><Stat label="Take profit" value={`${s.takeProfitPercent ?? 0}%`} /></div>
      <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => beginEdit(s)} className="rounded-xl border border-white/10 px-3 py-2 text-sm">Edit</button><button onClick={() => void setStatus(s, 'RUNNING')} disabled={busyId === s.id} className="rounded-xl bg-emerald-400/15 px-3 py-2 text-sm text-emerald-300">Run</button><button onClick={() => void setStatus(s, 'PAUSED')} disabled={busyId === s.id} className="rounded-xl bg-amber-400/15 px-3 py-2 text-sm text-amber-300">Pause</button><button onClick={() => void setStatus(s, 'STOPPED')} disabled={busyId === s.id} className="rounded-xl bg-slate-400/10 px-3 py-2 text-sm text-slate-300">Stop</button></div>
    </article>)}</div>
    {editing && form && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4"><form onSubmit={save} className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0a1728] p-6"><div className="flex items-center justify-between"><h3 className="text-xl font-semibold">Edit {editing.name}</h3><button type="button" onClick={() => setEditing(null)}>Close</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2">{Object.entries(form).map(([key, value]) => <label key={key} className="text-sm text-slate-300">{key.replace(/([A-Z])/g, ' $1')}<input type={key === 'name' ? 'text' : 'number'} step="any" value={value} onChange={(e) => setForm((current) => current ? ({ ...current, [key]: key === 'name' ? e.target.value : Number(e.target.value) }) : current)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3" /></label>)}</div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-white/10 px-4 py-2.5">Cancel</button><button disabled={busyId === editing.id} className="rounded-xl bg-cyan-400 px-4 py-2.5 font-semibold text-slate-950">Save changes</button></div></form></div>}
  </section>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-950/30 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
