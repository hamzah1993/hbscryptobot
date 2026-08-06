import { TestnetActionRetrySchedulerService } from './testnet-action-retry-scheduler.service';

describe('TestnetActionRetrySchedulerService', () => {
  const dueAction = {
    id: 'action-1',
    userId: 'user-1',
    strategyId: 'strategy-1',
    positionId: 'position-1',
    side: 'BUY',
    quantity: 2,
    type: 'DCA_ENTRY',
    actionKey: 'strategy:strategy-1:position:position-1:dca:2',
    attemptCount: 1,
    level: 2,
    triggerPrice: 95,
    order: null,
  };

  function createService(actionsOverride: Record<string, unknown> = {}) {
    const prisma = {
      strategyAction: { findMany: jest.fn().mockResolvedValue([dueAction]) },
    } as any;
    const actions = {
      claimRetry: jest.fn().mockResolvedValue(true),
      markFailed: jest.fn(),
      ...actionsOverride,
    } as any;
    const execution = { executeMarketOrder: jest.fn().mockResolvedValue({ submitted: true }) } as any;
    const lock = { key: 'retry-lock', token: 'token' };
    const redisLock = {
      acquire: jest.fn().mockResolvedValue(lock),
      release: jest.fn().mockResolvedValue(true),
    } as any;
    const health = {
      markRedisAvailable: jest.fn(),
      markRedisUnavailable: jest.fn(),
      markRetryTick: jest.fn(),
      markError: jest.fn(),
    } as any;
    return {
      service: new TestnetActionRetrySchedulerService(prisma, actions, execution, redisLock, health),
      prisma,
      actions,
      execution,
      redisLock,
      health,
    };
  }

  it('retries the claimed logical action instead of creating a new retry action key', async () => {
    const { service, actions, execution, redisLock, health } = createService();

    await service.runDueRetries();

    expect(actions.claimRetry).toHaveBeenCalledWith('action-1');
    expect(execution.executeMarketOrder).toHaveBeenCalledWith('user-1', {
      strategyId: 'strategy-1',
      side: 'BUY',
      quantity: 2,
      actionType: 'DCA_ENTRY',
      actionKey: dueAction.actionKey,
      level: 2,
      triggerPrice: 95,
      allowRunningStrategy: true,
      retryActionId: 'action-1',
    });
    expect(actions.markFailed).not.toHaveBeenCalled();
    expect(health.markRetryTick).toHaveBeenCalledTimes(1);
    expect(redisLock.release).toHaveBeenCalledTimes(1);
  });

  it.each(['PENDING', 'PARTIALLY_FILLED'])('does not retry while the linked order is %s', async (status) => {
    const { service, prisma, actions, execution } = createService();
    prisma.strategyAction.findMany.mockResolvedValue([{ ...dueAction, order: { status } }]);

    await service.runDueRetries();

    expect(actions.claimRetry).not.toHaveBeenCalled();
    expect(actions.markFailed).not.toHaveBeenCalled();
    expect(execution.executeMarketOrder).not.toHaveBeenCalled();
  });

  it('does not execute when another worker wins the retry claim', async () => {
    const { service, execution } = createService({ claimRetry: jest.fn().mockResolvedValue(false) });

    await service.runDueRetries();

    expect(execution.executeMarketOrder).not.toHaveBeenCalled();
  });
});
