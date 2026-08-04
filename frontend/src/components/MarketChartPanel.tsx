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
};

const intervals: BinanceKlineInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

const intervalSeconds: Record<BinanceKlineInterval, number | null> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '4h': 14400,
  '6h': 21600,
  '8h': 28800,
  '12h': 43200,
  '1d': 86400,
  '3d': 259200,
  '1w': 604800,
  '1M': null,
};

const markerKind = (order: TestnetOrder): TradingViewOrderMarker['kind'] => {
  switch (order.strategyAction?.type) {
    case 'DCA_ENTRY':
      return 'DCA';
    case 'PARENT_EXIT':
      return 'TAKE_PROFIT';
    case 'INDEPENDENT_ENTRY':
      return 'INDEPENDENT_ENTRY';
    case 'INDEPENDENT_EXIT':
      return 'INDEPENDENT_TAKE_PROFIT';
    case 'INITIAL_ENTRY':
    default:
      return 'ENTRY';
  }
};

const markerLabel = (order: TestnetOrder) => {
  switch (order.strategyAction?.type) {
    case 'DCA_ENTRY':
      return `DCA #${order.level}`;
    case 'PARENT_EXIT':
      return 'Parent TP';
    case 'INDEPENDENT_ENTRY':
      return `Independent #${order.level} entry`;
    case 'INDEPENDENT_EXIT':
      return `Independent #${order.level} TP`;
    case 'INITIAL_ENTRY':
      return 'Initial entry';
    default:
      return `${order.side} #${order.level}`;
  }
};

export function MarketChartPanel({ token }: Props) {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState<BinanceKlineInterval>('5m');
  const [environment, setEnvironment] = useState<BinanceStreamEnvironment>('live');
  const [candles, setCandles] = useState<MarketCandle[]>([]);
  const [positions, setPositions] = useState<TestnetPosition[]>([]);
  const [orders, setOrders] = useState<TestnetOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [accountDataError, setAccountDataError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const [streamStale, setStreamStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const normalizedSymbol = symbol.trim().toUpperCase();

    if (!normalizedSymbol) {
      setCandles([]);
      setPositions([]);
      setOrders([]);
      setMarketError('Enter a market symbol.');
      setAccountDataError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMarketError(null);
    setAccountDataError(null);

    const load = async () => {
      try {
        const response = await api.getMarketCandles(token, normalizedSymbol, interval, 300, environment);
        if (!cancelled) setCandles(response.candles);
      } catch (reason: unknown) {
        if (!cancelled) {
          setMarketError(reason instanceof Error ? reason.message : 'Unable to load market candles');
        }
      }

      if (environment !== 'testnet') {
        if (!cancelled) {
          setPositions([]);
          setOrders([]);
          setLoading(false);
        }
        return;
      }

      const [positionResult, orderResult] = await Promise.allSettled([
        api.listTestnetPositions(token, 100),
        api.listTestnetOrders(token, 300),
      ]);

      if (!cancelled) {
        if (positionResult.status === 'fulfilled') {
          setPositions(positionResult.value.filter((position) => position.symbol === normalizedSymbol));
        } else {
          setPositions([]);
        }

        if (orderResult.status === 'fulfilled') {
          setOrders(orderResult.value.filter((order) => order.position.symbol === normalizedSymbol));
        } else {
          setOrders([]);
        }

        if (positionResult.status === 'rejected' || orderResult.status === 'rejected') {
          setAccountDataError('Chart candles loaded, but some Testnet position or order overlays are unavailable.');
        }

        setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [token, symbol, interval, environment, refreshKey]);

  useEffect(() => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const bucketSize = intervalSeconds[interval];
    if (!normalizedSymbol || bucketSize === null) return;

    let cancelled = false;
    let pollTimer: number | undefined;
    let lastSuccessfulPoll = 0;

    const start = async () => {
      try {
        await api.subscribeMarketStream(token, normalizedSymbol, environment);
        if (!cancelled) {
          setStreaming(true);
          setStreamStale(false);
        }
      } catch {
        if (!cancelled) {
          setStreaming(false);
          setStreamStale(true);
        }
      }

      const poll = async () => {
        try {
          const streamed = await api.getStreamedMarketPrice(token, normalizedSymbol, environment);
          if (!cancelled && streamed && Number.isFinite(streamed.price)) {
            lastSuccessfulPoll = Date.now();
            setStreaming(true);
            setStreamStale(false);
            const candleTime = Math.floor(streamed.eventTime / 1000 / bucketSize) * bucketSize;
            setCandles((current) => {
              if (current.length === 0) return current;
              const last = current[current.length - 1];
              if (candleTime < last.time) return current;

              if (candleTime === last.time) {
                const updated: MarketCandle = {
                  ...last,
                  high: Math.max(last.high, streamed.price),
                  low: Math.min(last.low, streamed.price),
                  close: streamed.price,
                  closeTime: (candleTime + bucketSize) * 1000 - 1,
                };
                return [...current.slice(0, -1), updated];
              }

              const next: MarketCandle = {
                time: candleTime,
                open: last.close,
                high: streamed.price,
                low: streamed.price,
                close: streamed.price,
                volume: 0,
                closeTime: (candleTime + bucketSize) * 1000 - 1,
              };
              return [...current.slice(-299), next];
            });
          } else if (!cancelled && lastSuccessfulPoll > 0 && Date.now() - lastSuccessfulPoll > 10_000) {
            setStreamStale(true);
          }
        } catch {
          if (!cancelled) {
            setStreaming(false);
            setStreamStale(true);
          }
        } finally {
          if (!cancelled) pollTimer = window.setTimeout(poll, 2000);
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
      void api.unsubscribeMarketStream(token, normalizedSymbol, environment).catch(() => undefined);
    };
  }, [token, symbol, interval, environment]);

  const chartData = useMemo<TradingViewCandle[]>(
    () => candles.map((candle) => ({
      time: candle.time as TradingViewCandle['time'],
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })),
    [candles],
  );

  const positionLevels = useMemo<TradingViewPriceLevel[]>(() => positions.flatMap((position) => {
    const levels: TradingViewPriceLevel[] = [
      { label: 'Average entry', value: Number(position.averageEntryPrice), kind: 'ENTRY' },
      { label: 'Next DCA', value: Number(position.nextDcaPrice ?? 0), kind: 'DCA' },
      { label: 'Take profit', value: Number(position.takeProfitPrice ?? 0), kind: 'TAKE_PROFIT' },
      ...position.subPositions
        .filter((subPosition) => subPosition.status === 'OPEN')
        .flatMap<TradingViewPriceLevel>((subPosition) => [
          {
            label: `Independent #${subPosition.level} entry`,
            value: Number(subPosition.entryPrice),
            kind: 'INDEPENDENT_ENTRY',
          },
          {
            label: `Independent #${subPosition.level} TP`,
            value: Number(subPosition.takeProfitPrice),
            kind: 'INDEPENDENT_TAKE_PROFIT',
          },
        ]),
    ];

    return levels.filter((level) => Number.isFinite(level.value) && level.value > 0);
  }), [positions]);

  const orderMarkers = useMemo<TradingViewOrderMarker[]>(() => {
    if (candles.length === 0) return [];

    const firstCandleTime = candles[0].time;
    const lastCandleTime = candles[candles.length - 1].time;

    return orders
      .filter((order) => order.status === 'FILLED')
      .flatMap<TradingViewOrderMarker>((order) => {
        const eventTime = Date.parse(order.strategyAction?.completedAt ?? order.updatedAt);
        const candle = candles.reduce<MarketCandle | null>((closest, candidate) => {
          const candidateDistance = Math.abs(candidate.time * 1000 - eventTime);
          if (!closest) return candidate;
          const closestDistance = Math.abs(closest.time * 1000 - eventTime);
          return candidateDistance < closestDistance ? candidate : closest;
        }, null);

        if (!candle || candle.time < firstCandleTime || candle.time > lastCandleTime) return [];

        const kind = markerKind(order);
        const marker: TradingViewOrderMarker = {
          time: candle.time as TradingViewOrderMarker['time'],
          side: order.side,
          label: markerLabel(order),
        };
        if (kind) marker.kind = kind;
        return [marker];
      });
  }, [candles, orders]);

  const latest = candles.length > 0 ? candles[candles.length - 1] : undefined;
  const streamLabel = streaming && !streamStale ? 'Live updates' : streamStale ? 'Reconnecting' : 'Snapshot only';

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-white/10 p-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">TradingView market chart</h3>
            <span className="rounded-full border border-white/10 bg-slate-950/30 px-2.5 py-1 text-xs uppercase tracking-wider text-slate-400">
              Public market data
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${streaming && !streamStale ? 'bg-emerald-400/15 text-emerald-300' : streamStale ? 'bg-amber-400/15 text-amber-300' : 'bg-slate-400/10 text-slate-400'}`}>
              {streamLabel}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Binance OHLC candles for chart analysis. This panel does not place or manage orders.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(140px,1fr)_110px_130px_auto]">
          <input
            aria-label="Chart symbol"
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-2.5 text-sm outline-none ring-cyan-400/40 focus:ring"
            placeholder="BTCUSDT"
          />
          <select
            aria-label="Chart interval"
            value={interval}
            onChange={(event) => setInterval(event.target.value as BinanceKlineInterval)}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm outline-none ring-cyan-400/40 focus:ring"
          >
            {intervals.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select
            aria-label="Chart environment"
            value={environment}
            onChange={(event) => setEnvironment(event.target.value as BinanceStreamEnvironment)}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm outline-none ring-cyan-400/40 focus:ring"
          >
            <option value="live">Live public</option>
            <option value="testnet">Testnet</option>
          </select>
          <button
            type="button"
            disabled={loading}
            onClick={() => setRefreshKey((current) => current + 1)}
            className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {marketError && (
        <div className="mx-5 mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {marketError}
        </div>
      )}

      {accountDataError && (
        <div className="mx-5 mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          {accountDataError}
        </div>
      )}

      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <TradingViewChart
          data={chartData}
          priceLevels={environment === 'testnet' ? positionLevels : []}
          orderMarkers={environment === 'testnet' ? orderMarkers : []}
          loading={loading && candles.length === 0}
          emptyMessage={marketError ? 'Market candles could not be loaded.' : 'No candles returned for this market.'}
        />

        <aside className="rounded-2xl border border-white/10 bg-slate-950/30 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Latest candle</p>
          <p className="mt-2 text-lg font-semibold">{symbol || 'Market'}</p>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Open</dt><dd>{latest ? latest.open.toLocaleString() : '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">High</dt><dd>{latest ? latest.high.toLocaleString() : '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Low</dt><dd>{latest ? latest.low.toLocaleString() : '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Close</dt><dd>{latest ? latest.close.toLocaleString() : '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Volume</dt><dd>{latest ? latest.volume.toLocaleString() : '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Candles</dt><dd>{candles.length}</dd></div>
            {environment === 'testnet' && (
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Order markers</dt><dd>{orderMarkers.length}</dd></div>
            )}
          </dl>

          {environment === 'testnet' && (
            <div className="mt-6 border-t border-white/10 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Position levels</p>
              {positionLevels.length === 0 ? (
                <p className="mt-3 text-xs leading-5 text-slate-500">No open Testnet levels for this symbol.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {positionLevels.map((level, index) => (
                    <div key={`${level.label}-${level.value}-${index}`} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                      <p className="text-xs text-slate-500">{level.label}</p>
                      <p className="mt-1 text-sm font-medium">{level.value.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
