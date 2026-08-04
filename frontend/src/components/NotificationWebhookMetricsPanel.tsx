import { useEffect, useState } from 'react';
import {
  notificationWebhookMetricsApi,
  type NotificationWebhookMetrics,
} from '../lib/notification-webhook-metrics-api';

type Props = {
  token: string;
};

function timestamp(value?: string) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

export function NotificationWebhookMetricsPanel({ token }: Props) {
  const [metrics, setMetrics] = useState<NotificationWebhookMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMetrics() {
    setLoading(true);
    setError(null);
    try {
      setMetrics(await notificationWebhookMetricsApi.get(token));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to load webhook delivery metrics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMetrics();
    const timer = window.setInterval(() => void loadMetrics(), 15_000);
    return () => window.clearInterval(timer);
  }, [token]);

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Delivery health</p>
          <h3 className="mt-2 text-xl font-semibold">Webhook metrics</h3>
          <p className="mt-2 text-sm text-slate-400">
            In-memory delivery counters for configured operational notification webhooks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadMetrics()}
          disabled={loading}
          className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh metrics'}
        </button>
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {metrics && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Attempts</p>
              <p className="mt-2 text-xl font-semibold">{metrics.attempted}</p>
            </article>
            <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Delivered</p>
              <p className="mt-2 text-xl font-semibold text-emerald-300">{metrics.delivered}</p>
            </article>
            <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Failed</p>
              <p className="mt-2 text-xl font-semibold text-rose-300">{metrics.failed}</p>
            </article>
            <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">Retries</p>
              <p className="mt-2 text-xl font-semibold text-amber-300">{metrics.retried}</p>
            </article>
          </div>

          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-slate-950/20 p-4">
              <dt className="text-slate-500">Last attempt</dt>
              <dd className="mt-1 text-slate-200">{timestamp(metrics.lastAttemptAt)}</dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/20 p-4">
              <dt className="text-slate-500">Last success</dt>
              <dd className="mt-1 text-slate-200">{timestamp(metrics.lastSuccessAt)}</dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/20 p-4">
              <dt className="text-slate-500">Last failure</dt>
              <dd className="mt-1 text-slate-200">{timestamp(metrics.lastFailureAt)}</dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/20 p-4">
              <dt className="text-slate-500">Last HTTP status</dt>
              <dd className="mt-1 text-slate-200">{metrics.lastStatusCode ?? '—'}</dd>
            </div>
          </dl>
        </>
      )}

      {!metrics && loading && !error && (
        <div className="py-8 text-center text-sm text-slate-500">Loading webhook metrics…</div>
      )}
    </section>
  );
}
