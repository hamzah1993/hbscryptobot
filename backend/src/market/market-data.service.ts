import { Injectable } from '@nestjs/common';
import { BinanceService, type BinanceEnvironment } from '../exchange/binance/binance.service';

export type MarketQuote = {
  symbol: string;
  price: number;
  environment: BinanceEnvironment;
  fetchedAt: string;
};

@Injectable()
export class MarketDataService {
  constructor(private readonly binance: BinanceService) {}

  async getQuote(symbol: string, environment: BinanceEnvironment = 'testnet'): Promise<MarketQuote> {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) throw new Error('Symbol is required');

    const ticker = await this.binance.getTickerPrice(normalized, environment) as {
      symbol?: string;
      price?: string;
    };
    const price = Number(ticker.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Binance returned an invalid market price');
    }

    return {
      symbol: ticker.symbol ?? normalized,
      price,
      environment,
      fetchedAt: new Date().toISOString(),
    };
  }
}
