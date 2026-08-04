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

export type TradingStrategy = {
  id: string;
  name: string;
  symbol: string;
  paperTrading: boolean;
  riskBudgetQuote: string;
  maxDcaOrders: number;
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
};

type AuthResponse = {
  user: AuthUser;
  accessToken: string;
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

export const api = {
  register: (payload: { email: string; fullName: string; password: string }) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  me: (token: string) => request<AuthUser>('/users/me', { headers: authHeaders(token) }),
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
