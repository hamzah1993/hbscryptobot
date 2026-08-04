import { useEffect } from 'react';
import type { OperationalNotification } from '../lib/api';

type Props = {
  notifications: OperationalNotification[];
  onDismiss: (id: string) => void;
};

const autoDismissMilliseconds: Record<OperationalNotification['severity'], number> = {
  INFO: 6_000,
  WARNING: 10_000,
  CRITICAL: 15_000,
};

function severityClasses(severity: OperationalNotification['severity']) {
  switch (severity) {
    case 'CRITICAL':
      return 'border-rose-400/40 bg-rose-400/15 text-rose-100';
    case 'WARNING':
      return 'border-amber-400/40 bg-amber-400/15 text-amber-100';
    default:
      return 'border-cyan-400/40 bg-cyan-400/15 text-cyan-100';
  }
}

export function NotificationToastStack({ notifications, onDismiss }: Props) {
  useEffect(() => {
    const timers = notifications.map((notification) => window.setTimeout(
      () => onDismiss(notification.id),
      autoDismissMilliseconds[notification.severity],
    ));

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [notifications, onDismiss]);

  if (notifications.length === 0) return null;

  return (
    <aside className="fixed right-4 top-4 z-[70] flex w-[min(92vw,420px)] flex-col gap-3" aria-live="polite">
      {notifications.map((notification) => (
        <article
          key={notification.id}
          className={`rounded-2xl border p-4 shadow-2xl backdrop-blur ${severityClasses(notification.severity)}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">{notification.severity}</p>
              <p className="mt-2 text-sm leading-6">{notification.message}</p>
              <p className="mt-2 text-xs opacity-70">{new Date(notification.createdAt).toLocaleString()}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(notification.id)}
              className="rounded-lg border border-current/20 px-2 py-1 text-xs font-semibold opacity-80 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              Dismiss
            </button>
          </div>
        </article>
      ))}
    </aside>
  );
}
