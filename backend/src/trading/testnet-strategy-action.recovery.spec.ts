import { BadRequestException } from '@nestjs/common';
import { TestnetStrategyActionService } from './testnet-strategy-action.service';

describe('TestnetStrategyActionService manual recovery', () => {
  const createService = () => {
    const prisma = {
      strategyAction: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(async ({ data }: any) => ({ id: 'action-1', ...data })),
      },
    } as any;
    const notifications = { publish: jest.fn() } as any;
    return {
      service: new TestnetStrategyActionService(prisma, notifications),
      prisma,
      notifications,
    };
  };

  it('lists only the authenticated user Testnet recovery actions', async () => {
    const { service, prisma } = createService();
    prisma.strategyAction.findMany.mockResolvedValue([]);

    await service.listUserRecoverable('user-1', 50);

    expect(prisma.strategyAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          strategy: { environment: 'TESTNET', paperTrading: false },
          status: { in: ['PENDING', 'SUBMITTED', 'FAILED', 'PERMANENTLY_FAILED'] },
        }),
        take: 50,
      }),
    );
  });

  it('manually retries a failed action and clears failure metadata', async () => {
    const { service, prisma, notifications } = createService();
    prisma.strategyAction.findFirst.mockResolvedValue({
      id: 'action-1',
      userId: 'user-1',
      strategyId: 'strategy-1',
      positionId: 'position-1',
      orderId: null,
      actionKey: 'key-1',
      type: 'DCA_ENTRY',
      status: 'FAILED',
      order: null,
    });

    const result = await service.manualRetry('user-1', 'action-1');

    expect(prisma.strategyAction.update).toHaveBeenCalledWith({
      where: { id: 'action-1' },
      data: expect.objectContaining({
        status: 'PENDING',
        retryable: false,
        failureCategory: null,
        errorMessage: null,
        nextRetryAt: null,
        completedAt: null,
        lastAttemptedAt: expect.any(Date),
        attemptCount: { increment: 1 },
      }),
    });
    expect(notifications.publish).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'TESTNET_STRATEGY_ACTION_MANUAL_RETRY', userId: 'user-1' }),
    );
    expect(result).toMatchObject({ id: 'action-1', status: 'PENDING' });
  });

  it('blocks manual retry while the linked order is unresolved', async () => {
    const { service, prisma } = createService();
    prisma.strategyAction.findFirst.mockResolvedValue({
      id: 'action-1',
      status: 'FAILED',
      order: { status: 'PARTIALLY_FILLED' },
    });

    await expect(service.manualRetry('user-1', 'action-1')).rejects.toThrow(
      'The linked Testnet order is still unresolved',
    );
    expect(prisma.strategyAction.update).not.toHaveBeenCalled();
  });

  it('rejects recovery of another user action', async () => {
    const { service, prisma } = createService();
    prisma.strategyAction.findFirst.mockResolvedValue(null);

    await expect(service.manualRetry('user-1', 'action-2')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cancels a scheduled retry and clears retry scheduling', async () => {
    const { service, prisma } = createService();
    prisma.strategyAction.findFirst.mockResolvedValue({ id: 'action-1', status: 'FAILED' });

    await service.cancelRetry('user-1', 'action-1');

    expect(prisma.strategyAction.update).toHaveBeenCalledWith({
      where: { id: 'action-1' },
      data: expect.objectContaining({
        status: 'CANCELLED',
        retryable: false,
        nextRetryAt: null,
        completedAt: expect.any(Date),
        errorMessage: 'Cancelled manually',
      }),
    });
  });

  it('acknowledges only a permanent Testnet failure', async () => {
    const { service, prisma, notifications } = createService();
    prisma.strategyAction.findFirst.mockResolvedValue({
      id: 'action-1',
      userId: 'user-1',
      strategyId: 'strategy-1',
      positionId: null,
      orderId: null,
      actionKey: 'key-1',
      type: 'INITIAL_ENTRY',
      status: 'PERMANENTLY_FAILED',
    });

    const result = await service.acknowledgePermanentFailure('user-1', 'action-1');

    expect(result).toEqual({ acknowledged: true, actionId: 'action-1' });
    expect(notifications.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'TESTNET_STRATEGY_ACTION_FAILURE_ACKNOWLEDGED',
        severity: 'INFO',
        userId: 'user-1',
      }),
    );
  });
});
