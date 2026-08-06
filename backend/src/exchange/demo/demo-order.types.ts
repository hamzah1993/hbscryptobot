export type DemoExchange = 'BYBIT' | 'OKX';
export type DemoOrderSide = 'BUY' | 'SELL';
export type DemoOrderType = 'MARKET' | 'LIMIT';
export type DemoOrderStatus = 'PENDING' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';

export type DemoOrderInput = {
  symbol: string;
  side: DemoOrderSide;
  type: DemoOrderType;
  quantity: number;
  price?: number;
  clientOrderId: string;
};

export type NormalizedDemoOrder = {
  exchange: DemoExchange;
  exchangeOrderId: string;
  clientOrderId: string;
  symbol: string;
  side: DemoOrderSide;
  type: DemoOrderType;
  status: DemoOrderStatus;
  quantity: string;
  filledQuantity: string;
  quoteAmount: string;
  averageFillPrice: string | null;
  price: string | null;
};

export type DemoCredentials = { apiKey: string; apiSecret: string; passphrase?: string };

export interface DemoExchangeOrderAdapter {
  testConnection(credentials: DemoCredentials): Promise<Record<string, unknown>>;
  placeOrder(credentials: DemoCredentials, input: DemoOrderInput): Promise<NormalizedDemoOrder>;
  getOrder(credentials: DemoCredentials, symbol: string, orderId: string): Promise<NormalizedDemoOrder>;
  findOrderByClientOrderId(credentials: DemoCredentials, symbol: string, clientOrderId: string): Promise<NormalizedDemoOrder | null>;
  cancelOrder(credentials: DemoCredentials, symbol: string, orderId: string): Promise<NormalizedDemoOrder>;
}
