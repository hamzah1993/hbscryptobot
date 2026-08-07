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
import { TradeHistoryPanel } from '../components/TradeHistoryPanel';
import { UnifiedPositionsPanel } from '../components/UnifiedPositionsPanel';
import { UserProfilePanel } from '../components/UserProfilePanel';
import {
  api,
  type BinanceStreamEnvironment,
  type MarketStreamStatus,
  type OperationalNotification,
  type StrategyStatus,
  type TestnetEmergencyStopResponse,
  type TestnetEmergencyExitResponse,
  type TestnetPosition,
  type TradingPosition,
} from '../lib/api';
import { subscribeSharedMarketPrice } from '../lib/sharedMarketPriceFeed';
import { useTradingEnvironment } from '../trading/TradingEnvironmentContext';

const navigation = ['Overview', 'Backtests', 'Bots', 'Positions', 'Strategies', 'Notifications', 'Exchange accounts', 'Trade history', 'Profile'];
const notificationSeenStorageKey = 'hbs-notifications-last-seen-at';
const notificationToastStorageKey = 'hbs-notifications-last-toast-at';
const browserNotificationStorageKey = 'hbs-browser-notifications-enabled';
const notificationSoundStorageKey = 'hbs-notification-sounds-enabled';
const tradingLifecycleEvents = new Set(['ENTRY_FILLED', 'DCA_FILLED', 'INDEPENDENT_OPENED', 'RECOVERY_ACTIVATED', 'RECOVERY_DCA_FILLED', 'INDEPENDENT_TP_HIT', 'PARENT_TP_HIT', 'CYCLE_COMPLETED']);
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
  const { mode, setMode } = useTradingEnvironment();
  const [activeNav, setActiveNav] = useState('Overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
  const [showEmergencyExitConfirm, setShowEmergencyExitConfirm] = useState(false);
  const [emergencyExitBusy, setEmergencyExitBusy] = useState(false);
  const [emergencyExitResult, setEmergencyExitResult] = useState<TestnetEmergencyExitResponse | null>(null);
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
        mode === 'LIVE' ? api.listLivePositions(token, 250) : api.listTestnetPositions(token, 250),
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
  }, [token, mode]);

  useEffect(() => {
    if (!token) return;
    const active = (mode === 'PAPER' ? paperPositions : testnetPositions).filter((position) => position.status === 'OPEN');
    const symbols = [...new Set(active.map((position) => position.symbol))];
    if (symbols.length === 0) return;
    let cancelled = false;
    const unsubscribes = symbols.map((symbol) => subscribeSharedMarketPrice(
      token,
      symbol,
      mode === 'LIVE' ? 'live' : 'testnet',
      (streamed) => {
        if (cancelled || !streamed?.price || !Number.isFinite(streamed.price)) return;
        setPrices((current) => ({ ...current, [symbol]: streamed.price }));
      },
    ));
    return () => {
      cancelled = true;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
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
            .filter((notification) => (notification.severity !== 'INFO' || tradingLifecycleEvents.has(notification.event)) && new Date(notification.createdAt).getTime() > lastToastAt)
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

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileMenuOpen]);

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

  async function runEmergencyExit() {
    if (!token) return;
    setEmergencyExitBusy(true);
    setEmergencyStopError(null);
    setEmergencyExitResult(null);
    try {
      const result = mode === 'LIVE'
        ? await api.emergencyExitLive(token)
        : await api.emergencyExitTestnet(token);
      setEmergencyExitResult(result);
      setShowEmergencyExitConfirm(false);
      await loadPositions(true);
    } catch (reason: unknown) {
      setEmergencyStopError(reason instanceof Error ? reason.message : `Unable to emergency-exit ${mode === 'LIVE' ? 'Binance LIVE' : 'Testnet'} positions`);
    } finally {
      setEmergencyExitBusy(false);
    }
  }

  const dashboardPositions = mode === 'PAPER' ? paperPositions : testnetPositions;
  const openPositions = dashboardPositions.filter((position) => position.status === 'OPEN');
  const independentCost = (position: TradingPosition | TestnetPosition) => position.subPositions
    .filter((subPosition) => subPosition.status === 'OPEN')
    .reduce((sum, subPosition) => sum + Number(subPosition.costQuote), 0);
  const independentQuantity = (position: TradingPosition | TestnetPosition) => position.subPositions
    .filter((subPosition) => subPosition.status === 'OPEN')
    .reduce((sum, subPosition) => sum + Number(subPosition.quantity), 0);
  const independentRealized = (position: TradingPosition | TestnetPosition) => position.subPositions
    .reduce((sum, subPosition) => sum + Number(subPosition.realizedPnlQuote), 0);
  const invested = openPositions.reduce((sum, position) => sum + Number(position.totalCostQuote) + independentCost(position), 0);
  const unrealizedPnl = openPositions.reduce((sum, position) => {
    const currentPrice = prices[position.symbol] ?? Number(position.averageEntryPrice);
    return sum + (currentPrice * (Number(position.totalQuantity) + independentQuantity(position)) - (Number(position.totalCostQuote) + independentCost(position)));
  }, 0);
  const realizedPnl = dashboardPositions.reduce((sum, position) => sum + Number(position.realizedPnlQuote) + independentRealized(position), 0);
  const totalPnl = unrealizedPnl + realizedPnl;
  const runningBots = new Set(openPositions.filter((position) => position.strategy.status === 'RUNNING').map((position) => position.strategy.id)).size;
  const pausedBots = new Set(openPositions.filter((position) => position.strategy.status === 'PAUSED').map((position) => position.strategy.id)).size;
  const recoveryPositions = openPositions.filter((position) => position.recoveryMode).length;
  const openRiskBudget = openPositions.reduce((sum, position) => sum + Number(position.strategy.riskBudgetQuote), 0);
  const remainingRiskBudget = Math.max(openRiskBudget - invested, 0);
  const riskUtilization = openRiskBudget > 0 ? (invested / openRiskBudget) * 100 : 0;
  const initials = useMemo(() => user?.fullName?.split(' ').map((name) => name[0]).join('').slice(0, 2).toUpperCase() || 'HB', [user?.fullName]);
  const environmentLabel = mode === 'PAPER' ? 'Paper' : mode === 'TESTNET' ? 'Binance Testnet' : 'Live';

  const stats = [
    { label: 'Risk / exposure', value: money(invested), change: `${openPositions.length} open ${environmentLabel} position${openPositions.length === 1 ? '' : 's'} · independent legs included` },
    { label: 'Unrealized P&L', value: money(unrealizedPnl), change: 'Updates from current market prices' },
    { label: 'Realized P&L', value: money(realizedPnl), change: 'Closed positions refresh automatically' },
    { label: 'Total P&L', value: money(totalPnl), change: `${runningBots} running bot${runningBots === 1 ? '' : 's'}` },
  ];

  const pageTitle = activeNav === 'Backtests' ? 'Backtesting and analytics' : activeNav === 'Bots' ? 'Bot operations' : activeNav === 'Exchange accounts' ? 'Exchange accounts' : activeNav === 'Trade history' ? 'Trade history' : activeNav === 'Positions' ? 'Positions' : activeNav === 'Strategies' ? 'Strategy action timeline' : activeNav === 'Notifications' ? 'Operational notifications' : activeNav === 'Profile' ? 'User profile' : 'Trading dashboard';

  const selectNavigation = (item: string) => {
    setActiveNav(item);
    setMobileMenuOpen(false);
  };

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <NotificationToastStack notifications={toastNotifications} onDismiss={(id) => setToastNotifications((current) => current.filter((notification) => notification.id !== id))} />
      {showCreateBot && token && <CreateBotWizard token={token} defaultMode={mode} onClose={() => setShowCreateBot(false)} onCreated={() => { setShowCreateBot(false); void loadPositions(); setActiveNav('Bots'); }} />}
      {showEmergencyStopConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <section className="w-full max-w-lg rounded-2xl border border-rose-400/30 bg-[#0a1728] p-6 shadow-2xl shadow-rose-950/40">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300">Testnet safety control</p>
            <h3 className="mt-3 text-2xl font-semibold">Stop all Testnet strategies?</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">This stops every running or paused non-paper Testnet strategy and cancels pending strategy actions and cancellable Binance orders. It does not close open positions.</p>
            {emergencyStopError && <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{emergencyStopError}</p>}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" disabled={emergencyStopBusy} onClick={() => setShowEmergencyStopConfirm(false)} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 disabled:opacity-50">Keep running</button>
              <button type="button" disabled={emergencyStopBusy} onClick={() => void runEmergencyStop()} className="rounded-xl bg-rose-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">{emergencyStopBusy ? 'Stopping…' : 'Confirm emergency stop'}</button>
            </div>
          </section>
        </div>
      )}
      {showEmergencyExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <section className="w-full max-w-lg rounded-2xl border border-rose-500/40 bg-[#0a1728] p-6 shadow-2xl shadow-rose-950/50">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300">Emergency market exit</p>
            <h3 className="mt-3 text-2xl font-semibold">Close all Binance {mode === 'LIVE' ? 'LIVE' : 'Testnet'} exposure now?</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">This pauses automation, cancels pending execution where possible, submits MARKET sells for open parent and independent positions, then leaves every affected bot STOPPED so it cannot reopen.</p>
            <p className="mt-3 text-xs font-semibold text-rose-200">This is an exit action, not the normal Emergency Stop.</p>
            {emergencyStopError && <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{emergencyStopError}</p>}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" disabled={emergencyExitBusy} onClick={() => setShowEmergencyExitConfirm(false)} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={emergencyExitBusy} onClick={() => void runEmergencyExit()} className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{emergencyExitBusy ? 'Closing…' : 'MARKET close all'}</button>
            </div>
          </section>
        </div>
      )}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button type="button" aria-label="Close navigation menu" onClick={() => setMobileMenuOpen(false)} className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" />
          <aside className="absolute inset-y-0 left-0 flex w-[min(86vw,340px)] flex-col border-r border-white/10 bg-[#0a1728] shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">HBS Trading</p>
                <p className="mt-1 text-sm text-slate-400">Control Center</p>
              </div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xl text-slate-300 hover:bg-white/[0.08]">×</button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {navigation.map((item) => <button key={item} onClick={() => selectNavigation(item)} className={`flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left text-sm font-medium transition ${activeNav === item ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-950/20' : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'}`}><span>{item}</span>{item === 'Notifications' && unreadNotifications > 0 && <span className={`ml-3 rounded-full px-2 py-0.5 text-xs font-semibold ${activeNav === item ? 'bg-slate-950/15 text-slate-950' : 'bg-rose-400/20 text-rose-200'}`}>{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}</button>)}
            </nav>
            <div className="border-t border-white/10 p-4">
              <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/[0.035] p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-sm font-semibold text-cyan-200">{initials}</div>
                <div className="min-w-0"><p className="truncate text-sm font-medium">{user?.fullName}</p><p className="text-xs text-emerald-300">Systems online</p></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={toggleNotificationSounds} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs font-medium text-slate-300">{notificationSoundsEnabled ? 'Sound on' : 'Sound off'}</button>
                <button type="button" onClick={logout} className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2.5 text-xs font-semibold text-rose-200">Log out</button>
              </div>
            </div>
          </aside>
        </div>
      )}
      <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
        <aside className="hidden border-r border-white/10 bg-[#0a1728] px-5 py-5 lg:block lg:min-h-screen">
          <div className="flex items-center justify-between lg:block"><div><p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-400">HBS Trading</p><h1 className="mt-2 text-xl font-semibold">Control Center</h1></div><span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">Systems online</span></div>
          <nav className="mt-7 grid grid-cols-1 gap-2">{navigation.map((item) => <button key={item} onClick={() => selectNavigation(item)} className={`flex items-center justify-between rounded-xl px-4 py-3 text-left text-sm transition ${activeNav === item ? 'bg-cyan-400 text-slate-950' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}><span>{item}</span>{item === 'Notifications' && unreadNotifications > 0 && <span className={`ml-3 rounded-full px-2 py-0.5 text-xs font-semibold ${activeNav === item ? 'bg-slate-950/15 text-slate-950' : 'bg-rose-400/20 text-rose-200'}`}>{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}</button>)}</nav>
        </aside>
        <section className="px-3.5 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-7">
          <div className="mb-4 flex items-center justify-between lg:hidden">
            <button type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation menu" aria-expanded={mobileMenuOpen} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-200">
              <span className="flex w-5 flex-col gap-1.5" aria-hidden="true"><span className="h-0.5 rounded-full bg-current" /><span className="h-0.5 rounded-full bg-current" /><span className="h-0.5 rounded-full bg-current" /></span>
            </button>
            <div className="text-center"><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-400">HBS Trading</p><p className="mt-0.5 text-xs text-emerald-300">● Systems online</p></div>
            <button type="button" onClick={() => selectNavigation('Profile')} aria-label="Open profile" className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xs font-semibold">{initials}</button>
          </div>
          <header className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:pb-6 md:flex-row md:items-center md:justify-between">
            <div><p className="text-xs text-slate-400 sm:text-sm">Welcome back, {user?.fullName}</p><h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{pageTitle}</h2></div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="grid w-full grid-cols-3 rounded-xl border border-white/10 bg-white/[0.04] p-1 sm:flex sm:w-auto">
                <button type="button" onClick={() => setMode('PAPER')} className={`rounded-lg px-2 py-2 text-xs sm:px-3 sm:text-sm ${mode === 'PAPER' ? 'bg-violet-400 text-slate-950' : 'text-violet-300'}`}>Paper</button>
                <button type="button" onClick={() => setMode('TESTNET')} className={`rounded-lg px-2 py-2 text-xs sm:px-3 sm:text-sm ${mode === 'TESTNET' ? 'bg-cyan-400 text-slate-950' : 'text-cyan-300'}`}>Testnet</button>
                <button type="button" onClick={() => setMode('LIVE')} className={`rounded-lg px-2 py-2 text-xs sm:px-3 sm:text-sm ${mode === 'LIVE' ? 'bg-amber-300 text-slate-950' : 'text-amber-200'}`}>Live</button>
              </div>
              <button type="button" onClick={toggleNotificationSounds} className="hidden rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.08] sm:block">{notificationSoundsEnabled ? 'Disable sounds' : 'Enable sounds'}</button>
              {'Notification' in window && (browserNotificationsEnabled ? <button type="button" onClick={disableBrowserNotifications} className="hidden rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.08] md:block">Disable browser alerts</button> : <button type="button" onClick={() => void enableBrowserNotifications()} className="hidden rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/20 md:block">Enable browser alerts</button>)}
              {mode === 'TESTNET' && <button type="button" onClick={() => { setEmergencyStopError(null); setShowEmergencyStopConfirm(true); }} className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-200 hover:bg-amber-400/20">Emergency stop</button>}
              {(mode === 'TESTNET' || mode === 'LIVE') && <button type="button" onClick={() => { setEmergencyStopError(null); setShowEmergencyExitConfirm(true); }} className="rounded-xl border border-rose-500/50 bg-rose-500/15 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-500/25">Emergency exit</button>}
              <button onClick={() => setShowCreateBot(true)} className="flex-1 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 sm:flex-none">Create bot</button>
              <button type="button" onClick={() => selectNavigation('Profile')} aria-label="Open profile" className="hidden h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm font-semibold lg:flex">{initials}</button>
            </div>
          </header>
          {mode === 'LIVE' && <div className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">Binance LIVE workspace is enabled. Orders use real funds. Fixed risk budgets, strategy limits and the configured LIVE capital ceiling remain enforced.</div>}
          {emergencyStopResult && <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">Emergency stop completed at {new Date(emergencyStopResult.stoppedAt).toLocaleString()}. Stopped {emergencyStopResult.stoppedStrategies} strateg{emergencyStopResult.stoppedStrategies === 1 ? 'y' : 'ies'} and cancelled {emergencyStopResult.cancelledPendingOrRetryableActions ?? emergencyStopResult.cancelledPendingActions ?? 0} pending/retryable actions.</div>}
          {emergencyExitResult && <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">Emergency exit submitted {emergencyExitResult.exitOrdersSubmitted} market close order{emergencyExitResult.exitOrdersSubmitted === 1 ? '' : 's'} across {emergencyExitResult.positionsFound} position{emergencyExitResult.positionsFound === 1 ? '' : 's'}. Re-entry is blocked. Failures: {emergencyExitResult.failedCloses + emergencyExitResult.cancellationFailures}.</div>}
          {activeNav === 'Backtests' && token ? <BacktestDashboardPanel token={token} /> : activeNav === 'Bots' && token ? <BotManagementPanel token={token} mode={mode} onViewPaperPosition={(positionId) => { setExpandedPositionId(positionId); setActiveNav('Positions'); }} onViewTestnetPosition={(positionId) => { setExpandedPositionId(positionId); setActiveNav('Positions'); }} /> : activeNav === 'Exchange accounts' && token ? <ExchangeAccountsPanel token={token} /> : activeNav === 'Trade history' && token ? <TradeHistoryPanel token={token} mode={mode} /> : activeNav === 'Positions' && token ? <UnifiedPositionsPanel token={token} initialPositionId={expandedPositionId} initialMode={mode} /> : activeNav === 'Strategies' && token ? (mode === 'PAPER' ? <EnvironmentEmptyPanel mode={mode} label="strategy action timeline" /> : <TestnetActionTimelinePanel token={token} environment={mode} />) : activeNav === 'Notifications' && token ? <><NotificationWebhookMetricsPanel token={token} /><NotificationsPanel token={token} /></> : activeNav === 'Profile' && user ? <UserProfilePanel user={user} onLogout={logout} /> : <>{error && <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}<section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map((stat) => <article key={stat.label} className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5"><p className="text-sm text-slate-400">{stat.label}</p><p className="mt-3 text-2xl font-semibold">{loading ? '—' : stat.value}</p><p className="mt-2 text-xs text-cyan-300">{stat.change}</p></article>)}</section><section className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-2 xl:grid-cols-4"><DashboardMiniMetric label="Bot state" value={`${runningBots} running · ${pausedBots} paused`} /><DashboardMiniMetric label="Recovery" value={`${recoveryPositions} active`} /><DashboardMiniMetric label="Risk utilization" value={`${riskUtilization.toFixed(1)}% of ${money(openRiskBudget)}`} /><DashboardMiniMetric label="Risk budget remaining" value={money(remainingRiskBudget)} /></section><p className="mt-3 text-xs text-slate-500">Dashboard last updated: {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : '—'}</p><PortfolioAnalytics positions={dashboardPositions as TradingPosition[]} loading={loading} />{token && <MarketChartPanel token={token} environment={marketEnvironment} showTestnetOverlays={mode === 'TESTNET'} />}<section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-6"><h3 className="text-lg font-semibold">Trading workspace</h3><p className="mt-2 text-sm text-slate-400">Dashboard is showing {environmentLabel} operations.{mode === 'LIVE' ? ' LIVE orders use real funds and remain subject to the configured trading risk limits.' : ''}</p>{streamError && <p className="mt-2 text-xs text-amber-300">{streamError}</p>}{streamStatus && !streamBusy && <p className="mt-2 text-xs text-slate-500">Market stream: {streamStatus.connected ? 'connected' : 'disconnected'}</p>}</section></>}
        </section>
      </div>
    </main>
  );
}

function EnvironmentEmptyPanel({ mode, label }: { mode: 'PAPER' | 'TESTNET' | 'LIVE'; label: string }) {
  return <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-6"><h3 className="text-xl font-semibold">No {mode === 'PAPER' ? 'Paper' : mode === 'TESTNET' ? 'Testnet' : 'Live'} {label}</h3><p className="mt-2 text-sm text-slate-400">The global environment selector is applied across the dashboard.</p></section>;
}

function DashboardMiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-950/30 p-3"><p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1.5 text-sm font-semibold text-slate-200">{value}</p></div>;
}
