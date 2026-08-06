import { BadRequestException } from '@nestjs/common';
import { TestnetStrategyActionService } from './testnet-strategy-action.service';

describe('TestnetStrategyActionService manual recovery', () => {
  const createService = () => {
    const prisma = {
      strategyAction: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      tradingStrategy: { findFirst: jest.fn() },
      tradingPosition: { findFirst: jest.fn() },
      tradingOrder: { findFirst: jest.fn() },
    } as any;
    const notifications = { publish: jest.fn() } as any;
    const service = new TestnetStrategyActionService(prisma, notifications);
    return { service, prisma, notifications };
  };

  it('lists only the authenticated user Testnet recovery actions', async () => {
    const { service, prisma } = createService();
    prisma.strategyAction.findMany.mockResolvedValue([]);

    await service.listUserRecoverable('user-1', 25);

    expect(prisma.strategyAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          strategy: { environment: 'TESTNET', paperTrading: false },
          status: { in: ['PENDING', 'SUBMITTED', 'FAILED', 'PERMANENTLY_FAILED'] },
        }),
        take: 25,
      }),
    );
  });

  it('rejects manual retry when the linked order is unresolved', async () => {
    const { service, prisma } = createService();
    prisma.strategyAction.findFirst.mockResolvedValue({
      id: 'action-1',
      status: 'FAILED',
      order: { status: 'PARTIALLY_FILLED' },
    });

    await expect(service.manualRetry('user-1', 'action-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.strategyAction.update).not.toHaveBeenCalled();
  });

  it('queues a failed action for immediate scheduler retry', async () => {
    const { service, prisma, notifications } = createService();
    const action = {
      id: 'action-1',
      userId: 'user-1',
      strategyId: 'strategy-1',
      positionId: 'position-1',
      orderId: 'order-1',
      actionKey: 'action-key',
      type: 'DCA_ENTRY',
      status: 'PERMANENTLY_FAILED',
      order: { status: 'FAILED' },
    };
    prisma.strategyAction.findFirst.mockResolvedValue(action);
    prisma.strategyAction.update.mockResolvedValue({ ...action, status: 'FAILED', retryable: true });

    await service.manualRetry('user-1', 'action-1');

    expect(prisma.strategyAction.update).toHaveBeenCalledWith({
      where: { id: 'action-1' },
      data: expect.objectContaining({
        status: 'FAILED',
        retryable: true,
        failureCategory: null,
        errorMessage: null,
        nextRetryAt: expect.any(Date),
        completedAt: null,
      }),
    });
    expect(notifications.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'TESTNET_STRATEGY_ACTION_MANUAL_RETRY',
        userId: 'user-1',
        strategyId: 'strategy-1',
      }),
    );
  });

  it('cancels a scheduled retry and clears scheduling metadata', async () => {
    const { service, prisma } = createService();
    prisma.strategyAction.findFirst.mockResolvedValue({ id: 'action-1', status: 'FAILED' });
    prisma.strategyAction.update.mockResolvedValue({ id: 'action-1', status: 'CANCELLED' });

    await service.cancelRetry('user-1', 'action-1');

    expect(prisma.strategyAction.update).toHaveBeenCalledWith({
      where: { id: 'action-1' },
      data: expect.objectContaining({
        status: 'CANCELLED',
        retryable: false,
        nextRetryAt: null,
        completedAt: expect.any(Date),
      }),
    });
  });

  it('rejects acknowledgement for a non-permanent failure', async () => {
    const { service, prisma } = createService();
    prisma.strategyAction.findFirst.mockResolvedValue(null);

    await expect(service.acknowledgePermanentFailure('user-1', 'action-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([
    [{ response: { status: 429 }, message: 'Too Many Requests' }, 'RATE_LIMIT', true],
    [{ statusCode: 503, message: 'Service unavailable' }, 'EXCHANGE_TEMPORARY', true],
    [new Error('socket ECONNRESET'), 'NETWORK', true],
    [new Error('request timed out'), 'TIMEOUT', true],
    [{ status: 401, message: 'invalid API key' }, 'AUTHENTICATION', false],
    [new Error('insufficient balance'), 'INSUFFICIENT_BALANCE', false],
    [new Error('invalid quantity'), 'VALIDATION', false],
  ])('classifies exchange failure %p as %s with retryable=%s', async (failure, category, retryable) => {
    const { service, prisma } = createService();
    prisma.strategyAction.findUnique.mockResolvedValue({ attemptCount: 1, maxAttempts: 5 });
    prisma.strategyAction.update.mockImplementation(({ data }: any) => Promise.resolve({
      id: 'action-1',
      userId: 'user-1',
      strategyId: 'strategy-1',
      positionId: 'position-1',
      orderId: null,
      type: 'DCA_ENTRY',
      side: 'BUY',
      level: 2,
      actionKey: 'action-key',
      attemptCount: 1,
      maxAttempts: 5,
      nextRetryAt: data.nextRetryAt,
      failureCategory: data.failureCategory,
      retryable: data.retryable,
      status: data.status,
    }));

    await service.markFailed('action-1', failure);

    expect(prisma.strategyAction.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        failureCategory: category,
        retryable,
        status: retryable ? 'FAILED' : 'PERMANENTLY_FAILED',
      }),
    }));
  });

  it('stops retrying once the maximum attempt count is exhausted', async () => {
    const { service, prisma } = createService();
    prisma.strategyAction.findUnique.mockResolvedValue({ attemptCount: 5, maxAttempts: 5 });
    prisma.strategyAction.update.mockImplementation(({ data }: any) => Promise.resolve({
      id: 'action-1', userId: 'user-1', strategyId: 'strategy-1', positionId: null, orderId: null,
      type: 'DCA_ENTRY', side: 'BUY', level: 2, actionKey: 'action-key', attemptCount: 5,
      maxAttempts: 5, nextRetryAt: data.nextRetryAt, failureCategory: data.failureCategory,
      retryable: data.retryable, status: data.status,
    }));

    await service.markFailed('action-1', { status: 503, message: 'temporarily unavailable' });

    expect(prisma.strategyAction.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'PERMANENTLY_FAILED',
        retryable: false,
        nextRetryAt: null,
      }),
    }));
  });
});
