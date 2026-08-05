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

    const initialCapital = new Prisma.Decimal(input.initialCapital);
    const priceDeviationPercent = new Prisma.Decimal(
      input.priceDeviationPercent,
    );
    const volumeMultiplier = new Prisma.Decimal(input.volumeMultiplier ?? 1);

    if (!initialCapital.isPositive()) {
      throw new BadRequestException('Initial capital must be positive');
    }
    if (!priceDeviationPercent.isPositive()) {
      throw new BadRequestException('Price deviation percent must be positive');
    }
    if (volumeMultiplier.lessThan(1)) {
      throw new BadRequestException('Volume multiplier must be at least 1');
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
    let baseQuantity = new Prisma.Decimal(0);
    let entries = 0;
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
        baseQuantity = baseQuantity.add(spend.div(price));
        entries += 1;
      }

      const equity = quoteBalance.add(baseQuantity.mul(price));
      if (equity.greaterThan(peakEquity)) peakEquity = equity;

      const drawdownPercent = peakEquity
        .sub(equity)
        .div(peakEquity)
        .mul(100);
      if (drawdownPercent.greaterThan(maxDrawdownPercent)) {
        maxDrawdownPercent = drawdownPercent;
      }
    }

    const endingCapital = quoteBalance.add(
      baseQuantity.mul(prices[prices.length - 1]),
    );
    const realizedPnlQuote = endingCapital.sub(initialCapital);
    const returnPercent = realizedPnlQuote.div(initialCapital).mul(100);

    return {
      endingCapital: endingCapital.toFixed(8),
      realizedPnlQuote: realizedPnlQuote.toFixed(8),
      returnPercent: returnPercent.toFixed(6),
      maxDrawdownPercent: maxDrawdownPercent.toFixed(6),
      tradeCount: entries,
    };
  }
}
