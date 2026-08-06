import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  api,
  type CreateStrategyPayload,
  type StrategyStatus,
  type TestnetPosition,
  type TradingPosition,
  type TradingStrategy,
} from '../lib/api';

type Props = {
  token: string;
  onViewPaperPosition: (positionId: string) => void;
  onViewTestnetPosition: (positionId: string) => void;
};

type EditableStrategy = {
  name: string;
  riskBudgetQuote: number;
  baseOrderQuote: number;
  maxDcaOrders: number;
  dcaStepPercent: number;
  dcaMultiplier: number;
  takeProfitPercent: number;
  independentFromLevel: number;
};

const toEditable = (strategy: TradingStrategy): EditableStrategy => ({
  name: strategy.name,
  riskBudgetQuote: Number(strategy.riskBudgetQuote),
  baseOrderQuote: Number(strategy.baseOrderQuote ?? 0),
  maxDcaOrders: strategy.maxDcaOrders,
  dcaStepPercent: Number(strategy.dcaStepPercent ?? 0),
  dcaMultiplier: Number(strategy.dcaMultiplier ?? 1),
  takeProfitPercent: Number(strategy.takeProfitPercent ?? 0),
  independentFromLevel: Number(strategy.independentFromLevel ?? 5),
});

export function BotManagementPanel({ token, onViewPaperPosition, onViewTestnetPosition }: Props) {
  const [strategies, setStrategies] = useState<TradingStrategy[]>([]);
  const [paperPositions, setPaperPositions] = useState<TradingPosition[]>([]);
  const [testnetPositions, setTestnetPositions] = useState<TestnetPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableStrategy | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [strategyResult, paperResult, testnetResult] = await Promise.all([
        api.listStrategies(token),
        api.listPaperPositions(token),
        api.listTestnetPositions(token, 250),
      ]);
      setStrategies(strategyResult);
      setPaperPositions(paperResult);
      setTestnetPositions(testnetResult);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to load bots');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  const positionsByStrategy = useMemo(() => {
    const paper = new Map<string, TradingPosition[]>();
    const testnet = new Map<string, TestnetPosition[]>();
    for (const position of paperPositions) {
      const list = paper.get(position.strategy.id) ?? [];
      list.push(position);
      paper.set(position.strategy.id, list);
    }
    for (const position of testnetPositions) {
      const list = testnet.get(position.strategyId) ?? [];
      list.push(position);
      testnet.set(position.strategyId, list);
    }
    return { paper, testnet };
  }, [paperPositions, testnetPositions]);

  async function updateStatus(strategyId: string, status: StrategyStatus) {
    setBusyId(strategyId);
    setError(null);
    try {
      const updated = await api.setStrategyStatus(token, strategyId, status);
      setStrategies((current) => current.map((strategy) => strategy.id === strategyId ? { ...strategy, ...updated } : strategy));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to update bot status');
    } finally {
      setBusyId(null);
    }
  }

  function startEditing(strategy: TradingStrategy) {
    setEditingId(strategy.id);
    setDraft(toEditable(strategy));
  }

  async function saveEdit(event: FormEvent, strategy: TradingStrategy) {
    event.preventDefault();
    if (!draft) return;
    setBusyId(strategy.id);
    setError(null);
    try {
      const payload: Partial<CreateStrategyPayload> = {
        ...draft,
        symbol: strategy.symbol,
        environment: strategy.environment ?? 'TESTNET',
        paperTrading: strategy.paperTrading,
      };
      const updated = await api.updateStrategy(token, strategy.id, payload);
      setStrategies((current) => current.map((item) => item.id === strategy.id ? { ...item, ...updated } : item));
      setEditingId(null);
      setDraft(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to save bot');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(strategy: TradingStrategy) {
    if (!window.confirm(`Delete bot “${strategy.name}”? This cannot be undone.`)) return;
    setBusyId(strategy.id);
    setError(null);
    try {
      await api.deleteStrategy(token, strategy.id);
      setStrategies((current) => current.filter((item) => item.id !== strategy.id));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete bot');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/[0.08] via-white/[0.03] to-violet-400/[0.06] p-5 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Bot operations</p>
            <h3 className="mt-2 text-2xl font-semibold">My bots</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Manage Paper and Binance Testnet strategies, review linked positions, and safely change operating status.</p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">{loading ? 'Refreshing…' : 'Refresh bots'}</button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-10 text-center text-sm text-slate-500">Loading bots…</div>
      ) : strategies.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-10 text-center text-sm text-slate-500">No bots have been created yet.</div>
      ) : (
        <div className="space-y-4">
          {strategies.map((strategy) => {
            const paper = positionsByStrategy.paper.get(strategy.id) ?? [];
            const testnet = positionsByStrategy.testnet.get(strategy.id) ?? [];
            const linkedPositionCount = paper.length + testnet.length;
            const status = strategy.status ?? 'STOPPED';
            const isEditing = editingId === strategy.id && draft;
            const disabled = busyId === strategy.id;

            return (
              <article key={strategy.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
                <div className="grid gap-5 p-5 xl:grid-cols-[1.3fr_0.8fr_0.8fr_1fr_auto] xl:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-lg font-semibold">{strategy.name}</h4>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status === 'RUNNING' ? 'bg-emerald-400/15 text-emerald-300' : status === 'PAUSED' ? 'bg-amber-400/15 text-amber-300' : 'bg-slate-400/10 text-slate-300'}`}>{status}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${strategy.paperTrading ? 'bg-violet-400/15 text-violet-300' : 'bg-cyan-400/15 text-cyan-300'}`}>{strategy.paperTrading ? 'Paper' : 'Binance Testnet'}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{strategy.symbol}</p>
                    <p className="mt-1 text-xs text-slate-600">{linkedPositionCount > 0 ? `${linkedPositionCount} linked position${linkedPositionCount === 1 ? '' : 's'}` : 'No position opened yet'}</p>
                  </div>
                  <Metric label="Risk budget" value={`$${Number(strategy.riskBudgetQuote).toLocaleString()}`} />
                  <Metric label="Base order" value={`$${Number(strategy.baseOrderQuote ?? 0).toLocaleString()}`} />
                  <Metric label="DCA / take profit" value={`${strategy.maxDcaOrders} orders · ${Number(strategy.takeProfitPercent ?? 0)}% TP`} />
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    {status !== 'RUNNING' && <button disabled={disabled} onClick={() => void updateStatus(strategy.id, 'RUNNING')} className="rounded-xl bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Run</button>}
                    {status === 'RUNNING' && <button disabled={disabled} onClick={() => void updateStatus(strategy.id, 'PAUSED')} className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-200 disabled:opacity-50">Pause</button>}
                    {status !== 'STOPPED' && <button disabled={disabled} onClick={() => void updateStatus(strategy.id, 'STOPPED')} className="rounded-xl border border-white/10 px-3 py-2 text-sm disabled:opacity-50">Stop</button>}
                    <button disabled={disabled} onClick={() => startEditing(strategy)} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-50">Edit</button>
                    <button disabled={disabled} onClick={() => void remove(strategy)} className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm font-semibold text-rose-200 disabled:opacity-50">Delete</button>
                  </div>
                </div>

                {(paper.length > 0 || testnet.length > 0) && (
                  <div className="border-t border-white/10 px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Linked positions</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {paper.map((position) => <button key={position.id} onClick={() => onViewPaperPosition(position.id)} className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-sm text-violet-200">Paper · {position.status} · View</button>)}
                      {testnet.map((position) => <button key={position.id} onClick={() => onViewTestnetPosition(position.id)} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-200">Testnet · {position.status} · View</button>)}
                    </div>
                  </div>
                )}

                {isEditing && (
                  <form onSubmit={(event) => void saveEdit(event, strategy)} className="border-t border-white/10 p-5">
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <Field label="Bot name" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
                      <NumberField label="Risk budget" value={draft.riskBudgetQuote} onChange={(value) => setDraft({ ...draft, riskBudgetQuote: value })} />
                      <NumberField label="Base order" value={draft.baseOrderQuote} onChange={(value) => setDraft({ ...draft, baseOrderQuote: value })} />
                      <NumberField label="Maximum DCA orders" value={draft.maxDcaOrders} onChange={(value) => setDraft({ ...draft, maxDcaOrders: value })} />
                      <NumberField label="DCA step (%)" value={draft.dcaStepPercent} onChange={(value) => setDraft({ ...draft, dcaStepPercent: value })} />
                      <NumberField label="DCA multiplier" value={draft.dcaMultiplier} onChange={(value) => setDraft({ ...draft, dcaMultiplier: value })} />
                      <NumberField label="Take profit (%)" value={draft.takeProfitPercent} onChange={(value) => setDraft({ ...draft, takeProfitPercent: value })} />
                      <NumberField label="Independent from level" value={draft.independentFromLevel} onChange={(value) => setDraft({ ...draft, independentFromLevel: value })} />
                    </div>
                    <div className="mt-5 flex justify-end gap-3">
                      <button type="button" onClick={() => { setEditingId(null); setDraft(null); }} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm">Cancel</button>
                      <button disabled={disabled} type="submit" className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{disabled ? 'Saving…' : 'Save changes'}</button>
                    </div>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 font-semibold">{value}</p></div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-sm text-slate-300">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 outline-none focus:border-cyan-300/60" /></label>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="text-sm text-slate-300">{label}<input type="number" min="0" step="any" value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 outline-none focus:border-cyan-300/60" /></label>;
}
