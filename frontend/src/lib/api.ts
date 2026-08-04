const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
};

export type TradingOrder = {
  id: string;
  side: 'BUY' | 'SELL';
  level: number;
  independent: boolean;
  quoteAmount: string;
  averageFillPrice: string | null;
  createdAt: string;
};

export type TradingSubPosition = {
  id: string;
  level: number;
  status: 'OPEN' | 'CLOSED';
  quantity: string;
  costQuote: string;
  entryPrice: string;
  takeProfitPrice: string;
  realizedPnlQuote: string;
  openedAt: string;
  closedAt: string | null;
};

export type StrategyStatus = 'STOPPED' | 'RUNNING' | 'PAUSED';
export type BinanceStreamEnvironment = 'testnet' | 'live';
export type ExchangeEnvironment = 'TESTNET' | 'LIVE';
export type TestnetOrderStatus = 'PENDING' | 'PARTIALLY_FILLED' | 'FILLED' | 'REJECTED' | 'CANCELLED';
export type TestnetActionType = 'INITIAL_ENTRY' | 'DCA_ENTRY' | 'INDEPENDENT_ENTRY' | 'PARENT_EXIT' | 'INDEPENDENT_EXIT';
export type TestnetActionStatus = 'PENDING' | 'SUBMITTED' | 'COMPLETED' | 'FAILED';

export type ExchangeCredentialSummary = {
  id: string;
  exchange: 'BINANCE';
  environment: ExchangeEnvironment;
  createdAt: string;
  updatedAt: string;
};

export type BinanceAccountTestResponse = {
  makerCommission?: number;
  takerCommission?: number;
  buyerCommission?: number;
  sellerCommission?: number;
  canTrade?: boolean;
  canWithdraw?: boolean;
  canDeposit?: boolean;
  updateTime?: number;
  accountType?: string;
  balances?: Array<{
    asset: string;
    free: string;
    locked: string;
  }>;
  permissions?: string[];
};

export type TradingStrategy = {
  id: string;
  name: string;
  symbol: string;
  status?: StrategyStatus;
  environment?: ExchangeEnvironment;
  paperTrading: boolean;
  riskBudgetQuote: string;
  baseOrderQuote?: string;
  maxDcaOrders: number;
  dcaStepPercent?: string;
  dcaMultiplier?: string;
  takeProfitPercent?: string;
  independentFromLevel?: number;
};

export type TradingPosition = {
  id: string;
  symbol: string;
  status: 'OPEN' | 'CLOSING' | 'CLOSED' | 'ERROR';
  totalQuantity: string;
  totalCostQuote: string;
  averageEntryPrice: string;
  realizedPnlQuote: string;
  dcaCount: number;
  nextDcaPrice: string | null;
  takeProfitPrice: string | null;
  openedAt: string;
  closedAt: string | null;
  strategy: TradingStrategy;
  orders: TradingOrder[];
  subPositions: TradingSubPosition[];
};

export type TestnetOrder = {
  id: string;
  positionId: string;
  subPositionId: string | null;
  exchangeOrderId: string | null;
  clientOrderId: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  status: TestnetOrderStatus;
  level: number;
  independent: boolean;
  quantity: string;
  price: string | null;
  filledQuantity: string;
  quoteAmount: string;
  averageFillPrice: string | null;
  createdAt: string;
  updatedAt: string;
  position: {
    id: string;
    symbol: string;
    status: TradingPosition['status'];
    strategy: Pick<TradingStrategy, 'id' | 'name' | 'status' | 'environment' | 'paperTrading'>;
  };
  subPosition: {
    id: string;
    level: number;
    status: 'OPEN' | 'CLOSED';
  } | null;
  strategyAction: {
    id: string;
    type: TestnetActionType;
    status: TestnetActionStatus;
    actionKey: string;
    triggerPrice: string | null;
    createdAt: string;
    completedAt: string | null;
  } | null;
};

export type TestnetOrderSyncResponse = {
  tradingOrder: TestnetOrder;
  exchangeOrder: unknown;
  deltaQuantity: number;
  deltaQuoteAmount: number;
};

export type TestnetPosition = {
  id: string;
  userId: string;
  strategyId: string;
  symbol: string;
  status: TradingPosition['status'];
  totalQuantity: string;
  totalCostQuote: string;
  averageEntryPrice: string;
  realizedPnlQuote: string;
  dcaCount: number;
  nextDcaPrice: string | null;
  takeProfitPrice: string | null;
  openedAt: string;
  closedAt: string | null;
  updatedAt: string;
  strategy: TradingStrategy;
  subPositions: TradingSubPosition[];
  orders: Array<{
    id: string;
    exchangeOrderId: string | null;
    clientOrderId: string;
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT';
    status: TestnetOrderStatus;
    level: number;
    independent: boolean;
    quantity: string;
    filledQuantity: string;
    quoteAmount: string;
    averageFillPrice: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

export type TestnetAction = {
  id: string;
  userId: string;
  strategyId: string;
  positionId: string | null;
  subPositionId: string | null;
  orderId: string | null;
  actionKey: string;
  type: TestnetActionType;
  status: TestnetActionStatus;
  level: number | null;
  independent: boolean;
  side: 'BUY' | 'SELL';
  quantity: string | null;
  quoteAmount: string | null;
  triggerPrice: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  strategy: Pick<TradingStrategy, 'id' | 'name' | 'symbol' | 'status' | 'environment' | 'paperTrading'>;
  position: {
    id: string;
    symbol: string;
    status: TradingPosition['status'];
  } | null;
  subPosition: {
    id: string;
    level: number;
    status: 'OPEN' | 'CLOSED';
  } | null;
  order: {
    id: string;
    exchangeOrderId: string | null;
    clientOrderId: string;
    status: TestnetOrderStatus;
    filledQuantity: string;
    quoteAmount: string;
    averageFillPrice: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type StreamedMarketPrice = {
  symbol: string;
  price: number;
  eventTime: number;
  receivedAt: number;
  environment: BinanceStreamEnvironment;
};

export type MarketStreamStatus = {
  symbol: string;
  environment: BinanceStreamEnvironment;
  subscribed: boolean;
  connected: boolean;
  reconnectAttempts: number;
  latestPrice: StreamedMarketPrice | null;
};

type AuthResponse = {
  user: AuthUser;
  accessToken: string;
};

export type CreateStrategyPayload = {
  name: string;
  symbol: string;
  environment: ExchangeEnvironment;
  paperTrading: boolean;
  riskBudgetQuote: number;
  baseOrderQuote: number;
  maxDcaOrders: number;
  dcaStepPercent: number;
  dcaMultiplier: number;
  takeProfitPercent: number;
  independentFromLevel: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message ?? 'Request failed');
  }

  return response.json() as Promise<T>;
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
const toBinanceEnvironment = (environment: ExchangeEnvironment): BinanceStreamEnvironment =>
  environment === 'LIVE' ? 'live' : 'testnet';

export const api = {
  register: (payload: { email: string; fullName: string; password: string }) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  me: (token: string) => request<AuthUser>('/users/me', { headers: authHeaders(token) }),
  listStrategies: (token: string) =>
    request<TradingStrategy[]>('/strategies', { headers: authHeaders(token) }),
  createStrategy: (token: string, payload: CreateStrategyPayload) =>
    request<TradingStrategy>('/strategies', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    }),
  setStrategyStatus: (token: string, strategyId: string, status: StrategyStatus) =>
    request<TradingStrategy>(`/strategies/${strategyId}/status`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ status }),
    }),
  listTestnetOrders: (token: string, limit = 100) =>
    request<TestnetOrder[]>(`/strategies/testnet-orders?limit=${encodeURIComponent(String(limit))}`, {
      headers: authHeaders(token),
    }),
  syncTestnetOrder: (token: string, tradingOrderId: string) =>
    request<TestnetOrderSyncResponse>(`/strategies/testnet-orders/${tradingOrderId}/sync`, {
      method: 'POST',
      headers: authHeaders(token),
    }),
  listTestnetPositions: (token: string, limit = 100) =>
    request<TestnetPosition[]>(`/strategies/testnet-positions?limit=${encodeURIComponent(String(limit))}`, {
      headers: authHeaders(token),
    }),
  listTestnetActions: (token: string, limit = 100) =>
    request<TestnetAction[]>(`/strategies/testnet-actions?limit=${encodeURIComponent(String(limit))}`, {
      headers: authHeaders(token),
    }),
  listExchangeCredentials: (token: string) =>
    request<ExchangeCredentialSummary[]>('/exchange/credentials', { headers: authHeaders(token) }),
  saveBinanceCredentials: (
    token: string,
    payload: { apiKey: string; apiSecret: string; environment: ExchangeEnvironment },
  ) =>
    request<ExchangeCredentialSummary>('/exchange/credentials/binance', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    }),
  deleteBinanceCredentials: (token: string, environment: ExchangeEnvironment) =>
    request<{ deleted: boolean }>(`/exchange/credentials/binance/${environment}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    }),
  testBinanceConnection: (token: string, environment: ExchangeEnvironment) =>
    request<BinanceAccountTestResponse>('/exchange/binance/account/test', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ environment: toBinanceEnvironment(environment) }),
    }),
  subscribeMarketStream: (token: string, symbol: string, environment: BinanceStreamEnvironment) =>
    request<MarketStreamStatus>(`/market-data/stream/subscribe?symbol=${encodeURIComponent(symbol)}&environment=${environment}`, {
      method: 'POST',
      headers: authHeaders(token),
    }),
  unsubscribeMarketStream: (token: string, symbol: string, environment: BinanceStreamEnvironment) =>
    request<{ unsubscribed: boolean }>(`/market-data/stream/subscribe?symbol=${encodeURIComponent(symbol)}&environment=${environment}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    }),
  getMarketStreamStatus: (token: string, symbol: string, environment: BinanceStreamEnvironment) =>
    request<MarketStreamStatus>(`/market-data/stream/status?symbol=${encodeURIComponent(symbol)}&environment=${environment}`, {
      headers: authHeaders(token),
    }),
  getStreamedMarketPrice: (token: string, symbol: string, environment: BinanceStreamEnvironment) =>
    request<StreamedMarketPrice | null>(`/market-data/stream/price?symbol=${encodeURIComponent(symbol)}&environment=${environment}`, {
      headers: authHeaders(token),
    }),
  openPaperPosition: (token: string, strategyId: string, marketPrice: number) =>
    request<TradingPosition>('/paper-trading/positions/open', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ strategyId, marketPrice }),
    }),
  listPaperPositions: (token: string) =>
    request<TradingPosition[]>('/paper-trading/positions', { headers: authHeaders(token) }),
  tickPaperPosition: (token: string, positionId: string, marketPrice: number) =>
    request<{ action: 'DCA' | 'TAKE_PROFIT' | 'HOLD'; position: TradingPosition }>(
      `/paper-trading/positions/${positionId}/tick`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ marketPrice }),
      },
    ),
  closePaperPosition: (token: string, positionId: string, marketPrice: number) =>
    request<TradingPosition>(`/paper-trading/positions/${positionId}/close`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ marketPrice }),
    }),
};
