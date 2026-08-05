import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BacktestDcaSimulatorService } from './backtest-dca-simulator.service';

describe('BacktestDcaSimulatorService', () => {
  const service = new BacktestDcaSimulatorService();

  it('allocates capital across triggered DCA entries', () => {
    expect(
      service.simulate({
        initialCapital: '1000',
        candles: [
          { close: '100' },
          { close: '95' },
          { close: '90' },
          { close: '105' },
        ],
        maxEntries: 3,
        priceDeviationPercent: '5',
        volumeMultiplier: '1',
      }),
    ).toEqual({
      endingCapital: '1131.28654971',
      realizedPnlQuote: '131.28654971',
      returnPercent: '13.128655',
      maxDrawdownPercent: '5.555556',
      tradeCount: 3,
    });
  });

  it('uses a volume multiplier to increase later allocations', () => {
    const result = service.simulate({
      initialCapital: new Prisma.Decimal('700'),
      candles: [{ close: '100' }, { close: '90' }, { close: '100' }],
      maxEntries: 3,
      priceDeviationPercent: '5',
      volumeMultiplier: '2',
    });

    expect(result.tradeCount).toBe(3);
    expect(result.endingCapital).toBe('757.14285714');
    expect(result.realizedPnlQuote).toBe('57.14285714');
    expect(result.returnPercent).toBe('8.163265');
  });

  it('executes only the initial entry when later triggers are not reached', () => {
    expect(
      service.simulate({
        initialCapital: 1000,
        candles: [{ close: 100 }, { close: 102 }, { close: 110 }],
        maxEntries: 4,
        priceDeviationPercent: 5,
      }),
    ).toEqual({
      endingCapital: '1025.00000000',
      realizedPnlQuote: '25.00000000',
      returnPercent: '2.500000',
      maxDrawdownPercent: '0.000000',
      tradeCount: 1,
    });
  });

  it('separates configured higher DCA levels and exits them independently', () => {
    expect(
      service.simulate({
        initialCapital: 1000,
        candles: [
          { close: 100 },
          { close: 95 },
          { close: 90 },
          { close: 95 },
        ],
        maxEntries: 3,
        priceDeviationPercent: 5,
        volumeMultiplier: 1,
        takeProfitPercent: 5,
        independentFromLevel: 3,
      }),
    ).toEqual({
      endingCapital: '1020.76023392',
      realizedPnlQuote: '20.76023392',
      returnPercent: '2.076023',
      maxDrawdownPercent: '5.555556',
      tradeCount: 4,
    });
  });

  it('keeps parent and independent positions open when their take-profit levels are not reached', () => {
    const result = service.simulate({
      initialCapital: 1000,
      candles: [{ close: 100 }, { close: 95 }, { close: 90 }, { close: 92 }],
      maxEntries: 3,
      priceDeviationPercent: 5,
      takeProfitPercent: 5,
      independentFromLevel: 3,
    });

    expect(result.tradeCount).toBe(3);
    expect(result.endingCapital).toBe('975.28265107');
    expect(result.realizedPnlQuote).toBe('-24.71734893');
  });

  it('rejects an empty candle collection', () => {
    expect(() =>
      service.simulate({
        initialCapital: 1000,
        candles: [],
        maxEntries: 3,
        priceDeviationPercent: 5,
      }),
    ).toThrow(BadRequestException);
  });

  it.each([0, -1, 1.5])('rejects invalid maxEntries: %s', (maxEntries) => {
    expect(() =>
      service.simulate({
        initialCapital: 1000,
        candles: [{ close: 100 }],
        maxEntries,
        priceDeviationPercent: 5,
      }),
    ).toThrow('maxEntries must be a positive integer');
  });

  it.each([1, 1.5, 5])(
    'rejects invalid independentFromLevel: %s',
    (independentFromLevel) => {
      expect(() =>
        service.simulate({
          initialCapital: 1000,
          candles: [{ close: 100 }],
          maxEntries: 3,
          priceDeviationPercent: 5,
          independentFromLevel,
        }),
      ).toThrow(
        'independentFromLevel must be an integer between 2 and maxEntries + 1',
      );
    },
  );

  it.each([0, -1])('rejects non-positive initial capital: %s', (initialCapital) => {
    expect(() =>
      service.simulate({
        initialCapital,
        candles: [{ close: 100 }],
        maxEntries: 3,
        priceDeviationPercent: 5,
      }),
    ).toThrow('Initial capital must be positive');
  });

  it.each([0, -1])(
    'rejects non-positive price deviation percent: %s',
    (priceDeviationPercent) => {
      expect(() =>
        service.simulate({
          initialCapital: 1000,
          candles: [{ close: 100 }],
          maxEntries: 3,
          priceDeviationPercent,
        }),
      ).toThrow('Price deviation percent must be positive');
    },
  );

  it.each([0, 0.5, -1])(
    'rejects a volume multiplier below one: %s',
    (volumeMultiplier) => {
      expect(() =>
        service.simulate({
          initialCapital: 1000,
          candles: [{ close: 100 }],
          maxEntries: 3,
          priceDeviationPercent: 5,
          volumeMultiplier,
        }),
      ).toThrow('Volume multiplier must be at least 1');
    },
  );

  it.each([0, -1])('rejects non-positive take profit: %s', (takeProfitPercent) => {
    expect(() =>
      service.simulate({
        initialCapital: 1000,
        candles: [{ close: 100 }],
        maxEntries: 3,
        priceDeviationPercent: 5,
        takeProfitPercent,
      }),
    ).toThrow('Take profit percent must be positive');
  });

  it.each([0, -1])('rejects non-positive candle prices: %s', (close) => {
    expect(() =>
      service.simulate({
        initialCapital: 1000,
        candles: [{ close: 100 }, { close }],
        maxEntries: 3,
        priceDeviationPercent: 5,
      }),
    ).toThrow('Historical candle close prices must be positive');
  });
});
