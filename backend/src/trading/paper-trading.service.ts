import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RiskBudgetService } from './risk-budget.service';

interface OpenPaperPositionInput {
  strategyId: string;
  marketPrice: number;
}

interface AddPaperDcaInput {
  positionId: string;
  marketPrice: number;
}

@Injectable()
export class PaperTradingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly riskBudget: RiskBudgetService,
  ) {}

  async openPosition(userId: string, input: OpenPaperPositionInput) {
    if (input.marketPrice <= 0) throw new BadRequestException('Market price must be positive');

    const strategy = await this.prisma.tradingStrategy.findFirst({
      where: { id: input.strategyId, userId, paperTrading: true },
    });
    if (!strategy) throw new NotFoundException('Paper-trading strategy not found');

    const existing = await this.prisma.tradingPosition.findFirst({
      where: { strategyId: strategy.id, userId, status: 'OPEN' },
    });
    if (existing) throw new BadRequestException('Strategy already has an open position');

    const plan = this.riskBudget.buildPlan({
      riskBudgetQuote: Number(strategy.riskBudgetQuote),
      baseOrderQuote: Number(strategy.baseOrderQuote),
      maxDcaOrders: strategy.maxDcaOrders,
      dcaStepPercent: Number(strategy.dcaStepPercent),
      dcaMultiplier: Number(strategy.dcaMultiplier),
      takeProfitPercent: Number(strategy.takeProfitPercent),
      independentFromLevel: strategy.independentFromLevel,
    });
    const base = plan[0];
    const quantity = base.quoteAmount / input.marketPrice;
    const nextDcaPrice = plan[1]
      ? input.marketPrice * (1 - plan[1].triggerDropPercent / 100)
      : null;
    const takeProfitPrice = input.marketPrice * (1 + Number(strategy.takeProfitPercent) / 100);

    return this.prisma.$transaction(async (tx) => {
      const position = await tx.tradingPosition.create({
        data: {
          userId,
          strategyId: strategy.id,
          symbol: strategy.symbol,
          totalQuantity: quantity,
          totalCostQuote: base.quoteAmount,
          averageEntryPrice: input.marketPrice,
          dcaCount: 0,
          nextDcaPrice,
          takeProfitPrice,
        },
      });

      await tx.tradingOrder.create({
        data: {
          userId,
          positionId: position.id,
          clientOrderId: `paper-${randomUUID()}`,
          side: 'BUY',
          type: 'MARKET',
          status: 'FILLED',
          level: 1,
          independent: base.independent,
          quantity,
          price: input.marketPrice,
          filledQuantity: quantity,
          quoteAmount: base.quoteAmount,
          averageFillPrice: input.marketPrice,
        },
      });

      return tx.tradingPosition.findUnique({
        where: { id: position.id },
        include: { orders: { orderBy: { createdAt: 'asc' } }, strategy: true },
      });
    });
  }

  async addDca(userId: string, input: AddPaperDcaInput) {
    if (input.marketPrice <= 0) throw new BadRequestException('Market price must be positive');

    const position = await this.prisma.tradingPosition.findFirst({
      where: { id: input.positionId, userId, status: 'OPEN' },
      include: { strategy: true, orders: true },
    });
    if (!position) throw new NotFoundException('Open paper position not found');
    if (!position.strategy.paperTrading) throw new BadRequestException('Strategy is not in paper mode');
    if (position.nextDcaPrice && input.marketPrice > Number(position.nextDcaPrice)) {
      throw new BadRequestException('Market price has not reached the next DCA trigger');
    }

    const plan = this.riskBudget.buildPlan({
      riskBudgetQuote: Number(position.strategy.riskBudgetQuote),
      baseOrderQuote: Number(position.strategy.baseOrderQuote),
      maxDcaOrders: position.strategy.maxDcaOrders,
      dcaStepPercent: Number(position.strategy.dcaStepPercent),
      dcaMultiplier: Number(position.strategy.dcaMultiplier),
      takeProfitPercent: Number(position.strategy.takeProfitPercent),
      independentFromLevel: position.strategy.independentFromLevel,
    });
    const nextLevel = position.dcaCount + 2;
    const allocation = plan.find((level) => level.level === nextLevel);
    if (!allocation) throw new BadRequestException('No further DCA allocation is available');

    const alreadyAllocated = Number(position.totalCostQuote);
    this.riskBudget.assertWithinBudget(
      allocation.quoteAmount,
      alreadyAllocated,
      Number(position.strategy.riskBudgetQuote),
    );

    const quantity = allocation.quoteAmount / input.marketPrice;
    const totalQuantity = Number(position.totalQuantity) + quantity;
    const totalCostQuote = alreadyAllocated + allocation.quoteAmount;
    const averageEntryPrice = totalCostQuote / totalQuantity;
    const following = plan.find((level) => level.level === nextLevel + 1);
    const nextDcaPrice = following
      ? Number(position.orders[0]?.averageFillPrice ?? input.marketPrice) *
        (1 - following.triggerDropPercent / 100)
      : null;
    const takeProfitPrice = averageEntryPrice *
      (1 + Number(position.strategy.takeProfitPercent) / 100);

    return this.prisma.$transaction(async (tx) => {
      await tx.tradingOrder.create({
        data: {
          userId,
          positionId: position.id,
          clientOrderId: `paper-${randomUUID()}`,
          side: 'BUY',
          type: 'MARKET',
          status: 'FILLED',
          level: nextLevel,
          independent: allocation.independent,
          quantity,
          price: input.marketPrice,
          filledQuantity: quantity,
          quoteAmount: allocation.quoteAmount,
          averageFillPrice: input.marketPrice,
        },
      });

      await tx.tradingPosition.update({
        where: { id: position.id },
        data: {
          totalQuantity,
          totalCostQuote,
          averageEntryPrice,
          dcaCount: position.dcaCount + 1,
          nextDcaPrice,
          takeProfitPrice,
        },
      });

      return tx.tradingPosition.findUnique({
        where: { id: position.id },
        include: { orders: { orderBy: { createdAt: 'asc' } }, strategy: true },
      });
    });
  }

  async closePosition(userId: string, positionId: string, marketPrice: number) {
    if (marketPrice <= 0) throw new BadRequestException('Market price must be positive');

    const position = await this.prisma.tradingPosition.findFirst({
      where: { id: positionId, userId, status: 'OPEN' },
      include: { strategy: true },
    });
    if (!position) throw new NotFoundException('Open paper position not found');
    if (!position.strategy.paperTrading) throw new BadRequestException('Strategy is not in paper mode');

    const quantity = Number(position.totalQuantity);
    const proceeds = quantity * marketPrice;
    const realizedPnlQuote = proceeds - Number(position.totalCostQuote);

    return this.prisma.$transaction(async (tx) => {
      await tx.tradingOrder.create({
        data: {
          userId,
          positionId: position.id,
          clientOrderId: `paper-${randomUUID()}`,
          side: 'SELL',
          type: 'MARKET',
          status: 'FILLED',
          level: position.dcaCount + 2,
          independent: false,
          quantity,
          price: marketPrice,
          filledQuantity: quantity,
          quoteAmount: proceeds,
          averageFillPrice: marketPrice,
        },
      });

      await tx.tradingPosition.update({
        where: { id: position.id },
        data: {
          status: 'CLOSED',
          realizedPnlQuote,
          closedAt: new Date(),
          nextDcaPrice: null,
          takeProfitPrice: null,
        },
      });

      return tx.tradingPosition.findUnique({
        where: { id: position.id },
        include: { orders: { orderBy: { createdAt: 'asc' } }, strategy: true },
      });
    });
  }

  async listPositions(userId: string) {
    return this.prisma.tradingPosition.findMany({
      where: { userId },
      include: { strategy: true, orders: { orderBy: { createdAt: 'asc' } } },
      orderBy: { openedAt: 'desc' },
    });
  }
}
