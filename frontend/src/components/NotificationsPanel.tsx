import { useEffect, useMemo, useState } from 'react';
import { api, type NotificationChannelSettings, type NotificationSeverity, type OperationalNotification } from '../lib/api';

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
  const [channels, setChannels] = useState<NotificationChannelSettings | null>(null);
  const [channelBusy, setChannelBusy] = useState(false);
  const [channelMessage, setChannelMessage] = useState<string | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);

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
    void loadChannels();
  }, [token]);

  async function loadChannels() {
    try {
      setChannels(await api.getNotificationChannels(token));
      setChannelError(null);
    } catch (reason: unknown) {
      setChannelError(reason instanceof Error ? reason.message : 'Unable to load notification channels');
    }
  }

  async function saveChannels() {
    if (!channels) return;
    setChannelBusy(true);
    setChannelMessage(null);
    setChannelError(null);
    try {
      const saved = await api.updateNotificationChannels(token, {
        email: {
          enabled: channels.email.enabled,
          address: channels.email.address,
          minimumSeverity: channels.email.minimumSeverity,
        },
        telegram: {
          enabled: channels.telegram.enabled,
          chatId: channels.telegram.chatId,
          minimumSeverity: channels.telegram.minimumSeverity,
        },
      });
      setChannels(saved);
      setChannelMessage('Notification channel settings saved.');
    } catch (reason: unknown) {
      setChannelError(reason instanceof Error ? reason.message : 'Unable to save notification channels');
    } finally {
      setChannelBusy(false);
    }
  }

  async function testChannel(channel: 'email' | 'telegram') {
    setChannelBusy(true);
    setChannelMessage(null);
    setChannelError(null);
    try {
      await api.testNotificationChannel(token, channel);
      setChannelMessage(`${channel === 'email' ? 'Email' : 'Telegram'} test notification delivered.`);
    } catch (reason: unknown) {
      setChannelError(reason instanceof Error ? reason.message : `Unable to test ${channel}`);
    } finally {
      setChannelBusy(false);
    }
  }

  function updateChannel<K extends 'email' | 'telegram'>(channel: K, patch: Partial<NotificationChannelSettings[K]>) {
    setChannels((current) => current ? { ...current, [channel]: { ...current[channel], ...patch } } : current);
    setChannelMessage(null);
  }

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
    <>
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Delivery</p>
        <h3 className="mt-2 text-2xl font-semibold">Telegram &amp; email</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Send trading lifecycle and operational alerts outside the dashboard. Provider credentials stay on the server; only your destinations and alert thresholds are stored here.
        </p>
      </div>

      {channels ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <article className="rounded-2xl border border-white/10 bg-slate-950/30 p-5">
            <div className="flex items-start justify-between gap-4">
              <div><h4 className="font-semibold">Telegram</h4><p className="mt-1 text-xs text-slate-500">Bot message to your Telegram chat.</p></div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${channels.telegram.providerConfigured ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>
                {channels.telegram.providerConfigured ? 'Provider ready' : 'Server setup needed'}
              </span>
            </div>
            <label className="mt-5 flex items-center gap-3 text-sm text-slate-300">
              <input type="checkbox" checked={channels.telegram.enabled} onChange={(event) => updateChannel('telegram', { enabled: event.target.checked })} className="h-4 w-4 accent-cyan-400" />
              Enable Telegram notifications
            </label>
            <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-slate-500">Telegram chat ID
              <input value={channels.telegram.chatId} onChange={(event) => updateChannel('telegram', { chatId: event.target.value })} placeholder="e.g. 123456789" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm normal-case tracking-normal text-slate-200 outline-none ring-cyan-400/40 focus:ring" />
            </label>
            <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-slate-500">Minimum severity
              <select value={channels.telegram.minimumSeverity} onChange={(event) => updateChannel('telegram', { minimumSeverity: event.target.value as NotificationSeverity })} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm normal-case tracking-normal text-slate-200 outline-none">
                <option value="INFO">Info — all alerts</option><option value="WARNING">Warning &amp; critical</option><option value="CRITICAL">Critical only</option>
              </select>
            </label>
            <button type="button" disabled={channelBusy || !channels.telegram.enabled || !channels.telegram.providerConfigured} onClick={() => void testChannel('telegram')} className="mt-4 rounded-xl border border-cyan-400/30 px-3 py-2 text-sm font-semibold text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40">Send Telegram test</button>
          </article>

          <article className="rounded-2xl border border-white/10 bg-slate-950/30 p-5">
            <div className="flex items-start justify-between gap-4">
              <div><h4 className="font-semibold">Email</h4><p className="mt-1 text-xs text-slate-500">Operational alert to your chosen inbox.</p></div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${channels.email.providerConfigured ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>
                {channels.email.providerConfigured ? 'Provider ready' : 'Server setup needed'}
              </span>
            </div>
            <label className="mt-5 flex items-center gap-3 text-sm text-slate-300">
              <input type="checkbox" checked={channels.email.enabled} onChange={(event) => updateChannel('email', { enabled: event.target.checked })} className="h-4 w-4 accent-cyan-400" />
              Enable email notifications
            </label>
            <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-slate-500">Destination email
              <input type="email" value={channels.email.address} onChange={(event) => updateChannel('email', { address: event.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm normal-case tracking-normal text-slate-200 outline-none ring-cyan-400/40 focus:ring" />
            </label>
            <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-slate-500">Minimum severity
              <select value={channels.email.minimumSeverity} onChange={(event) => updateChannel('email', { minimumSeverity: event.target.value as NotificationSeverity })} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm normal-case tracking-normal text-slate-200 outline-none">
                <option value="INFO">Info — all alerts</option><option value="WARNING">Warning &amp; critical</option><option value="CRITICAL">Critical only</option>
              </select>
            </label>
            <button type="button" disabled={channelBusy || !channels.email.enabled || !channels.email.providerConfigured} onClick={() => void testChannel('email')} className="mt-4 rounded-xl border border-cyan-400/30 px-3 py-2 text-sm font-semibold text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40">Send email test</button>
          </article>
        </div>
      ) : <div className="mt-5 py-6 text-sm text-slate-500">Loading delivery settings…</div>}

      {channelError && <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{channelError}</div>}
      {channelMessage && <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{channelMessage}</div>}
      <button type="button" onClick={() => void saveChannels()} disabled={!channels || channelBusy} className="mt-5 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">
        {channelBusy ? 'Working…' : 'Save delivery settings'}
      </button>
    </section>

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
    </>
  );
}
