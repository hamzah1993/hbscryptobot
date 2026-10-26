import { TestnetStrategyRunnerService } from './testnet-strategy-runner.service';
import { RecoveryStrategyService } from './recovery-strategy.service';

describe('TestnetStrategyRunnerService', () => {
  const userId = 'user-1';

  const baseStrategy = {
    id: 'strategy-1',
    symbol: 'BTCUSDT',
    baseOrderQuote: 100,
    riskBudgetQuote: 1000,
    maxDcaOrders: 4,
    dcaMultiplier: 2,
    independentFromLevel: 4,
    recoveryEnabled: true,
    recoveryMaxOrders: 5,
    recoveryStepPercents: [5, 8, 12, 18, 25],
    recoveryMultipliers: [1, 1.5, 2, 3, 5],
    recoveryTakeProfitPercent: 1.5,
    positions: [],
  };

  function createService(
    strategies: any[],
    price: number,
    executionResult: any = {},
    lockAcquired = true,
    pendingOrder: any = null,
    pendingAction: any = null,
  ) {
    const prisma = {
      tradingStrategy: {
        findMany: jest.fn().mockResolvedValue(strategies),
      },
      tradingPosition: {
        count: jest.fn().mockResolvedValue(0),
      },
      tradingOrder: {
        findFirst: jest.fn().mockResolvedValue(pendingOrder),
      },
      strategyAction: {
        findFirst: jest.fn().mockResolvedValue(pendingAction),
      },
    } as any;
    const marketData = {
      getQuote: jest.fn().mockResolvedValue({ price }),
    } as any;
    const testnetExecution = {
      executeMarketOrder: jest.fn().mockResolvedValue({
        duplicate: false,
        savedOrder: { positionId: 'position-1' },
        ...executionResult,
      }),
    } as any;
    const redisLock = {
      acquire: jest
        .fn()
        .mockResolvedValue(lockAcquired ? { key: 'strategy-lock', token: 'token' } : null),
      release: jest.fn().mockResolvedValue(true),
    } as any;

    const entrySignal = { check: jest.fn().mockResolvedValue({ ok: true, reason: 'Bounce confirmed' }) } as any;

    return {
      service: new TestnetStrategyRunnerService(
        prisma,
        marketData,
        testnetExecution,
        redisLock,
        new RecoveryStrategyService(),
        entrySignal,
      ),
      prisma,
      marketData,
      testnetExecution,
      redisLock,
      entrySignal,
    };
  }

  it('uses a new initial-entry key for every cycle so the bot can trade again after a take-profit', async () => {
    const { service, prisma, testnetExecution } = createService([baseStrategy], 50);
    prisma.tradingPosition.count.mockResolvedValue(3);
    await service.runUserStrategies(userId);
    expect(testnetExecution.executeMarketOrder.mock.calls[0][1].actionKey).toBe('strategy:strategy-1:initial-entry:4');
  });

  it('waits for the dip and bounce before a new cycle in DIP_CONFIRMATION mode', async () => {
    const dipStrategy = { ...baseStrategy, entryMode: 'DIP_CONFIRMATION' };
    const { service, testnetExecution, entrySignal } = createService([dipStrategy], 50);
    entrySignal.check.mockResolvedValueOnce({ ok: false, reason: 'Waiting for a 3% drop (currently 1.20% below the recent high)' });
    const [held] = await service.runUserStrategies(userId);
    expect(held).toMatchObject({ action: 'HOLD', message: 'Waiting for a 3% drop (currently 1.20% below the recent high)' });
    expect(entrySignal.check).toHaveBeenCalledWith(dipStrategy, 'testnet', true);
    expect(testnetExecution.executeMarketOrder).not.toHaveBeenCalled();

    const [opened] = await service.runUserStrategies(userId);
    expect(opened.action).toBe('OPEN');
  });

  it('never consults the entry rule in IMMEDIATE mode', async () => {
    const { service, entrySignal } = createService([baseStrategy], 50);
    await service.runUserStrategies(userId);
    expect(entrySignal.check).not.toHaveBeenCalled();
  });

  it('sells independent legs and then the parent when the stop-loss is hit', async () => {
    const position = {
      id: 'position-1', status: 'OPEN', totalQuantity: 1, totalCostQuote: 100, averageEntryPrice: 100, dcaCount: 2,
      takeProfitPrice: 101.5, nextDcaPrice: 90,
      subPositions: [{ id: 'sub-4', level: 4, status: 'OPEN', quantity: 1, costQuote: 92, takeProfitPrice: 93.5 }],
    };
    const strategy = { ...baseStrategy, stopLossPercent: 5, positions: [position] };
    // Basket average = (100 + 92) / 2 = 96; stop = 91.2.
    const { service, testnetExecution } = createService([strategy], 91);
    const [first] = await service.runUserStrategies(userId);
    expect(first).toMatchObject({ action: 'STOP_LOSS', subPositionId: 'sub-4' });
    expect(testnetExecution.executeMarketOrder.mock.calls[0][1]).toMatchObject({
      side: 'SELL', actionType: 'INDEPENDENT_EXIT', quantity: 1, actionKey: 'strategy:strategy-1:position:position-1:stop-loss:sub:sub-4',
    });

    const parentOnly = { ...strategy, positions: [{ ...position, subPositions: [] }] };
    const second = createService([parentOnly], 94);
    const [parent] = await second.service.runUserStrategies(userId);
    expect(parent).toMatchObject({ action: 'STOP_LOSS' });
    expect(second.testnetExecution.executeMarketOrder.mock.calls[0][1]).toMatchObject({ side: 'SELL', actionType: 'PARENT_EXIT', actionKey: 'strategy:strategy-1:position:position-1:stop-loss:parent' });

    const safe = createService([strategy], 92);
    const [held] = await safe.service.runUserStrategies(userId);
    expect(held.action).not.toBe('STOP_LOSS');
  });

  it('holds a DCA buy until the bounce is confirmed when DCA confirmation is enabled', async () => {
    const position = { id: 'position-1', status: 'OPEN', totalQuantity: 2, totalCostQuote: 100, averageEntryPrice: 50, dcaCount: 0, takeProfitPrice: 51, nextDcaPrice: 48, subPositions: [] };
    const strategy = { ...baseStrategy, dcaRequiresConfirmation: true, positions: [position] };
    const { service, testnetExecution, entrySignal } = createService([strategy], 47);
    entrySignal.check.mockResolvedValueOnce({ ok: false, reason: 'Waiting for a green candle' });
    const [held] = await service.runUserStrategies(userId);
    expect(held).toMatchObject({ action: 'HOLD', message: 'DCA level reached. Waiting for a green candle' });
    expect(entrySignal.check).toHaveBeenCalledWith(strategy, 'testnet', false);
    expect(testnetExecution.executeMarketOrder).not.toHaveBeenCalled();
    const [bought] = await service.runUserStrategies(userId);
    expect(bought.action).toBe('DCA');
  });

  it('opens an initial Testnet position with a stable action key', async () => {
    const { service, testnetExecution, redisLock } = createService([baseStrategy], 50);

    const result = await service.runUserStrategies(userId);

    expect(result[0]).toMatchObject({ action: 'OPEN', quantity: 2, positionId: 'position-1' });
    expect(testnetExecution.executeMarketOrder).toHaveBeenCalledWith(userId, {
      strategyId: 'strategy-1',
      side: 'BUY',
      quantity: 2,
      actionType: 'INITIAL_ENTRY',
      actionKey: 'strategy:strategy-1:initial-entry:1',
      level: 1,
      triggerPrice: 50,
      plannedQuoteAmount: 100,
      orderType: 'LIMIT',
      limitPrice: 50,
      signalAtMs: expect.any(Number),
      allowRunningStrategy: true,
    });
    expect(redisLock.release).toHaveBeenCalledTimes(1);
  });

  it('submits a parent DCA before the independent level', async () => {
    const strategy = {
      ...baseStrategy,
      positions: [{
        id: 'position-1',
        totalQuantity: 2,
        totalCostQuote: 100,
        dcaCount: 1,
        nextDcaPrice: 45,
        takeProfitPrice: 60,
        subPositions: [],
      }],
    };
    const { service, testnetExecution } = createService([strategy], 40);

    const result = await service.runUserStrategies(userId);

    expect(result[0].action).toBe('DCA');
    expect(testnetExecution.executeMarketOrder).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ actionType: 'DCA_ENTRY', level: 3, quantity: 10 }),
    );
  });

  it.each([3, 5])('switches to an independent entry at configured level #%s', async (independentFromLevel) => {
    const strategy = {
      ...baseStrategy,
      independentFromLevel,
      positions: [{
        id: 'position-1',
        totalQuantity: 4,
        totalCostQuote: 300,
        dcaCount: independentFromLevel - 2,
        nextDcaPrice: 45,
        takeProfitPrice: 80,
        subPositions: [],
      }],
    };
    const { service, testnetExecution } = createService([strategy], 40);

    const result = await service.runUserStrategies(userId);

    expect(result[0].action).toBe('INDEPENDENT_ENTRY');
    expect(testnetExecution.executeMarketOrder).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        actionType: 'INDEPENDENT_ENTRY',
        level: independentFromLevel,
        actionKey: `strategy:strategy-1:position:position-1:independent-entry:${independentFromLevel}`,
      }),
    );
  });

  it('counts open independent exposure against the hard risk budget', async () => {
    const strategy = {
      ...baseStrategy,
      positions: [{
        id: 'position-1',
        totalQuantity: 5,
        totalCostQuote: 500,
        dcaCount: 3,
        nextDcaPrice: 45,
        takeProfitPrice: 80,
        subPositions: [{
          id: 'sub-existing',
          level: 4,
          quantity: 5,
          costQuote: 450,
          takeProfitPrice: 90,
        }],
      }],
    };
    const { service, testnetExecution } = createService([strategy], 40);

    const result = await service.runUserStrategies(userId);

    expect(result[0]).toMatchObject({
      action: 'INDEPENDENT_ENTRY',
      quantity: 1.25,
    });
    expect(testnetExecution.executeMarketOrder).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        actionType: 'INDEPENDENT_ENTRY',
        level: 5,
        quantity: 1.25,
      }),
    );
  });

  it('holds when parent plus open independent exposure exhausts the risk budget', async () => {
    const strategy = {
      ...baseStrategy,
      positions: [{
        id: 'position-1',
        totalQuantity: 5,
        totalCostQuote: 500,
        dcaCount: 3,
        nextDcaPrice: 45,
        takeProfitPrice: 80,
        subPositions: [{
          id: 'sub-existing',
          level: 4,
          quantity: 5,
          costQuote: 500,
          takeProfitPrice: 90,
        }],
      }],
    };
    const { service, testnetExecution } = createService([strategy], 40);

    const result = await service.runUserStrategies(userId);

    expect(result[0]).toMatchObject({
      action: 'HOLD',
      message: 'No remaining risk budget is available for DCA',
    });
    expect(testnetExecution.executeMarketOrder).not.toHaveBeenCalled();
  });

  it('progresses from a filled independent level to the next configured level', async () => {
    const strategy = {
      ...baseStrategy,
      maxDcaOrders: 5,
      positions: [{
        id: 'position-1',
        totalQuantity: 4,
        totalCostQuote: 300,
        dcaCount: 4,
        nextDcaPrice: 35,
        takeProfitPrice: 80,
        subPositions: [{
          id: 'sub-5',
          level: 5,
          quantity: 2,
          costQuote: 80,
          takeProfitPrice: 50,
        }],
      }],
    };
    const { service, testnetExecution } = createService([strategy], 30);

    const result = await service.runUserStrategies(userId);

    expect(result[0].action).toBe('INDEPENDENT_ENTRY');
    expect(testnetExecution.executeMarketOrder).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        actionType: 'INDEPENDENT_ENTRY',
        level: 6,
        actionKey: 'strategy:strategy-1:position:position-1:independent-entry:6',
      }),
    );
  });

  it('prioritizes an independent take-profit exit', async () => {
    const strategy = {
      ...baseStrategy,
      positions: [{
        id: 'position-1',
        totalQuantity: 2,
        totalCostQuote: 100,
        dcaCount: 2,
        nextDcaPrice: 45,
        takeProfitPrice: 60,
        subPositions: [{
          id: 'sub-1',
          level: 4,
          quantity: 3,
          takeProfitPrice: 55,
        }],
      }],
    };
    const { service, testnetExecution } = createService([strategy], 56);

    const result = await service.runUserStrategies(userId);

    expect(result[0]).toMatchObject({
      action: 'INDEPENDENT_TAKE_PROFIT',
      subPositionId: 'sub-1',
      quantity: 3,
    });
    expect(testnetExecution.executeMarketOrder).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        side: 'SELL',
        actionType: 'INDEPENDENT_EXIT',
        level: 4,
      }),
    );
  });

  it('activates recovery DCA when price falls 5% below the first independent entry', async () => {
    const strategy = {
      ...baseStrategy,
      positions: [{
        id: 'position-1',
        totalQuantity: 3,
        totalCostQuote: 300,
        dcaCount: 3,
        recoveryMode: false,
        recoveryDcaCount: 0,
        nextDcaPrice: 78,
        takeProfitPrice: 110,
        subPositions: [{
          id: 'sub-4', level: 4, status: 'OPEN', quantity: 1, costQuote: 80,
          entryPrice: 80, takeProfitPrice: 81.2,
        }],
      }],
    };
    const { service, testnetExecution } = createService([strategy], 75);

    const result = await service.runUserStrategies(userId);

    expect(result[0].action).toBe('RECOVERY_DCA');
    expect(testnetExecution.executeMarketOrder).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        actionType: 'RECOVERY_DCA_ENTRY',
        actionKey: 'strategy:strategy-1:position:position-1:recovery-dca:1',
        triggerPrice: 76,
      }),
    );
  });

  it('uses the global recovery TP and closes independent legs in reverse order first', async () => {
    const strategy = {
      ...baseStrategy,
      positions: [{
        id: 'position-1',
        totalQuantity: 4,
        totalCostQuote: 380,
        dcaCount: 3,
        recoveryMode: true,
        recoveryDcaCount: 1,
        recoveryAnchorPrice: 80,
        recoveryTakeProfitPrice: 90,
        nextDcaPrice: 73.6,
        takeProfitPrice: null,
        subPositions: [
          { id: 'sub-4', level: 4, status: 'OPEN', quantity: 1, costQuote: 80, entryPrice: 80, takeProfitPrice: 81.2 },
          { id: 'sub-5', level: 5, status: 'OPEN', quantity: 0.5, costQuote: 35, entryPrice: 70, takeProfitPrice: 71.05 },
        ],
      }],
    };
    const { service, testnetExecution } = createService([strategy], 91);

    const result = await service.runUserStrategies(userId);

    expect(result[0]).toMatchObject({ action: 'RECOVERY_TAKE_PROFIT', subPositionId: 'sub-5' });
    expect(testnetExecution.executeMarketOrder).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        side: 'SELL',
        actionType: 'INDEPENDENT_EXIT',
        level: 5,
        triggerPrice: 90,
      }),
    );
  });

  it('submits the parent take-profit when no independent exit is triggered', async () => {
    const strategy = {
      ...baseStrategy,
      positions: [{
        id: 'position-1',
        totalQuantity: 2,
        totalCostQuote: 100,
        dcaCount: 1,
        nextDcaPrice: 45,
        takeProfitPrice: 55,
        subPositions: [],
      }],
    };
    const { service, testnetExecution } = createService([strategy], 56);

    const result = await service.runUserStrategies(userId);

    expect(result[0].action).toBe('TAKE_PROFIT');
    expect(testnetExecution.executeMarketOrder).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ side: 'SELL', actionType: 'PARENT_EXIT', quantity: 2 }),
    );
  });

  it('returns SKIP when the idempotent execution already exists', async () => {
    const { service } = createService([baseStrategy], 50, { duplicate: true });

    const result = await service.runUserStrategies(userId);

    expect(result[0]).toMatchObject({
      action: 'SKIP',
      message: 'Initial entry action was already claimed',
    });
  });

  it('holds when no trigger has been reached', async () => {
    const strategy = {
      ...baseStrategy,
      positions: [{
        id: 'position-1',
        totalQuantity: 2,
        totalCostQuote: 100,
        dcaCount: 1,
        nextDcaPrice: 45,
        takeProfitPrice: 60,
        subPositions: [],
      }],
    };
    const { service, testnetExecution } = createService([strategy], 50);

    const result = await service.runUserStrategies(userId);

    expect(result[0].action).toBe('HOLD');
    expect(testnetExecution.executeMarketOrder).not.toHaveBeenCalled();
  });

  it('returns ERROR when the exchange execution fails', async () => {
    const { service, testnetExecution, redisLock } = createService([baseStrategy], 50);
    testnetExecution.executeMarketOrder.mockRejectedValue(new Error('Binance unavailable'));

    const result = await service.runUserStrategies(userId);

    expect(result[0]).toMatchObject({ action: 'ERROR', message: 'Binance unavailable' });
    expect(redisLock.release).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['pending order', { id: 'order-1' }, null],
    ['pending strategy action', null, { id: 'action-1' }],
  ])('skips execution when a %s exists', async (_label, pendingOrder, pendingAction) => {
    const { service, marketData, testnetExecution, redisLock } = createService(
      [baseStrategy],
      50,
      {},
      true,
      pendingOrder,
      pendingAction,
    );

    const result = await service.runUserStrategies(userId);

    expect(result[0]).toMatchObject({
      action: 'SKIP',
      message: 'A Testnet order or strategy action is still pending',
    });
    expect(marketData.getQuote).not.toHaveBeenCalled();
    expect(testnetExecution.executeMarketOrder).not.toHaveBeenCalled();
    expect(redisLock.release).toHaveBeenCalledTimes(1);
  });

  it('skips execution when another instance owns the strategy lock', async () => {
    const { service, marketData, testnetExecution, redisLock } = createService(
      [baseStrategy],
      50,
      {},
      false,
    );

    const result = await service.runUserStrategies(userId);

    expect(result[0]).toMatchObject({
      action: 'SKIP',
      message: 'Strategy tick is already running on another instance',
    });
    expect(marketData.getQuote).not.toHaveBeenCalled();
    expect(testnetExecution.executeMarketOrder).not.toHaveBeenCalled();
    expect(redisLock.release).not.toHaveBeenCalled();
  });
});
