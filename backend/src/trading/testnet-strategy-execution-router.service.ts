import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecuteTestnetStrategyInput, TestnetStrategyExecutionService } from './testnet-strategy-execution.service';
import { RiskAwareLiveStrategyExecutionService } from './risk-aware-live-strategy-execution.service';

/**
 * Exchange-aware boundary used by the shared strategy runner.
 *
 * Binance remains authorized because its complete strategy lifecycle has been
 * proven. Bybit/OKX adapters exist, but strategy routing stays intentionally
 * closed until credential-backed E2E lifecycle verification has passed.
 */
@Injectable()
export class TestnetStrategyExecutionRouterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly binance: TestnetStrategyExecutionService,
    private readonly binanceLive: RiskAwareLiveStrategyExecutionService,
  ) {}

  async executeMarketOrder(userId: string, input: ExecuteTestnetStrategyInput) {
    const strategy = await this.prisma.tradingStrategy.findFirst({
      where: { id: input.strategyId, userId },
      select: { exchange: true, environment: true, paperTrading: true },
    });
    if (!strategy) throw new NotFoundException('Strategy not found');
    if (strategy.paperTrading) {
      throw new BadRequestException('Paper strategies cannot use exchange order routing');
    }

    if (strategy.exchange === 'BINANCE' && strategy.environment === 'TESTNET') {
      return this.binance.executeMarketOrder(userId, input);
    }

    if (strategy.exchange === 'BINANCE' && strategy.environment === 'LIVE') {
      return this.binanceLive.executeMarketOrder(userId, input);
    }

    throw new BadRequestException(
      `${strategy.exchange} strategy routing is locked until credential-backed Demo/Testnet E2E verification passes`,
    );
  }
}
