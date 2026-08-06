import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BacktestDcaSimulatorService } from './backtest-dca-simulator.service';
import { RecoveryStrategyService } from './recovery-strategy.service';

describe('BacktestDcaSimulatorService', () => {
  const service = new BacktestDcaSimulatorService(new RecoveryStrategyService());

  it('allocates capital across triggered DCA entries', () => {
    const result = service.simulate({
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
    });

    expect(result).toMatchObject({
      endingCapital: '1107.30994152',
      realizedPnlQuote: '107.30994152',
      returnPercent: '10.730994',
      maxDrawdownPercent: '5.087719',
      tradeCount: 3,
    });
    expect(result.trades).toHaveLength(3);
    expect(result.equityPoints).toHaveLength(4);
  });

  it('uses a volume multiplier to increase later allocations', () => {
    const result = service.simulate({
      initialCapital: new Prisma.Decimal('700'),
      candles: [{ close: '100' }, { close: '95' }, { close: '90.25' }],
      maxEntries: 3,
      priceDeviationPercent: '5',
      volumeMultiplier: '2',
    });

    expect(result.tradeCount).toBe(3);
    expect(result.trades?.map((trade) => trade.quoteAmount)).toEqual([
      '100.00000000', '200.00000000', '400.00000000',
    ]);
  });

  it('applies entry and exit fees plus adverse slippage', () => {
    const result = service.simulate({
      initialCapital: 1000,
      candles: [{ close: 100 }, { close: 110 }],
      maxEntries: 1,
      priceDeviationPercent: 5,
      takeProfitPercent: 5,
      feePercent: 1,
      slippagePercent: 1,
    });

    expect(result).toMatchObject({
      endingCapital: '1056.76128713',
      realizedPnlQuote: '56.76128713',
      returnPercent: '5.676129',
      maxDrawdownPercent: '1.980198',
      tradeCount: 2,
    });
    expect(result.trades).toHaveLength(2);
    expect(result.equityPoints).toHaveLength(2);
  });

  it('executes only the initial entry when later triggers are not reached', () => {
    const result = service.simulate({
      initialCapital: 1000,
      candles: [{ close: 100 }, { close: 102 }, { close: 110 }],
      maxEntries: 4,
      priceDeviationPercent: 5,
    });

    expect(result).toMatchObject({
      endingCapital: '1025.00000000',
      realizedPnlQuote: '25.00000000',
      returnPercent: '2.500000',
      maxDrawdownPercent: '0.000000',
      tradeCount: 1,
    });
    expect(result.trades).toHaveLength(1);
    expect(result.equityPoints).toHaveLength(3);
  });

  it('separates configured higher DCA levels and exits them independently', () => {
    const result = service.simulate({
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
    });

    expect(result).toMatchObject({
      endingCapital: '1001.85185185',
      realizedPnlQuote: '1.85185185',
      returnPercent: '0.185185',
      maxDrawdownPercent: '5.087719',
      tradeCount: 4,
    });
    expect(result.trades).toHaveLength(4);
    expect(result.equityPoints).toHaveLength(4);
  });

  it.each([3, 5])(
    'switches backtest entries to independent exactly at configured level #%s',
    (independentFromLevel) => {
      const result = service.simulate({
        initialCapital: 5000,
        riskBudgetQuote: 5000,
        baseOrderQuote: 100,
        candles: [{ close: 100 }, { close: 98 }, { close: 96 }, { close: 94 }, { close: 92 }],
        maxEntries: 5,
        priceDeviationPercent: 2,
        volumeMultiplier: 1,
        takeProfitPercent: 50,
        independentFromLevel,
        recoveryEnabled: false,
      });

      expect(result.trades!.map((trade) => [trade.level, trade.type])).toEqual(
        [1, 2, 3, 4, 5].map((level) => [
          level,
          level >= independentFromLevel ? 'INDEPENDENT_ENTRY' : 'PARENT_ENTRY',
        ]),
      );
    },
  );

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
    expect(result.endingCapital).toBe('970.21442495');
    expect(result.realizedPnlQuote).toBe('-29.78557505');
  });

  it('simulates recovery DCA and exits the weighted basket at the global TP', () => {
    const result = service.simulate({
      initialCapital: 1000,
      riskBudgetQuote: 500,
      baseOrderQuote: 100,
      candles: [{ close: 100 }, { close: 95 }, { close: 90 }, { close: 85 }, { close: 94 }],
      maxEntries: 3,
      priceDeviationPercent: 5,
      volumeMultiplier: 1,
      takeProfitPercent: 1.5,
      independentFromLevel: 3,
      recoveryEnabled: true,
      recoveryMaxOrders: 5,
      recoveryStepPercents: [5, 8, 12, 18, 25],
      recoveryMultipliers: [1, 1.5, 2, 3, 5],
      recoveryTakeProfitPercent: 1.5,
    });

    expect(result.tradeCount).toBe(6);
    expect(result.trades!.map((trade) => trade.type)).toEqual([
      'PARENT_ENTRY',
      'PARENT_ENTRY',
      'INDEPENDENT_ENTRY',
      'RECOVERY_ENTRY',
      'INDEPENDENT_EXIT',
      'PARENT_EXIT',
    ]);
    expect(Number(result.endingCapital)).toBeGreaterThan(1000);
  });

  it('can restart completed campaigns for continuous 24/7 backtests', () => {
    const result = service.simulate({
      initialCapital: 1000,
      riskBudgetQuote: 100,
      baseOrderQuote: 100,
      candles: [{ close: 100 }, { close: 110 }, { close: 100 }],
      maxEntries: 1,
      priceDeviationPercent: 5,
      takeProfitPercent: 5,
      continuousCycles: true,
    });

    expect(result.trades!.map((trade) => trade.type)).toEqual([
      'PARENT_ENTRY',
      'PARENT_EXIT',
      'PARENT_ENTRY',
    ]);
    expect(result.tradeCount).toBe(3);
  });

  it('runs a full main-to-independent-to-recovery lifecycle, closes the basket, and resets', () => {
    const riskBudgetQuote = 5000;
    const result = service.simulate({
      initialCapital: 5000,
      riskBudgetQuote,
      baseOrderQuote: 100,
      candles: [
        { close: 100 }, // #1 main
        { close: 98 },  // #2 main
        { close: 96 },  // #3 main
        { close: 94 },  // #4 main
        { close: 92 },  // #5 independent
        { close: 90 },  // #6 independent
        { close: 87 },  // Recovery R1
        { close: 84 },  // Recovery R2
        { close: 100 }, // Global TP: independent legs (reverse order), then parent
        { close: 101 }, // Completed campaign resets and opens the next #1
      ],
      maxEntries: 6,
      priceDeviationPercent: 2,
      volumeMultiplier: 1.5,
      takeProfitPercent: 1.5,
      independentFromLevel: 5,
      recoveryEnabled: true,
      recoveryMaxOrders: 5,
      recoveryStepPercents: [5, 8, 12, 18, 25],
      recoveryMultipliers: [1, 1.5, 2, 3, 5],
      recoveryTakeProfitPercent: 1.5,
      continuousCycles: true,
    });

    const trades = result.trades!;
    const firstExitIndex = trades.findIndex((trade) =>
      trade.type === 'INDEPENDENT_EXIT' || trade.type === 'PARENT_EXIT',
    );
    const firstCampaign = trades.slice(0, firstExitIndex);
    const firstCampaignEntryExposure = firstCampaign.reduce(
      (sum, trade) => sum + Number(trade.quoteAmount),
      0,
    );

    expect(firstCampaign.map((trade) => [trade.type, trade.level])).toEqual([
      ['PARENT_ENTRY', 1],
      ['PARENT_ENTRY', 2],
      ['PARENT_ENTRY', 3],
      ['PARENT_ENTRY', 4],
      ['INDEPENDENT_ENTRY', 5],
      ['INDEPENDENT_ENTRY', 6],
      ['RECOVERY_ENTRY', 7],
      ['RECOVERY_ENTRY', 8],
    ]);
    expect(firstCampaignEntryExposure).toBeLessThanOrEqual(riskBudgetQuote);

    expect(trades.slice(firstExitIndex, firstExitIndex + 3).map((trade) => [
      trade.type,
      trade.level,
    ])).toEqual([
      ['INDEPENDENT_EXIT', 6],
      ['INDEPENDENT_EXIT', 5],
      ['PARENT_EXIT', 8],
    ]);

    expect(trades[firstExitIndex + 3]).toMatchObject({
      type: 'PARENT_ENTRY',
      level: 1,
    });
    expect(Number(result.endingCapital)).toBeGreaterThan(5000);
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

  it.each(['0', '-1'])('rejects non-positive initial capital: %s', (initialCapital) => {
    expect(() =>
      service.simulate({
        initialCapital,
        candles: [{ close: 100 }],
        maxEntries: 3,
        priceDeviationPercent: 5,
      }),
    ).toThrow('Initial capital must be positive');
  });

  it.each(['0', '-1'])(
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

  it.each(['0', '-1'])('rejects non-positive take profit: %s', (takeProfitPercent) => {
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

  it.each([-1, 100])('rejects invalid fee percent: %s', (feePercent) => {
    expect(() =>
      service.simulate({
        initialCapital: 1000,
        candles: [{ close: 100 }],
        maxEntries: 1,
        priceDeviationPercent: 5,
        feePercent,
      }),
    ).toThrow('Fee percent must be between 0 and 100');
  });

  it.each([-1, 100])('rejects invalid slippage percent: %s', (slippagePercent) => {
    expect(() =>
      service.simulate({
        initialCapital: 1000,
        candles: [{ close: 100 }],
        maxEntries: 1,
        priceDeviationPercent: 5,
        slippagePercent,
      }),
    ).toThrow('Slippage percent must be between 0 and 100');
  });

  it.each(['0', '-1'])('rejects non-positive candle prices: %s', (close) => {
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
