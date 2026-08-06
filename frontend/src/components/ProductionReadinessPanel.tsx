import { useEffect, useState } from 'react';
import { api, type ProductionReadiness } from '../lib/api';

export function ProductionReadinessPanel({ token }: { token: string }) {
  const [snapshot, setSnapshot] = useState<ProductionReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => api.getProductionReadiness(token)
      .then((result) => { if (!cancelled) { setSnapshot(result); setError(null); } })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load production readiness'); });
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [token]);

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
