import { BadRequestException, Injectable } from '@nestjs/common';
import { ExchangeEnvironment, ExchangeName } from '@prisma/client';
import { BybitV5DemoService } from '../bybit/bybit-v5-demo.service';
import { ExchangeCredentialsService } from '../credentials/exchange-credentials.service';
import { OkxV5DemoService } from '../okx/okx-v5-demo.service';
import type { DemoCredentials, DemoExchange, DemoExchangeOrderAdapter, DemoOrderInput } from './demo-order.types';

@Injectable()
export class DemoExchangeExecutionService {
  private readonly maxAttempts = 4;
  private readonly baseBackoffMs = 250;

  constructor(
    private readonly credentials: ExchangeCredentialsService,
    private readonly bybit: BybitV5DemoService,
    private readonly okx: OkxV5DemoService,
  ) {}

  async testConnection(userId: string, exchange: DemoExchange) {
    const { adapter, credentials } = await this.context(userId, exchange);
    return adapter.testConnection(credentials);
  }

  async placeOrder(userId: string, exchange: DemoExchange, input: DemoOrderInput) {
    this.validateInput(input);
    const { adapter, credentials } = await this.context(userId, exchange);
    const connection = await adapter.testConnection(credentials);
    if (connection.canTrade !== true) {
      throw new BadRequestException(`${exchange} Demo/Testnet API key does not have trading permission`);
    }
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const existing = await adapter.findOrderByClientOrderId(credentials, input.symbol, input.clientOrderId);
        if (existing) return { ...existing, duplicateRecovered: true, attemptCount: attempt };

        const placed = await adapter.placeOrder(credentials, input);
        return { ...placed, duplicateRecovered: false, attemptCount: attempt };
      } catch (error) {
        lastError = error;
        if (!this.isRetryable(error) || attempt === this.maxAttempts) throw error;
        await this.sleep(this.baseBackoffMs * (2 ** (attempt - 1)));
      }
    }

    throw lastError;
  }

  async getOrder(userId: string, exchange: DemoExchange, symbol: string, orderId: string) {
    const { adapter, credentials } = await this.context(userId, exchange);
    return adapter.getOrder(credentials, symbol, orderId);
  }

  async findOrderByClientOrderId(userId: string, exchange: DemoExchange, symbol: string, clientOrderId: string) {
    const { adapter, credentials } = await this.context(userId, exchange);
    return adapter.findOrderByClientOrderId(credentials, symbol, clientOrderId);
  }

  async cancelOrder(userId: string, exchange: DemoExchange, symbol: string, orderId: string) {
    const { adapter, credentials } = await this.context(userId, exchange);
    return adapter.cancelOrder(credentials, symbol, orderId);
  }

  private async context(userId: string, exchange: DemoExchange): Promise<{ adapter: DemoExchangeOrderAdapter; credentials: DemoCredentials }> {
    if (exchange === 'BYBIT') {
      return { adapter: this.bybit, credentials: await this.credentials.getBybit(userId, ExchangeEnvironment.TESTNET) };
    }
    if (exchange === 'OKX') {
      return { adapter: this.okx, credentials: await this.credentials.getOkx(userId, ExchangeEnvironment.TESTNET) };
    }
    throw new BadRequestException('Only Bybit Testnet and OKX Demo execution are enabled');
  }

  private validateInput(input: DemoOrderInput) {
    if (!input.symbol?.trim()) throw new BadRequestException('Symbol is required');
    if (!['BUY', 'SELL'].includes(input.side)) throw new BadRequestException('Order side must be BUY or SELL');
    if (!['MARKET', 'LIMIT'].includes(input.type)) throw new BadRequestException('Order type must be MARKET or LIMIT');
    if (!Number.isFinite(Number(input.quantity)) || Number(input.quantity) <= 0) throw new BadRequestException('Quantity must be positive');
    if (!input.clientOrderId?.trim()) throw new BadRequestException('Client order ID is required for duplicate protection');
    if (input.type === 'LIMIT' && (!Number.isFinite(Number(input.price)) || Number(input.price) <= 0)) {
      throw new BadRequestException('A positive price is required for LIMIT orders');
    }
  }

  private isRetryable(error: unknown) {
    if (error instanceof BadRequestException) return false;
    const message = error instanceof Error ? error.message : String(error);
    return /timeout|timed out|network|fetch failed|429|rate.?limit|temporar|502|503|504|10000|10006|50011/i.test(message);
  }

  protected sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
