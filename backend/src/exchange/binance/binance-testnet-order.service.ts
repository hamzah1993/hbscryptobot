import { BadRequestException, Injectable } from '@nestjs/common';
import { ExchangeEnvironment } from '@prisma/client';
import { ExchangeCredentialsService } from '../credentials/exchange-credentials.service';
import { BinanceService } from './binance.service';

export type BinanceTestnetMarketOrderInput = {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  clientOrderId?: string;
};

@Injectable()
export class BinanceTestnetOrderService {
  constructor(
    private readonly binance: BinanceService,
    private readonly credentials: ExchangeCredentialsService,
  ) {}

  async placeMarketOrder(userId: string, input: BinanceTestnetMarketOrderInput) {
    const symbol = input.symbol.trim().toUpperCase();
    if (!symbol) throw new BadRequestException('Symbol is required');
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new BadRequestException('Quantity must be a positive number');
    }

    const credential = await this.credentials.getBinance(
      userId,
      ExchangeEnvironment.TESTNET,
    );

    return this.binance.placeMarketOrder(
      {
        symbol,
        side: input.side,
        quantity: String(input.quantity),
        clientOrderId: input.clientOrderId,
      },
      credential.apiKey,
      credential.apiSecret,
      'testnet',
    );
  }
}
