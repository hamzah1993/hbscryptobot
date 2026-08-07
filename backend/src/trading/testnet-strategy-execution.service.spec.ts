import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TestnetStrategyExecutionService } from './testnet-strategy-execution.service';
import { RecoveryStrategyService } from './recovery-strategy.service';

describe('TestnetStrategyExecutionService incremental fill accounting', () => {
  const userId = 'user-1';
  const strategy = {
    id: 'strategy-1',
    userId,
    symbol: 'BTCUSDT',
    exchange: 'BINANCE',
    paperTrading: false,
    environment: 'TESTNET',
    status: 'PAUSED',
    dcaStepPercent: 5,
    dcaMultiplier: 1,
    takeProfitPercent: 10,
    riskBudgetQuote: 1000,
    baseOrderQuote: 100,
    independentFromLevel: 5,
    recoveryEnabled: true,
    recoveryMaxOrders: 5,
    recoveryStepPercents: [5, 8, 12, 18, 25],
    recoveryMultipliers: [1, 1.5, 2, 3, 5],
    recoveryTakeProfitPercent: 1.5,
  };

  function createService(
    orderOverrides: Record<string, unknown> = {},
    exchangeOrder: Record<string, unknown> = {},
    positionOverrides: Record<string, unknown> = {},
  ) {
    const position = {
      id: 'position-1',
      strategyId: strategy.id,
      symbol: strategy.symbol,
      status: 'OPEN',
      totalQuantity: 2,
      totalCostQuote: 200,
      averageEntryPrice: 100,
      realizedPnlQuote: 0,
      dcaCount: 0,
      recoveryMode: false,
      recoveryDcaCount: 0,
      recoveryAnchorPrice: 80,
      recoveryTakeProfitManual: false,
      nextDcaPrice: 95,
      takeProfitPrice: 110,
      takeProfitManual: false,
      strategy,
      ...positionOverrides,
    };
    const order = {
      id: 'order-1',
      userId,
      positionId: position.id,
      subPositionId: null,
      exchangeOrderId: '123',
      clientOrderId: 'client-1',
      side: 'BUY',
      status: 'PARTIALLY_FILLED',
      level: 2,
      independent: false,
      quantity: 2,
      price: 100,
      filledQuantity: 1,
      quoteAmount: 100,
      averageFillPrice: 100,
      accountedFilledQuantity: 1,
      accountedQuoteAmount: 100,
      position,
      strategyAction: {
        id: 'action-1',
        subPositionId: null,
      },
      subPosition: null,
      ...orderOverrides,
    };

    const tradingPosition = {
      findFirst: jest.fn().mockResolvedValue({ ...position, subPositions: [], orders: [] }),
      findUnique: jest.fn().mockResolvedValue({ ...position, subPositions: [], orders: [] }),
      update: jest.fn(async ({ data }) => ({ ...position, ...data })),
    };
    const tradingSubPosition = {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }) => ({ id: 'sub-1', realizedPnlQuote: 0, ...data })),
      update: jest.fn(async ({ data }) => ({ id: 'sub-1', ...data })),
    };
    const tradingOrder = {
      findFirst: jest.fn().mockResolvedValue(order),
      create: jest.fn(async ({ data }) => ({ id: 'order-new', ...data })),
      update: jest.fn(async ({ data }) => ({ ...order, ...data })),
    };
    const strategyAction = {
      update: jest.fn().mockResolvedValue({}),
    };
    const tx = { tradingPosition, tradingSubPosition, tradingOrder, strategyAction };
    const prisma = {
      tradingStrategy: { findFirst: jest.fn().mockResolvedValue(strategy) },
      tradingPosition,
      tradingSubPosition,
      tradingOrder,
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    } as any;
    const resolvedExchangeOrder = {
      orderId: '123',
      status: 'FILLED',
      executedQty: '2',
      cummulativeQuoteQty: '210',
      ...exchangeOrder,
    };
    const testnetOrders = {
      getOrder: jest.fn().mockResolvedValue(resolvedExchangeOrder),
      findOrderByClientOrderId: jest.fn().mockResolvedValue(null),
      placeMarketOrder: jest.fn().mockResolvedValue(resolvedExchangeOrder),
    } as any;
    const actions = {
      claim: jest.fn().mockResolvedValue({ claimed: true, action: { id: 'action-new' } }),
      getClaimedRetry: jest.fn().mockResolvedValue({ id: 'action-1' }),
      markFailed: jest.fn(),
    } as any;
    const notifications = { publish: jest.fn() } as any;

    return {
      service: new TestnetStrategyExecutionService(prisma, testnetOrders, actions, notifications, new RecoveryStrategyService()),
      order,
      tradingOrder,
      tradingPosition,
      tradingSubPosition,
      strategyAction,
      testnetOrders,
      actions,
      notifications,
    };
  }

  it('recovers an exchange-accepted retry by stable client id without submitting a second order', async () => {
    const { service, testnetOrders, actions } = createService(
      {},
      { status: 'FILLED', executedQty: '1', cummulativeQuoteQty: '100' },
    );
    testnetOrders.findOrderByClientOrderId.mockResolvedValue({
      orderId: 'accepted-order',
      clientOrderId: 'accepted-client-id',
      status: 'FILLED',
      executedQty: '1',
      cummulativeQuoteQty: '100',
    });

    await service.executeMarketOrder(userId, {
      strategyId: strategy.id,
      side: 'BUY',
      quantity: 1,
      actionType: 'DCA_ENTRY',
      actionKey: 'strategy:strategy-1:position:position-1:dca:2',
      level: 2,
      allowRunningStrategy: true,
      retryActionId: 'action-1',
    });

    expect(actions.claim).not.toHaveBeenCalled();
    expect(actions.getClaimedRetry).toHaveBeenCalledWith(
      userId,
      'action-1',
      strategy.id,
      'strategy:strategy-1:position:position-1:dca:2',
    );
    expect(testnetOrders.findOrderByClientOrderId).toHaveBeenCalledWith(
      userId,
      strategy.symbol,
      expect.stringMatching(/^hbs-[a-f0-9]{32}$/),
    );
    expect(testnetOrders.placeMarketOrder).not.toHaveBeenCalled();
  });

  it('advances the campaign once when an independent entry fills immediately', async () => {
    const { service, tradingPosition, tradingOrder, notifications } = createService(
      {},
      { status: 'FILLED', executedQty: '1', cummulativeQuoteQty: '90', fills: [{ price: '90', qty: '1', commission: '0.001', commissionAsset: 'BTC' }] },
      { dcaCount: 3 },
    );

    await service.executeMarketOrder(userId, {
      strategyId: strategy.id,
      side: 'BUY',
      quantity: 1,
      actionType: 'INDEPENDENT_ENTRY',
      actionKey: 'strategy:strategy-1:position:position-1:independent-entry:5',
      level: 5,
    });

    expect(tradingPosition.update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: expect.objectContaining({
        dcaCount: 4,
      }),
    });
    expect(tradingOrder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ feeQuote: 0.09 }),
    }));
    expect(notifications.publish).toHaveBeenCalledWith(expect.objectContaining({
      event: 'INDEPENDENT_OPENED',
      userId,
      metadata: expect.objectContaining({ level: 5, feeQuote: 0.09 }),
    }));
  });

  it('advances the campaign on the first reconciled independent fill only', async () => {
    const { service, tradingPosition } = createService(
      {
        independent: true,
        level: 5,
        filledQuantity: 0,
        quoteAmount: 0,
        accountedFilledQuantity: 0,
        accountedQuoteAmount: 0,
      },
      {
        status: 'PARTIALLY_FILLED',
        executedQty: '0.5',
        cummulativeQuoteQty: '50',
      },
      { dcaCount: 3 },
    );

    await service.syncOrder(userId, 'order-1');

    expect(tradingPosition.update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: expect.objectContaining({
        dcaCount: 4,
      }),
    });
  });

  it('does not advance an independent level twice on a later partial-fill sync', async () => {
    const existingSubPosition = {
      id: 'sub-1',
      positionId: 'position-1',
      level: 5,
      status: 'OPEN',
      quantity: 0.5,
      costQuote: 50,
      entryPrice: 100,
      takeProfitPrice: 110,
      realizedPnlQuote: 0,
    };
    const { service, tradingPosition } = createService(
      {
        independent: true,
        level: 5,
        subPositionId: 'sub-1',
        subPosition: existingSubPosition,
        filledQuantity: 0.5,
        quoteAmount: 50,
        accountedFilledQuantity: 0.5,
        accountedQuoteAmount: 50,
      },
      {
        status: 'FILLED',
        executedQty: '1',
        cummulativeQuoteQty: '100',
      },
      { dcaCount: 4 },
    );

    await service.syncOrder(userId, 'order-1');

    expect(tradingPosition.update).not.toHaveBeenCalled();
  });

  it('accounts only newly confirmed parent BUY fill deltas', async () => {
    const { service, tradingPosition, tradingOrder, strategyAction } = createService();

    await service.syncOrder(userId, 'order-1');

    expect(tradingPosition.update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: expect.objectContaining({
        totalQuantity: 3,
        totalCostQuote: 310,
        averageEntryPrice: 310 / 3,
        dcaCount: 0,
      }),
    });
    expect(tradingOrder.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({
        status: 'FILLED',
        filledQuantity: 2,
        quoteAmount: 210,
        accountedFilledQuantity: 2,
        accountedQuoteAmount: 210,
      }),
    });
    expect(strategyAction.update).toHaveBeenCalledWith({
      where: { id: 'action-1' },
      data: expect.objectContaining({ status: 'COMPLETED' }),
    });
  });

  it('keeps DCA count at zero when a pending manual initial limit entry fills on sync', async () => {
    const { service, tradingPosition } = createService({
      strategyAction: null,
      level: 1,
      filledQuantity: 0,
      quoteAmount: 0,
      accountedFilledQuantity: 0,
      accountedQuoteAmount: 0,
    }, {
      status: 'FILLED',
      executedQty: '1',
      cummulativeQuoteQty: '100',
    }, {
      totalQuantity: 0,
      totalCostQuote: 0,
      averageEntryPrice: 0,
      dcaCount: 0,
    });

    await service.syncOrder(userId, 'order-1');
    expect(tradingPosition.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ dcaCount: 0, totalQuantity: 1, totalCostQuote: 100 }),
    }));
  });

  it('does not double-account a fill already fully accounted', async () => {
    const { service, tradingPosition, tradingSubPosition, tradingOrder } = createService({
      status: 'FILLED',
      filledQuantity: 2,
      quoteAmount: 210,
      accountedFilledQuantity: 2,
      accountedQuoteAmount: 210,
    });

    await service.syncOrder(userId, 'order-1');

    expect(tradingPosition.update).not.toHaveBeenCalled();
    expect(tradingSubPosition.create).not.toHaveBeenCalled();
    expect(tradingSubPosition.update).not.toHaveBeenCalled();
    expect(tradingOrder.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({
        accountedFilledQuantity: 2,
        accountedQuoteAmount: 210,
      }),
    });
  });

  it('creates an independent sub-position from a newly reconciled BUY fill', async () => {
    const { service, tradingSubPosition, tradingPosition, tradingOrder } = createService({
      independent: true,
      level: 5,
      filledQuantity: 0,
      quoteAmount: 0,
      accountedFilledQuantity: 0,
      accountedQuoteAmount: 0,
    }, {
      status: 'PARTIALLY_FILLED',
      executedQty: '0.5',
      cummulativeQuoteQty: '50',
    }, {
      dcaCount: 3,
    });

    await service.syncOrder(userId, 'order-1');

    expect(tradingPosition.update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: { dcaCount: 4, nextDcaPrice: 95 },
    });
    expect(tradingSubPosition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        positionId: 'position-1',
        level: 5,
        status: 'OPEN',
        quantity: 0.5,
        costQuote: 50,
        entryPrice: 100,
        takeProfitPrice: 110.00000000000001,
      }),
    });
    expect(tradingOrder.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({
        status: 'PARTIALLY_FILLED',
        subPositionId: 'sub-1',
        accountedFilledQuantity: 0.5,
        accountedQuoteAmount: 50,
      }),
    });
  });

  it('recalculates independent average and take-profit from cumulative fills', async () => {
    const existingSubPosition = {
      id: 'sub-1',
      positionId: 'position-1',
      level: 5,
      status: 'OPEN',
      quantity: 1,
      costQuote: 100,
      entryPrice: 100,
      takeProfitPrice: 110,
      realizedPnlQuote: 0,
    };
    const { service, tradingSubPosition, tradingPosition } = createService({
      independent: true,
      level: 5,
      subPositionId: 'sub-1',
      subPosition: existingSubPosition,
      filledQuantity: 1,
      quoteAmount: 100,
      accountedFilledQuantity: 1,
      accountedQuoteAmount: 100,
    }, {
      status: 'FILLED',
      executedQty: '2',
      cummulativeQuoteQty: '180',
    });

    await service.syncOrder(userId, 'order-1');

    expect(tradingPosition.update).not.toHaveBeenCalled();
    expect(tradingSubPosition.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: expect.objectContaining({
        quantity: 2,
        costQuote: 180,
        entryPrice: 90,
        takeProfitPrice: 99.00000000000001,
      }),
    });
  });

  it('preserves a manually overridden independent TP across later partial fills', async () => {
    const existingSubPosition = {
      id: 'sub-1',
      positionId: 'position-1',
      level: 5,
      status: 'OPEN',
      quantity: 1,
      costQuote: 100,
      entryPrice: 100,
      takeProfitPrice: 115,
      takeProfitManual: true,
      realizedPnlQuote: 0,
    };
    const { service, tradingSubPosition } = createService({
      independent: true,
      level: 5,
      subPositionId: 'sub-1',
      subPosition: existingSubPosition,
      filledQuantity: 1,
      quoteAmount: 100,
      accountedFilledQuantity: 1,
      accountedQuoteAmount: 100,
    }, {
      status: 'FILLED',
      executedQty: '2',
      cummulativeQuoteQty: '180',
    });

    await service.syncOrder(userId, 'order-1');

    expect(tradingSubPosition.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: expect.objectContaining({ takeProfitPrice: 115 }),
    });
  });

  it('updates Testnet TP only while the strategy is paused and has no pending order', async () => {
    const { service, tradingPosition } = createService();

    await service.updateTakeProfit(userId, 'position-1', {
      target: 'PARENT',
      takeProfitPrice: 120,
    });

    expect(tradingPosition.update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: { takeProfitPrice: 120, takeProfitManual: true },
    });
  });

  it('reconciles recovery BUY fills without advancing the normal campaign level', async () => {
    const { service, tradingPosition } = createService({
      level: 7,
      filledQuantity: 0,
      quoteAmount: 0,
      accountedFilledQuantity: 0,
      accountedQuoteAmount: 0,
      strategyAction: { id: 'action-1', subPositionId: null, type: 'RECOVERY_DCA_ENTRY' },
    }, {
      status: 'FILLED',
      executedQty: '1',
      cummulativeQuoteQty: '70',
    });

    await service.syncOrder(userId, 'order-1');

    expect(tradingPosition.update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: expect.objectContaining({
        totalQuantity: 3,
        totalCostQuote: 270,
        dcaCount: 0,
        recoveryMode: true,
        recoveryDcaCount: 1,
        recoveryAnchorPrice: 80,
        recoveryTakeProfitPrice: 91.35,
        nextDcaPrice: 73.60000000000001,
        takeProfitPrice: null,
      }),
    });
  });

  it('accounts an independent partial SELL only against its sub-position', async () => {
    const subPosition = {
      id: 'sub-1',
      positionId: 'position-1',
      level: 5,
      status: 'OPEN',
      quantity: 2,
      costQuote: 200,
      entryPrice: 100,
      takeProfitPrice: 110,
      realizedPnlQuote: 0,
    };
    const { service, tradingSubPosition, tradingPosition } = createService({
      side: 'SELL',
      independent: true,
      subPositionId: 'sub-1',
      subPosition,
      filledQuantity: 0,
      quoteAmount: 0,
      accountedFilledQuantity: 0,
      accountedQuoteAmount: 0,
    }, {
      status: 'PARTIALLY_FILLED',
      executedQty: '0.5',
      cummulativeQuoteQty: '60',
    });

    await service.syncOrder(userId, 'order-1');

    expect(tradingPosition.update).not.toHaveBeenCalled();
    expect(tradingSubPosition.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: expect.objectContaining({
        status: 'OPEN',
        quantity: 1.5,
        costQuote: 150,
        entryPrice: 100,
        realizedPnlQuote: 10,
      }),
    });
  });

  it('closes only the selected independent sub-position and accumulates realized P&L', async () => {
    const subPosition = {
      id: 'sub-1',
      positionId: 'position-1',
      level: 5,
      status: 'OPEN',
      quantity: 1.5,
      costQuote: 150,
      entryPrice: 100,
      takeProfitPrice: 110,
      realizedPnlQuote: 10,
    };
    const { service, tradingSubPosition, tradingPosition } = createService({
      side: 'SELL',
      independent: true,
      subPositionId: 'sub-1',
      subPosition,
      filledQuantity: 0,
      quoteAmount: 0,
      accountedFilledQuantity: 0,
      accountedQuoteAmount: 0,
    }, {
      status: 'FILLED',
      executedQty: '1.5',
      cummulativeQuoteQty: '180',
    });

    await service.syncOrder(userId, 'order-1');

    expect(tradingPosition.update).not.toHaveBeenCalled();
    expect(tradingSubPosition.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: expect.objectContaining({
        status: 'CLOSED',
        quantity: 0,
        costQuote: 0,
        entryPrice: 0,
        realizedPnlQuote: 40,
        closedAt: expect.any(Date),
      }),
    });
  });

  it('keeps the campaign open when the parent exits while an independent leg remains open', async () => {
    const { service, tradingPosition, tradingSubPosition } = createService(
      {},
      { status: 'FILLED', executedQty: '2', cummulativeQuoteQty: '240' },
    );
    tradingSubPosition.findMany.mockResolvedValue([{ id: 'sub-5' }]);

    await service.executeMarketOrder(userId, {
      strategyId: strategy.id,
      side: 'SELL',
      quantity: 2,
      actionType: 'PARENT_EXIT',
      actionKey: 'parent-exit-with-independent-open',
      level: 1,
    });

    expect(tradingPosition.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'OPEN', totalQuantity: 0 }),
    }));
  });

  it('closes the campaign when the final independent leg exits after the parent is empty', async () => {
    const subPosition = {
      id: 'sub-5', positionId: 'position-1', level: 5, status: 'OPEN', quantity: 1,
      costQuote: 90, entryPrice: 90, takeProfitPrice: 91.35, realizedPnlQuote: 0,
    };
    const { service, tradingPosition, tradingSubPosition } = createService(
      {},
      { status: 'FILLED', executedQty: '1', cummulativeQuoteQty: '95' },
      { totalQuantity: 0, totalCostQuote: 0, averageEntryPrice: 0 },
    );
    tradingSubPosition.findUnique.mockResolvedValue(subPosition);
    tradingSubPosition.findMany.mockResolvedValue([]);

    await service.executeMarketOrder(userId, {
      strategyId: strategy.id,
      side: 'SELL',
      quantity: 1,
      actionType: 'INDEPENDENT_EXIT',
      actionKey: 'final-independent-exit',
      level: 5,
    });

    expect(tradingPosition.update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: { status: 'CLOSED', closedAt: expect.any(Date) },
    });
  });

  it('rejects synchronization for a missing order', async () => {
    const { service, tradingOrder } = createService();
    tradingOrder.findFirst.mockResolvedValue(null);

    await expect(service.syncOrder(userId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects synchronization when no exchange order id exists', async () => {
    const { service } = createService({ exchangeOrderId: null });

    await expect(service.syncOrder(userId, 'order-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
