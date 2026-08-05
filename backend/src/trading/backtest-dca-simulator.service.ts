import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  BacktestSimulationCandle,
  BacktestSimulationResult,
} from './backtest-buy-hold-simulator.service';

export type BacktestDcaSimulationInput = {
  initialCapital: Prisma.Decimal | string | number;
  candles: BacktestSimulationCandle[];
  maxEntries: number;
  priceDeviationPercent: Prisma.Decimal | string | number;
  volumeMultiplier?: Prisma.Decimal | string | number;
  takeProfitPercent?: Prisma.Decimal | string | number;
  independentFromLevel?: number;
};

type IndependentPosition = {
  quantity: Prisma.Decimal;
  costQuote: Prisma.Decimal;
};

@Injectable()
export class BacktestDcaSimulatorService {
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
    const priceDeviationPercent = new Prisma.Decimal(
      input.priceDeviationPercent,
    );
    const volumeMultiplier = new Prisma.Decimal(input.volumeMultiplier ?? 1);
    const takeProfitPercent =
      input.takeProfitPercent === undefined
        ? null
        : new Prisma.Decimal(input.takeProfitPercent);

    if (!initialCapital.isPositive()) {
      throw new BadRequestException('Initial capital must be positive');
    }
    if (!priceDeviationPercent.isPositive()) {
      throw new BadRequestException('Price deviation percent must be positive');
    }
    if (volumeMultiplier.lessThan(1)) {
      throw new BadRequestException('Volume multiplier must be at least 1');
    }
    if (takeProfitPercent !== null && !takeProfitPercent.isPositive()) {
      throw new BadRequestException('Take profit percent must be positive');
    }

    const prices = input.candles.map(
      (candle) => new Prisma.Decimal(candle.close),
    );
    if (prices.some((price) => !price.isPositive())) {
      throw new BadRequestException(
        'Historical candle close prices must be positive',
      );
    }

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
    let entries = 0;
    let exits = 0;
    let peakEquity = initialCapital;
    let maxDrawdownPercent = new Prisma.Decimal(0);
    const entryPrice = prices[0];

    for (const price of prices) {
      while (entries < input.maxEntries) {
        const triggerPrice = entryPrice.mul(
          new Prisma.Decimal(1).sub(
            priceDeviationPercent.mul(entries).div(100),
          ),
        );
        if (price.greaterThan(triggerPrice)) break;

        const allocation = initialCapital.mul(weights[entries]).div(totalWeight);
        const spend = Prisma.Decimal.min(allocation, quoteBalance);
        if (!spend.isPositive()) break;

        quoteBalance = quoteBalance.sub(spend);
        const quantity = spend.div(price);
        const level = entries + 1;

        if (level >= independentFromLevel) {
          independentPositions.push({ quantity, costQuote: spend });
        } else {
          parentQuantity = parentQuantity.add(quantity);
          parentCostQuote = parentCostQuote.add(spend);
        }
        entries += 1;
      }

      if (takeProfitPercent !== null) {
        if (
          parentQuantity.isPositive() &&
          price.greaterThanOrEqualTo(
            parentCostQuote
              .div(parentQuantity)
              .mul(new Prisma.Decimal(1).add(takeProfitPercent.div(100))),
          )
        ) {
          quoteBalance = quoteBalance.add(parentQuantity.mul(price));
          parentQuantity = new Prisma.Decimal(0);
          parentCostQuote = new Prisma.Decimal(0);
          exits += 1;
        }

        for (let index = independentPositions.length - 1; index >= 0; index -= 1) {
          const position = independentPositions[index];
          const takeProfitPrice = position.costQuote
            .div(position.quantity)
            .mul(new Prisma.Decimal(1).add(takeProfitPercent.div(100)));
          if (price.greaterThanOrEqualTo(takeProfitPrice)) {
            quoteBalance = quoteBalance.add(position.quantity.mul(price));
            independentPositions.splice(index, 1);
            exits += 1;
          }
        }
      }

      const independentEquity = independentPositions.reduce(
        (sum, position) => sum.add(position.quantity.mul(price)),
        new Prisma.Decimal(0),
      );
      const equity = quoteBalance
        .add(parentQuantity.mul(price))
        .add(independentEquity);
      if (equity.greaterThan(peakEquity)) peakEquity = equity;

      const drawdownPercent = peakEquity
        .sub(equity)
        .div(peakEquity)
        .mul(100);
      if (drawdownPercent.greaterThan(maxDrawdownPercent)) {
        maxDrawdownPercent = drawdownPercent;
      }
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
      tradeCount: entries + exits,
    };
  }
}
