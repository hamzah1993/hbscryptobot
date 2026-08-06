import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RiskBudgetService } from './risk-budget.service';
import { RecoveryStrategyService } from './recovery-strategy.service';

export type StrategyInput = {
  name: string;
  symbol: string;
  environment?: 'TESTNET' | 'LIVE';
  paperTrading?: boolean;
  riskBudgetQuote: number;
  baseOrderQuote: number;
  maxDcaOrders: number;
  dcaStepPercent: number;
  dcaMultiplier: number;
  dcaMultipliers?: number[];
  takeProfitPercent: number;
  subPositionTriggerPercent?: number;
  subPositionTakeProfitPercent?: number;
  independentFromLevel: number;
  basePositionPercent?: number;
  maxTotalRiskPercent?: number;
  maxOpenPairs?: number;
  cooldownMinutes?: number;
  recoveryEnabled?: boolean;
  recoveryMaxOrders?: number;
  recoveryStepPercents?: number[];
  recoveryMultipliers?: number[];
  recoveryTakeProfitPercent?: number;
};

@Injectable()
export class StrategyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly riskBudget: RiskBudgetService,
    private readonly recoveryStrategy: RecoveryStrategyService,
  ) {}

  async create(userId: string, input: StrategyInput) {
    const normalized = this.normalize(input);
    this.riskBudget.buildPlan(normalized);

    try {
      return await this.prisma.tradingStrategy.create({
        data: {
          userId,
          name: normalized.name,
          symbol: normalized.symbol,
          environment: normalized.environment,
          mode: normalized.mode,
          paperTrading: normalized.paperTrading,
          riskBudgetQuote: normalized.riskBudgetQuote,
          baseOrderQuote: normalized.baseOrderQuote,
          maxDcaOrders: normalized.maxDcaOrders,
          dcaStepPercent: normalized.dcaStepPercent,
          dcaMultiplier: normalized.dcaMultiplier,
          dcaMultipliers: normalized.dcaMultipliers,
          takeProfitPercent: normalized.takeProfitPercent,
          subPositionTriggerPercent: normalized.subPositionTriggerPercent,
          subPositionTakeProfitPercent: normalized.subPositionTakeProfitPercent,
          independentFromLevel: normalized.independentFromLevel,
          basePositionPercent: normalized.basePositionPercent,
          maxTotalRiskPercent: normalized.maxTotalRiskPercent,
          maxOpenPairs: normalized.maxOpenPairs,
          cooldownMinutes: normalized.cooldownMinutes,
          recoveryEnabled: normalized.recoveryEnabled,
          recoveryMaxOrders: normalized.recoveryMaxOrders,
          recoveryStepPercents: normalized.recoveryStepPercents,
          recoveryMultipliers: normalized.recoveryMultipliers,
          recoveryTakeProfitPercent: normalized.recoveryTakeProfitPercent,
        },
      });
    } catch (error) {
      this.rethrowFriendlyPrismaError(error);
    }
  }

  list(userId: string) {
    return this.prisma.tradingStrategy.findMany({
      where: { userId },
      include: {
        positions: {
          where: { status: 'OPEN' },
          select: { id: true, status: true, totalCostQuote: true, averageEntryPrice: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(userId: string, strategyId: string, input: Partial<StrategyInput>) {
    const existing = await this.prisma.tradingStrategy.findFirst({ where: { id: strategyId, userId } });
    if (!existing) throw new NotFoundException('Strategy not found');
    if (existing.status === 'RUNNING') throw new BadRequestException('Pause or stop the strategy before editing');

    const merged = this.normalize({
      name: input.name ?? existing.name,
      symbol: input.symbol ?? existing.symbol,
      environment: input.environment ?? existing.environment,
      paperTrading: input.paperTrading ?? existing.paperTrading,
      riskBudgetQuote: input.riskBudgetQuote ?? Number(existing.riskBudgetQuote),
      baseOrderQuote: input.baseOrderQuote ?? Number(existing.baseOrderQuote),
      maxDcaOrders: input.maxDcaOrders ?? existing.maxDcaOrders,
      dcaStepPercent: input.dcaStepPercent ?? Number(existing.dcaStepPercent),
      dcaMultiplier: input.dcaMultiplier ?? Number(existing.dcaMultiplier),
      dcaMultipliers: input.dcaMultipliers ?? (existing.dcaMultipliers as number[]),
      takeProfitPercent: input.takeProfitPercent ?? Number(existing.takeProfitPercent),
      subPositionTriggerPercent: input.subPositionTriggerPercent ?? Number(existing.subPositionTriggerPercent),
      subPositionTakeProfitPercent: input.subPositionTakeProfitPercent ?? Number(existing.subPositionTakeProfitPercent),
      independentFromLevel: input.independentFromLevel ?? existing.independentFromLevel,
      basePositionPercent: input.basePositionPercent ?? Number(existing.basePositionPercent),
      maxTotalRiskPercent: input.maxTotalRiskPercent ?? Number(existing.maxTotalRiskPercent),
      maxOpenPairs: input.maxOpenPairs ?? existing.maxOpenPairs,
      cooldownMinutes: input.cooldownMinutes ?? existing.cooldownMinutes,
      recoveryEnabled: input.recoveryEnabled ?? existing.recoveryEnabled,
      recoveryMaxOrders: input.recoveryMaxOrders ?? existing.recoveryMaxOrders,
      recoveryStepPercents: input.recoveryStepPercents ?? (existing.recoveryStepPercents as number[]),
      recoveryMultipliers: input.recoveryMultipliers ?? (existing.recoveryMultipliers as number[]),
      recoveryTakeProfitPercent: input.recoveryTakeProfitPercent ?? Number(existing.recoveryTakeProfitPercent),
    });
    this.riskBudget.buildPlan(merged);

    try {
      return await this.prisma.tradingStrategy.update({
        where: { id: strategyId },
        data: merged,
      });
    } catch (error) {
      this.rethrowFriendlyPrismaError(error);
    }
  }

  async setStatus(userId: string, strategyId: string, status: 'RUNNING' | 'PAUSED' | 'STOPPED') {
    const existing = await this.prisma.tradingStrategy.findFirst({ where: { id: strategyId, userId } });
    if (!existing) throw new NotFoundException('Strategy not found');
    return this.prisma.tradingStrategy.update({ where: { id: strategyId }, data: { status } });
  }

  async remove(userId: string, strategyId: string) {
    const existing = await this.prisma.tradingStrategy.findFirst({
      where: { id: strategyId, userId },
      include: { positions: { where: { status: 'OPEN' }, select: { id: true } } },
    });
    if (!existing) throw new NotFoundException('Strategy not found');
    if (existing.positions.length) throw new BadRequestException('Close open positions before deleting the strategy');
    return this.prisma.tradingStrategy.delete({ where: { id: strategyId } });
  }

  private rethrowFriendlyPrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('A bot with this name already exists. Choose another name or edit the existing bot.');
    }
    throw error;
  }

  private normalize(input: StrategyInput) {
    const name = input.name.trim();
    const symbol = input.symbol.replace(/[^a-z0-9]/gi, '').toUpperCase();
    if (!name) throw new BadRequestException('Strategy name is required');
    if (!symbol) throw new BadRequestException('Trading symbol is required');

    const environment = input.environment ?? 'TESTNET';
    const paperTrading = input.paperTrading ?? true;
    const mode = paperTrading
      ? 'PAPER'
      : environment === 'TESTNET'
        ? 'BINANCE_TESTNET'
        : 'BINANCE_LIVE';

    const normalized = {
      name,
      symbol,
      environment,
      mode,
      paperTrading,
      riskBudgetQuote: Number(input.riskBudgetQuote),
      baseOrderQuote: Number(input.baseOrderQuote),
      maxDcaOrders: Number(input.maxDcaOrders),
      dcaStepPercent: Number(input.dcaStepPercent),
      dcaMultiplier: Number(input.dcaMultiplier),
      dcaMultipliers: (input.dcaMultipliers ?? [1, 1.5, 2, 3, 5]).map(Number),
      takeProfitPercent: Number(input.takeProfitPercent),
      subPositionTriggerPercent: Number(input.subPositionTriggerPercent ?? 2),
      subPositionTakeProfitPercent: Number(input.subPositionTakeProfitPercent ?? 1.5),
      independentFromLevel: Number(input.independentFromLevel),
      basePositionPercent: Number(input.basePositionPercent ?? 1),
      maxTotalRiskPercent: Number(input.maxTotalRiskPercent ?? 3),
      maxOpenPairs: Number(input.maxOpenPairs ?? 5),
      cooldownMinutes: Number(input.cooldownMinutes ?? 60),
      recoveryEnabled: input.recoveryEnabled ?? true,
      recoveryMaxOrders: Number(input.recoveryMaxOrders ?? 5),
      recoveryStepPercents: (input.recoveryStepPercents ?? [5, 8, 12, 18, 25]).map(Number),
      recoveryMultipliers: (input.recoveryMultipliers ?? [1, 1.5, 2, 3, 5]).map(Number),
      recoveryTakeProfitPercent: Number(input.recoveryTakeProfitPercent ?? 1.5),
    } as const;
    this.validateConfigRanges(normalized);
    this.recoveryStrategy.normalizeConfig(normalized);
    return normalized;
  }

  private validateConfigRanges(input: {
    maxDcaOrders: number; dcaStepPercent: number; dcaMultipliers: number[]; takeProfitPercent: number;
    subPositionTriggerPercent: number; subPositionTakeProfitPercent: number; basePositionPercent: number;
    maxTotalRiskPercent: number; maxOpenPairs: number; cooldownMinutes: number;
  }) {
    if (!Number.isInteger(input.maxDcaOrders) || input.maxDcaOrders < 3 || input.maxDcaOrders > 10) {
      throw new BadRequestException('DCA levels must be an integer between 3 and 10');
    }
    if (input.dcaStepPercent < 3 || input.dcaStepPercent > 15) throw new BadRequestException('DCA trigger must be between 3% and 15%');
    if (input.takeProfitPercent < 0.5 || input.takeProfitPercent > 5) throw new BadRequestException('Global take-profit must be between 0.5% and 5%');
    if (input.subPositionTriggerPercent < 0.5 || input.subPositionTriggerPercent > 5) throw new BadRequestException('Sub-position trigger must be between 0.5% and 5%');
    if (input.subPositionTakeProfitPercent < 0.5 || input.subPositionTakeProfitPercent > 5) throw new BadRequestException('Sub-position take-profit must be between 0.5% and 5%');
    if (input.basePositionPercent < 0.1 || input.basePositionPercent > 5) throw new BadRequestException('Base position size must be between 0.1% and 5% of capital');
    if (input.maxTotalRiskPercent < 1 || input.maxTotalRiskPercent > 10) throw new BadRequestException('Maximum total risk must be between 1% and 10% of capital');
    if (!Number.isInteger(input.maxOpenPairs) || input.maxOpenPairs < 1 || input.maxOpenPairs > 20) throw new BadRequestException('Maximum open pairs must be between 1 and 20');
    if (!Number.isInteger(input.cooldownMinutes) || input.cooldownMinutes < 0 || input.cooldownMinutes > 1440) throw new BadRequestException('Cooldown must be between 0 and 1440 minutes');
    if (input.dcaMultipliers.length < input.maxDcaOrders) throw new BadRequestException('DCA multipliers must cover every configured DCA level');
    if (input.dcaMultipliers.some((value) => !Number.isFinite(value) || value <= 0)) throw new BadRequestException('Every DCA multiplier must be a positive number');
  }
}
