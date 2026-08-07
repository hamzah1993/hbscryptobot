import { LiveEmergencyExitService } from './live-emergency-exit.service';

describe('LiveEmergencyExitService', () => {
  it('stops LIVE strategies and blocks re-entry even when a market close fails', async () => {
    const prisma = {
      tradingStrategy: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      strategyAction: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      tradingOrder: { findMany: jest.fn().mockResolvedValue([]) },
      tradingPosition: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', subPositions: [] }]) },
    } as any;
    const liveOrders = { cancelOrder: jest.fn() } as any;
    const execution = { closePosition: jest.fn().mockRejectedValue(new Error('Binance unavailable')), syncOrder: jest.fn() } as any;
    const notifications = { publish: jest.fn() } as any;
    const service = new LiveEmergencyExitService(prisma, liveOrders, execution, notifications);

    const result = await service.exitUserPositions('user-1');

    expect(result).toMatchObject({ environment: 'LIVE', reentryBlocked: true, failedCloses: 1 });
    expect(prisma.tradingStrategy.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { status: 'STOPPED' },
    }));
    expect(notifications.publish).toHaveBeenCalledWith(expect.objectContaining({ severity: 'CRITICAL' }));
  });

  it('cancels and reconciles pending LIVE orders before calculating close submissions', async () => {
    const prisma = {
      tradingStrategy: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      strategyAction: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      tradingOrder: { findMany: jest.fn().mockResolvedValue([{ id: 'o1', exchangeOrderId: '123', position: { symbol: 'BTCUSDT' } }]) },
      tradingPosition: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const liveOrders = { cancelOrder: jest.fn().mockResolvedValue({ status: 'CANCELED' }) } as any;
    const execution = { closePosition: jest.fn(), syncOrder: jest.fn().mockResolvedValue({}) } as any;
    const notifications = { publish: jest.fn() } as any;
    const service = new LiveEmergencyExitService(prisma, liveOrders, execution, notifications);

    await service.exitUserPositions('user-1');
    expect(liveOrders.cancelOrder).toHaveBeenCalledWith('user-1', 'BTCUSDT', '123');
    expect(execution.syncOrder).toHaveBeenCalledWith('user-1', 'o1');
  });
});
