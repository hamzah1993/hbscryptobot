import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { BacktestDashboardPanel } from '../components/BacktestDashboardPanel';
import { BotManagementPanel } from '../components/BotManagementPanel';
import { CreateBotWizard } from '../components/CreateBotWizard';
import { ExchangeAccountsPanel } from '../components/ExchangeAccountsPanel';
import { MarketChartPanel } from '../components/MarketChartPanel';
import { NotificationsPanel } from '../components/NotificationsPanel';
import { NotificationToastStack } from '../components/NotificationToastStack';
import { NotificationWebhookMetricsPanel } from '../components/NotificationWebhookMetricsPanel';
import { PortfolioAnalytics } from '../components/PortfolioAnalytics';
import { TestnetActionTimelinePanel } from '../components/TestnetActionTimelinePanel';
import { TestnetOrdersPanel } from '../components/TestnetOrdersPanel';
import { UnifiedPositionsPanel } from '../components/UnifiedPositionsPanel';
import {
  api,
  type BinanceStreamEnvironment,
  type MarketStreamStatus,
  type OperationalNotification,
  type StrategyStatus,
  type TestnetEmergencyStopResponse,
  type TestnetPosition,
  type TradingPosition,
} from '../lib/api';
import { useTradingEnvironment } from '../trading/TradingEnvironmentContext';

const navigation = ['Overview', 'Backtests', 'Bots', 'Positions', 'Strategies', 'Notifications', 'Exchange accounts', 'Trade history'];
const notificationSeenStorageKey = 'hbs-notifications-last-seen-at';
const notificationToastStorageKey = 'hbs-notifications-last-toast-at';
const browserNotificationStorageKey = 'hbs-browser-notifications-enabled';
const notificationSoundStorageKey = 'hbs-notification-sounds-enabled';
type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

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
  const { mode, setMode, liveExecutionEnabled } = useTradingEnvironment();
  const [activeNav, setActiveNav] = useState('Overview');
  const [paperPositions, setPaperPositions] = useState<TradingPosition[]>([]);
  const [testnetPositions, setTestnetPositions] = useState<TestnetPosition[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateBot, setShowCreateBot] = useState(false);
  const [expandedPositionId, setExpandedPositionId] = useState<string | null>(null);
  const [updatingStrategyId, setUpdatingStrategyId] = useState<string | null>(null);
  const [marketSymbol] = useState('BTCUSDT');
  const marketEnvironment: BinanceStreamEnvironment = mode === 'LIVE' ? 'live' : 'testnet';
  const [streamStatus, setStreamStatus] = useState<MarketStreamStatus | null>(null);
  const [streamBusy] = useState(false);
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

  async function loadPositions(silent = false) {
    if (!token) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const [paper, testnet] = await Promise.all([
        api.listPaperPositions(token),
        api.listTestnetPositions(token, 250),
      ]);
      setPaperPositions(paper);
      setTestnetPositions(testnet);
      setLastUpdatedAt(new Date());
      setError(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to load positions');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadPositions();
    if (!token) return;
    const timer = window.setInterval(() => void loadPositions(true), 5000);
    return () => window.clearInterval(timer);
  }, [token]);

  useEffect(() => {
    if (!token || mode === 'LIVE') return;
    const active = (mode === 'PAPER' ? paperPositions : testnetPositions).filter((position) => position.status === 'OPEN');
    const symbols = [...new Set(active.map((position) => position.symbol))];
    if (symbols.length === 0) return;
    let cancelled = false;
    const refresh = async () => {
      const results = await Promise.allSettled(symbols.map(async (symbol) => {
        const streamed = await api.getStreamedMarketPrice(token, symbol, 'testnet');
        if (streamed?.price && Number.isFinite(streamed.price)) return [symbol, streamed.price] as const;
        const candles = await api.getMarketCandles(token, symbol, '1m', 1, 'testnet');
        const latest = candles.candles[candles.candles.length - 1];
        return [symbol, latest?.close ?? 0] as const;
      }));
      if (cancelled) return;
      setPrices((current) => {
        const next = { ...current };
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value[1] > 0) next[result.value[0]] = result.value[1];
        }
        return next;
      });
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, mode, paperPositions, testnetPositions]);

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
        setUnreadNotifications(notifications.filter((notification) => new Date(notification.createdAt).getTime() > seenAt).length);
        const latestTimestamp = notifications.reduce((latest, notification) => Math.max(latest, new Date(notification.createdAt).getTime()), 0);
        const lastToastAt = Number(window.localStorage.getItem(notificationToastStorageKey) ?? 0);
        if (initializedNotificationPolling.current) {
          const freshOperationalAlerts = notifications
            .filter((notification) => notification.severity !== 'INFO' && new Date(notification.createdAt).getTime() > lastToastAt)
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
              playNotificationSound(freshOperationalAlerts.some((notification) => notification.severity === 'CRITICAL') ? 'CRITICAL' : 'WARNING');
            }
            if (browserNotificationsEnabled && 'Notification' in window && window.Notification.permission === 'granted' && document.visibilityState !== 'visible') {
              for (const notification of freshOperationalAlerts) {
                new window.Notification(`HBS Trading · ${notification.severity}`, { body: notification.message, tag: notification.id });
              }
            }
          }
        } else {
          initializedNotificationPolling.current = true;
        }
        if (latestTimestamp > lastToastAt) window.localStorage.setItem(notificationToastStorageKey, String(latestTimestamp));
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
    if (!token || ['Backtests', 'Exchange accounts', 'Trade history', 'Positions', 'Strategies', 'Bots', 'Notifications'].includes(activeNav)) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const status = await api.getMarketStreamStatus(token, marketSymbol, marketEnvironment);
        if (!cancelled) {
          setStreamStatus(status);
          setStreamError(null);
        }
      } catch (reason: unknown) {
        if (!cancelled) setStreamError(reason instanceof Error ? reason.message : 'Unable to load market stream status');
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
      setPaperPositions((current) => current.map((position) => position.strategy.id === strategyId ? { ...position, strategy: { ...position.strategy, ...strategy } } : position));
      setTestnetPositions((current) => current.map((position) => position.strategy.id === strategyId ? { ...position, strategy: { ...position.strategy, ...strategy } } : position));
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

  const dashboardPositions = mode === 'PAPER' ? paperPositions : mode === 'TESTNET' ? testnetPositions : [];
  const openPositions = dashboardPositions.filter((position) => position.status === 'OPEN');
  const invested = openPositions.reduce((sum, position) => sum + Number(position.totalCostQuote), 0);
  const unrealizedPnl = openPositions.reduce((sum, position) => {
    const currentPrice = prices[position.symbol] ?? Number(position.averageEntryPrice);
    return sum + (currentPrice * Number(position.totalQuantity) - Number(position.totalCostQuote));
  }, 0);
  const realizedPnl = dashboardPositions.reduce((sum, position) => sum + Number(position.realizedPnlQuote), 0);
  const totalPnl = unrealizedPnl + realizedPnl;
  const runningBots = new Set(openPositions.filter((position) => position.strategy.status === 'RUNNING').map((position) => position.strategy.id)).size;
  const initials = useMemo(() => user?.fullName?.split(' ').map((name) => name[0]).join('').slice(0, 2).toUpperCase() || 'HB', [user?.fullName]);
  const environmentLabel = mode === 'PAPER' ? 'Paper' : mode === 'TESTNET' ? 'Binance Testnet' : 'Live';

  const stats = [
    { label: 'Allocated capital', value: money(invested), change: mode === 'LIVE' ? 'Live execution is disabled' : `${openPositions.length} open ${environmentLabel} position${openPositions.length === 1 ? '' : 's'}` },
    { label: 'Unrealized P&L', value: money(unrealizedPnl), change: mode === 'LIVE' ? 'No live positions are loaded' : 'Updates from current market prices' },
    { label: 'Realized P&L', value: money(realizedPnl), change: mode === 'LIVE' ? 'Live order history is disabled' : 'Closed positions refresh automatically' },
    { label: 'Total P&L', value: money(totalPnl), change: `${runningBots} running bot${runningBots === 1 ? '' : 's'}` },
  ];

  const pageTitle = activeNav === 'Backtests' ? 'Backtesting and analytics' : activeNav === 'Bots' ? 'Bot operations' : activeNav === 'Exchange accounts' ? 'Exchange accounts' : activeNav === 'Trade history' ? 'Trade history' : activeNav === 'Positions' ? 'Positions' : activeNav === 'Strategies' ? 'Strategy action timeline' : activeNav === 'Notifications' ? 'Operational notifications' : 'Trading dashboard';

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <NotificationToastStack notifications={toastNotifications} onDismiss={(id) => setToastNotifications((current) => current.filter((notification) => notification.id !== id))} />
      {showCreateBot && token && mode !== 'LIVE' && <CreateBotWizard token={token} defaultMode={mode} onClose={() => setShowCreateBot(false)} onCreated={() => { setShowCreateBot(false); void loadPositions(); setActiveNav('Bots'); }} />}
      {showEmergencyStopConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <section className="w-full max-w-lg rounded-2xl border border-rose-400/30 bg-[#0a1728] p-6 shadow-2xl shadow-rose-950/40">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300">Testnet safety control</p>
            <h3 className="mt-3 text-2xl font-semibold">Stop all Testnet strategies?</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">This stops every running or paused non-paper Testnet strategy and cancels pending strategy actions. It does not cancel already-submitted Binance orders or close open positions.</p>
            {emergencyStopError && <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{emergencyStopError}</p>}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" disabled={emergencyStopBusy} onClick={() => setShowEmergencyStopConfirm(false)} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 disabled:opacity-50">Keep running</button>
              <button type="button" disabled={emergencyStopBusy} onClick={() => void runEmergencyStop()} className="rounded-xl bg-rose-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">{emergencyStopBusy ? 'Stopping…' : 'Confirm emergency stop'}</button>
            </div>
          </section>
        </div>
      )}
      <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-white/10 bg-[#0a1728] px-5 py-5 lg:min-h-screen lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between lg:block"><div><p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-400">HBS Trading</p><h1 className="mt-2 text-xl font-semibold">Control Center</h1></div><span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">Systems online</span></div>
          <nav className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">{navigation.map((item) => <button key={item} onClick={() => setActiveNav(item)} className={`flex items-center justify-between rounded-xl px-4 py-3 text-left text-sm transition ${activeNav === item ? 'bg-cyan-400 text-slate-950' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}><span>{item}</span>{item === 'Notifications' && unreadNotifications > 0 && <span className={`ml-3 rounded-full px-2 py-0.5 text-xs font-semibold ${activeNav === item ? 'bg-slate-950/15 text-slate-950' : 'bg-rose-400/20 text-rose-200'}`}>{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}</button>)}</nav>
        </aside>
        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <header className="flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-center md:justify-between">
            <div><p className="text-sm text-slate-400">Welcome back, {user?.fullName}</p><h2 className="mt-1 text-3xl font-semibold tracking-tight">{pageTitle}</h2></div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
                <button type="button" onClick={() => setMode('PAPER')} className={`rounded-lg px-3 py-2 text-sm ${mode === 'PAPER' ? 'bg-violet-400 text-slate-950' : 'text-violet-300'}`}>Paper</button>
                <button type="button" onClick={() => setMode('TESTNET')} className={`rounded-lg px-3 py-2 text-sm ${mode === 'TESTNET' ? 'bg-cyan-400 text-slate-950' : 'text-cyan-300'}`}>Binance Testnet</button>
                <button type="button" onClick={() => setMode('LIVE')} className={`rounded-lg px-3 py-2 text-sm ${mode === 'LIVE' ? 'bg-amber-300 text-slate-950' : 'text-amber-200'}`}>Live</button>
              </div>
              <button type="button" onClick={toggleNotificationSounds} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.08]">{notificationSoundsEnabled ? 'Disable sounds' : 'Enable sounds'}</button>
              {'Notification' in window && (browserNotificationsEnabled ? <button type="button" onClick={disableBrowserNotifications} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.08]">Disable browser alerts</button> : <button type="button" onClick={() => void enableBrowserNotifications()} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/20">Enable browser alerts</button>)}
              {mode === 'TESTNET' && <button type="button" onClick={() => { setEmergencyStopError(null); setShowEmergencyStopConfirm(true); }} className="rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-2.5 text-sm font-semibold text-rose-200 hover:bg-rose-400/20">Emergency stop</button>}
              {mode !== 'LIVE' && <button onClick={() => setShowCreateBot(true)} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950">Create bot</button>}
              <button onClick={logout} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm font-semibold">{initials}</button>
            </div>
          </header>
          {mode === 'LIVE' && !liveExecutionEnabled && <div className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">Live public market data is available. Live bot creation, positions and order execution remain disabled.</div>}
          {emergencyStopResult && <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">Emergency stop completed at {new Date(emergencyStopResult.stoppedAt).toLocaleString()}. Stopped {emergencyStopResult.stoppedStrategies} strateg{emergencyStopResult.stoppedStrategies === 1 ? 'y' : 'ies'} and cancelled {emergencyStopResult.cancelledPendingActions} pending action{emergencyStopResult.cancelledPendingActions === 1 ? '' : 's'}.</div>}
          {activeNav === 'Backtests' && token ? <BacktestDashboardPanel token={token} /> : activeNav === 'Bots' && token ? (mode === 'LIVE' ? <DisabledLivePanel label="Live bots" /> : <BotManagementPanel token={token} mode={mode} onViewPaperPosition={(positionId) => { setExpandedPositionId(positionId); setActiveNav('Positions'); }} onViewTestnetPosition={(positionId) => { setExpandedPositionId(positionId); setActiveNav('Positions'); }} />) : activeNav === 'Exchange accounts' && token ? <ExchangeAccountsPanel token={token} /> : activeNav === 'Trade history' && token ? (mode === 'TESTNET' ? <TestnetOrdersPanel token={token} /> : <EnvironmentEmptyPanel mode={mode} label="trade history" />) : activeNav === 'Positions' && token ? (mode === 'LIVE' ? <DisabledLivePanel label="Live positions" /> : <UnifiedPositionsPanel token={token} initialPositionId={expandedPositionId} initialMode={mode} />) : activeNav === 'Strategies' && token ? (mode === 'TESTNET' ? <TestnetActionTimelinePanel token={token} /> : <EnvironmentEmptyPanel mode={mode} label="strategy action timeline" />) : activeNav === 'Notifications' && token ? <><NotificationWebhookMetricsPanel token={token} /><NotificationsPanel token={token} /></> : <>{error && <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}<section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map((stat) => <article key={stat.label} className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5"><p className="text-sm text-slate-400">{stat.label}</p><p className="mt-3 text-2xl font-semibold">{loading ? '—' : stat.value}</p><p className="mt-2 text-xs text-cyan-300">{stat.change}</p></article>)}</section><p className="mt-3 text-xs text-slate-500">Dashboard last updated: {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : '—'}</p><PortfolioAnalytics positions={dashboardPositions as TradingPosition[]} loading={loading} />{token && <MarketChartPanel token={token} environment={marketEnvironment} showTestnetOverlays={mode === 'TESTNET'} />}<section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-6"><h3 className="text-lg font-semibold">Trading workspace</h3><p className="mt-2 text-sm text-slate-400">Dashboard is showing {environmentLabel} operations. Live-money order execution remains disabled.</p>{streamError && <p className="mt-2 text-xs text-amber-300">{streamError}</p>}{streamStatus && !streamBusy && <p className="mt-2 text-xs text-slate-500">Market stream: {streamStatus.connected ? 'connected' : 'disconnected'}</p>}</section></>}
        </section>
      </div>
    </main>
  );
}

function DisabledLivePanel({ label }: { label: string }) {
  return <section className="mt-6 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-6"><h3 className="text-xl font-semibold text-amber-100">{label} are disabled</h3><p className="mt-2 text-sm text-amber-50/80">Only public live market data is enabled. Live credentials and real-money execution are not available.</p></section>;
}

function EnvironmentEmptyPanel({ mode, label }: { mode: 'PAPER' | 'TESTNET' | 'LIVE'; label: string }) {
  return <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-6"><h3 className="text-xl font-semibold">No {mode === 'PAPER' ? 'Paper' : mode === 'TESTNET' ? 'Testnet' : 'Live'} {label}</h3><p className="mt-2 text-sm text-slate-400">The global environment selector is applied across the dashboard.</p></section>;
}
