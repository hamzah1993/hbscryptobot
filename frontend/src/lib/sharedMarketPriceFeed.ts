import { api, type BinanceStreamEnvironment, type StreamedMarketPrice } from './api';

type PriceListener = (price: StreamedMarketPrice | null) => void;

type FeedGroup = {
  token: string;
  environment: BinanceStreamEnvironment;
  listeners: Map<string, Set<PriceListener>>;
  subscribed: Set<string>;
  subscribing: Set<string>;
  timer?: number;
  polling: boolean;
};

const groups = new Map<string, FeedGroup>();

const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

const groupKey = (token: string, environment: BinanceStreamEnvironment) => `${environment}:${token}`;

function getGroup(token: string, environment: BinanceStreamEnvironment) {
  const key = groupKey(token, environment);
  let group = groups.get(key);
  if (!group) {
    group = { token, environment, listeners: new Map(), subscribed: new Set(), subscribing: new Set(), polling: false };
    groups.set(key, group);
  }
  return group;
}

async function ensureSubscribed(group: FeedGroup, symbol: string) {
  if (group.subscribed.has(symbol) || group.subscribing.has(symbol)) return;
  group.subscribing.add(symbol);
  try {
    await api.subscribeMarketStream(group.token, symbol, group.environment);
    group.subscribed.add(symbol);
  } catch {
    // The price poll keeps running; a later cycle can retry the subscription.
  } finally {
    group.subscribing.delete(symbol);
  }
}

async function poll(group: FeedGroup) {
  if (group.polling) return;
  const symbols = [...group.listeners.entries()]
    .filter(([, listeners]) => listeners.size > 0)
    .map(([symbol]) => symbol);
  if (symbols.length === 0) return;

  group.polling = true;
  try {
    await Promise.all(symbols.map((symbol) => ensureSubscribed(group, symbol)));
    const response = await api.getStreamedMarketPrices(group.token, symbols, group.environment);
    const bySymbol = new Map(response.prices.map((item) => [item.symbol, item.price]));
    for (const symbol of symbols) {
      const price = bySymbol.get(symbol) ?? null;
      for (const listener of group.listeners.get(symbol) ?? []) listener(price);
    }
  } catch {
    for (const symbol of symbols) {
      for (const listener of group.listeners.get(symbol) ?? []) listener(null);
    }
  } finally {
    group.polling = false;
    if ([...group.listeners.values()].some((listeners) => listeners.size > 0)) {
      group.timer = window.setTimeout(() => void poll(group), 1000);
    }
  }
}

export function subscribeSharedMarketPrice(
  token: string,
  symbol: string,
  environment: BinanceStreamEnvironment,
  listener: PriceListener,
) {
  const normalized = normalizeSymbol(symbol);
  const key = groupKey(token, environment);
  const group = getGroup(token, environment);
  let listeners = group.listeners.get(normalized);
  if (!listeners) {
    listeners = new Set();
    group.listeners.set(normalized, listeners);
  }
  listeners.add(listener);

  if (!group.polling && !group.timer) void poll(group);

  return () => {
    const current = group.listeners.get(normalized);
    current?.delete(listener);
    if (current?.size === 0) group.listeners.delete(normalized);
    if (group.listeners.size === 0) {
      if (group.timer) window.clearTimeout(group.timer);
      group.timer = undefined;
      groups.delete(key);
    }
  };
}
