import { useEffect, useMemo, useState } from 'react';
import {
  api,
  type BinanceKlineInterval,
  type BinanceStreamEnvironment,
  type MarketCandle,
  type TestnetOrder,
  type TestnetPosition,
} from '../lib/api';
import {
  TradingViewChart,
  type TradingViewCandle,
  type TradingViewOrderMarker,
  type TradingViewPriceLevel,
} from './TradingViewChart';

type Props = {
  token: string;
  environment: BinanceStreamEnvironment;
  showTestnetOverlays?: boolean;
};

const intervals: BinanceKlineInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const intervalSeconds: Record<BinanceKlineInterval, number | null> = {
  '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600,
  '2h': 7200, '4h': 14400, '6h': 21600, '8h': 28800, '12h': 43200,
  '1d': 86400, '3d': 259200, '1w': 604800, '1M': null,
};

const markerKind = (order: TestnetOrder): TradingViewOrderMarker['kind'] => {
  switch (order.strategyAction?.type) {
    case 'DCA_ENTRY': return 'DCA';
    case 'PARENT_EXIT': return 'TAKE_PROFIT';
    case 'INDEPENDENT_ENTRY': return 'INDEPENDENT_ENTRY';
    case 'INDEPENDENT_EXIT': return 'INDEPENDENT_TAKE_PROFIT';
    default: return 'ENTRY';
  }
};

const markerLabel = (order: TestnetOrder) => {
  switch (order.strategyAction?.type) {
    case 'DCA_ENTRY': return `DCA #${order.level}`;
    case 'PARENT_EXIT': return 'Parent TP';
    case 'INDEPENDENT_ENTRY': return `Independent #${order.level} entry`;
    case 'INDEPENDENT_EXIT': return `Independent #${order.level} TP`;
    case 'INITIAL_ENTRY': return 'Initial entry';
    default: return `${order.side} #${order.level}`;
  }
};

export function MarketChartPanel({ token, environment, showTestnetOverlays = false }: Props) {
  const [symbolInput, setSymbolInput] = useState('BTCUSDT');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState<BinanceKlineInterval>('5m');
  const [candles, setCandles] = useState<MarketCandle[]>([]);
  const [positions, setPositions] = useState<TestnetPosition[]>([]);
  const [orders, setOrders] = useState<TestnetOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [accountDataError, setAccountDataError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const [streamStale, setStreamStale] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = symbolInput.trim().toUpperCase();
      if (/^[A-Z0-9]{5,20}$/.test(normalized)) setSymbol(normalized);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [symbolInput]);

  useEffect(() => {
    let cancelled = false;
    const normalizedSymbol = symbol.trim().toUpperCase();
    let autoTimer: number | undefined;

    const load = async (silent = false) => {
      if (!silent) setLoading(true);
      setMarketError(null);
      setAccountDataError(null);
      try {
        const response = await api.getMarketCandles(token, normalizedSymbol, interval, 300, environment);
        if (!cancelled) setCandles(response.candles);
      } catch (reason: unknown) {
        if (!cancelled) setMarketError(reason instanceof Error ? reason.message : 'Unable to load market candles');
      }

      if (showTestnetOverlays && environment === 'testnet') {
        const [positionResult, orderResult] = await Promise.allSettled([
          api.listTestnetPositions(token, 100),
          api.listTestnetOrders(token, 300),
        ]);
        if (!cancelled) {
          setPositions(positionResult.status === 'fulfilled' ? positionResult.value.filter((position) => position.symbol === normalizedSymbol) : []);
          setOrders(orderResult.status === 'fulfilled' ? orderResult.value.filter((order) => order.position.symbol === normalizedSymbol) : []);
          if (positionResult.status === 'rejected' || orderResult.status === 'rejected') {
            setAccountDataError('Candles loaded, but some Testnet position or order overlays are unavailable.');
          }
        }
      } else if (!cancelled) {
        setPositions([]);
        setOrders([]);
      }

      if (!cancelled) {
        setLastUpdatedAt(new Date());
        if (!silent) setLoading(false);
      }
    };

    void load();
    autoTimer = window.setInterval(() => void load(true), 30_000);
    return () => {
      cancelled = true;
      if (autoTimer) window.clearInterval(autoTimer);
    };
  }, [token, symbol, interval, environment, showTestnetOverlays, refreshKey]);

  useEffect(() => {
    const bucketSize = intervalSeconds[interval];
    if (!symbol || bucketSize === null) return;
    let cancelled = false;
    let pollTimer: number | undefined;
    let lastSuccessfulPoll = 0;

    const start = async () => {
      try {
        await api.subscribeMarketStream(token, symbol, environment);
        if (!cancelled) { setStreaming(true); setStreamStale(false); }
      } catch {
        if (!cancelled) { setStreaming(false); setStreamStale(true); }
      }

      const poll = async () => {
        try {
          const streamed = await api.getStreamedMarketPrice(token, symbol, environment);
          if (!cancelled && streamed && Number.isFinite(streamed.price)) {
            lastSuccessfulPoll = Date.now();
            setStreaming(true);
            setStreamStale(false);
            setLastUpdatedAt(new Date());
            const candleTime = Math.floor(streamed.eventTime / 1000 / bucketSize) * bucketSize;
            setCandles((current) => {
              if (current.length === 0) return current;
              const last = current[current.length - 1];
              if (candleTime < last.time) return current;
              if (candleTime === last.time) {
                return [...current.slice(0, -1), {
                  ...last,
                  high: Math.max(last.high, streamed.price),
                  low: Math.min(last.low, streamed.price),
                  close: streamed.price,
                  closeTime: (candleTime + bucketSize) * 1000 - 1,
                }];
              }
              return [...current.slice(-299), {
                time: candleTime,
                open: last.close,
                high: streamed.price,
                low: streamed.price,
                close: streamed.price,
                volume: 0,
                closeTime: (candleTime + bucketSize) * 1000 - 1,
              }];
            });
          } else if (!cancelled && lastSuccessfulPoll > 0 && Date.now() - lastSuccessfulPoll > 10_000) {
            setStreamStale(true);
          }
        } catch {
          if (!cancelled) { setStreaming(false); setStreamStale(true); }
        } finally {
          if (!cancelled) pollTimer = window.setTimeout(poll, 1000);
        }
      };
      void poll();
    };

    void start();
    return () => {
      cancelled = true;
      setStreaming(false);
      setStreamStale(false);
      if (pollTimer) window.clearTimeout(pollTimer);
      void api.unsubscribeMarketStream(token, symbol, environment).catch(() => undefined);
    };
  }, [token, symbol, interval, environment]);

  const chartData = useMemo<TradingViewCandle[]>(() => candles.map((candle) => ({
    time: candle.time as TradingViewCandle['time'],
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  })), [candles]);

  const positionLevels = useMemo<TradingViewPriceLevel[]>(() => positions.flatMap((position) => [
    { label: 'Average entry', value: Number(position.averageEntryPrice), kind: 'ENTRY' as const },
    { label: 'Next DCA', value: Number(position.nextDcaPrice ?? 0), kind: 'DCA' as const },
    { label: 'Take profit', value: Number(position.takeProfitPrice ?? 0), kind: 'TAKE_PROFIT' as const },
    ...position.subPositions.filter((sub) => sub.status === 'OPEN').flatMap((sub) => [
      { label: `Independent #${sub.level} entry`, value: Number(sub.entryPrice), kind: 'INDEPENDENT_ENTRY' as const },
      { label: `Independent #${sub.level} TP`, value: Number(sub.takeProfitPrice), kind: 'INDEPENDENT_TAKE_PROFIT' as const },
    ]),
  ].filter((level) => Number.isFinite(level.value) && level.value > 0)), [positions]);

  const orderMarkers = useMemo<TradingViewOrderMarker[]>(() => {
    if (candles.length === 0) return [];
    const first = candles[0].time;
    const last = candles[candles.length - 1].time;
    return orders.filter((order) => order.status === 'FILLED').flatMap((order) => {
      const eventTime = Date.parse(order.strategyAction?.completedAt ?? order.updatedAt);
      const candle = candles.reduce<MarketCandle | null>((closest, candidate) =>
        !closest || Math.abs(candidate.time * 1000 - eventTime) < Math.abs(closest.time * 1000 - eventTime)
          ? candidate
          : closest,
      null);
      if (!candle || candle.time < first || candle.time > last) return [];
      return [{
        time: candle.time as TradingViewOrderMarker['time'],
        side: order.side,
        label: markerLabel(order),
        kind: markerKind(order),
      }];
    });
  }, [candles, orders]);

  const latest = candles[candles.length - 1];
  const streamLabel = streaming && !streamStale ? 'Live updates' : streamStale ? 'Reconnecting' : 'Snapshot only';

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-white/10 p-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">TradingView market chart</h3>
            <span className="rounded-full border border-white/10 bg-slate-950/30 px-2.5 py-1 text-xs uppercase tracking-wider text-slate-400">Price refresh 1s</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${streaming && !streamStale ? 'bg-emerald-400/15 text-emerald-300' : streamStale ? 'bg-amber-400/15 text-amber-300' : 'bg-slate-400/10 text-slate-400'}`}>{streamLabel}</span>
          </div>
          <p className="mt-2 text-sm text-slate-400">The active candle updates every second. Full candle history and Testnet overlays refresh every 30 seconds.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(140px,1fr)_110px_auto]">
          <input aria-label="Chart symbol" value={symbolInput} onChange={(event) => setSymbolInput(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-2.5 text-sm outline-none ring-cyan-400/40 focus:ring" placeholder="BTCUSDT" />
          <select value={interval} onChange={(event) => setInterval(event.target.value as BinanceKlineInterval)} className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm">{intervals.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <button disabled={loading} onClick={() => setRefreshKey((current) => current + 1)} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{loading ? 'Loading…' : 'Refresh now'}</button>
        </div>
      </div>
      {marketError && <div className="mx-5 mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{marketError}</div>}
      {accountDataError && <div className="mx-5 mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">{accountDataError}</div>}
      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <TradingViewChart data={chartData} priceLevels={showTestnetOverlays ? positionLevels : []} orderMarkers={showTestnetOverlays ? orderMarkers : []} loading={loading && candles.length === 0} emptyMessage={marketError ? 'Market candles could not be loaded.' : 'No candles returned for this market.'} />
        <aside className="rounded-2xl border border-white/10 bg-slate-950/30 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Latest candle</p>
          <p className="mt-2 text-lg font-semibold">{symbol}</p>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Environment</dt><dd>{environment === 'testnet' ? 'Testnet' : 'Live public'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Open</dt><dd>{latest ? latest.open.toLocaleString() : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">High</dt><dd>{latest ? latest.high.toLocaleString() : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Low</dt><dd>{latest ? latest.low.toLocaleString() : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Close</dt><dd>{latest ? latest.close.toLocaleString() : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Candles</dt><dd>{candles.length}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Updated</dt><dd>{lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : '—'}</dd></div>
            {showTestnetOverlays && <>
              <div className="flex justify-between"><dt className="text-slate-500">Markers</dt><dd>{orderMarkers.length}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Levels</dt><dd>{positionLevels.length}</dd></div>
            </>}
          </dl>
        </aside>
      </div>
    </section>
  );
}
