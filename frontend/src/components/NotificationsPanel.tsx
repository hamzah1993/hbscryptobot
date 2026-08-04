import { useEffect, useMemo, useState } from 'react';
import { api, type NotificationSeverity, type OperationalNotification } from '../lib/api';

type Props = {
  token: string;
};

const severities: Array<'ALL' | NotificationSeverity> = ['ALL', 'INFO', 'WARNING', 'CRITICAL'];

function severityClass(severity: NotificationSeverity) {
  switch (severity) {
    case 'CRITICAL':
      return 'bg-rose-400/15 text-rose-300';
    case 'WARNING':
      return 'bg-amber-400/15 text-amber-300';
    default:
      return 'bg-cyan-400/15 text-cyan-300';
  }
}

function eventLabel(event: string) {
  return event.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

export function NotificationsPanel({ token }: Props) {
  const [notifications, setNotifications] = useState<OperationalNotification[]>([]);
  const [severity, setSeverity] = useState<'ALL' | NotificationSeverity>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadNotifications() {
    setLoading(true);
    setError(null);
    try {
      setNotifications(await api.listNotifications(token, 250));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to load operational notifications');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();
  }, [token]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadNotifications(), 15_000);
    return () => window.clearInterval(timer);
  }, [token]);

  const filtered = useMemo(
    () => notifications.filter((notification) => severity === 'ALL' || notification.severity === severity),
    [notifications, severity],
  );

  const totals = useMemo(() => ({
    total: notifications.length,
    warning: notifications.filter((notification) => notification.severity === 'WARNING').length,
    critical: notifications.filter((notification) => notification.severity === 'CRITICAL').length,
  }), [notifications]);

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Operations</p>
          <h3 className="mt-2 text-2xl font-semibold">Notification history</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Recent Testnet execution, synchronization, failure, and emergency-stop events for this account.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value as 'ALL' | NotificationSeverity)}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none ring-cyan-400/40 focus:ring"
            aria-label="Filter notifications by severity"
          >
            {severities.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button
            type="button"
            onClick={() => void loadNotifications()}
            disabled={loading}
            className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Total</p><p className="mt-2 text-xl font-semibold">{totals.total}</p></article>
        <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Warnings</p><p className="mt-2 text-xl font-semibold text-amber-300">{totals.warning}</p></article>
        <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Critical</p><p className="mt-2 text-xl font-semibold text-rose-300">{totals.critical}</p></article>
      </div>

      {error && <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      <div className="mt-5">
        {loading && notifications.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">Loading notifications…</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">No notifications match the selected severity.</div>
        ) : (
          <ol className="space-y-3">
            {filtered.map((notification) => (
              <li key={notification.id} className="rounded-xl border border-white/10 bg-slate-950/25 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${severityClass(notification.severity)}`}>
                        {notification.severity}
                      </span>
                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-400">
                        {eventLabel(notification.event)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-200">{notification.message}</p>
                  </div>
                  <time className="shrink-0 text-xs text-slate-500">{new Date(notification.createdAt).toLocaleString()}</time>
                </div>

                {(notification.strategyId || notification.positionId || notification.orderId) && (
                  <dl className="mt-4 grid gap-2 border-t border-white/10 pt-4 text-xs text-slate-500 sm:grid-cols-3">
                    <div><dt>Strategy</dt><dd className="mt-1 break-all text-slate-300">{notification.strategyId ?? '—'}</dd></div>
                    <div><dt>Position</dt><dd className="mt-1 break-all text-slate-300">{notification.positionId ?? '—'}</dd></div>
                    <div><dt>Order</dt><dd className="mt-1 break-all text-slate-300">{notification.orderId ?? '—'}</dd></div>
                  </dl>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
