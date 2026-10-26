import { BadRequestException, Injectable } from '@nestjs/common';
import { BacktestTradeType, Prisma } from '@prisma/client';
import type {
  BacktestSimulationCandle,
  BacktestSimulationEquityPoint,
  BacktestSimulationResult,
  BacktestSimulationTrade,
} from './backtest-buy-hold-simulator.service';
import { RecoveryStrategyService } from './recovery-strategy.service';
import { evaluateEntrySignal, requiredCandles, type EntrySignalConfig, type SignalCandle } from './entry-signal';

export type BacktestDcaSimulationInput = {
  initialCapital: Prisma.Decimal | string | number;
  candles: BacktestSimulationCandle[];
  maxEntries: number;
  priceDeviationPercent: Prisma.Decimal | string | number;
  volumeMultiplier?: Prisma.Decimal | string | number;
  volumeMultipliers?: number[];
  takeProfitPercent?: Prisma.Decimal | string | number;
  subPositionTriggerPercent?: Prisma.Decimal | string | number;
  subPositionTakeProfitPercent?: Prisma.Decimal | string | number;
  independentFromLevel?: number;
  feePercent?: Prisma.Decimal | string | number;
  slippagePercent?: Prisma.Decimal | string | number;
  riskBudgetQuote?: Prisma.Decimal | string | number;
  baseOrderQuote?: Prisma.Decimal | string | number;
  recoveryEnabled?: boolean;
  recoveryMaxOrders?: number;
  recoveryStepPercents?: number[];
  recoveryMultipliers?: number[];
  recoveryTakeProfitPercent?: Prisma.Decimal | string | number;
  continuousCycles?: boolean;
  /** Dip/bounce rule settings; candles must then carry open, high and low, on the rule's timeframe. */
  signalConfig?: EntrySignalConfig;
  /** Open each cycle only when the dip-and-bounce rule fires (live DIP_CONFIRMATION mode). */
  dipEntry?: boolean;
  /** DCA and recovery buys also wait for a bounce candle. */
  dcaRequiresConfirmation?: boolean;
  /** Sell the whole basket once the close is this far below its average entry. */
  stopLossPercent?: number | null;
};

type IndependentPosition = {
  level: number;
  quantity: Prisma.Decimal;
  costQuote: Prisma.Decimal;
};

@Injectable()
export class BacktestDcaSimulatorService {
  constructor(private readonly recoveryStrategy: RecoveryStrategyService) {}

  simulate(input: BacktestDcaSimulationInput): BacktestSimulationResult {
    if (input.candles.length === 0) {
      throw new BadRequestException('At least one historical candle is required');
    }
    if (!Number.isInteger(input.maxEntries) || input.maxEntries < 1) {
      throw new BadRequestException('maxEntries must be a positive integer');
    }

    const independentFromLevel = input.independentFromLevel ?? input.maxEntries + 1;
    if (
      !Number.isInteger(independentFromLevel) ||
      independentFromLevel < 2 ||
      independentFromLevel > input.maxEntries + 1
    ) {
      throw new BadRequestException(
        'independentFromLevel must be an integer between 2 and maxEntries + 1',
      );
    }

    const initialCapital = new Prisma.Decimal(input.initialCapital);
    const priceDeviationPercent = new Prisma.Decimal(input.priceDeviationPercent);
    const volumeMultiplier = new Prisma.Decimal(input.volumeMultiplier ?? 1);
    const volumeMultipliers = (input.volumeMultipliers ?? []).map((value) => new Prisma.Decimal(value));
    const takeProfitPercent =
      input.takeProfitPercent === undefined
        ? null
        : new Prisma.Decimal(input.takeProfitPercent);
    const subPositionTriggerPercent = new Prisma.Decimal(input.subPositionTriggerPercent ?? input.priceDeviationPercent);
    const subPositionTakeProfitPercent = new Prisma.Decimal(input.subPositionTakeProfitPercent ?? input.takeProfitPercent ?? 1.5);
    const feePercent = new Prisma.Decimal(input.feePercent ?? 0);
    const slippagePercent = new Prisma.Decimal(input.slippagePercent ?? 0);
    const riskBudgetQuote = input.riskBudgetQuote === undefined
      ? null
      : new Prisma.Decimal(input.riskBudgetQuote);
    const baseOrderQuote = input.baseOrderQuote === undefined
      ? null
      : new Prisma.Decimal(input.baseOrderQuote);
    const recoveryConfig = {
      recoveryEnabled: input.recoveryEnabled ?? false,
      recoveryMaxOrders: input.recoveryMaxOrders ?? 5,
      recoveryStepPercents: input.recoveryStepPercents ?? [5, 8, 12, 18, 25],
      recoveryMultipliers: input.recoveryMultipliers ?? [1, 1.5, 2, 3, 5],
      recoveryTakeProfitPercent: Number(input.recoveryTakeProfitPercent ?? 1.5),
    };
    this.recoveryStrategy.normalizeConfig(recoveryConfig);

    if (initialCapital.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Initial capital must be positive');
    }
    if (priceDeviationPercent.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Price deviation percent must be positive');
    }
    if (volumeMultiplier.lessThan(1)) {
      throw new BadRequestException('Volume multiplier must be at least 1');
    }
    if (volumeMultipliers.some((value) => value.lessThanOrEqualTo(0))) throw new BadRequestException('DCA multipliers must be positive');
    if (
      takeProfitPercent !== null &&
      takeProfitPercent.lessThanOrEqualTo(0)
    ) {
      throw new BadRequestException('Take profit percent must be positive');
    }
    if (feePercent.isNegative() || feePercent.greaterThanOrEqualTo(100)) {
      throw new BadRequestException('Fee percent must be between 0 and 100');
    }
    if (slippagePercent.isNegative() || slippagePercent.greaterThanOrEqualTo(100)) {
      throw new BadRequestException('Slippage percent must be between 0 and 100');
    }
    if (riskBudgetQuote !== null && riskBudgetQuote.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Risk budget must be positive');
    }
    if (baseOrderQuote !== null && baseOrderQuote.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Base order must be positive');
    }
    if ((riskBudgetQuote === null) !== (baseOrderQuote === null)) {
      throw new BadRequestException('Risk budget and base order must be supplied together');
    }

    const prices = input.candles.map((candle) => new Prisma.Decimal(candle.close));
    if (prices.some((price) => price.lessThanOrEqualTo(0))) {
      throw new BadRequestException(
        'Historical candle close prices must be positive',
      );
    }

    const usesSignals = Boolean(input.dipEntry || input.dcaRequiresConfirmation);
    if (usesSignals && !input.signalConfig) throw new BadRequestException('Entry rule settings are required for dip entries');
    const signalCandles: SignalCandle[] | null = usesSignals
      ? input.candles.map((candle) => {
          if (candle.open === undefined || candle.high === undefined || candle.low === undefined) {
            throw new BadRequestException('The dip entry rule needs full open/high/low/close candles');
          }
          return { open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close) };
        })
      : null;
    const signalWindow = input.signalConfig ? requiredCandles(input.signalConfig) + 2 : 0;
    // Each candle is treated as just closed, exactly like the live runner, which only reads closed candles.
    const signalAt = (index: number, requireDip: boolean) => evaluateEntrySignal(
      signalCandles!.slice(Math.max(0, index - signalWindow + 1), index + 1), input.signalConfig!, { requireDip },
    ).ok;
    const stopLossPercent = input.stopLossPercent === null || input.stopLossPercent === undefined
      ? null
      : new Prisma.Decimal(input.stopLossPercent);
    if (stopLossPercent !== null && (stopLossPercent.lessThanOrEqualTo(0) || stopLossPercent.greaterThanOrEqualTo(100))) {
      throw new BadRequestException('Stop-loss percent must be between 0 and 100');
    }
    let cycleCount = 0;
    let stopLossCount = 0;

    const feeRate = feePercent.div(100);
    const buySlippageFactor = new Prisma.Decimal(1).add(slippagePercent.div(100));
    const sellSlippageFactor = new Prisma.Decimal(1).sub(slippagePercent.div(100));
    const weights = Array.from({ length: input.maxEntries }, (_, index) =>
      volumeMultiplier.pow(index),
    );
    const totalWeight = weights.reduce(
      (sum, weight) => sum.add(weight),
      new Prisma.Decimal(0),
    );

    let quoteBalance = initialCapital;
    let parentQuantity = new Prisma.Decimal(0);
    let parentCostQuote = new Prisma.Decimal(0);
    const independentPositions: IndependentPosition[] = [];
    const trades: BacktestSimulationTrade[] = [];
    const equityPoints: BacktestSimulationEquityPoint[] = [];
    let entries = 0;
    let entryTrades = 0;
    let exits = 0;
    let peakEquity = initialCapital;
    let maxDrawdownPercent = new Prisma.Decimal(0);
    let cycleEntryPrice = prices[0];
    let lastEntryPrice = cycleEntryPrice;
    let recoveryMode = false;
    let recoveryDcaCount = 0;
    let recoveryAnchorPrice: Prisma.Decimal | null = null;
    let awaitingNewCycle = false;

    const currentExposure = () => independentPositions.reduce(
      (sum, position) => sum.add(position.costQuote),
      parentCostQuote,
    );

    for (let candleIndex = 0; candleIndex < prices.length; candleIndex += 1) {
      const marketPrice = prices[candleIndex];
      const executedAt =
        input.candles[candleIndex].openTime ?? new Date(candleIndex);

      if (input.continuousCycles && awaitingNewCycle) {
        entries = 0;
        recoveryMode = false;
        recoveryDcaCount = 0;
        recoveryAnchorPrice = null;
        cycleEntryPrice = marketPrice;
        lastEntryPrice = marketPrice;
        awaitingNewCycle = false;
      }

      while (!recoveryMode && entries < input.maxEntries) {
        if (entries === 0 && input.dipEntry) {
          if (!signalAt(candleIndex, true)) break;
          cycleEntryPrice = marketPrice;
        }
        const nextLevel = entries + 1;
        const triggerPercent = nextLevel >= independentFromLevel ? subPositionTriggerPercent : priceDeviationPercent;
        const triggerPrice = entries === 0
          ? cycleEntryPrice
          : lastEntryPrice.mul(new Prisma.Decimal(1).sub(triggerPercent.div(100)));
        if (marketPrice.greaterThan(triggerPrice)) break;
        if (entries > 0 && input.dcaRequiresConfirmation && !signalAt(candleIndex, false)) break;

        const configuredMultiplier = entries > 0 ? volumeMultipliers[entries - 1] : undefined;
        const allocation = baseOrderQuote === null
          ? initialCapital.mul(weights[entries]).div(totalWeight)
          : baseOrderQuote.mul(entries === 0 ? 1 : (configuredMultiplier ?? volumeMultiplier.pow(entries)));
        const riskRemaining = riskBudgetQuote === null
          ? quoteBalance
          : Prisma.Decimal.max(riskBudgetQuote.sub(currentExposure()), 0);
        const spend = Prisma.Decimal.min(allocation, quoteBalance, riskRemaining);
        if (!spend.greaterThan(0)) break;

        const feeQuote = spend.mul(feeRate);
        const quoteForAsset = spend.sub(feeQuote);
        const executionPrice = marketPrice.mul(buySlippageFactor);
        if (!quoteForAsset.greaterThan(0) || !executionPrice.greaterThan(0)) break;

        quoteBalance = quoteBalance.sub(spend);
        const quantity = quoteForAsset.div(executionPrice);
        const level = entries + 1;
        const independent = level >= independentFromLevel;

        if (independent) {
          independentPositions.push({ level, quantity, costQuote: spend });
        } else {
          parentQuantity = parentQuantity.add(quantity);
          parentCostQuote = parentCostQuote.add(spend);
        }

        trades.push({
          type: independent
            ? BacktestTradeType.INDEPENDENT_ENTRY
            : BacktestTradeType.PARENT_ENTRY,
          level,
          independent,
          executedAt,
          price: executionPrice.toFixed(12),
          quantity: quantity.toFixed(12),
          quoteAmount: spend.toFixed(8),
          feeQuote: feeQuote.toFixed(8),
        });
        entries += 1;
        lastEntryPrice = marketPrice;
        entryTrades += 1;
      }

      const recoveryAnchor = independentPositions.find(
        (position) => position.level === independentFromLevel,
      );
      if (!recoveryMode && recoveryAnchor && recoveryConfig.recoveryEnabled) {
        recoveryAnchorPrice = recoveryAnchor.costQuote.div(recoveryAnchor.quantity);
      }

      while (recoveryAnchorPrice !== null && recoveryConfig.recoveryEnabled) {
        const exposure = currentExposure();
        const riskRemaining = riskBudgetQuote === null
          ? quoteBalance
          : Prisma.Decimal.max(riskBudgetQuote.sub(exposure), 0);
        const leg = this.recoveryStrategy.nextLeg(recoveryConfig, {
          recoveryDcaCount,
          anchorPrice: recoveryAnchorPrice.toNumber(),
          baseOrderQuote: Number(baseOrderQuote ?? initialCapital.div(totalWeight)),
          remainingRiskBudget: Prisma.Decimal.min(riskRemaining, quoteBalance).toNumber(),
        });
        if (!leg || marketPrice.greaterThan(leg.triggerPrice) || leg.quoteAmount <= 0) break;
        if (input.dcaRequiresConfirmation && !signalAt(candleIndex, false)) break;

        const spend = Prisma.Decimal.min(new Prisma.Decimal(leg.quoteAmount), quoteBalance, riskRemaining);
        if (!spend.greaterThan(0)) break;
        const feeQuote = spend.mul(feeRate);
        const quoteForAsset = spend.sub(feeQuote);
        const executionPrice = marketPrice.mul(buySlippageFactor);
        if (!quoteForAsset.greaterThan(0) || !executionPrice.greaterThan(0)) break;

        quoteBalance = quoteBalance.sub(spend);
        const quantity = quoteForAsset.div(executionPrice);
        parentQuantity = parentQuantity.add(quantity);
        parentCostQuote = parentCostQuote.add(spend);
        recoveryMode = true;
        recoveryDcaCount += 1;
        entryTrades += 1;
        trades.push({
          type: BacktestTradeType.RECOVERY_ENTRY,
          level: input.maxEntries + recoveryDcaCount,
          independent: false,
          executedAt,
          price: executionPrice.toFixed(12),
          quantity: quantity.toFixed(12),
          quoteAmount: spend.toFixed(8),
          feeQuote: feeQuote.toFixed(8),
        });
      }

      let stoppedOut = false;
      if (stopLossPercent !== null) {
        const basketQuantity = independentPositions.reduce((sum, position) => sum.add(position.quantity), parentQuantity);
        if (basketQuantity.greaterThan(0)) {
          const stopPrice = currentExposure().div(basketQuantity).mul(new Prisma.Decimal(1).sub(stopLossPercent.div(100)));
          if (marketPrice.lessThanOrEqualTo(stopPrice)) {
            const executionPrice = marketPrice.mul(sellSlippageFactor);
            const sell = (quantity: Prisma.Decimal, costQuote: Prisma.Decimal, type: BacktestTradeType, level: number, independent: boolean) => {
              const grossProceeds = quantity.mul(executionPrice);
              const feeQuote = grossProceeds.mul(feeRate);
              const netProceeds = grossProceeds.sub(feeQuote);
              quoteBalance = quoteBalance.add(netProceeds);
              trades.push({
                type, level, independent, executedAt,
                price: executionPrice.toFixed(12), quantity: quantity.toFixed(12), quoteAmount: grossProceeds.toFixed(8),
                feeQuote: feeQuote.toFixed(8), realizedPnlQuote: netProceeds.sub(costQuote).toFixed(8),
              });
              exits += 1;
            };
            for (let index = independentPositions.length - 1; index >= 0; index -= 1) {
              const position = independentPositions[index];
              sell(position.quantity, position.costQuote, BacktestTradeType.INDEPENDENT_EXIT, position.level, true);
            }
            independentPositions.splice(0, independentPositions.length);
            if (parentQuantity.greaterThan(0)) {
              sell(parentQuantity, parentCostQuote, BacktestTradeType.PARENT_EXIT, Math.max(1, Math.min(entries, independentFromLevel - 1)), false);
              parentQuantity = new Prisma.Decimal(0);
              parentCostQuote = new Prisma.Decimal(0);
            }
            recoveryMode = false;
            recoveryDcaCount = 0;
            recoveryAnchorPrice = null;
            stopLossCount += 1;
            stoppedOut = true;
          }
        }
      }

      if (takeProfitPercent !== null && !stoppedOut) {
        if (recoveryMode) {
          const basketQuantity = independentPositions.reduce(
            (sum, position) => sum.add(position.quantity),
            parentQuantity,
          );
          const basketCost = currentExposure();
          const globalTakeProfit = basketQuantity.greaterThan(0)
            ? basketCost.div(basketQuantity).mul(
                new Prisma.Decimal(1).add(new Prisma.Decimal(recoveryConfig.recoveryTakeProfitPercent).div(100)),
              )
            : null;
          if (globalTakeProfit && marketPrice.greaterThanOrEqualTo(globalTakeProfit)) {
            for (let index = independentPositions.length - 1; index >= 0; index -= 1) {
              const position = independentPositions[index];
              const executionPrice = marketPrice.mul(sellSlippageFactor);
              const grossProceeds = position.quantity.mul(executionPrice);
              const feeQuote = grossProceeds.mul(feeRate);
              const netProceeds = grossProceeds.sub(feeQuote);
              quoteBalance = quoteBalance.add(netProceeds);
              trades.push({
                type: BacktestTradeType.INDEPENDENT_EXIT,
                level: position.level,
                independent: true,
                executedAt,
                price: executionPrice.toFixed(12),
                quantity: position.quantity.toFixed(12),
                quoteAmount: grossProceeds.toFixed(8),
                feeQuote: feeQuote.toFixed(8),
                realizedPnlQuote: netProceeds.sub(position.costQuote).toFixed(8),
              });
              exits += 1;
            }
            independentPositions.splice(0, independentPositions.length);

            if (parentQuantity.greaterThan(0)) {
              const executionPrice = marketPrice.mul(sellSlippageFactor);
              const grossProceeds = parentQuantity.mul(executionPrice);
              const feeQuote = grossProceeds.mul(feeRate);
              const netProceeds = grossProceeds.sub(feeQuote);
              quoteBalance = quoteBalance.add(netProceeds);
              trades.push({
                type: BacktestTradeType.PARENT_EXIT,
                level: input.maxEntries + recoveryDcaCount,
                independent: false,
                executedAt,
                price: executionPrice.toFixed(12),
                quantity: parentQuantity.toFixed(12),
                quoteAmount: grossProceeds.toFixed(8),
                feeQuote: feeQuote.toFixed(8),
                realizedPnlQuote: netProceeds.sub(parentCostQuote).toFixed(8),
              });
              parentQuantity = new Prisma.Decimal(0);
              parentCostQuote = new Prisma.Decimal(0);
              exits += 1;
            }
            recoveryMode = false;
            recoveryDcaCount = 0;
            recoveryAnchorPrice = null;
          }
        } else {
        if (
          parentQuantity.greaterThan(0) &&
          marketPrice.greaterThanOrEqualTo(
            parentCostQuote
              .div(parentQuantity)
              .mul(new Prisma.Decimal(1).add(takeProfitPercent.div(100))),
          )
        ) {
          const executionPrice = marketPrice.mul(sellSlippageFactor);
          const grossProceeds = parentQuantity.mul(executionPrice);
          const feeQuote = grossProceeds.mul(feeRate);
          const netProceeds = grossProceeds.sub(feeQuote);
          const realizedPnlQuote = netProceeds.sub(parentCostQuote);
          quoteBalance = quoteBalance.add(netProceeds);
          trades.push({
            type: BacktestTradeType.PARENT_EXIT,
            level: Math.max(1, Math.min(entries, independentFromLevel - 1)),
            independent: false,
            executedAt,
            price: executionPrice.toFixed(12),
            quantity: parentQuantity.toFixed(12),
            quoteAmount: grossProceeds.toFixed(8),
            feeQuote: feeQuote.toFixed(8),
            realizedPnlQuote: realizedPnlQuote.toFixed(8),
          });
          parentQuantity = new Prisma.Decimal(0);
          parentCostQuote = new Prisma.Decimal(0);
          exits += 1;
        }

        for (let index = independentPositions.length - 1; index >= 0; index -= 1) {
          const position = independentPositions[index];
          const takeProfitPrice = position.costQuote
            .div(position.quantity)
            .mul(new Prisma.Decimal(1).add(subPositionTakeProfitPercent.div(100)));
          if (marketPrice.greaterThanOrEqualTo(takeProfitPrice)) {
            const executionPrice = marketPrice.mul(sellSlippageFactor);
            const grossProceeds = position.quantity.mul(executionPrice);
            const feeQuote = grossProceeds.mul(feeRate);
            const netProceeds = grossProceeds.sub(feeQuote);
            const realizedPnlQuote = netProceeds.sub(position.costQuote);
            quoteBalance = quoteBalance.add(netProceeds);
            trades.push({
              type: BacktestTradeType.INDEPENDENT_EXIT,
              level: position.level,
              independent: true,
              executedAt,
              price: executionPrice.toFixed(12),
              quantity: position.quantity.toFixed(12),
              quoteAmount: grossProceeds.toFixed(8),
              feeQuote: feeQuote.toFixed(8),
              realizedPnlQuote: realizedPnlQuote.toFixed(8),
            });
            independentPositions.splice(index, 1);
            exits += 1;
          }
        }
        }
      }

      if (
        input.continuousCycles &&
        entries > 0 &&
        !parentQuantity.greaterThan(0) &&
        independentPositions.length === 0
      ) {
        if (!awaitingNewCycle) cycleCount += 1;
        awaitingNewCycle = true;
      }

      const independentEquity = independentPositions.reduce(
        (sum, position) => sum.add(position.quantity.mul(marketPrice)),
        new Prisma.Decimal(0),
      );
      const equity = quoteBalance
        .add(parentQuantity.mul(marketPrice))
        .add(independentEquity);
      if (equity.greaterThan(peakEquity)) peakEquity = equity;

      const drawdownPercent = peakEquity
        .sub(equity)
        .div(peakEquity)
        .mul(100);
      if (drawdownPercent.greaterThan(maxDrawdownPercent)) {
        maxDrawdownPercent = drawdownPercent;
      }

      equityPoints.push({
        recordedAt: executedAt,
        equityQuote: equity.toFixed(8),
        drawdownPercent: drawdownPercent.toFixed(6),
      });
    }

    const finalPrice = prices[prices.length - 1];
    const independentEndingValue = independentPositions.reduce(
      (sum, position) => sum.add(position.quantity.mul(finalPrice)),
      new Prisma.Decimal(0),
    );
    const endingCapital = quoteBalance
      .add(parentQuantity.mul(finalPrice))
      .add(independentEndingValue);
    const realizedPnlQuote = endingCapital.sub(initialCapital);
    const returnPercent = realizedPnlQuote.div(initialCapital).mul(100);

    return {
      endingCapital: endingCapital.toFixed(8),
      realizedPnlQuote: realizedPnlQuote.toFixed(8),
      returnPercent: returnPercent.toFixed(6),
      maxDrawdownPercent: maxDrawdownPercent.toFixed(6),
      tradeCount: entryTrades + exits,
      cycleCount,
      stopLossCount,
      trades,
      equityPoints,
    };
  }
}
