import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RiskBudgetService } from './risk-budget.service';
import { RecoveryStrategyService } from './recovery-strategy.service';

interface OpenPaperPositionInput {
  strategyId: string;
  marketPrice: number;
}

interface AddPaperDcaInput {
  positionId: string;
  marketPrice: number;
}

type TakeProfitUpdateInput = {
  target: 'PARENT' | 'RECOVERY' | 'INDEPENDENT';
  takeProfitPrice: number;
  subPositionId?: string;
};

type PaperTickAction = 'DCA' | 'RECOVERY_DCA' | 'TAKE_PROFIT' | 'RECOVERY_TAKE_PROFIT' | 'HOLD';

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
    private readonly recoveryStrategy: RecoveryStrategyService,
    private readonly notifications: NotificationsService,
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

    const result = await this.prisma.$transaction(async (tx) => {
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
    this.publishLifecycle(userId, strategy.id, result?.id, 'ENTRY_FILLED', `${strategy.symbol} Paper entry #1 filled.`, {
      symbol: strategy.symbol, level: 1, price: input.marketPrice, quoteAmount: base.quoteAmount,
    });
    return result;
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

  async updateTakeProfit(userId: string, positionId: string, input: TakeProfitUpdateInput) {
    if (!['PARENT', 'RECOVERY', 'INDEPENDENT'].includes(input.target)) {
      throw new BadRequestException('Take-profit target is invalid');
    }
    if (!Number.isFinite(Number(input.takeProfitPrice)) || Number(input.takeProfitPrice) <= 0) {
      throw new BadRequestException('Take-profit price must be greater than zero');
    }

    const position = await this.getOpenPosition(userId, positionId);
    const takeProfitPrice = Number(input.takeProfitPrice);

    if (input.target === 'INDEPENDENT') {
      if (position.recoveryMode) {
        throw new BadRequestException('Recovery mode uses the global take-profit price');
      }
      const subPosition = position.subPositions.find((item) => item.id === input.subPositionId);
      if (!subPosition || subPosition.status !== 'OPEN') {
        throw new BadRequestException('Open independent sub-position was not found');
      }
      await this.prisma.tradingSubPosition.update({
        where: { id: subPosition.id },
        data: { takeProfitPrice, takeProfitManual: true },
      });
    } else if (input.target === 'RECOVERY') {
      if (!position.recoveryMode) throw new BadRequestException('Position is not in recovery mode');
      await this.prisma.tradingPosition.update({
        where: { id: position.id },
        data: { recoveryTakeProfitPrice: takeProfitPrice, recoveryTakeProfitManual: true },
      });
    } else {
      if (position.recoveryMode) {
        throw new BadRequestException('Recovery mode uses the global take-profit price');
      }
      await this.prisma.tradingPosition.update({
        where: { id: position.id },
        data: { takeProfitPrice, takeProfitManual: true },
      });
    }

    return this.getOpenPosition(userId, positionId);
  }

  async processPrice(
    userId: string,
    positionId: string,
    marketPrice: number,
  ): Promise<PaperTickResult> {
    if (marketPrice <= 0) throw new BadRequestException('Market price must be positive');

    let position = await this.getOpenPosition(userId, positionId);
    if (position.recoveryMode) {
      return this.processRecoveryPrice(position, marketPrice);
    }

    position = await this.closeEligibleSubPositions(position, marketPrice);

    const takeProfitPrice = position.takeProfitPrice ? Number(position.takeProfitPrice) : null;
    const nextDcaPrice = position.nextDcaPrice ? Number(position.nextDcaPrice) : null;

    if (takeProfitPrice !== null && marketPrice >= takeProfitPrice) {
      return { action: 'TAKE_PROFIT', position: await this.executeClose(position, marketPrice) };
    }

    const recoveryAnchor = this.getRecoveryAnchor(position);
    if (recoveryAnchor !== null) {
      const basket = this.recoveryStrategy.basketTotals(position, position.subPositions);
      const remainingRiskBudget = Math.max(Number(position.strategy.riskBudgetQuote) - basket.costQuote, 0);
      const firstRecoveryLeg = this.recoveryStrategy.nextLeg(position.strategy, {
        recoveryDcaCount: 0,
        anchorPrice: recoveryAnchor,
        baseOrderQuote: Number(position.strategy.baseOrderQuote),
        remainingRiskBudget,
      });
      if (firstRecoveryLeg && marketPrice <= firstRecoveryLeg.triggerPrice) {
        return {
          action: 'RECOVERY_DCA',
          position: await this.executeRecoveryDca(position, marketPrice, recoveryAnchor),
        };
      }
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

    const basketBefore = this.recoveryStrategy.basketTotals(position, position.subPositions);
    const alreadyAllocated = basketBefore.costQuote;
    this.riskBudget.assertWithinBudget(
      allocation.quoteAmount,
      alreadyAllocated,
      Number(position.strategy.riskBudgetQuote),
    );

    const quantity = allocation.quoteAmount / marketPrice;
    const totalQuantity = allocation.independent
      ? Number(position.totalQuantity)
      : Number(position.totalQuantity) + quantity;
    const totalCostQuote = allocation.independent
      ? Number(position.totalCostQuote)
      : Number(position.totalCostQuote) + allocation.quoteAmount;
    const averageEntryPrice = totalQuantity > 0 ? totalCostQuote / totalQuantity : 0;
    const following = plan.find((level) => level.level === nextLevel + 1);
    const nextDcaPrice = following
      ? marketPrice * (1 - Number(position.strategy.dcaStepPercent) / 100)
      : null;
    const parentTakeProfitPrice =
      averageEntryPrice * (1 + Number(position.strategy.takeProfitPercent) / 100);
    const subPositionTakeProfitPrice =
      marketPrice * (1 + Number(position.strategy.takeProfitPercent) / 100);

    const result = await this.prisma.$transaction(async (tx) => {
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
          takeProfitPrice: allocation.independent || position.takeProfitManual
            ? Number(position.takeProfitPrice ?? parentTakeProfitPrice)
            : parentTakeProfitPrice,
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
    this.publishLifecycle(
      position.userId,
      position.strategyId,
      position.id,
      allocation.independent ? 'INDEPENDENT_OPENED' : 'DCA_FILLED',
      allocation.independent
        ? `${position.symbol} Paper independent level #${nextLevel} opened.`
        : `${position.symbol} Paper main DCA level #${nextLevel} filled.`,
      { symbol: position.symbol, level: nextLevel, price: marketPrice, quoteAmount: allocation.quoteAmount },
    );
    return result;
  }

  private getRecoveryAnchor(position: any): number | null {
    if (!this.recoveryStrategy.shouldActivate(
      position.strategy,
      Number(position.dcaCount) + 1,
      Number(position.strategy.independentFromLevel),
    )) return null;

    const anchor = position.subPositions.find(
      (subPosition: any) =>
        Number(subPosition.level) === Number(position.strategy.independentFromLevel),
    );
    const anchorPrice = Number(anchor?.entryPrice ?? 0);
    return Number.isFinite(anchorPrice) && anchorPrice > 0 ? anchorPrice : null;
  }

  private async processRecoveryPrice(position: any, marketPrice: number): Promise<PaperTickResult> {
    const basket = this.recoveryStrategy.basketTotals(position, position.subPositions);
    const takeProfitPrice = Number(
      position.recoveryTakeProfitPrice ?? this.recoveryStrategy.globalTakeProfit(position.strategy, basket) ?? 0,
    );
    if (takeProfitPrice > 0 && marketPrice >= takeProfitPrice) {
      return {
        action: 'RECOVERY_TAKE_PROFIT',
        position: await this.executeRecoveryClose(position, marketPrice),
      };
    }

    const anchorPrice = Number(position.recoveryAnchorPrice ?? this.getRecoveryAnchor(position) ?? 0);
    const remainingRiskBudget = Math.max(Number(position.strategy.riskBudgetQuote) - basket.costQuote, 0);
    const leg = this.recoveryStrategy.nextLeg(position.strategy, {
      recoveryDcaCount: Number(position.recoveryDcaCount),
      anchorPrice,
      baseOrderQuote: Number(position.strategy.baseOrderQuote),
      remainingRiskBudget,
    });
    if (leg && marketPrice <= leg.triggerPrice) {
      return {
        action: 'RECOVERY_DCA',
        position: await this.executeRecoveryDca(position, marketPrice, anchorPrice),
      };
    }

    return {
      action: 'HOLD',
      position,
      unrealizedPnlQuote: basket.quantity * marketPrice - basket.costQuote,
    };
  }

  private async executeRecoveryDca(position: any, marketPrice: number, anchorPrice: number) {
    const basketBefore = this.recoveryStrategy.basketTotals(position, position.subPositions);
    const remainingRiskBudget = Math.max(
      Number(position.strategy.riskBudgetQuote) - basketBefore.costQuote,
      0,
    );
    const leg = this.recoveryStrategy.nextLeg(position.strategy, {
      recoveryDcaCount: Number(position.recoveryDcaCount),
      anchorPrice,
      baseOrderQuote: Number(position.strategy.baseOrderQuote),
      remainingRiskBudget,
    });
    if (!leg || leg.quoteAmount <= 0) {
      throw new BadRequestException('No further recovery DCA allocation is available');
    }
    this.riskBudget.assertWithinBudget(
      leg.quoteAmount,
      basketBefore.costQuote,
      Number(position.strategy.riskBudgetQuote),
    );

    const quantity = leg.quoteAmount / marketPrice;
    const totalQuantity = Number(position.totalQuantity) + quantity;
    const totalCostQuote = Number(position.totalCostQuote) + leg.quoteAmount;
    const basketAfter = this.recoveryStrategy.basketTotals(
      { totalQuantity, totalCostQuote },
      position.subPositions,
    );
    const recoveryTakeProfitPrice = position.recoveryTakeProfitManual
      ? Number(position.recoveryTakeProfitPrice)
      : this.recoveryStrategy.globalTakeProfit(position.strategy, basketAfter);
    const nextLeg = this.recoveryStrategy.nextLeg(position.strategy, {
      recoveryDcaCount: Number(position.recoveryDcaCount) + 1,
      anchorPrice,
      baseOrderQuote: Number(position.strategy.baseOrderQuote),
      remainingRiskBudget: Math.max(Number(position.strategy.riskBudgetQuote) - basketAfter.costQuote, 0),
    });

    const recoveryWasActive = Boolean(position.recoveryMode);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.tradingOrder.create({
        data: {
          userId: position.userId,
          positionId: position.id,
          clientOrderId: `paper-${randomUUID()}`,
          side: 'BUY',
          type: 'MARKET',
          status: 'FILLED',
          level: Number(position.strategy.maxDcaOrders) + Number(position.recoveryDcaCount) + 2,
          independent: false,
          quantity,
          price: marketPrice,
          filledQuantity: quantity,
          quoteAmount: leg.quoteAmount,
          averageFillPrice: marketPrice,
        },
      });

      await tx.tradingPosition.update({
        where: { id: position.id },
        data: {
          totalQuantity,
          totalCostQuote,
          averageEntryPrice: totalQuantity > 0 ? totalCostQuote / totalQuantity : 0,
          recoveryMode: true,
          recoveryDcaCount: Number(position.recoveryDcaCount) + 1,
          recoveryAnchorPrice: anchorPrice,
          recoveryTakeProfitPrice,
          nextDcaPrice: nextLeg?.triggerPrice ?? null,
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
    this.publishLifecycle(
      position.userId,
      position.strategyId,
      position.id,
      recoveryWasActive ? 'RECOVERY_DCA_FILLED' : 'RECOVERY_ACTIVATED',
      recoveryWasActive
        ? `${position.symbol} Paper Recovery order #${Number(position.recoveryDcaCount) + 1} filled.`
        : `${position.symbol} entered Recovery mode and Recovery order #1 filled.`,
      { symbol: position.symbol, recoveryOrder: Number(position.recoveryDcaCount) + 1, price: marketPrice, quoteAmount: leg.quoteAmount },
    );
    return result;
  }

  private async executeRecoveryClose(position: any, marketPrice: number) {
    const basket = this.recoveryStrategy.basketTotals(position, position.subPositions);
    if (basket.quantity <= 0) throw new BadRequestException('Recovery basket has no open quantity');
    const proceeds = basket.quantity * marketPrice;
    const realizedPnlQuote = Number(position.realizedPnlQuote) + proceeds - basket.costQuote;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.tradingOrder.create({
        data: {
          userId: position.userId,
          positionId: position.id,
          clientOrderId: `paper-${randomUUID()}`,
          side: 'SELL',
          type: 'MARKET',
          status: 'FILLED',
          level: Number(position.strategy.maxDcaOrders) + Number(position.recoveryDcaCount) + 2,
          independent: false,
          quantity: basket.quantity,
          price: marketPrice,
          filledQuantity: basket.quantity,
          quoteAmount: proceeds,
          averageFillPrice: marketPrice,
        },
      });
      for (const subPosition of position.subPositions.filter((item: any) => item.status === 'OPEN')) {
        const quantity = Number(subPosition.quantity);
        const costQuote = Number(subPosition.costQuote);
        await tx.tradingSubPosition.update({
          where: { id: subPosition.id },
          data: {
            status: 'CLOSED',
            quantity: 0,
            costQuote: 0,
            entryPrice: 0,
            realizedPnlQuote:
              Number(subPosition.realizedPnlQuote ?? 0) + quantity * marketPrice - costQuote,
            closedAt: new Date(),
          },
        });
      }
      await tx.tradingPosition.update({
        where: { id: position.id },
        data: {
          status: 'CLOSED',
          totalQuantity: 0,
          totalCostQuote: 0,
          averageEntryPrice: 0,
          realizedPnlQuote,
          closedAt: new Date(),
          recoveryMode: false,
          recoveryTakeProfitPrice: null,
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
    this.publishLifecycle(
      position.userId,
      position.strategyId,
      position.id,
      'CYCLE_COMPLETED',
      `${position.symbol} Paper Recovery global TP hit; trading cycle completed.`,
      { symbol: position.symbol, price: marketPrice, realizedPnlQuote },
    );
    return result;
  }

  private async closeEligibleSubPositions(position: any, marketPrice: number) {
    const eligible = position.subPositions.filter(
      (subPosition: any) =>
        subPosition.status === 'OPEN' &&
        marketPrice >= Number(subPosition.takeProfitPrice),
    );
    if (!eligible.length) return position;

    const result = await this.prisma.$transaction(async (tx) => {
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

        realizedPnlQuote += pnl;
      }

      const totalQuantity = Number(position.totalQuantity);
      const totalCostQuote = Number(position.totalCostQuote);
      const averageEntryPrice = totalQuantity > 0 ? totalCostQuote / totalQuantity : 0;
      const takeProfitPrice =
        totalQuantity > 0
          ? averageEntryPrice * (1 + Number(position.strategy.takeProfitPercent) / 100)
          : null;
      const closed = totalQuantity <= 1e-12 && position.subPositions.every(
        (subPosition: any) => subPosition.status !== 'OPEN' || eligible.some((item: any) => item.id === subPosition.id),
      );

      await tx.tradingPosition.update({
        where: { id: position.id },
        data: {
          totalQuantity,
          totalCostQuote,
          averageEntryPrice,
          realizedPnlQuote,
          takeProfitPrice,
          status: closed ? 'CLOSED' : 'OPEN',
          closedAt: closed ? new Date() : null,
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
    for (const subPosition of eligible) {
      this.publishLifecycle(
        position.userId,
        position.strategyId,
        position.id,
        'INDEPENDENT_TP_HIT',
        `${position.symbol} Paper independent level #${subPosition.level} hit TP and closed.`,
        { symbol: position.symbol, level: subPosition.level, price: marketPrice },
      );
    }
    return result;
  }

  private async executeClose(position: any, marketPrice: number) {
    const quantity = Number(position.totalQuantity);
    if (quantity <= 0) throw new BadRequestException('Parent position has no open quantity');
    const proceeds = quantity * marketPrice;
    const realizedPnlQuote =
      Number(position.realizedPnlQuote) + proceeds - Number(position.totalCostQuote);
    const hasOpenIndependent = position.subPositions.some((subPosition: any) => subPosition.status === 'OPEN');

    const result = await this.prisma.$transaction(async (tx) => {
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

      await tx.tradingPosition.update({
        where: { id: position.id },
        data: {
          status: hasOpenIndependent ? 'OPEN' : 'CLOSED',
          totalQuantity: 0,
          totalCostQuote: 0,
          averageEntryPrice: 0,
          realizedPnlQuote,
          closedAt: hasOpenIndependent ? null : new Date(),
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
    this.publishLifecycle(
      position.userId,
      position.strategyId,
      position.id,
      hasOpenIndependent ? 'PARENT_TP_HIT' : 'CYCLE_COMPLETED',
      hasOpenIndependent
        ? `${position.symbol} Paper parent TP/exit filled; independent legs remain open.`
        : `${position.symbol} Paper TP/exit filled; trading cycle completed.`,
      { symbol: position.symbol, price: marketPrice, realizedPnlQuote },
    );
    return result;
  }

  private publishLifecycle(
    userId: string,
    strategyId: string,
    positionId: string | undefined,
    event: string,
    message: string,
    metadata: Record<string, unknown>,
  ) {
    this.notifications.publish({
      event,
      message,
      severity: 'INFO',
      userId,
      strategyId,
      positionId,
      metadata: { environment: 'PAPER', ...metadata },
    });
  }
}
