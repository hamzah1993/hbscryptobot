import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';

export type TradingViewCandle = {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type TradingViewPriceLevel = {
  label: string;
  value: number;
  kind?: 'ENTRY' | 'DCA' | 'TAKE_PROFIT' | 'INDEPENDENT_ENTRY' | 'INDEPENDENT_TAKE_PROFIT';
};

export type TradingViewOrderMarker = {
  time: Time;
  side: 'BUY' | 'SELL';
  label: string;
  kind?: 'ENTRY' | 'DCA' | 'TAKE_PROFIT' | 'INDEPENDENT_ENTRY' | 'INDEPENDENT_TAKE_PROFIT';
};

type Props = {
  data: TradingViewCandle[];
  priceLevels?: TradingViewPriceLevel[];
  orderMarkers?: TradingViewOrderMarker[];
  height?: number;
  loading?: boolean;
  emptyMessage?: string;
};

const priceLevelStyle = (kind: TradingViewPriceLevel['kind']) => {
  switch (kind) {
    case 'DCA':
      return { color: '#fbbf24', lineStyle: LineStyle.Dashed };
    case 'TAKE_PROFIT':
    case 'INDEPENDENT_TAKE_PROFIT':
      return { color: '#34d399', lineStyle: LineStyle.Dashed };
    case 'INDEPENDENT_ENTRY':
      return { color: '#a78bfa', lineStyle: LineStyle.Dotted };
    case 'ENTRY':
    default:
      return { color: '#22d3ee', lineStyle: LineStyle.Solid };
  }
};

const orderMarkerStyle = (marker: TradingViewOrderMarker): SeriesMarker<Time> => ({
  time: marker.time,
  position: marker.side === 'BUY' ? 'belowBar' : 'aboveBar',
  shape: marker.side === 'BUY' ? 'arrowUp' : 'arrowDown',
  color: marker.side === 'BUY' ? '#22d3ee' : '#fb7185',
  text: marker.label,
});

export function TradingViewChart({
  data,
  priceLevels = [],
  orderMarkers = [],
  height = 420,
  loading = false,
  emptyMessage = 'No market candles are available yet.',
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#07111f' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.08)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.16)',
      },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.16)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: 'rgba(34, 211, 238, 0.35)' },
        horzLine: { color: 'rgba(34, 211, 238, 0.35)' },
      },
      handleScroll: true,
      handleScale: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#34d399',
      downColor: '#fb7185',
      borderVisible: false,
      wickUpColor: '#34d399',
      wickDownColor: '#fb7185',
      priceLineVisible: true,
      lastValueVisible: true,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      chart.applyOptions({ width: entry.contentRect.width, height });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      priceLinesRef.current = [];
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    series.setData(data as CandlestickData<Time>[]);
    if (data.length > 0) chart.timeScale().fitContent();
  }, [data]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    priceLinesRef.current.forEach((line) => series.removePriceLine(line));
    priceLinesRef.current = priceLevels
      .filter((level) => Number.isFinite(level.value) && level.value > 0)
      .map((level) => {
        const style = priceLevelStyle(level.kind);
        return series.createPriceLine({
          price: level.value,
          title: level.label,
          color: style.color,
          lineStyle: style.lineStyle,
          lineWidth: 1,
          axisLabelVisible: true,
        });
      });
  }, [priceLevels]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const validMarkers = orderMarkers
      .filter((marker) => marker.label.trim().length > 0)
      .map(orderMarkerStyle)
      .sort((left, right) => Number(left.time) - Number(right.time));

    const markerApi = createSeriesMarkers(series, validMarkers);
    return () => markerApi.setMarkers([]);
  }, [orderMarkers]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#07111f]">
      <div ref={containerRef} className="w-full" style={{ height }} aria-label="TradingView candlestick chart" />
      {(loading || data.length === 0) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#07111f]/75 px-6 text-center text-sm text-slate-400 backdrop-blur-[1px]">
          {loading ? 'Loading market candles…' : emptyMessage}
        </div>
      )}
    </div>
  );
}
