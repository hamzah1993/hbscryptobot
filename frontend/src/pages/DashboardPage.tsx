import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { CreateBotWizard } from '../components/CreateBotWizard';
import { ExchangeAccountsPanel } from '../components/ExchangeAccountsPanel';
import { MarketChartPanel } from '../components/MarketChartPanel';
import { NotificationsPanel } from '../components/NotificationsPanel';
import { NotificationToastStack } from '../components/NotificationToastStack';
import { PortfolioAnalytics } from '../components/PortfolioAnalytics';
import { TestnetActionTimelinePanel } from '../components/TestnetActionTimelinePanel';
import { TestnetOrdersPanel } from '../components/TestnetOrdersPanel';
import { TestnetPositionsPanel } from '../components/TestnetPositionsPanel';
import {
  api,
  type BinanceStreamEnvironment,
  type MarketStreamStatus,
  type OperationalNotification,
  type StrategyStatus,
  type TestnetEmergencyStopResponse,
  type TradingPosition,
} from '../lib/api';

const navigation = ['Overview', 'Bots', 'Positions', 'Strategies', 'Notifications', 'Exchange accounts', 'Trade history'];
const notificationSeenStorageKey = 'hbs-notifications-last-seen-at';
const notificationToastStorageKey = 'hbs-notifications-last-toast-at';
const browserNotificationStorageKey = 'hbs-browser-notifications-enabled';
const notificationSoundStorageKey = 'hbs-notification-sounds-enabled';

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function playNotificationSound(severity: OperationalNotification['severity']) {
  const audioWindow = window as AudioWindow;
  const AudioContextClass = audioWindow.AudioContext || audioWindow.webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = severity === 'CRITICAL' ? 'square' : 'sine';
  oscillator.frequency.value = severity === 'CRITICAL' ? 880 : 660;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.25);
  oscillator.addEventListener('ended', () => void context.close());
}

export function DashboardPage() {
  const { user, token, logout } = useAuth();
  const [activeNav, setActiveNav] = useState('Overview');
  const [mode, setMode] = useState<'paper' | 'live'>('paper');
  const [positions, setPositions] = useState<TradingPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateBot, setShowCreateBot] = useState(false);
  const [expandedPositionId, setExpandedPositionId] = useState<string | null>(null);
  const [updatingStrategyId, setUpdatingStrategyId] = useState<string | null>(null);
  const [marketSymbol, setMarketSymbol] = useState('BTCUSDT');
  const [marketEnvironment, setMarketEnvironment] = useState<BinanceStreamEnvironment>('testnet');
  const [streamStatus, setStreamStatus] = useState<MarketStreamStatus | null>(null);
  const [streamBusy, setStreamBusy] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [showEmergencyStopConfirm, setShowEmergencyStopConfirm] = useState(false);
  const [emergencyStopBusy, setEmergencyStopBusy] = useState(false);
  const [emergencyStopResult, setEmergencyStopResult] = useState<TestnetEmergencyStopResponse | null>(null);
  const [emergencyStopError, setEmergencyStopError] = useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [toastNotifications, setToastNotifications] = useState<OperationalNotification[]>([]);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(
    () => window.localStorage.getItem(browserNotificationStorageKey) === 'true',
  );
  const [notificationSoundsEnabled, setNotificationSoundsEnabled] = useState(
    () => window.localStorage.getItem(notificationSoundStorageKey) === 'true',
  );
  const initializedNotificationPolling = useRef(false);

  function loadPositions() {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    api.listPaperPositions(token)
      .then(setPositions)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load positions'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadPositions();
  }, [token]);

  useEffect(() => {
    if (!token) {
      setUnreadNotifications(0);
      setToastNotifications([]);
      initializedNotificationPolling.current = false;
      return;
    }

    let cancelled = false;
    const refreshNotifications = async () => {
      try {
        const notifications = await api.listNotifications(token, 250);
        if (cancelled) return;

        const seenAt = Number(window.localStorage.getItem(notificationSeenStorageKey) ?? 0);
        setUnreadNotifications(
          notifications.filter((notification) => new Date(notification.createdAt).getTime() > seenAt).length,
        );

        const latestTimestamp = notifications.reduce(
          (latest, notification) => Math.max(latest, new Date(notification.createdAt).getTime()),
          0,
        );
        const lastToastAt = Number(window.localStorage.getItem(notificationToastStorageKey) ?? 0);

        if (initializedNotificationPolling.current) {
          const freshOperationalAlerts = notifications
            .filter((notification) => (
              notification.severity !== 'INFO' && new Date(notification.createdAt).getTime() > lastToastAt
            ))
            .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
            .slice(-3);

          if (freshOperationalAlerts.length > 0) {
            setToastNotifications((current) => {
              const merged = [...current];
              for (const notification of freshOperationalAlerts) {
                if (!merged.some((item) => item.id === notification.id)) merged.push(notification);
              }
              return merged.slice(-3);
            });

            if (notificationSoundsEnabled) {
              playNotificationSound(
                freshOperationalAlerts.some((notification) => notification.severity === 'CRITICAL')
                  ? 'CRITICAL'
                  : 'WARNING',
              );
            }

            if (
              browserNotificationsEnabled &&
              'Notification' in window &&
              window.Notification.permission === 'granted' &&
              document.visibilityState !== 'visible'
            ) {
              for (const notification of freshOperationalAlerts) {
                new window.Notification(`HBS Trading · ${notification.severity}`, {
                  body: notification.message,
                  tag: notification.id,
                });
              }
            }
          }
        } else {
          initializedNotificationPolling.current = true;
        }

        if (latestTimestamp > lastToastAt) {
          window.localStorage.setItem(notificationToastStorageKey, String(latestTimestamp));
        }
      } catch {
        if (!cancelled) setUnreadNotifications(0);
      }
    };

    void refreshNotifications();
    const interval = window.setInterval(() => void refreshNotifications(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token, browserNotificationsEnabled, notificationSoundsEnabled]);

  useEffect(() => {
    if (activeNav !== 'Notifications') return;
    window.localStorage.setItem(notificationSeenStorageKey, String(Date.now()));
    setUnreadNotifications(0);
  }, [activeNav]);

  async function enableBrowserNotifications() {
    if (!('Notification' in window)) return;
    const permission = await window.Notification.requestPermission();
    const enabled = permission === 'granted';
    setBrowserNotificationsEnabled(enabled);
    window.localStorage.setItem(browserNotificationStorageKey, String(enabled));
  }

  function disableBrowserNotifications() {
    setBrowserNotificationsEnabled(false);
    window.localStorage.setItem(browserNotificationStorageKey, 'false');
  }

  function toggleNotificationSounds() {
    const enabled = !notificationSoundsEnabled;
    setNotificationSoundsEnabled(enabled);
    window.localStorage.setItem(notificationSoundStorageKey, String(enabled));
    if (enabled) playNotificationSound('WARNING');
  }

  useEffect(() => {
    if (
      !token ||
      activeNav === 'Exchange accounts' ||
      activeNav === 'Trade history' ||
      activeNav === 'Positions' ||
      activeNav === 'Strategies' ||
      activeNav === 'Notifications'
    ) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const status = await api.getMarketStreamStatus(token, marketSymbol, marketEnvironment);
        if (!cancelled) {
          setStreamStatus(status);
          setStreamError(null);
        }
      } catch (reason: unknown) {
        if (!cancelled) {
          setStreamError(reason instanceof Error ? reason.message : 'Unable to load market stream status');
        }
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token, marketSymbol, marketEnvironment, activeNav]);

  async function updateStrategyStatus(strategyId: string, status: StrategyStatus) {
    if (!token) return;
    setUpdatingStrategyId(strategyId);
    setError(null);
    try {
      const strategy = await api.setStrategyStatus(token, strategyId, status);
      setPositions((current) => current.map((position) => (
        position.strategy.id === strategyId
          ? { ...position, strategy: { ...position.strategy, ...strategy } }
          : position
      )));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to update strategy');
    } finally {
      setUpdatingStrategyId(null);
    }
  }

  async function runEmergencyStop() {
    if (!token) return;
    setEmergencyStopBusy(true);
    setEmergencyStopError(null);
    setEmergencyStopResult(null);
    try {
      const result = await api.stopTestnetStrategies(token);
      setEmergencyStopResult(result);
      setShowEmergencyStopConfirm(false);
    } catch (reason: unknown) {
      setEmergencyStopError(reason instanceof Error ? reason.message : 'Unable to stop Testnet strategies');
    } finally {
      setEmergencyStopBusy(false);
    }
  }

  async function subscribeMarketStream() {
    if (!token) return;
    setStreamBusy(true);
    setStreamError(null);
    try {
      const status = await api.subscribeMarketStream(token, marketSymbol, marketEnvironment);
      setStreamStatus(status);
    } catch (reason: unknown) {
      setStreamError(reason instanceof Error ? reason.message : 'Unable to start market stream');
    } finally {
      setStreamBusy(false);
    }
  }

  async function unsubscribeMarketStream() {
    if (!token) return;
    setStreamBusy(true);
    setStreamError(null);
    try {
      await api.unsubscribeMarketStream(token, marketSymbol, marketEnvironment);
      const status = await api.getMarketStreamStatus(token, marketSymbol, marketEnvironment);
      setStreamStatus(status);
    } catch (reason: unknown) {
      setStreamError(reason instanceof Error ? reason.message : 'Unable to stop market stream');
    } finally {
      setStreamBusy(false);
    }
  }

  const openPositions = positions.filter((position) => position.status === 'OPEN');
  const invested = openPositions.reduce((sum, position) => sum + Number(position.totalCostQuote), 0);
  const realizedPnl = positions.reduce((sum, position) => sum + Number(position.realizedPnlQuote), 0);
  const runningBots = new Set(openPositions.filter((position) => position.strategy.status === 'RUNNING').map((position) => position.strategy.id)).size;
  const independentPositions = positions.flatMap((position) => position.subPositions ?? []);
  const openIndependentPositions = independentPositions.filter((subPosition) => subPosition.status === 'OPEN');

  const initials = useMemo(
    () => user?.fullName?.split(' ').map((name) => name[0]).join('').slice(0, 2).toUpperCase() || 'HB',
    [user?.fullName],
  );

  const stats = [
    { label: 'Allocated capital', value: money(invested), change: `${openPositions.length} open position${openPositions.length === 1 ? '' : 's'}` },
    { label: 'Realized P&L', value: money(realizedPnl), change: realizedPnl >= 0 ? 'Paper trading gains' : 'Paper trading loss' },
    { label: 'Running bots', value: String(runningBots), change: 'Strategies actively processed by the scheduler' },
    { label: 'Independent legs', value: String(openIndependentPositions.length), change: `${independentPositions.length} total sub-position${independentPositions.length === 1 ? '' : 's'}` },
  ];

  const secondaryPage =
    activeNav === 'Exchange accounts' ||
    activeNav === 'Trade history' ||
    activeNav === 'Positions' ||
    activeNav === 'Strategies' ||
    activeNav === 'Notifications';
  const pageTitle = activeNav === 'Exchange accounts'
    ? 'Exchange accounts'
    : activeNav === 'Trade history'
      ? 'Testnet orders'
      : activeNav === 'Positions'
        ? 'Testnet positions'
        : activeNav === 'Strategies'
          ? 'Strategy action timeline'
          : activeNav === 'Notifications'
            ? 'Operational notifications'
            : 'Trading dashboard';

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <NotificationToastStack
        notifications={toastNotifications}
        onDismiss={(id) => setToastNotifications((current) => current.filter((notification) => notification.id !== id))}
      />

      {showCreateBot && token && (
        <CreateBotWizard
          token={token}
          onClose={() => setShowCreateBot(false)}
          onCreated={() => {
            setShowCreateBot(false);
            loadPositions();
          }}
        />
      )}

      {showEmergencyStopConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <section className="w-full max-w-lg rounded-2xl border border-rose-400/30 bg-[#0a1728] p-6 shadow-2xl shadow-rose-950/40">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300">Testnet safety control</p>
            <h3 className="mt-3 text-2xl font-semibold">Stop all Testnet strategies?</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              This stops every running or paused non-paper Testnet strategy and cancels pending strategy actions. It does not cancel already-submitted Binance orders or close open positions.
            </p>
            {emergencyStopError && <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{emergencyStopError}</p>}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={emergencyStopBusy}
                onClick={() => setShowEmergencyStopConfirm(false)}
                className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 disabled:opacity-50"
              >
                Keep running
              </button>
              <button
                type="button"
                disabled={emergencyStopBusy}
                onClick={() => void runEmergencyStop()}
                className="rounded-xl bg-rose-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
              >
                {emergencyStopBusy ? 'Stopping…' : 'Confirm emergency stop'}
              </button>
            </div>
          </section>
        </div>
      )}

      <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-white/10 bg-[#0a1728] px-5 py-5 lg:min-h-screen lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between lg:block">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-400">HBS Trading</p>
              <h1 className="mt-2 text-xl font-semibold">Control Center</h1>
            </div>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">Systems online</span>
          </div>

          <nav className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {navigation.map((item) => (
              <button key={item} onClick={() => setActiveNav(item)} className={`flex items-center justify-between rounded-xl px-4 py-3 text-left text-sm transition ${activeNav === item ? 'bg-cyan-400 text-slate-950' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
                <span>{item}</span>
                {item === 'Notifications' && unreadNotifications > 0 && (
                  <span className={`ml-3 rounded-full px-2 py-0.5 text-xs font-semibold ${activeNav === item ? 'bg-slate-950/15 text-slate-950' : 'bg-rose-400/20 text-rose-200'}`}>
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <header className="flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-slate-400">Welcome back, {user?.fullName}</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight">{pageTitle}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={toggleNotificationSounds}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.08]"
              >
                {notificationSoundsEnabled ? 'Disable sounds' : 'Enable sounds'}
              </button>
              {'Notification' in window && (
                browserNotificationsEnabled ? (
                  <button
                    type="button"
                    onClick={disableBrowserNotifications}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.08]"
                  >
                    Disable browser alerts
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void enableBrowserNotifications()}
                    className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/20"
                  >
                    Enable browser alerts
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => {
                  setEmergencyStopError(null);
                  setShowEmergencyStopConfirm(true);
                }}
                className="rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-2.5 text-sm font-semibold text-rose-200 hover:bg-rose-400/20"
              >
                Emergency stop
              </button>
              {!secondaryPage && (
                <>
                  <div className="flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
                    <button onClick={() => setMode('paper')} className={`rounded-lg px-3 py-2 text-sm ${mode === 'paper' ? 'bg-cyan-400 text-slate-950' : 'text-slate-400'}`}>Paper</button>
                    <button onClick={() => setMode('live')} className={`rounded-lg px-3 py-2 text-sm ${mode === 'live' ? 'bg-rose-400 text-slate-950' : 'text-slate-400'}`}>Live</button>
                  </div>
                  <button onClick={() => setShowCreateBot(true)} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950">Create bot</button>
                </>
              )}
              <button onClick={logout} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm font-semibold">{initials}</button>
            </div>
          </header>

          {emergencyStopResult && (
            <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              Emergency stop completed at {new Date(emergencyStopResult.stoppedAt).toLocaleString()}. Stopped {emergencyStopResult.stoppedStrategies} strateg{emergencyStopResult.stoppedStrategies === 1 ? 'y' : 'ies'} and cancelled {emergencyStopResult.cancelledPendingActions} pending action{emergencyStopResult.cancelledPendingActions === 1 ? '' : 's'}.
            </div>
          )}

          {activeNav === 'Exchange accounts' && token ? (
            <ExchangeAccountsPanel token={token} />
          ) : activeNav === 'Trade history' && token ? (
            <TestnetOrdersPanel token={token} />
          ) : activeNav === 'Positions' && token ? (
            <TestnetPositionsPanel token={token} />
          ) : activeNav === 'Strategies' && token ? (
            <TestnetActionTimelinePanel token={token} />
          ) : activeNav === 'Notifications' && token ? (
            <NotificationsPanel token={token} />
          ) : (
            <>
              {error && <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

              <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((stat) => (
                  <article key={stat.label} className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5">
                    <p className="text-sm text-slate-400">{stat.label}</p>
                    <p className="mt-3 text-2xl font-semibold">{loading ? '—' : stat.value}</p>
                    <p className="mt-2 text-xs text-cyan-300">{stat.change}</p>
                  </article>
                ))}
              </section>

              <PortfolioAnalytics positions={positions} loading={loading} />

              {token && <MarketChartPanel token={token} />}

              <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/[0.09] via-white/[0.03] to-violet-400/[0.08] p-5 sm:p-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">Live market</h3>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${streamStatus?.connected ? 'bg-emerald-400/15 text-emerald-300' : streamStatus?.subscribed ? 'bg-amber-400/15 text-amber-300' : 'bg-slate-400/10 text-slate-400'}`}>
                        {streamStatus?.connected ? 'Connected' : streamStatus?.subscribed ? 'Reconnecting' : 'Disconnected'}
                      </span>
                      <span className="rounded-full border border-white/10 bg-slate-950/30 px-2.5 py-1 text-xs uppercase tracking-wider text-slate-400">Public data only</span>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm text-slate-400">Real-time Binance ticker streaming. Live market data does not enable live order execution.</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[minmax(150px,1fr)_140px_auto]">
                    <input
                      value={marketSymbol}
                      onChange={(event) => setMarketSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      aria-label="Market symbol"
                      className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none ring-cyan-400/40 placeholder:text-slate-600 focus:ring"
                      placeholder="BTCUSDT"
                    />
                    <select
                      value={marketEnvironment}
                      onChange={(event) => setMarketEnvironment(event.target.value as BinanceStreamEnvironment)}
                      className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none ring-cyan-400/40 focus:ring"
                    >
                      <option value="testnet">Testnet</option>
                      <option value="live">Live public</option>
                    </select>
                    {streamStatus?.subscribed ? (
                      <button disabled={streamBusy} onClick={unsubscribeMarketStream} className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-200 disabled:opacity-50">Stop stream</button>
                    ) : (
                      <button disabled={streamBusy || !marketSymbol} onClick={subscribeMarketStream} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">Start stream</button>
                    )}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <article className="rounded-2xl border border-white/10 bg-slate-950/30 p-5 md:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{(streamStatus?.symbol ?? marketSymbol) || 'Market'}</p>
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                      <div>
                        <p className="text-4xl font-semibold tracking-tight sm:text-5xl">
                          {streamStatus?.latestPrice ? money(streamStatus.latestPrice.price) : '—'}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          {streamStatus?.latestPrice
                            ? `Updated ${new Date(streamStatus.latestPrice.receivedAt).toLocaleTimeString()}`
                            : 'Start the stream to receive a live ticker price'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-right">
                        <p className="text-xs text-slate-500">Environment</p>
                        <p className="mt-1 text-sm font-semibold uppercase text-cyan-300">{marketEnvironment}</p>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-white/10 bg-slate-950/30 p-5">
                    <p className="text-sm font-medium">Stream health</p>
                    <dl className="mt-4 space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Subscribed</dt><dd>{streamStatus?.subscribed ? 'Yes' : 'No'}</dd></div>
                      <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Connection</dt><dd>{streamStatus?.connected ? 'Online' : 'Offline'}</dd></div>
                      <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Reconnects</dt><dd>{streamStatus?.reconnectAttempts ?? 0}</dd></div>
                    </dl>
                    {streamError && <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{streamError}</p>}
                  </article>
                </div>
              </section>

              <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Paper trading positions</h3>
                    <p className="mt-1 text-sm text-slate-400">Parent positions and Royal Q-style independent legs</p>
                  </div>
                  <button onClick={() => setShowCreateBot(true)} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">New paper bot</button>
                </div>

                {loading ? (
                  <div className="mt-6 rounded-xl border border-dashed border-white/10 p-10 text-center text-slate-400">Loading positions…</div>
                ) : positions.length === 0 ? (
                  <div className="mt-6 rounded-xl border border-dashed border-white/10 p-10 text-center text-slate-400">
                    <p>No paper positions yet.</p>
                    <button onClick={() => setShowCreateBot(true)} className="mt-4 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950">Create your first bot</button>
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {positions.map((position) => {
                      const subPositions = position.subPositions ?? [];
                      const isExpanded = expandedPositionId === position.id;
                      const strategyStatus = position.strategy.status ?? 'STOPPED';
                      const isUpdating = updatingStrategyId === position.strategy.id;

                      return (
                        <article key={position.id} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/20">
                          <div className="grid gap-4 px-4 py-4 sm:grid-cols-[1.2fr_0.8fr_1fr_1fr_auto] sm:items-center">
                            <button type="button" onClick={() => setExpandedPositionId(isExpanded ? null : position.id)} className="text-left">
                              <p className="font-semibold">{position.symbol}</p>
                              <p className="mt-1 text-xs text-slate-500">{position.strategy.name}</p>
                            </button>
                            <div className="space-y-2">
                              <span className={`rounded-full px-2.5 py-1 text-xs ${position.status === 'OPEN' ? 'bg-cyan-400/10 text-cyan-300' : 'bg-slate-400/10 text-slate-300'}`}>{position.status}</span>
                              <div><span className={`rounded-full px-2.5 py-1 text-xs ${strategyStatus === 'RUNNING' ? 'bg-emerald-400/10 text-emerald-300' : strategyStatus === 'PAUSED' ? 'bg-amber-400/10 text-amber-300' : 'bg-slate-400/10 text-slate-300'}`}>{strategyStatus}</span></div>
                            </div>
                            <div><p className="text-xs text-slate-500">Invested</p><p className="mt-1">{money(Number(position.totalCostQuote))}</p></div>
                            <div><p className="text-xs text-slate-500">Independent legs</p><p className="mt-1">{subPositions.filter((subPosition) => subPosition.status === 'OPEN').length}/{subPositions.length}</p></div>
                            <button type="button" onClick={() => setExpandedPositionId(isExpanded ? null : position.id)} className="text-sm text-cyan-300">{isExpanded ? 'Hide' : 'Details'}</button>
                          </div>

                          <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
                            {strategyStatus !== 'RUNNING' && (
                              <button disabled={isUpdating} onClick={() => updateStrategyStatus(position.strategy.id, 'RUNNING')} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">Start</button>
                            )}
                            {strategyStatus === 'RUNNING' && (
                              <button disabled={isUpdating} onClick={() => updateStrategyStatus(position.strategy.id, 'PAUSED')} className="rounded-lg bg-amber-300 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">Pause</button>
                            )}
                            {strategyStatus !== 'STOPPED' && (
                              <button disabled={isUpdating} onClick={() => updateStrategyStatus(position.strategy.id, 'STOPPED')} className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-50">Stop</button>
                            )}
                            {isUpdating && <span className="self-center text-xs text-slate-500">Updating strategy…</span>}
                          </div>

                          {isExpanded && (
                            <div className="border-t border-white/10 px-4 py-4">
                              <div className="grid gap-3 sm:grid-cols-4">
                                <div><p className="text-xs text-slate-500">Average entry</p><p className="mt-1">{money(Number(position.averageEntryPrice))}</p></div>
                                <div><p className="text-xs text-slate-500">DCA progress</p><p className="mt-1">{position.dcaCount}/{position.strategy.maxDcaOrders}</p></div>
                                <div><p className="text-xs text-slate-500">Parent take profit</p><p className="mt-1">{position.takeProfitPrice ? money(Number(position.takeProfitPrice)) : '—'}</p></div>
                                <div><p className="text-xs text-slate-500">Realized P&L</p><p className={`mt-1 font-medium ${Number(position.realizedPnlQuote) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{money(Number(position.realizedPnlQuote))}</p></div>
                              </div>

                              <div className="mt-5">
                                <h4 className="text-sm font-semibold">Independent sub-positions</h4>
                                {subPositions.length === 0 ? (
                                  <p className="mt-3 rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-500">No independent DCA level has been opened yet.</p>
                                ) : (
                                  <div className="mt-3 overflow-x-auto">
                                    <table className="w-full min-w-[720px] text-left text-sm">
                                      <thead className="text-xs uppercase tracking-wider text-slate-500">
                                        <tr><th className="pb-3">Level</th><th className="pb-3">Status</th><th className="pb-3">Cost</th><th className="pb-3">Entry</th><th className="pb-3">Take profit</th><th className="pb-3">Realized P&L</th></tr>
                                      </thead>
                                      <tbody>
                                        {subPositions.map((subPosition) => (
                                          <tr key={subPosition.id} className="border-t border-white/5">
                                            <td className="py-3">#{subPosition.level}</td>
                                            <td className="py-3">{subPosition.status}</td>
                                            <td className="py-3">{money(Number(subPosition.costQuote))}</td>
                                            <td className="py-3">{money(Number(subPosition.entryPrice))}</td>
                                            <td className="py-3">{money(Number(subPosition.takeProfitPrice))}</td>
                                            <td className={`py-3 ${Number(subPosition.realizedPnlQuote) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{money(Number(subPosition.realizedPnlQuote))}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
