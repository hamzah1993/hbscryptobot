import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BacktestBuyHoldSimulatorService } from './backtest-buy-hold-simulator.service';

describe('BacktestBuyHoldSimulatorService', () => {
  const service = new BacktestBuyHoldSimulatorService();

  it('calculates ending capital, return, drawdown, and trade count', () => {
    expect(
      service.simulate({
        initialCapital: '1000',
        candles: [{ close: '100' }, { close: '120' }, { close: '90' }, { close: '110' }],
      }),
    ).toEqual({
      endingCapital: '1100.00000000',
      realizedPnlQuote: '100.00000000',
      returnPercent: '10.000000',
      maxDrawdownPercent: '25.000000',
      tradeCount: 1,
    });
  });

  it('accepts Prisma Decimal values', () => {
    expect(
      service.simulate({
        initialCapital: new Prisma.Decimal('500'),
        candles: [
          { close: new Prisma.Decimal('50') },
          { close: new Prisma.Decimal('75') },
        ],
      }),
    ).toEqual({
      endingCapital: '750.00000000',
      realizedPnlQuote: '250.00000000',
      returnPercent: '50.000000',
      maxDrawdownPercent: '0.000000',
      tradeCount: 1,
    });
  });

  it('supports a single candle with zero return and drawdown', () => {
    expect(
      service.simulate({
        initialCapital: 250,
        candles: [{ close: 25 }],
      }),
    ).toEqual({
      endingCapital: '250.00000000',
      realizedPnlQuote: '0.00000000',
      returnPercent: '0.000000',
      maxDrawdownPercent: '0.000000',
      tradeCount: 1,
    });
  });

  it('rejects an empty candle collection', () => {
    expect(() =>
      service.simulate({ initialCapital: 1000, candles: [] }),
    ).toThrow(BadRequestException);
  });

  it.each([0, -1])('rejects non-positive initial capital: %s', (initialCapital) => {
    expect(() =>
      service.simulate({
        initialCapital,
        candles: [{ close: 100 }],
      }),
    ).toThrow('Initial capital must be positive');
  });

  it.each([0, -1])('rejects non-positive candle close prices: %s', (close) => {
    expect(() =>
      service.simulate({
        initialCapital: 1000,
        candles: [{ close: 100 }, { close }],
      }),
    ).toThrow('Historical candle close prices must be positive');
  });
});
