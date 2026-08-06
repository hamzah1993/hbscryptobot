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

export type BinanceTestnetLimitOrderInput = BinanceTestnetMarketOrderInput & { price: number };

type ResolvedQuantityFilter = {
  filter: BinanceSymbolFilter;
  filterType: 'MARKET_LOT_SIZE' | 'LOT_SIZE';
  minQty: number;
  maxQty: number | null;
  stepSize: number;
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
    const resolvedFilter = this.resolveQuantityFilter(symbolInfo.filters);
    const normalizedQuantity = this.normalizeQuantity(rawQuantity, resolvedFilter);
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
      quantityFilterType: resolvedFilter.filterType,
      minQuantity: resolvedFilter.minQty,
      maxQuantity: resolvedFilter.maxQty ?? 0,
      stepSize: resolvedFilter.filter.stepSize,
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

    const resolvedFilter = this.resolveQuantityFilter(symbolInfo.filters);
    const normalizedQuantity = this.normalizeQuantity(input.quantity, resolvedFilter);
    this.assertMinimumNotional(normalizedQuantity, Number(ticker.price ?? 0), symbolInfo.filters);

    return this.binance.placeMarketOrder(
      {
        symbol,
        side: input.side,
        quantity: normalizedQuantity,
        clientOrderId: this.normalizeClientOrderId(input.clientOrderId),
      },
      credential.apiKey,
      credential.apiSecret,
      'testnet',
    );
  }

  async placeLimitOrder(userId: string, input: BinanceTestnetLimitOrderInput) {
    const symbol = input.symbol.trim().toUpperCase();
    if (!symbol) throw new BadRequestException('Symbol is required');
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new BadRequestException('Quantity must be a positive number');
    if (!Number.isFinite(input.price) || input.price <= 0) throw new BadRequestException('Limit price must be a positive number');

    const [credential, symbolInfo] = await Promise.all([
      this.credentials.getBinance(userId, ExchangeEnvironment.TESTNET),
      this.binance.getSymbolInfo(symbol, 'testnet'),
    ]);
    const resolvedFilter = this.resolveLimitQuantityFilter(symbolInfo.filters);
    const normalizedQuantity = this.normalizeQuantity(input.quantity, resolvedFilter);
    const normalizedPrice = this.normalizePrice(input.price, symbolInfo.filters);
    this.assertMinimumNotional(normalizedQuantity, Number(normalizedPrice), symbolInfo.filters);

    return this.binance.placeLimitOrder({
      symbol, side: input.side, quantity: normalizedQuantity, price: normalizedPrice,
      clientOrderId: this.normalizeClientOrderId(input.clientOrderId),
    }, credential.apiKey, credential.apiSecret, 'testnet');
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

  async findOrderByClientOrderId(userId: string, symbol: string, clientOrderId: string) {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) throw new BadRequestException('Symbol is required');
    if (!clientOrderId.trim()) throw new BadRequestException('Client order ID is required');

    const credential = await this.credentials.getBinance(
      userId,
      ExchangeEnvironment.TESTNET,
    );

    try {
      return await this.binance.getOrderByClientOrderId(
        normalized,
        clientOrderId.trim(),
        credential.apiKey,
        credential.apiSecret,
        'testnet',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/order does not exist/i.test(message)) return null;
      throw error;
    }
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

  private resolveQuantityFilter(filters: BinanceSymbolFilter[]): ResolvedQuantityFilter {
    const marketLot = filters.find((item) => item.filterType === 'MARKET_LOT_SIZE');
    const lotSize = filters.find((item) => item.filterType === 'LOT_SIZE');

    const marketResolved = this.toResolvedFilter(marketLot, 'MARKET_LOT_SIZE');
    if (marketResolved) return marketResolved;

    const lotResolved = this.toResolvedFilter(lotSize, 'LOT_SIZE');
    if (lotResolved) return lotResolved;

    const marketDetails = marketLot
      ? `MARKET_LOT_SIZE(minQty=${marketLot.minQty ?? 'missing'}, maxQty=${marketLot.maxQty ?? 'missing'}, stepSize=${marketLot.stepSize ?? 'missing'})`
      : 'MARKET_LOT_SIZE missing';
    const lotDetails = lotSize
      ? `LOT_SIZE(minQty=${lotSize.minQty ?? 'missing'}, maxQty=${lotSize.maxQty ?? 'missing'}, stepSize=${lotSize.stepSize ?? 'missing'})`
      : 'LOT_SIZE missing';

    throw new BadRequestException(
      `Binance quantity filters are unusable for this symbol. ${marketDetails}; ${lotDetails}`,
    );
  }

  private resolveLimitQuantityFilter(filters: BinanceSymbolFilter[]): ResolvedQuantityFilter {
    const lotSize = this.toResolvedFilter(filters.find((item) => item.filterType === 'LOT_SIZE'), 'LOT_SIZE');
    if (lotSize) return lotSize;
    return this.resolveQuantityFilter(filters);
  }

  private normalizePrice(price: number, filters: BinanceSymbolFilter[]) {
    const priceFilter = filters.find((item) => item.filterType === 'PRICE_FILTER');
    const tickSize = Number(priceFilter?.tickSize ?? 0);
    if (!Number.isFinite(tickSize) || tickSize <= 0) return String(price);
    const precision = this.decimalPlaces(priceFilter?.tickSize ?? String(tickSize));
    const scale = 10 ** precision;
    const tickUnits = Math.round(tickSize * scale);
    const priceUnits = Math.floor(price * scale + Number.EPSILON);
    if (!Number.isSafeInteger(tickUnits) || tickUnits <= 0) throw new BadRequestException(`Binance price tick size ${priceFilter?.tickSize} is unsupported`);
    const normalizedUnits = Math.floor(priceUnits / tickUnits) * tickUnits;
    const normalized = (normalizedUnits / scale).toFixed(precision);
    if (Number(normalized) <= 0) throw new BadRequestException('Limit price is below the Binance price tick size');
    return normalized;
  }

  private toResolvedFilter(
    filter: BinanceSymbolFilter | undefined,
    filterType: 'MARKET_LOT_SIZE' | 'LOT_SIZE',
  ): ResolvedQuantityFilter | null {
    if (!filter) return null;

    const stepSize = Number(filter.stepSize ?? 0);
    const minQty = Number(filter.minQty ?? 0);
    const maxQtyValue = Number(filter.maxQty ?? 0);

    if (!Number.isFinite(stepSize) || stepSize <= 0) return null;
    if (!Number.isFinite(minQty) || minQty < 0) return null;

    return {
      filter,
      filterType,
      minQty,
      maxQty: Number.isFinite(maxQtyValue) && maxQtyValue > 0 ? maxQtyValue : null,
      stepSize,
    };
  }

  private normalizeQuantity(quantity: number, resolved: ResolvedQuantityFilter) {
    const precision = this.decimalPlaces(resolved.filter.stepSize ?? String(resolved.stepSize));
    const scale = 10 ** precision;
    const stepUnits = Math.round(resolved.stepSize * scale);
    const quantityUnits = Math.floor(quantity * scale + Number.EPSILON);

    if (!Number.isSafeInteger(stepUnits) || stepUnits <= 0) {
      throw new BadRequestException(
        `Binance ${resolved.filterType} step size ${resolved.filter.stepSize} is unsupported`,
      );
    }

    const normalizedUnits = Math.floor(quantityUnits / stepUnits) * stepUnits;
    const formatted = (normalizedUnits / scale).toFixed(precision);
    const numericQuantity = Number(formatted);

    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      throw new BadRequestException(
        `The calculated quantity is below the Binance ${resolved.filterType} step size ${resolved.filter.stepSize}`,
      );
    }
    if (numericQuantity < resolved.minQty) {
      throw new BadRequestException(
        `Order quantity must be at least ${resolved.filter.minQty} using Binance ${resolved.filterType}`,
      );
    }
    if (resolved.maxQty !== null && numericQuantity > resolved.maxQty) {
      throw new BadRequestException(
        `Order quantity must not exceed ${resolved.filter.maxQty} using Binance ${resolved.filterType}`,
      );
    }
    return formatted;
  }

  private normalizeClientOrderId(value?: string) {
    if (!value) return undefined;
    const normalized = value.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 36);
    if (!normalized) {
      throw new BadRequestException('Unable to generate a valid Binance client order ID');
    }
    return normalized;
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
