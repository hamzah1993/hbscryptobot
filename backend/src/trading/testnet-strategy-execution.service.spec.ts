import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TestnetStrategyExecutionService } from './testnet-strategy-execution.service';

describe('TestnetStrategyExecutionService incremental fill accounting', () => {
  const userId = 'user-1';
  const strategy = {
    id: 'strategy-1',
    userId,
    symbol: 'BTCUSDT',
    paperTrading: false,
    environment: 'TESTNET',
    status: 'PAUSED',
    dcaStepPercent: 5,
    dcaMultiplier: 1,
    takeProfitPercent: 10,
  };

  function createService(orderOverrides: Record<string, unknown> = {}, exchangeOrder: Record<string, unknown> = {}) {
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
      nextDcaPrice: 95,
      takeProfitPrice: 110,
      strategy,
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
      update: jest.fn(async ({ data }) => ({ ...position, ...data })),
    };
    const tradingSubPosition = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }) => ({ id: 'sub-1', realizedPnlQuote: 0, ...data })),
      update: jest.fn(async ({ data }) => ({ id: 'sub-1', ...data })),
    };
    const tradingOrder = {
      findFirst: jest.fn().mockResolvedValue(order),
      update: jest.fn(async ({ data }) => ({ ...order, ...data })),
    };
    const strategyAction = {
      update: jest.fn().mockResolvedValue({}),
    };
    const tx = { tradingPosition, tradingSubPosition, tradingOrder, strategyAction };
    const prisma = {
      tradingOrder,
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    } as any;
    const testnetOrders = {
      getOrder: jest.fn().mockResolvedValue({
        orderId: '123',
        status: 'FILLED',
        executedQty: '2',
        cummulativeQuoteQty: '210',
        ...exchangeOrder,
      }),
    } as any;
    const actions = { claim: jest.fn(), markFailed: jest.fn() } as any;
    const notifications = { publish: jest.fn() } as any;

    return {
      service: new TestnetStrategyExecutionService(prisma, testnetOrders, actions, notifications),
      order,
      tradingOrder,
      tradingPosition,
      tradingSubPosition,
      strategyAction,
      notifications,
    };
  }

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
    });

    await service.syncOrder(userId, 'order-1');

    expect(tradingPosition.update).not.toHaveBeenCalled();
    expect(tradingSubPosition.create).toHaveBeenCalledWith({
      data: {
        positionId: 'position-1',
        level: 5,
        status: 'OPEN',
        quantity: 0.5,
        costQuote: 50,
        entryPrice: 100,
        takeProfitPrice: 110.00000000000001,
      },
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
