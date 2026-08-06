import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecuteTestnetStrategyInput, TestnetStrategyExecutionService } from './testnet-strategy-execution.service';

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
  ) {}

  async executeMarketOrder(userId: string, input: ExecuteTestnetStrategyInput) {
    const strategy = await this.prisma.tradingStrategy.findFirst({
      where: { id: input.strategyId, userId },
      select: { exchange: true, environment: true, paperTrading: true },
    });
    if (!strategy) throw new NotFoundException('Strategy not found');
    if (strategy.paperTrading || strategy.environment !== 'TESTNET') {
      throw new BadRequestException('Only non-paper Testnet strategies can use exchange routing');
    }

    if (strategy.exchange === 'BINANCE') {
      return this.binance.executeMarketOrder(userId, input);
    }

    throw new BadRequestException(
      `${strategy.exchange} strategy routing is locked until credential-backed Demo/Testnet E2E verification passes`,
    );
  }
}
