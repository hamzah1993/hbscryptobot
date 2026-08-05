import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type BacktestSimulationCandle = {
  close: Prisma.Decimal | string | number;
};

export type BacktestBuyHoldSimulationInput = {
  initialCapital: Prisma.Decimal | string | number;
  candles: BacktestSimulationCandle[];
};

export type BacktestSimulationResult = {
  endingCapital: string;
  realizedPnlQuote: string;
  returnPercent: string;
  maxDrawdownPercent: string;
  tradeCount: number;
};

@Injectable()
export class BacktestBuyHoldSimulatorService {
  simulate(input: BacktestBuyHoldSimulationInput): BacktestSimulationResult {
    if (input.candles.length === 0) {
      throw new BadRequestException('At least one historical candle is required');
    }

    const initialCapital = new Prisma.Decimal(input.initialCapital);
    if (!initialCapital.isPositive()) {
      throw new BadRequestException('Initial capital must be positive');
    }

    const prices = input.candles.map((candle) => new Prisma.Decimal(candle.close));
    if (prices.some((price) => !price.isPositive())) {
      throw new BadRequestException('Historical candle close prices must be positive');
    }

    const entryPrice = prices[0];
    const quantity = initialCapital.div(entryPrice);
    let peakEquity = initialCapital;
    let maxDrawdownPercent = new Prisma.Decimal(0);

    for (const price of prices) {
      const equity = quantity.mul(price);
      if (equity.greaterThan(peakEquity)) peakEquity = equity;

      const drawdownPercent = peakEquity
        .sub(equity)
        .div(peakEquity)
        .mul(100);
      if (drawdownPercent.greaterThan(maxDrawdownPercent)) {
        maxDrawdownPercent = drawdownPercent;
      }
    }

    const endingCapital = quantity.mul(prices[prices.length - 1]);
    const realizedPnlQuote = endingCapital.sub(initialCapital);
    const returnPercent = realizedPnlQuote.div(initialCapital).mul(100);

    return {
      endingCapital: endingCapital.toFixed(8),
      realizedPnlQuote: realizedPnlQuote.toFixed(8),
      returnPercent: returnPercent.toFixed(6),
      maxDrawdownPercent: maxDrawdownPercent.toFixed(6),
      tradeCount: 1,
    };
  }
}
