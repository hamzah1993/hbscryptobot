import { ArrowDownUp, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type MarketQuoteAsset, type MarketTicker } from '../lib/api';
import { usePolling } from './ui';

const QUOTES: MarketQuoteAsset[] = ['USDT', 'BTC', 'ETH', 'USDC'];
type SortKey = 'price' | 'change';
type Sort = { key: SortKey; dir: 'asc' | 'desc' } | null;

function formatPrice(value: number) {
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return value.toPrecision(4);
}

/** Binance spot market list with quote-asset filter, search, sorting and tick-direction colouring. */
export function MarketList({ token }: { token: string }) {
  const [quote, setQuote] = useState<MarketQuoteAsset>('USDT');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [sort, setSort] = useState<Sort>(null);
  const previous = useRef(new Map<string, number>());
  const direction = useRef(new Map<string, 'up' | 'down'>());

  const { data, error, refresh } = usePolling(async () => {
    const tickers = await api.listMarketTickers(token, quote);
    for (const ticker of tickers) {
      const before = previous.current.get(ticker.symbol);
      if (before !== undefined && before !== ticker.lastPrice) direction.current.set(ticker.symbol, ticker.lastPrice > before ? 'up' : 'down');
      previous.current.set(ticker.symbol, ticker.lastPrice);
    }
    return { quote, tickers };
  }, 5_000);
  useEffect(() => { void refresh(); }, [quote, refresh]);

  const rows = useMemo(() => {
    const tickers: MarketTicker[] = data && data.quote === quote ? data.tickers : [];
    const term = query.trim().toUpperCase();
    const filtered = term ? tickers.filter((ticker) => ticker.baseAsset.includes(term)) : tickers;
    if (!sort) return filtered;
    const value = (ticker: MarketTicker) => (sort.key === 'price' ? ticker.lastPrice : ticker.priceChangePercent);
    return [...filtered].sort((a, b) => (sort.dir === 'asc' ? value(a) - value(b) : value(b) - value(a)));
  }, [data, quote, query, sort]);

  function selectQuote(next: MarketQuoteAsset) {
    previous.current.clear(); direction.current.clear();
    setQuote(next);
  }

  function toggleSort(key: SortKey) {
    setSort((current) => (!current || current.key !== key ? { key, dir: 'desc' } : current.dir === 'desc' ? { key, dir: 'asc' } : null));
  }

  const sortIcon = (key: SortKey) => (sort?.key !== key ? <ArrowDownUp className="h-3.5 w-3.5" /> : sort.dir === 'desc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />);

  return <section className="rounded-2xl bg-white shadow-sm">
    <div className="flex items-center justify-between border-b border-slate-100 px-4 pt-3">
      <span className="border-b-2 border-teal-600 pb-2.5 text-base font-semibold text-teal-700">Spot</span>
      <span className="pb-2.5 text-xs text-slate-400">Binance prices</span>
    </div>
    <div className="flex items-center gap-2 px-4 py-3">
      {searching
        ? <label className="flex flex-1 items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">
            <Search className="h-4 w-4 text-slate-400" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search coin" className="w-full bg-transparent text-sm outline-none" />
            <button type="button" aria-label="Close search" onClick={() => { setQuery(''); setSearching(false); }}><X className="h-4 w-4 text-slate-400" /></button>
          </label>
        : <>
            <div className="flex flex-1 gap-1.5 overflow-x-auto">
              {QUOTES.map((item) => <button key={item} type="button" onClick={() => selectQuote(item)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${quote === item ? 'bg-teal-50 text-teal-700' : 'text-slate-500'}`}>{item}</button>)}
            </div>
            <button type="button" aria-label="Search" onClick={() => setSearching(true)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100"><Search className="h-5 w-5" /></button>
          </>}
    </div>
    <div className="flex items-center px-4 pb-2 text-xs text-slate-400">
      <span className="flex-1">Currency</span>
      <button type="button" onClick={() => toggleSort('price')} className="flex w-28 items-center justify-end gap-1">Last price {sortIcon('price')}</button>
      <button type="button" onClick={() => toggleSort('change')} className="flex w-28 items-center justify-end gap-1">24h change {sortIcon('change')}</button>
    </div>
    {error && !data && <p className="px-4 pb-4 text-sm text-rose-600">Market data is unavailable right now.</p>}
    {!data && !error && <p className="px-4 pb-6 text-sm text-slate-400">Loading markets…</p>}
    <ul>
      {rows.map((ticker) => {
        const dir = direction.current.get(ticker.symbol);
        const change = ticker.priceChangePercent;
        return <li key={ticker.symbol} className="flex items-center border-t border-slate-100 px-4 py-3.5">
          <span className="flex-1 text-[15px] font-semibold">{ticker.baseAsset}<span className="text-xs font-normal text-slate-400">/{ticker.quoteAsset}</span></span>
          <span className={`w-28 text-right text-[15px] tabular-nums ${dir === 'up' ? 'text-emerald-600' : dir === 'down' ? 'text-rose-600' : 'text-slate-900'}`}>{formatPrice(ticker.lastPrice)}</span>
          <span className="flex w-28 justify-end">
            <span className={`min-w-[76px] rounded-md px-2 py-1.5 text-center text-sm font-medium tabular-nums text-white ${change >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}>{change > 0 ? '+' : ''}{change.toFixed(2)}%</span>
          </span>
        </li>;
      })}
    </ul>
    {data && rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">No coins match “{query}”.</p>}
  </section>;
}
