import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ExchangeName, Prisma, TradingMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_DCA_LEVELS, RiskBudgetService } from './risk-budget.service';
import { RecoveryStrategyService } from './recovery-strategy.service';
import {
  CONFIRM_RULES, CONFIRM_TIMEFRAMES, ENTRY_MODES, MAX_SIGNAL_CANDLES, timeframeMinutes,
  type ConfirmRule, type ConfirmTimeframe, type EntryMode,
} from './entry-signal';

export type StrategyInput = {
  name: string;
  symbol: string;
  exchange?: 'BINANCE' | 'BYBIT' | 'OKX';
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
  maxStrategyExposureQuote?: number | null;
  maxOrderQuote?: number | null;
  maxDailyRealizedLossQuote?: number | null;
  entryMode?: EntryMode;
  dipPercent?: number;
  dipLookbackMinutes?: number;
  confirmTimeframe?: ConfirmTimeframe;
  confirmRule?: ConfirmRule;
  confirmCandles?: number;
  rsiMax?: number | null;
  dcaRequiresConfirmation?: boolean;
  stopLossPercent?: number | null;
};

@Injectable()
export class StrategyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly riskBudget: RiskBudgetService,
    private readonly recoveryStrategy: RecoveryStrategyService,
  ) {}

  create(userId: string, input: StrategyInput) {
    return this.createWithClient(this.prisma, userId, input);
  }

  /** Validates a strategy definition exactly as create() would, without persisting it. */
  validateInput(input: StrategyInput) {
    const normalized = this.normalize(input);
    this.riskBudget.buildPlan(normalized);
    return normalized;
  }

  /** Same as create(), using the given client so callers can create inside their own transaction. */
  async createWithClient(
    client: Prisma.TransactionClient,
    userId: string,
    input: StrategyInput,
    options: { packageSubscriptionId?: string } = {},
  ) {
    const normalized = this.validateInput(input);

    try {
      return await client.tradingStrategy.create({
        data: {
          userId,
          packageSubscriptionId: options.packageSubscriptionId ?? null,
          name: normalized.name,
          symbol: normalized.symbol,
          exchange: normalized.exchange,
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
          maxStrategyExposureQuote: normalized.maxStrategyExposureQuote,
          maxOrderQuote: normalized.maxOrderQuote,
          maxDailyRealizedLossQuote: normalized.maxDailyRealizedLossQuote,
          entryMode: normalized.entryMode,
          dipPercent: normalized.dipPercent,
          dipLookbackMinutes: normalized.dipLookbackMinutes,
          confirmTimeframe: normalized.confirmTimeframe,
          confirmRule: normalized.confirmRule,
          confirmCandles: normalized.confirmCandles,
          rsiMax: normalized.rsiMax,
          dcaRequiresConfirmation: normalized.dcaRequiresConfirmation,
          stopLossPercent: normalized.stopLossPercent,
        },
      });
    } catch (error) {
      this.rethrowFriendlyPrismaError(error);
    }
  }

  /** Trading package bots are managed from the Packages page and their settings are admin-only, so they are never listed here. */
  list(userId: string) {
    return this.prisma.tradingStrategy.findMany({
      where: { userId, packageSubscriptionId: null },
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
    await this.assertNotPackageManaged(strategyId, 'edited');
    if (existing.status === 'RUNNING') throw new BadRequestException('Pause or stop the strategy before editing');

    const merged = this.normalize({
      name: input.name ?? existing.name,
      symbol: input.symbol ?? existing.symbol,
      exchange: input.exchange ?? existing.exchange,
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
      maxStrategyExposureQuote: input.maxStrategyExposureQuote !== undefined ? input.maxStrategyExposureQuote : existing.maxStrategyExposureQuote === null ? null : Number(existing.maxStrategyExposureQuote),
      maxOrderQuote: input.maxOrderQuote !== undefined ? input.maxOrderQuote : existing.maxOrderQuote === null ? null : Number(existing.maxOrderQuote),
      maxDailyRealizedLossQuote: input.maxDailyRealizedLossQuote !== undefined ? input.maxDailyRealizedLossQuote : existing.maxDailyRealizedLossQuote === null ? null : Number(existing.maxDailyRealizedLossQuote),
      entryMode: input.entryMode ?? existing.entryMode,
      dipPercent: input.dipPercent ?? Number(existing.dipPercent),
      dipLookbackMinutes: input.dipLookbackMinutes ?? existing.dipLookbackMinutes,
      confirmTimeframe: input.confirmTimeframe ?? (existing.confirmTimeframe as ConfirmTimeframe),
      confirmRule: input.confirmRule ?? existing.confirmRule,
      confirmCandles: input.confirmCandles ?? existing.confirmCandles,
      rsiMax: input.rsiMax !== undefined ? input.rsiMax : existing.rsiMax === null ? null : Number(existing.rsiMax),
      dcaRequiresConfirmation: input.dcaRequiresConfirmation ?? existing.dcaRequiresConfirmation,
      stopLossPercent: input.stopLossPercent !== undefined ? input.stopLossPercent : existing.stopLossPercent === null ? null : Number(existing.stopLossPercent),
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
    await this.assertNotPackageManaged(strategyId, 'started or stopped here');
    return this.prisma.tradingStrategy.update({ where: { id: strategyId }, data: { status } });
  }

  async remove(userId: string, strategyId: string) {
    const existing = await this.prisma.tradingStrategy.findFirst({
      where: { id: strategyId, userId },
      include: { positions: { where: { status: 'OPEN' }, select: { id: true } } },
    });
    if (!existing) throw new NotFoundException('Strategy not found');
    await this.assertNotPackageManaged(strategyId, 'deleted');
    if (existing.positions.length) throw new BadRequestException('Close open positions before deleting the strategy');
    return this.prisma.tradingStrategy.delete({ where: { id: strategyId } });
  }

  /** Package strategies keep the admin-defined settings for as long as the subscription is active. */
  /** Package bots keep admin-defined settings for life, including after the subscription is cancelled. */
  private async assertNotPackageManaged(strategyId: string, verb: 'edited' | 'deleted' | 'started or stopped here') {
    const managed = await this.prisma.tradingStrategy.findFirst({
      where: { id: strategyId, packageSubscriptionId: { not: null } },
      select: { id: true },
    });
    if (managed) {
      throw new BadRequestException(`This bot is managed by a trading package and cannot be ${verb}. Use the Packages page instead.`);
    }
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
    const exchange = ExchangeName[input.exchange ?? 'BINANCE'];
    const mode = paperTrading
      ? TradingMode.PAPER
      : TradingMode[`${exchange}_${environment}` as keyof typeof TradingMode];

    const normalized = {
      name,
      symbol,
      exchange,
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
      maxStrategyExposureQuote: input.maxStrategyExposureQuote == null ? null : Number(input.maxStrategyExposureQuote),
      maxOrderQuote: input.maxOrderQuote == null ? null : Number(input.maxOrderQuote),
      maxDailyRealizedLossQuote: input.maxDailyRealizedLossQuote == null ? null : Number(input.maxDailyRealizedLossQuote),
      entryMode: input.entryMode ?? 'IMMEDIATE',
      dipPercent: Number(input.dipPercent ?? 3),
      dipLookbackMinutes: Number(input.dipLookbackMinutes ?? 1440),
      confirmTimeframe: input.confirmTimeframe ?? '5m',
      confirmRule: input.confirmRule ?? 'CLOSE_ABOVE_PREV_HIGH',
      confirmCandles: Number(input.confirmCandles ?? 2),
      rsiMax: input.rsiMax == null ? null : Number(input.rsiMax),
      dcaRequiresConfirmation: input.dcaRequiresConfirmation ?? false,
      stopLossPercent: input.stopLossPercent == null ? null : Number(input.stopLossPercent),
    } as const;
    this.validateConfigRanges(normalized);
    this.validateEntryRules(normalized);
    this.recoveryStrategy.normalizeConfig(normalized);
    return normalized;
  }

  private validateConfigRanges(input: {
    maxDcaOrders: number; dcaStepPercent: number; dcaMultipliers: number[]; takeProfitPercent: number;
    subPositionTriggerPercent: number; subPositionTakeProfitPercent: number; basePositionPercent: number;
    maxTotalRiskPercent: number; maxOpenPairs: number; cooldownMinutes: number;
    maxStrategyExposureQuote: number | null; maxOrderQuote: number | null; maxDailyRealizedLossQuote: number | null;
  }) {
    if (!Number.isInteger(input.maxDcaOrders) || input.maxDcaOrders < 1 || input.maxDcaOrders > MAX_DCA_LEVELS) {
      throw new BadRequestException(`DCA levels must be a whole number between 1 and ${MAX_DCA_LEVELS}`);
    }
    if (input.dcaStepPercent < 3 || input.dcaStepPercent > 15) throw new BadRequestException('DCA trigger must be between 3% and 15%');
    if (input.takeProfitPercent < 0.5 || input.takeProfitPercent > 5) throw new BadRequestException('Global take-profit must be between 0.5% and 5%');
    if (input.subPositionTriggerPercent < 0.5 || input.subPositionTriggerPercent > 5) throw new BadRequestException('Sub-position trigger must be between 0.5% and 5%');
    if (input.subPositionTakeProfitPercent < 0.5 || input.subPositionTakeProfitPercent > 5) throw new BadRequestException('Sub-position take-profit must be between 0.5% and 5%');
    if (input.basePositionPercent < 0.1 || input.basePositionPercent > 5) throw new BadRequestException('Base position size must be between 0.1% and 5% of capital');
    if (input.maxTotalRiskPercent < 1 || input.maxTotalRiskPercent > 10) throw new BadRequestException('Maximum total risk must be between 1% and 10% of capital');
    if (!Number.isInteger(input.maxOpenPairs) || input.maxOpenPairs < 1 || input.maxOpenPairs > 20) throw new BadRequestException('Maximum open pairs must be between 1 and 20');
    if (!Number.isInteger(input.cooldownMinutes) || input.cooldownMinutes < 0 || input.cooldownMinutes > 1440) throw new BadRequestException('Cooldown must be between 0 and 1440 minutes');
    // Levels beyond the per-level list use dcaMultiplier growth (1 = equal-size buys), as the runner and backtests do.
    if (input.dcaMultipliers.some((value) => !Number.isFinite(value) || value <= 0)) throw new BadRequestException('Every DCA multiplier must be a positive number');
    for (const [label, value] of [
      ['Maximum strategy exposure', input.maxStrategyExposureQuote],
      ['Maximum order value', input.maxOrderQuote],
      ['Maximum daily realized loss', input.maxDailyRealizedLossQuote],
    ] as const) {
      if (value !== null && value !== undefined && (!Number.isFinite(value) || value <= 0)) {
        throw new BadRequestException(`${label} must be greater than zero when configured`);
      }
    }
  }

  private validateEntryRules(input: {
    entryMode: string; dipPercent: number; dipLookbackMinutes: number; confirmTimeframe: string; confirmRule: string;
    confirmCandles: number; rsiMax: number | null; dcaRequiresConfirmation: unknown; stopLossPercent: number | null;
  }) {
    if (!(ENTRY_MODES as readonly string[]).includes(input.entryMode)) throw new BadRequestException(`Entry mode must be one of ${ENTRY_MODES.join(', ')}`);
    if (!(CONFIRM_RULES as readonly string[]).includes(input.confirmRule)) throw new BadRequestException(`Confirmation rule must be one of ${CONFIRM_RULES.join(', ')}`);
    if (!(CONFIRM_TIMEFRAMES as readonly string[]).includes(input.confirmTimeframe)) throw new BadRequestException(`Confirmation timeframe must be one of ${CONFIRM_TIMEFRAMES.join(', ')}`);
    if (!(input.dipPercent >= 0.1 && input.dipPercent <= 50)) throw new BadRequestException('Dip size must be between 0.1% and 50%');
    const maxLookback = timeframeMinutes(input.confirmTimeframe as ConfirmTimeframe) * (MAX_SIGNAL_CANDLES - 60);
    if (!Number.isInteger(input.dipLookbackMinutes) || input.dipLookbackMinutes < 5 || input.dipLookbackMinutes > maxLookback) {
      throw new BadRequestException(`Dip lookback must be a whole number of minutes between 5 and ${maxLookback} for ${input.confirmTimeframe} candles`);
    }
    if (!Number.isInteger(input.confirmCandles) || input.confirmCandles < 1 || input.confirmCandles > 5) throw new BadRequestException('Confirmation candles must be between 1 and 5');
    if (input.rsiMax !== null && !(input.rsiMax >= 5 && input.rsiMax <= 60)) throw new BadRequestException('RSI threshold must be between 5 and 60 when set');
    if (typeof input.dcaRequiresConfirmation !== 'boolean') throw new BadRequestException('DCA confirmation must be true or false');
    if (input.stopLossPercent !== null && !(input.stopLossPercent >= 0.5 && input.stopLossPercent <= 90)) {
      throw new BadRequestException('Stop-loss must be between 0.5% and 90% when set');
    }
  }
}
