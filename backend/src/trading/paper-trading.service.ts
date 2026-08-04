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

type PaperTickAction = 'DCA' | 'TAKE_PROFIT' | 'HOLD';

type PaperTickResult = {
  action: PaperTickAction;
  position: Awaited<ReturnType<PaperTradingService['listPositions']>>[number] | null;
  unrealizedPnlQuote?: number;
};

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

    const plan = this.buildPlan(strategy);
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
        include: {
          orders: { orderBy: { createdAt: 'asc' } },
          subPositions: { orderBy: { level: 'asc' } },
          strategy: true,
        },
      });
    });
  }

  async addDca(userId: string, input: AddPaperDcaInput) {
    if (input.marketPrice <= 0) throw new BadRequestException('Market price must be positive');

    const position = await this.getOpenPosition(userId, input.positionId);
    if (position.nextDcaPrice && input.marketPrice > Number(position.nextDcaPrice)) {
      throw new BadRequestException('Market price has not reached the next DCA trigger');
    }

    return this.executeDca(position, input.marketPrice);
  }

  async closePosition(userId: string, positionId: string, marketPrice: number) {
    if (marketPrice <= 0) throw new BadRequestException('Market price must be positive');

    const position = await this.getOpenPosition(userId, positionId);
    return this.executeClose(position, marketPrice);
  }

  async processPrice(
    userId: string,
    positionId: string,
    marketPrice: number,
  ): Promise<PaperTickResult> {
    if (marketPrice <= 0) throw new BadRequestException('Market price must be positive');

    let position = await this.getOpenPosition(userId, positionId);
    position = await this.closeEligibleSubPositions(position, marketPrice);

    const takeProfitPrice = position.takeProfitPrice ? Number(position.takeProfitPrice) : null;
    const nextDcaPrice = position.nextDcaPrice ? Number(position.nextDcaPrice) : null;

    if (takeProfitPrice !== null && marketPrice >= takeProfitPrice) {
      return { action: 'TAKE_PROFIT', position: await this.executeClose(position, marketPrice) };
    }

    if (nextDcaPrice !== null && marketPrice <= nextDcaPrice) {
      return { action: 'DCA', position: await this.executeDca(position, marketPrice) };
    }

    return {
      action: 'HOLD',
      position,
      unrealizedPnlQuote:
        Number(position.totalQuantity) * marketPrice - Number(position.totalCostQuote),
    };
  }

  async listPositions(userId: string) {
    return this.prisma.tradingPosition.findMany({
      where: { userId },
      include: {
        strategy: true,
        orders: { orderBy: { createdAt: 'asc' } },
        subPositions: { orderBy: { level: 'asc' } },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  private async getOpenPosition(userId: string, positionId: string) {
    const position = await this.prisma.tradingPosition.findFirst({
      where: { id: positionId, userId, status: 'OPEN' },
      include: {
        strategy: true,
        orders: { orderBy: { createdAt: 'asc' } },
        subPositions: { orderBy: { level: 'asc' } },
      },
    });
    if (!position) throw new NotFoundException('Open paper position not found');
    if (!position.strategy.paperTrading) throw new BadRequestException('Strategy is not in paper mode');
    return position;
  }

  private buildPlan(strategy: {
    riskBudgetQuote: unknown;
    baseOrderQuote: unknown;
    maxDcaOrders: number;
    dcaStepPercent: unknown;
    dcaMultiplier: unknown;
    takeProfitPercent: unknown;
    independentFromLevel: number;
  }) {
    return this.riskBudget.buildPlan({
      riskBudgetQuote: Number(strategy.riskBudgetQuote),
      baseOrderQuote: Number(strategy.baseOrderQuote),
      maxDcaOrders: strategy.maxDcaOrders,
      dcaStepPercent: Number(strategy.dcaStepPercent),
      dcaMultiplier: Number(strategy.dcaMultiplier),
      takeProfitPercent: Number(strategy.takeProfitPercent),
      independentFromLevel: strategy.independentFromLevel,
    });
  }

  private async executeDca(position: any, marketPrice: number) {
    const plan = this.buildPlan(position.strategy);
    const nextLevel = position.dcaCount + 2;
    const allocation = plan.find((level) => level.level === nextLevel);
    if (!allocation) throw new BadRequestException('No further DCA allocation is available');

    const alreadyAllocated = Number(position.totalCostQuote);
    this.riskBudget.assertWithinBudget(
      allocation.quoteAmount,
      alreadyAllocated,
      Number(position.strategy.riskBudgetQuote),
    );

    const quantity = allocation.quoteAmount / marketPrice;
    const totalQuantity = Number(position.totalQuantity) + quantity;
    const totalCostQuote = alreadyAllocated + allocation.quoteAmount;
    const averageEntryPrice = totalCostQuote / totalQuantity;
    const following = plan.find((level) => level.level === nextLevel + 1);
    const baseEntryPrice = Number(position.orders[0]?.averageFillPrice ?? marketPrice);
    const nextDcaPrice = following
      ? baseEntryPrice * (1 - following.triggerDropPercent / 100)
      : null;
    const takeProfitPrice =
      averageEntryPrice * (1 + Number(position.strategy.takeProfitPercent) / 100);
    const subPositionTakeProfitPrice =
      marketPrice * (1 + Number(position.strategy.takeProfitPercent) / 100);

    return this.prisma.$transaction(async (tx) => {
      await tx.tradingOrder.create({
        data: {
          userId: position.userId,
          positionId: position.id,
          clientOrderId: `paper-${randomUUID()}`,
          side: 'BUY',
          type: 'MARKET',
          status: 'FILLED',
          level: nextLevel,
          independent: allocation.independent,
          quantity,
          price: marketPrice,
          filledQuantity: quantity,
          quoteAmount: allocation.quoteAmount,
          averageFillPrice: marketPrice,
        },
      });

      if (allocation.independent) {
        await tx.tradingSubPosition.create({
          data: {
            positionId: position.id,
            level: nextLevel,
            quantity,
            costQuote: allocation.quoteAmount,
            entryPrice: marketPrice,
            takeProfitPrice: subPositionTakeProfitPrice,
          },
        });
      }

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
        include: {
          orders: { orderBy: { createdAt: 'asc' } },
          subPositions: { orderBy: { level: 'asc' } },
          strategy: true,
        },
      });
    });
  }

  private async closeEligibleSubPositions(position: any, marketPrice: number) {
    const eligible = position.subPositions.filter(
      (subPosition: any) =>
        subPosition.status === 'OPEN' &&
        marketPrice >= Number(subPosition.takeProfitPrice),
    );
    if (!eligible.length) return position;

    return this.prisma.$transaction(async (tx) => {
      let totalQuantity = Number(position.totalQuantity);
      let totalCostQuote = Number(position.totalCostQuote);
      let realizedPnlQuote = Number(position.realizedPnlQuote);

      for (const subPosition of eligible) {
        const quantity = Number(subPosition.quantity);
        const costQuote = Number(subPosition.costQuote);
        const proceeds = quantity * marketPrice;
        const pnl = proceeds - costQuote;

        await tx.tradingOrder.create({
          data: {
            userId: position.userId,
            positionId: position.id,
            clientOrderId: `paper-${randomUUID()}`,
            side: 'SELL',
            type: 'MARKET',
            status: 'FILLED',
            level: subPosition.level,
            independent: true,
            quantity,
            price: marketPrice,
            filledQuantity: quantity,
            quoteAmount: proceeds,
            averageFillPrice: marketPrice,
          },
        });

        await tx.tradingSubPosition.update({
          where: { id: subPosition.id },
          data: {
            status: 'CLOSED',
            realizedPnlQuote: pnl,
            closedAt: new Date(),
          },
        });

        totalQuantity -= quantity;
        totalCostQuote -= costQuote;
        realizedPnlQuote += pnl;
      }

      const averageEntryPrice = totalQuantity > 0 ? totalCostQuote / totalQuantity : 0;
      const takeProfitPrice =
        totalQuantity > 0
          ? averageEntryPrice * (1 + Number(position.strategy.takeProfitPercent) / 100)
          : null;

      await tx.tradingPosition.update({
        where: { id: position.id },
        data: {
          totalQuantity,
          totalCostQuote,
          averageEntryPrice,
          realizedPnlQuote,
          takeProfitPrice,
        },
      });

      return tx.tradingPosition.findUnique({
        where: { id: position.id },
        include: {
          orders: { orderBy: { createdAt: 'asc' } },
          subPositions: { orderBy: { level: 'asc' } },
          strategy: true,
        },
      });
    });
  }

  private async executeClose(position: any, marketPrice: number) {
    const quantity = Number(position.totalQuantity);
    const proceeds = quantity * marketPrice;
    const realizedPnlQuote =
      Number(position.realizedPnlQuote) + proceeds - Number(position.totalCostQuote);

    return this.prisma.$transaction(async (tx) => {
      await tx.tradingOrder.create({
        data: {
          userId: position.userId,
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

      await tx.tradingSubPosition.updateMany({
        where: { positionId: position.id, status: 'OPEN' },
        data: { status: 'CLOSED', closedAt: new Date() },
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
        include: {
          orders: { orderBy: { createdAt: 'asc' } },
          subPositions: { orderBy: { level: 'asc' } },
          strategy: true,
        },
      });
    });
  }
}
