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

  async previewMarketBuy(userId: string, symbolInput: string, quoteAmountInput: number) {
    const symbol = symbolInput.trim().toUpperCase();
    const quoteAmount = Number(quoteAmountInput);
    if (!symbol) throw new BadRequestException('Symbol is required');
    if (!Number.isFinite(quoteAmount) || quoteAmount <= 0) {
      throw new BadRequestException('Base order must be a positive quote amount');
    }

    const [credential, symbolInfo, ticker] = await Promise.all([
      this.credentials.getBinance(userId, ExchangeEnvironment.TESTNET),
      this.binance.getSymbolInfo(symbol, 'testnet'),
      this.binance.getTickerPrice(symbol, 'testnet') as Promise<{ price?: string }>,
    ]);

    const account = (await this.binance.getAccount(
      credential.apiKey,
      credential.apiSecret,
      'testnet',
    )) as any;
    const marketPrice = Number(ticker.price ?? 0);
    if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
      throw new BadRequestException('Unable to load the current Binance Testnet price');
    }

    const rawQuantity = quoteAmount / marketPrice;
    const normalizedQuantity = this.normalizeQuantity(rawQuantity, symbolInfo.filters);
    const estimatedSpend = Number(normalizedQuantity) * marketPrice;
    this.assertMinimumNotional(normalizedQuantity, marketPrice, symbolInfo.filters);

    const quoteBalance = Array.isArray(account?.balances)
      ? account.balances.find((balance: any) => String(balance.asset ?? '') === symbolInfo.quoteAsset)
      : null;
    const availableQuote = Number(quoteBalance?.free ?? 0);
    if (!Number.isFinite(availableQuote) || availableQuote < estimatedSpend) {
      throw new BadRequestException(
        `Insufficient ${symbolInfo.quoteAsset} balance. Required about ${estimatedSpend}, available ${availableQuote}`,
      );
    }

    const lotSize = this.getQuantityFilter(symbolInfo.filters);
    const notionalFilter = symbolInfo.filters.find(
      (filter) => filter.filterType === 'NOTIONAL' || filter.filterType === 'MIN_NOTIONAL',
    );
    const minNotional = Number(notionalFilter?.minNotional ?? notionalFilter?.notional ?? 0);

    return {
      symbol,
      baseAsset: symbolInfo.baseAsset,
      quoteAsset: symbolInfo.quoteAsset,
      marketPrice,
      requestedQuoteAmount: quoteAmount,
      rawQuantity,
      normalizedQuantity,
      estimatedSpend,
      availableQuote,
      remainingQuote: availableQuote - estimatedSpend,
      minQuantity: Number(lotSize.minQty ?? 0),
      maxQuantity: Number(lotSize.maxQty ?? 0),
      stepSize: lotSize.stepSize,
      minNotional: Number.isFinite(minNotional) ? minNotional : 0,
    };
  }

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

  async getOrder(userId: string, symbol: string, exchangeOrderId: string) {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) throw new BadRequestException('Symbol is required');
    if (!exchangeOrderId.trim()) throw new BadRequestException('Exchange order ID is required');

    const credential = await this.credentials.getBinance(
      userId,
      ExchangeEnvironment.TESTNET,
    );

    return this.binance.getOrder(
      normalized,
      exchangeOrderId.trim(),
      credential.apiKey,
      credential.apiSecret,
      'testnet',
    );
  }

  async cancelOrder(userId: string, symbol: string, exchangeOrderId: string) {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) throw new BadRequestException('Symbol is required');
    if (!exchangeOrderId.trim()) throw new BadRequestException('Exchange order ID is required');

    const credential = await this.credentials.getBinance(
      userId,
      ExchangeEnvironment.TESTNET,
    );

    return this.binance.cancelOrder(
      normalized,
      exchangeOrderId.trim(),
      credential.apiKey,
      credential.apiSecret,
      'testnet',
    );
  }

  private getQuantityFilter(filters: BinanceSymbolFilter[]): BinanceSymbolFilter {
    const filter = filters.find((item) => item.filterType === 'MARKET_LOT_SIZE')
      ?? filters.find((item) => item.filterType === 'LOT_SIZE');

    if (!filter) {
      throw new BadRequestException('Binance quantity filter is unavailable');
    }

    return filter;
  }

  private normalizeQuantity(quantity: number, filters: BinanceSymbolFilter[]) {
    const lotSize = this.getQuantityFilter(filters);
    if (!lotSize.stepSize || !lotSize.minQty || !lotSize.maxQty) {
      throw new BadRequestException('Binance quantity filter is unavailable');
    }

    const stepSize = Number(lotSize.stepSize);
    const minQty = Number(lotSize.minQty);
    const maxQty = Number(lotSize.maxQty);
    if (![stepSize, minQty, maxQty].every((value) => Number.isFinite(value) && value > 0)) {
      throw new BadRequestException('Binance quantity filter is invalid');
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
