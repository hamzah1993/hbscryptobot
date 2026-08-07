const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  createdAt?: string;
};

export type AdminBackup = { filename: string; sizeBytes: number; createdAt: string; checksum?: string; verified?: boolean };
export type AdminHealth = {
  backend: 'HEALTHY' | 'ERROR'; database: 'HEALTHY' | 'ERROR'; redis: 'HEALTHY' | 'ERROR'; scheduler: string;
  runningStrategies: number; backupTools: 'AVAILABLE' | 'MISSING'; backupDirectory: string; persistentBackupDirectoryConfigured: boolean; automaticBackupsEnabled: boolean;
  maintenance: { active: boolean; reason?: string | null; startedAt?: string | null }; timestamp: string;
};
export type AdminAuditEvent = { id: string; action: string; target: string | null; metadata?: Record<string, unknown> | null; createdAt: string; admin: { id: string; email: string; fullName: string } };

export type TradingOrder = {
  id: string;
  side: 'BUY' | 'SELL';
  level: number;
  independent: boolean;
  quoteAmount: string;
  feeQuote?: string | null;
  averageFillPrice: string | null;
  executionLatencyMs?: number | null;
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
export type TakeProfitTarget = 'PARENT' | 'RECOVERY' | 'INDEPENDENT';
export type BinanceStreamEnvironment = 'testnet' | 'live';
export type ExchangeEnvironment = 'TESTNET' | 'LIVE';
export type BinanceKlineInterval =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '8h'
  | '12h'
  | '1d'
  | '3d'
  | '1w'
  | '1M';
export type TestnetOrderStatus = 'PENDING' | 'PARTIALLY_FILLED' | 'FILLED' | 'REJECTED' | 'CANCELLED';
export type TestnetActionType = 'INITIAL_ENTRY' | 'DCA_ENTRY' | 'INDEPENDENT_ENTRY' | 'RECOVERY_DCA_ENTRY' | 'PARENT_EXIT' | 'INDEPENDENT_EXIT';
export type TestnetActionStatus = 'PENDING' | 'SUBMITTED' | 'COMPLETED' | 'FAILED';
export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type BacktestRunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type BacktestStrategyMode = 'BASELINE' | 'DCA_ONLY' | 'DCA_SUB_POSITIONS';
export type BacktestTradeType = 'PARENT_ENTRY' | 'INDEPENDENT_ENTRY' | 'RECOVERY_ENTRY' | 'PARENT_EXIT' | 'INDEPENDENT_EXIT';

export type TestnetRunnerHealth = {
  scheduler: 'HEALTHY' | 'DELAYED' | 'ERROR' | 'IDLE';
  orderSync: 'HEALTHY' | 'DELAYED' | 'ERROR' | 'IDLE';
  retryScheduler: 'HEALTHY' | 'DELAYED' | 'ERROR' | 'IDLE';
  redis: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  lastStrategyTickAt: string | null;
  lastOrderSyncAt: string | null;
  lastRetryTickAt: string | null;
  lastError: string | null;
};

export type ProductionReadiness = {
  executionEvidence: {
    sampleCount: number; minimumSamples: number; targetMs: number; averageMs: number | null;
    p95Ms: number | null; maxMs: number | null; withinTargetCount: number; overTargetCount: number;
    meetsTarget: boolean;
    retryPolicy: { initialAttempt: number; retries: number; totalAttempts: number; backoff: string };
  };
  runner: TestnetRunnerHealth;
  unresolvedActions: number;
  permanentFailures: number;
  notificationReadiness: {
    email: { enabled: boolean; providerConfigured: boolean };
    telegram: { enabled: boolean; providerConfigured: boolean };
    atLeastOneProviderConfigured: boolean;
  };
  hardeningChecks: Record<string, boolean>;
  productionHardeningReady: boolean;
  liveChecks: Record<string, boolean>;
  liveSafetyProfile: {
    capitalCeilingQuote: number | null;
    confirmedAt: string | null;
    confirmationVersion: string | null;
  };
  liveConfirmationAvailable: boolean;
  liveMoneyReady: boolean;
};

export type LiveTradingSafetyProfile = {
  capitalCeilingQuote: number | null;
  confirmationVersion: string | null;
  confirmedAt: string | null;
  confirmationPhrase: string;
  activationEnabled: false;
};

export type OperationalNotification = {
  id: string;
  event: string;
  message: string;
  severity: NotificationSeverity;
  userId?: string;
  strategyId?: string;
  positionId?: string;
  orderId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type NotificationChannelSettings = {
  email: {
    enabled: boolean;
    address: string;
    minimumSeverity: NotificationSeverity;
    providerConfigured: boolean;
  };
  telegram: {
    enabled: boolean;
    chatId: string;
    connected: boolean;
    minimumSeverity: NotificationSeverity;
    providerConfigured: boolean;
    connectionConfigured: boolean;
  };
};

export type TelegramConnectionLink = {
  url: string;
  expiresAt: string;
};

export type ExchangeCredentialSummary = {
  id: string;
  exchange: 'BINANCE' | 'BYBIT' | 'OKX';
  environment: ExchangeEnvironment;
  createdAt: string;
  updatedAt: string;
};

export type DemoExchange = 'BYBIT' | 'OKX';

export type DemoExchangeConnectionResponse = {
  connected: boolean;
  exchange: DemoExchange;
  environment: 'TESTNET' | 'DEMO';
  account: unknown;
};

export type DemoExchangeOrder = {
  exchange: DemoExchange;
  exchangeOrderId: string;
  clientOrderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  status: 'PENDING' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  quantity: string;
  filledQuantity: string;
  quoteAmount: string;
  averageFillPrice: string | null;
  price: string | null;
  duplicateRecovered?: boolean;
  attemptCount?: number;
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
  balances?: Array<{ asset: string; free: string; locked: string }>;
  permissions?: string[];
};

export type BinanceTestnetConnectionResponse = {
  connected: boolean;
  exchange: 'BINANCE';
  environment: 'TESTNET';
  canTrade: boolean;
  accountType: string | null;
};

export type BinanceLiveConnectionResponse = {
  connected: boolean;
  exchange: 'BINANCE';
  environment: 'LIVE';
  canTrade: boolean;
  canWithdraw: boolean;
  spotEnabled: boolean;
  accountType: string | null;
  permissions: string[];
};

export type BinanceTestnetBalancesResponse = {
  exchange: 'BINANCE';
  environment: ExchangeEnvironment;
  canTrade: boolean;
  balances: Array<{ asset: string; free: number; locked: number }>;
};

export type TestnetOrderPreview = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  marketPrice: number;
  requestedQuoteAmount: number;
  rawQuantity: number;
  normalizedQuantity: string;
  estimatedSpend: number;
  availableQuote: number;
  remainingQuote: number;
  quantityFilterType: 'MARKET_LOT_SIZE' | 'LOT_SIZE';
  minQuantity: number;
  maxQuantity: number;
  stepSize: string;
  minNotional: number;
};

export type TradingStrategy = {
  id: string;
  name: string;
  symbol: string;
  exchange?: 'BINANCE' | 'BYBIT' | 'OKX';
  status?: StrategyStatus;
  environment?: ExchangeEnvironment;
  paperTrading: boolean;
  riskBudgetQuote: string;
  baseOrderQuote?: string;
  maxDcaOrders: number;
  dcaStepPercent?: string;
  dcaMultiplier?: string;
  dcaMultipliers?: number[];
  takeProfitPercent?: string;
  subPositionTriggerPercent?: string;
  subPositionTakeProfitPercent?: string;
  independentFromLevel?: number;
  basePositionPercent?: string;
  maxTotalRiskPercent?: string;
  maxOpenPairs?: number;
  cooldownMinutes?: number;
  recoveryEnabled?: boolean;
  recoveryMaxOrders?: number;
  recoveryStepPercents?: number[];
  recoveryMultipliers?: number[];
  recoveryTakeProfitPercent?: string;
  maxStrategyExposureQuote?: string | null;
  maxOrderQuote?: string | null;
  maxDailyRealizedLossQuote?: string | null;
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
  recoveryMode: boolean;
  recoveryDcaCount: number;
  recoveryAnchorPrice: string | null;
  recoveryTakeProfitPrice: string | null;
  nextDcaPrice: string | null;
  takeProfitPrice: string | null;
  openedAt: string;
  closedAt: string | null;
  strategy: TradingStrategy;
  orders: TradingOrder[];
  subPositions: TradingSubPosition[];
};

export type BacktestTrade = {
  id: string;
  runId: string;
  type: BacktestTradeType;
  level: number;
  independent: boolean;
  executedAt: string;
  price: string;
  quantity: string;
  quoteAmount: string;
  feeQuote: string;
  realizedPnlQuote: string | null;
};

export type BacktestEquityPoint = {
  id: string;
  runId: string;
  recordedAt: string;
  equityQuote: string;
  drawdownPercent: string;
};

export type BacktestRun = {
  id: string;
  userId: string;
  strategyId: string;
  exchange: 'BINANCE';
  symbol: string;
  interval: string;
  startTime: string;
  endTime: string;
  status: BacktestRunStatus;
  strategyMode: BacktestStrategyMode;
  initialCapital: string;
  endingCapital: string | null;
  realizedPnlQuote: string | null;
  returnPercent: string | null;
  maxDrawdownPercent: string | null;
  tradeCount: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  strategy?: TradingStrategy & { name?: string };
  trades?: BacktestTrade[];
  equityPoints?: BacktestEquityPoint[];
};

export type BacktestReport = {
  run: BacktestRun & {
    strategy: TradingStrategy & { name: string };
    trades: BacktestTrade[];
    equityPoints: BacktestEquityPoint[];
  };
  analytics: {
    completedExitCount: number;
    winningTradeCount: number;
    losingTradeCount: number;
    winRatePercent: string;
    grossProfitQuote: string;
    grossLossQuote: string;
    averageWinQuote: string;
    averageLossQuote: string;
    profitFactor: string | null;
    peakEquityQuote: string;
    maximumDcaLevelUsed: number;
    independentEntries: number;
    independentExits: number;
    entryCount: number;
    totalFeesQuote: string;
    maximumCapitalDeployedQuote: string;
    longestUnderwaterMinutes: number;
    averageRecoveryMinutes: number | null;
  };
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
  feeQuote: string | null;
  averageFillPrice: string | null;
  executionLatencyMs: number | null;
  createdAt: string;
  updatedAt: string;
  position: {
    id: string;
    symbol: string;
    status: TradingPosition['status'];
    strategy: Pick<TradingStrategy, 'id' | 'name' | 'status' | 'environment' | 'paperTrading'>;
  };
  subPosition: { id: string; level: number; status: 'OPEN' | 'CLOSED' } | null;
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
  recoveryMode: boolean;
  recoveryDcaCount: number;
  recoveryAnchorPrice: string | null;
  recoveryTakeProfitPrice: string | null;
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
    feeQuote?: string | null;
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
  position: { id: string; symbol: string; status: TradingPosition['status'] } | null;
  subPosition: { id: string; level: number; status: 'OPEN' | 'CLOSED' } | null;
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

export type TestnetEmergencyStopResponse = {
  environment: 'TESTNET';
  stoppedAt: string;
  stoppedStrategies: number;
  cancelledPendingActions?: number;
  cancelledPendingOrRetryableActions?: number;
};

export type TestnetEmergencyExitResponse = {
  environment: 'TESTNET' | 'LIVE';
  exchange: 'BINANCE';
  startedAt: string;
  positionsFound: number;
  exitOrdersSubmitted: number;
  failedCloses: number;
  cancellationFailures: number;
  reentryBlocked: boolean;
};

export type MarketCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
};

export type MarketCandlesResponse = {
  symbol: string;
  interval: BinanceKlineInterval;
  environment: BinanceStreamEnvironment;
  candles: MarketCandle[];
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

export type StreamedMarketPricesResponse = {
  environment: BinanceStreamEnvironment;
  prices: Array<{ symbol: string; price: StreamedMarketPrice | null }>;
};

type AuthResponse = {
  user: AuthUser;
  accessToken: string;
};

export type CreateStrategyPayload = {
  name: string;
  symbol: string;
  exchange: 'BINANCE' | 'BYBIT' | 'OKX';
  environment: ExchangeEnvironment;
  paperTrading: boolean;
  riskBudgetQuote: number;
  baseOrderQuote: number;
  maxDcaOrders: number;
  dcaStepPercent: number;
  dcaMultiplier: number;
  dcaMultipliers: number[];
  takeProfitPercent: number;
  subPositionTriggerPercent: number;
  subPositionTakeProfitPercent: number;
  independentFromLevel: number;
  basePositionPercent: number;
  maxTotalRiskPercent: number;
  maxOpenPairs: number;
  cooldownMinutes: number;
  recoveryEnabled: boolean;
  recoveryMaxOrders: number;
  recoveryStepPercents: number[];
  recoveryMultipliers: number[];
  recoveryTakeProfitPercent: number;
  maxStrategyExposureQuote: number | null;
  maxOrderQuote: number | null;
  maxDailyRealizedLossQuote: number | null;
};

export type CreateBacktestPayload = {
  strategyId: string;
  symbol: string;
  interval: string;
  startTime: string;
  endTime: string;
  initialCapital: number;
  strategyMode: BacktestStrategyMode;
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

async function requestText(path: string, token: string): Promise<string> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message ?? 'Request failed');
  }
  return response.text();
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
const toBinanceEnvironment = (environment: ExchangeEnvironment): BinanceStreamEnvironment =>
  environment === 'LIVE' ? 'live' : 'testnet';

export const api = {
  register: (payload: { email: string; fullName: string; password: string; deviceId?: string }) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string; deviceId?: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  forgotPassword: (email: string) =>
    request<{ requested: true }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, newPassword: string) =>
    request<{ reset: true; sessionsInvalidated: true }>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    request<{ changed: true; sessionsInvalidated: true }>('/auth/change-password', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ currentPassword, newPassword }) }),
  me: (token: string) => request<AuthUser>('/users/me', { headers: authHeaders(token) }),
  getAdminHealth: (token: string) => request<AdminHealth>('/admin/health', { headers: authHeaders(token) }),
  listAdminBackups: (token: string) => request<AdminBackup[]>('/admin/backups', { headers: authHeaders(token) }),
  createAdminBackup: (token: string) => request<AdminBackup>('/admin/backups', { method: 'POST', headers: authHeaders(token) }),
  listAdminAudit: (token: string) => request<AdminAuditEvent[]>('/admin/audit?limit=100', { headers: authHeaders(token) }),
  restoreAdminBackup: (token: string, filename: string, confirmation: string) => request<{ restored: true; filename: string; safetyBackup: string; tradingResumed: false }>('/admin/restore', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ filename, confirmation }) }),
  async downloadAdminBackup(token: string, filename: string) {
    const response = await fetch(`${API_URL}/admin/backups/${encodeURIComponent(filename)}/download`, { headers: authHeaders(token) });
    if (!response.ok) throw new Error((await response.text()) || `Request failed (${response.status})`);
    return response.blob();
  },
  listStrategies: (token: string) => request<TradingStrategy[]>('/strategies', { headers: authHeaders(token) }),
  createStrategy: (token: string, payload: CreateStrategyPayload) =>
    request<TradingStrategy>('/strategies', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) }),
  updateStrategy: (token: string, strategyId: string, payload: Partial<CreateStrategyPayload>) =>
    request<TradingStrategy>(`/strategies/${strategyId}`, { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(payload) }),
  deleteStrategy: (token: string, strategyId: string) =>
    request<{ deleted: boolean }>(`/strategies/${strategyId}`, { method: 'DELETE', headers: authHeaders(token) }),
  setStrategyStatus: (token: string, strategyId: string, status: StrategyStatus) =>
    request<TradingStrategy>(`/strategies/${strategyId}/status`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ status }) }),
  previewTestnetOrder: (token: string, payload: { symbol: string; quoteAmount: number }) =>
    request<TestnetOrderPreview>('/strategies/testnet-order-preview', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) }),
  previewLiveOrder: (token: string, payload: { symbol: string; quoteAmount: number }) =>
    request<TestnetOrderPreview>('/strategies/live-order-preview', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) }),
  executeTestnetOrder: (token: string, strategyId: string, payload: { side: 'BUY' | 'SELL'; quantity: number; type?: 'MARKET' | 'LIMIT'; price?: number }) =>
    request<unknown>(`/strategies/${strategyId}/testnet-order`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) }),
  executeLiveOrder: (token: string, strategyId: string, payload: { side: 'BUY' | 'SELL'; quantity: number; type?: 'MARKET' | 'LIMIT'; price?: number }) =>
    request<unknown>(`/strategies/${strategyId}/live-order`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) }),
  closeTestnetPosition: (token: string, positionId: string, subPositionId?: string) =>
    request<unknown>(`/strategies/testnet-positions/${encodeURIComponent(positionId)}/close`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(subPositionId ? { subPositionId } : {}),
    }),
  updateTestnetPositionTakeProfit: (token: string, positionId: string, payload: { target: TakeProfitTarget; takeProfitPrice: number; subPositionId?: string }) =>
    request<TestnetPosition>(`/strategies/testnet-positions/${encodeURIComponent(positionId)}/take-profit`, {
      method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(payload),
    }),
  closeLivePosition: (token: string, positionId: string, subPositionId?: string) =>
    request<unknown>(`/strategies/live-positions/${encodeURIComponent(positionId)}/close`, {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify(subPositionId ? { subPositionId } : {}),
    }),
  updateLivePositionTakeProfit: (token: string, positionId: string, payload: { target: TakeProfitTarget; takeProfitPrice: number; subPositionId?: string }) =>
    request<TestnetPosition>(`/strategies/live-positions/${encodeURIComponent(positionId)}/take-profit`, {
      method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(payload),
    }),
  getTestnetRunnerHealth: (token: string) =>
    request<TestnetRunnerHealth>('/strategies/testnet-runner-health', { headers: authHeaders(token) }),
  getProductionReadiness: (token: string) =>
    request<ProductionReadiness>('/strategies/production-readiness', { headers: authHeaders(token) }),
  getLiveTradingSafety: (token: string) =>
    request<LiveTradingSafetyProfile>('/strategies/live-safety', { headers: authHeaders(token) }),
  setLiveTradingCapitalCeiling: (token: string, capitalCeilingQuote: number) =>
    request<LiveTradingSafetyProfile>('/strategies/live-safety', { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ capitalCeilingQuote }) }),
  confirmLiveTrading: (token: string, confirmation: string) =>
    request<LiveTradingSafetyProfile>('/strategies/live-safety/confirm', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ confirmation }) }),
  listBacktests: (token: string, limit = 100) =>
    request<BacktestRun[]>(`/backtests?limit=${encodeURIComponent(String(limit))}`, { headers: authHeaders(token) }),
  createBacktest: (token: string, payload: CreateBacktestPayload) =>
    request<BacktestRun>('/backtests', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) }),
  startBacktest: (token: string, runId: string) =>
    request<BacktestRun>(`/backtests/${encodeURIComponent(runId)}/start`, { method: 'POST', headers: authHeaders(token) }),
  getBacktestReport: (token: string, runId: string) =>
    request<BacktestReport>(`/backtests/${encodeURIComponent(runId)}/report`, { headers: authHeaders(token) }),
  compareBacktests: (token: string, runIds: string[]) =>
    request<BacktestReport[]>(`/backtests/compare?runIds=${encodeURIComponent(runIds.join(','))}`, { headers: authHeaders(token) }),
  exportBacktestTradesCsv: (token: string, runId: string) =>
    requestText(`/backtests/${encodeURIComponent(runId)}/export/trades.csv`, token),
  exportBacktestEquityCsv: (token: string, runId: string) =>
    requestText(`/backtests/${encodeURIComponent(runId)}/export/equity.csv`, token),
  listNotifications: (token: string, limit = 100) =>
    request<OperationalNotification[]>(`/strategies/notifications?limit=${encodeURIComponent(String(limit))}`, { headers: authHeaders(token) }),
  getNotificationChannels: (token: string) =>
    request<NotificationChannelSettings>('/strategies/notifications/channels', { headers: authHeaders(token) }),
  updateNotificationChannels: (token: string, payload: Omit<NotificationChannelSettings, 'email' | 'telegram'> & {
    email: Omit<NotificationChannelSettings['email'], 'providerConfigured'>;
    telegram: Pick<NotificationChannelSettings['telegram'], 'enabled' | 'minimumSeverity'>;
  }) => request<NotificationChannelSettings>('/strategies/notifications/channels', {
    method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(payload),
  }),
  testNotificationChannel: (token: string, channel: 'email' | 'telegram') =>
    request<{ delivered: true; channel: 'EMAIL' | 'TELEGRAM' }>(`/strategies/notifications/channels/${channel}/test`, { method: 'POST', headers: authHeaders(token) }),
  connectTelegram: (token: string) =>
    request<TelegramConnectionLink>('/strategies/notifications/telegram/connect', { method: 'POST', headers: authHeaders(token) }),
  disconnectTelegram: (token: string) =>
    request<{ disconnected: true }>('/strategies/notifications/telegram', { method: 'DELETE', headers: authHeaders(token) }),
  listTestnetOrders: (token: string, limit = 100) =>
    request<TestnetOrder[]>(`/strategies/testnet-orders?limit=${encodeURIComponent(String(limit))}`, { headers: authHeaders(token) }),
  syncTestnetOrder: (token: string, tradingOrderId: string) =>
    request<TestnetOrderSyncResponse>(`/strategies/testnet-orders/${tradingOrderId}/sync`, { method: 'POST', headers: authHeaders(token) }),
  listTestnetPositions: (token: string, limit = 100) =>
    request<TestnetPosition[]>(`/strategies/testnet-positions?limit=${encodeURIComponent(String(limit))}`, { headers: authHeaders(token) }),
  listLiveOrders: (token: string, limit = 100) =>
    request<TestnetOrder[]>(`/strategies/live-orders?limit=${encodeURIComponent(String(limit))}`, { headers: authHeaders(token) }),
  syncLiveOrder: (token: string, tradingOrderId: string) =>
    request<TestnetOrderSyncResponse>(`/strategies/live-orders/${tradingOrderId}/sync`, { method: 'POST', headers: authHeaders(token) }),
  listLivePositions: (token: string, limit = 100) =>
    request<TestnetPosition[]>(`/strategies/live-positions?limit=${encodeURIComponent(String(limit))}`, { headers: authHeaders(token) }),
  listLiveActions: (token: string, limit = 100) =>
    request<TestnetAction[]>(`/strategies/live-actions?limit=${encodeURIComponent(String(limit))}`, { headers: authHeaders(token) }),
  listTestnetActions: (token: string, limit = 100) =>
    request<TestnetAction[]>(`/strategies/testnet-actions?limit=${encodeURIComponent(String(limit))}`, { headers: authHeaders(token) }),
  stopTestnetStrategies: (token: string) =>
    request<TestnetEmergencyStopResponse>('/strategies/testnet-emergency-stop', { method: 'POST', headers: authHeaders(token) }),
  emergencyExitTestnet: (token: string) =>
    request<TestnetEmergencyExitResponse>('/strategies/testnet-emergency-exit', { method: 'POST', headers: authHeaders(token) }),
  emergencyExitLive: (token: string) =>
    request<TestnetEmergencyExitResponse>('/strategies/live-emergency-exit', { method: 'POST', headers: authHeaders(token) }),
  listExchangeCredentials: (token: string) =>
    request<ExchangeCredentialSummary[]>('/exchange/credentials', { headers: authHeaders(token) }),
  saveBinanceCredentials: (token: string, payload: { apiKey: string; apiSecret: string; environment: ExchangeEnvironment }) =>
    request<ExchangeCredentialSummary>('/exchange/credentials/binance', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) }),
  saveBinanceTestnetCredentials: (token: string, payload: { apiKey: string; apiSecret: string }) =>
    request<ExchangeCredentialSummary>('/exchange/credentials/binance', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ ...payload, environment: 'TESTNET' }) }),
  saveBybitTestnetCredentials: (token: string, payload: { apiKey: string; apiSecret: string }) =>
    request<ExchangeCredentialSummary>('/exchange/credentials/bybit', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) }),
  saveOkxDemoCredentials: (token: string, payload: { apiKey: string; apiSecret: string; passphrase: string }) =>
    request<ExchangeCredentialSummary>('/exchange/credentials/okx', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) }),
  testDemoExchangeConnection: (token: string, exchange: DemoExchange) =>
    request<DemoExchangeConnectionResponse>(`/exchange/demo/${exchange.toLowerCase()}/test-connection`, { method: 'POST', headers: authHeaders(token) }),
  deleteDemoExchangeCredentials: (token: string, exchange: DemoExchange) =>
    request<{ deleted: boolean }>(`/exchange/credentials/${exchange.toLowerCase()}/demo`, { method: 'DELETE', headers: authHeaders(token) }),
  placeDemoExchangeOrder: (token: string, exchange: DemoExchange, payload: { symbol: string; side: 'BUY' | 'SELL'; type: 'MARKET' | 'LIMIT'; quantity: number; price?: number; clientOrderId: string }) =>
    request<DemoExchangeOrder>(`/exchange/demo/${exchange.toLowerCase()}/orders`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) }),
  getDemoExchangeOrder: (token: string, exchange: DemoExchange, symbol: string, orderId: string) =>
    request<DemoExchangeOrder>(`/exchange/demo/${exchange.toLowerCase()}/orders/${encodeURIComponent(orderId)}?symbol=${encodeURIComponent(symbol)}`, { headers: authHeaders(token) }),
  cancelDemoExchangeOrder: (token: string, exchange: DemoExchange, symbol: string, orderId: string) =>
    request<DemoExchangeOrder>(`/exchange/demo/${exchange.toLowerCase()}/orders/${encodeURIComponent(orderId)}/cancel`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ symbol }) }),
  deleteBinanceCredentials: (token: string, environment: ExchangeEnvironment) =>
    request<{ deleted: boolean }>(`/exchange/credentials/binance/${environment}`, { method: 'DELETE', headers: authHeaders(token) }),
  testBinanceConnection: (token: string, environment: ExchangeEnvironment) =>
    request<BinanceAccountTestResponse>('/exchange/binance/account/test', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ environment: toBinanceEnvironment(environment) }) }),
  testBinanceTestnetConnection: (token: string) =>
    request<BinanceTestnetConnectionResponse>('/exchange/credentials/binance/testnet/test-connection', { method: 'POST', headers: authHeaders(token) }),
  testBinanceLiveConnection: (token: string) =>
    request<BinanceLiveConnectionResponse>('/exchange/credentials/binance/live/test-connection', { method: 'POST', headers: authHeaders(token) }),
  getBinanceTestnetBalances: (token: string) =>
    request<BinanceTestnetBalancesResponse>('/exchange/credentials/binance/testnet/balances', { headers: authHeaders(token) }),
  getBinanceLiveBalances: (token: string) =>
    request<BinanceTestnetBalancesResponse>('/exchange/credentials/binance/live/balances', { headers: authHeaders(token) }),
  getMarketCandles: (token: string, symbol: string, interval: BinanceKlineInterval = '5m', limit = 200, environment: BinanceStreamEnvironment = 'live') =>
    request<MarketCandlesResponse>(`/market-data/candles?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(String(limit))}&environment=${environment}`, { headers: authHeaders(token) }),
  subscribeMarketStream: (token: string, symbol: string, environment: BinanceStreamEnvironment) =>
    request<MarketStreamStatus>(`/market-data/stream/subscribe?symbol=${encodeURIComponent(symbol)}&environment=${environment}`, { method: 'POST', headers: authHeaders(token) }),
  unsubscribeMarketStream: (token: string, symbol: string, environment: BinanceStreamEnvironment) =>
    request<{ unsubscribed: boolean }>(`/market-data/stream/subscribe?symbol=${encodeURIComponent(symbol)}&environment=${environment}`, { method: 'DELETE', headers: authHeaders(token) }),
  getMarketStreamStatus: (token: string, symbol: string, environment: BinanceStreamEnvironment) =>
    request<MarketStreamStatus>(`/market-data/stream/status?symbol=${encodeURIComponent(symbol)}&environment=${environment}`, { headers: authHeaders(token) }),
  getStreamedMarketPrice: (token: string, symbol: string, environment: BinanceStreamEnvironment) =>
    request<StreamedMarketPrice | null>(`/market-data/stream/price?symbol=${encodeURIComponent(symbol)}&environment=${environment}`, { headers: authHeaders(token) }),
  getStreamedMarketPrices: (token: string, symbols: string[], environment: BinanceStreamEnvironment) =>
    request<StreamedMarketPricesResponse>(`/market-data/stream/prices?symbols=${encodeURIComponent(symbols.join(','))}&environment=${environment}`, { headers: authHeaders(token) }),
  openPaperPosition: (token: string, strategyId: string, marketPrice: number) =>
    request<TradingPosition>('/paper-trading/positions/open', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ strategyId, marketPrice }) }),
  listPaperPositions: (token: string) => request<TradingPosition[]>('/paper-trading/positions', { headers: authHeaders(token) }),
  tickPaperPosition: (token: string, positionId: string, marketPrice: number) =>
    request<{ action: 'DCA' | 'TAKE_PROFIT' | 'HOLD'; position: TradingPosition }>(`/paper-trading/positions/${positionId}/tick`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ marketPrice }) }),
  closePaperPosition: (token: string, positionId: string, marketPrice: number) =>
    request<TradingPosition>(`/paper-trading/positions/${positionId}/close`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ marketPrice }) }),
  updatePaperPositionTakeProfit: (token: string, positionId: string, payload: { target: TakeProfitTarget; takeProfitPrice: number; subPositionId?: string }) =>
    request<TradingPosition>(`/paper-trading/positions/${encodeURIComponent(positionId)}/take-profit`, {
      method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(payload),
    }),
};
