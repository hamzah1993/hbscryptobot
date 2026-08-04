import { BadRequestException, Injectable } from '@nestjs/common';
import { ExchangeEnvironment } from '@prisma/client';
import { ExchangeCredentialsService } from '../credentials/exchange-credentials.service';
import { BinanceService, type BinanceSymbolFilter } from './binance.service';

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

    const [credential, symbolInfo, ticker] = await Promise.all([
      this.credentials.getBinance(userId, ExchangeEnvironment.TESTNET),
      this.binance.getSymbolInfo(symbol, 'testnet'),
      this.binance.getTickerPrice(symbol, 'testnet') as Promise<{ price?: string }>,
    ]);

    const normalizedQuantity = this.normalizeQuantity(input.quantity, symbolInfo.filters);
    this.assertMinimumNotional(normalizedQuantity, Number(ticker.price ?? 0), symbolInfo.filters);

    return this.binance.placeMarketOrder(
      {
        symbol,
        side: input.side,
        quantity: normalizedQuantity,
        clientOrderId: input.clientOrderId,
      },
      credential.apiKey,
      credential.apiSecret,
      'testnet',
    );
  }

  private normalizeQuantity(quantity: number, filters: BinanceSymbolFilter[]) {
    const lotSize = filters.find((filter) => filter.filterType === 'LOT_SIZE');
    if (!lotSize?.stepSize || !lotSize.minQty || !lotSize.maxQty) {
      throw new BadRequestException('Binance LOT_SIZE filter is unavailable');
    }

    const stepSize = Number(lotSize.stepSize);
    const minQty = Number(lotSize.minQty);
    const maxQty = Number(lotSize.maxQty);
    if (![stepSize, minQty, maxQty].every((value) => Number.isFinite(value) && value > 0)) {
      throw new BadRequestException('Binance LOT_SIZE filter is invalid');
    }

    const normalized = Math.floor((quantity + Number.EPSILON) / stepSize) * stepSize;
    const precision = this.decimalPlaces(lotSize.stepSize);
    const formatted = normalized.toFixed(precision);
    const numericQuantity = Number(formatted);

    if (numericQuantity < minQty) {
      throw new BadRequestException(`Order quantity must be at least ${lotSize.minQty}`);
    }
    if (numericQuantity > maxQty) {
      throw new BadRequestException(`Order quantity must not exceed ${lotSize.maxQty}`);
    }
    return formatted;
  }

  private assertMinimumNotional(
    quantity: string,
    marketPrice: number,
    filters: BinanceSymbolFilter[],
  ) {
    if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
      throw new BadRequestException('Unable to validate Binance order notional');
    }

    const notionalFilter = filters.find(
      (filter) => filter.filterType === 'NOTIONAL' || filter.filterType === 'MIN_NOTIONAL',
    );
    const minimum = Number(notionalFilter?.minNotional ?? notionalFilter?.notional ?? 0);
    if (!Number.isFinite(minimum) || minimum <= 0) return;

    const notional = Number(quantity) * marketPrice;
    if (notional < minimum) {
      throw new BadRequestException(
        `Order value must be at least ${minimum} quote units at the current market price`,
      );
    }
  }

  private decimalPlaces(value: string) {
    const decimal = value.split('.')[1] ?? '';
    return decimal.replace(/0+$/, '').length;
  }
}
