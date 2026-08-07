import { useEffect, useState } from 'react';
import { api, type ProductionReadiness } from '../lib/api';

export function ProductionReadinessPanel({ token }: { token: string }) {
  const [snapshot, setSnapshot] = useState<ProductionReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capitalCeiling, setCapitalCeiling] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => api.getProductionReadiness(token)
      .then((result) => { if (!cancelled) { setSnapshot(result); setCapitalCeiling(result.liveSafetyProfile.capitalCeilingQuote?.toString() ?? ''); setError(null); } })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load production readiness'); });
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [token]);

  async function saveCapitalCeiling() {
    const amount = Number(capitalCeiling);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a LIVE capital ceiling greater than zero.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.setLiveTradingCapitalCeiling(token, amount);
      setSnapshot(await api.getProductionReadiness(token));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to save LIVE capital ceiling');
    } finally {
      setBusy(false);
    }
  }

  async function confirmLiveTrading() {
    if (!snapshot?.liveConfirmationAvailable) return;
    setBusy(true);
    setError(null);
    try {
      await api.confirmLiveTrading(token, confirmation);
      setSnapshot(await api.getProductionReadiness(token));
      setConfirmation('');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'LIVE confirmation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-300/[0.05] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Production gate</p><h3 className="mt-2 text-xl font-semibold">Live-money readiness</h3><p className="mt-1 text-sm text-slate-400">Operational hardening and real-money authorization are separate. LIVE routing stays locked until every explicit gate is implemented and passes.</p></div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${snapshot?.liveMoneyReady ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-200'}`}>{snapshot?.liveMoneyReady ? 'LIVE READY' : 'LIVE BLOCKED'}</span>
      </div>
      {error && <p className="mt-4 text-sm text-amber-200">{error}</p>}
      {snapshot && <>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ReadinessMetric label="Latency evidence" value={`${snapshot.executionEvidence.sampleCount}/${snapshot.executionEvidence.minimumSamples} samples`} good={snapshot.executionEvidence.meetsTarget} />
          <ReadinessMetric label="p95 signal → order" value={snapshot.executionEvidence.p95Ms === null ? 'No samples' : `${snapshot.executionEvidence.p95Ms} ms`} good={snapshot.executionEvidence.meetsTarget} />
          <ReadinessMetric label="Production hardening" value={snapshot.productionHardeningReady ? 'PASS' : 'BLOCKED'} good={snapshot.productionHardeningReady} />
          <ReadinessMetric label="Retry policy" value={`1 + ${snapshot.executionEvidence.retryPolicy.retries} ${snapshot.executionEvidence.retryPolicy.backoff}`} good />
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Object.entries(snapshot.liveChecks).map(([name, passed]) => <div key={name} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm"><span className="text-slate-300">{label(name)}</span><span className={passed ? 'text-emerald-300' : 'text-rose-300'}>{passed ? 'PASS' : 'BLOCKED'}</span></div>)}
        </div>
        <div className="mt-5 rounded-xl border border-white/10 bg-slate-950/30 p-4">
          <p className="text-sm font-semibold text-slate-200">LIVE capital ceiling</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">This is a separate hard ceiling for the initial real-money rollout. Changing it invalidates any previous LIVE acknowledgement.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input type="number" min="0.01" step="0.01" value={capitalCeiling} onChange={(event) => setCapitalCeiling(event.target.value)} placeholder="USDT ceiling" className="rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm outline-none ring-amber-300/40 focus:ring" />
            <button type="button" disabled={busy} onClick={() => void saveCapitalCeiling()} className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm font-semibold text-amber-100 disabled:opacity-50">Save ceiling</button>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-4">
          <p className="text-sm font-semibold text-rose-100">Explicit LIVE activation acknowledgement</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">Binance LIVE stays locked until its Testnet W2W, routing, credentials, notifications, emergency-exit verification, latency and server feature-flag gates pass. Bybit/OKX are tracked separately and do not block Binance.</p>
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={!snapshot.liveConfirmationAvailable || busy} placeholder={snapshot.liveConfirmationAvailable ? 'I UNDERSTAND LIVE TRADING USES REAL MONEY' : 'Locked — prerequisites incomplete'} className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50" />
          <button type="button" disabled={!snapshot.liveConfirmationAvailable || busy} onClick={() => void confirmLiveTrading()} className="mt-3 rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Confirm LIVE acknowledgement</button>
          {snapshot.liveSafetyProfile.confirmedAt && <p className="mt-3 text-xs text-emerald-300">Acknowledged {new Date(snapshot.liveSafetyProfile.confirmedAt).toLocaleString()}.</p>}
        </div>
      </>}
    </section>
  );
}

function ReadinessMetric({ label: name, value, good }: { label: string; value: string; good: boolean }) {
  return <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">{name}</p><p className={`mt-2 font-semibold ${good ? 'text-emerald-300' : 'text-amber-200'}`}>{value}</p></div>;
}

function label(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (character) => character.toUpperCase());
}
