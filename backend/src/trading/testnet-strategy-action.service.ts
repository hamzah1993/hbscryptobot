import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ClaimTestnetStrategyActionInput = {
  strategyId: string;
  positionId?: string | null;
  type: 'INITIAL_ENTRY' | 'DCA_ENTRY' | 'INDEPENDENT_ENTRY' | 'PARENT_EXIT' | 'INDEPENDENT_EXIT';
  side: 'BUY' | 'SELL';
  quantity?: number | null;
  quoteAmount?: number | null;
  level?: number | null;
  triggerPrice?: number | null;
  idempotencyKey: string;
};

@Injectable()
export class TestnetStrategyActionService {
  constructor(private readonly prisma: PrismaService) {}

  async claim(userId: string, input: ClaimTestnetStrategyActionInput) {
    if (!input.idempotencyKey.trim()) {
      throw new BadRequestException('Strategy action idempotency key is required');
    }

    const strategy = await this.prisma.tradingStrategy.findFirst({
      where: { id: input.strategyId, userId },
      select: { id: true, environment: true, paperTrading: true },
    });

    if (!strategy) throw new BadRequestException('Strategy not found');
    if (strategy.paperTrading || strategy.environment !== 'TESTNET') {
      throw new BadRequestException('Only Binance testnet strategies can claim exchange actions');
    }

    if (input.positionId) {
      const position = await this.prisma.tradingPosition.findFirst({
        where: { id: input.positionId, strategyId: strategy.id, userId },
        select: { id: true },
      });
      if (!position) throw new BadRequestException('Strategy position not found');
    }

    const existing = await this.prisma.strategyAction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existing) return { action: existing, claimed: false };

    try {
      const action = await this.prisma.strategyAction.create({
        data: {
          userId,
          strategyId: strategy.id,
          positionId: input.positionId ?? null,
          type: input.type,
          status: 'PENDING',
          side: input.side,
          quantity: input.quantity ?? null,
          quoteAmount: input.quoteAmount ?? null,
          level: input.level ?? null,
          triggerPrice: input.triggerPrice ?? null,
          idempotencyKey: input.idempotencyKey,
        },
      });

      return { action, claimed: true };
    } catch (error: unknown) {
      const raced = await this.prisma.strategyAction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (raced) return { action: raced, claimed: false };
      throw error;
    }
  }

  async markSubmitted(actionId: string, tradingOrderId: string) {
    return this.prisma.strategyAction.update({
      where: { id: actionId },
      data: {
        status: 'SUBMITTED',
        tradingOrderId,
        errorMessage: null,
      },
    });
  }

  async markCompleted(actionId: string) {
    return this.prisma.strategyAction.update({
      where: { id: actionId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  async markFailed(actionId: string, error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown testnet strategy action failure';
    return this.prisma.strategyAction.update({
      where: { id: actionId },
      data: {
        status: 'FAILED',
        errorMessage: message.slice(0, 2000),
      },
    });
  }

  listRecoverable(limit = 100) {
    return this.prisma.strategyAction.findMany({
      where: { status: { in: ['PENDING', 'SUBMITTED'] } },
      include: { strategy: true, position: true, tradingOrder: true },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }
}
