import { TestnetEmergencyStopService } from './testnet-emergency-stop.service';

describe('TestnetEmergencyStopService emergency exit', () => {
  it('leaves Testnet strategies stopped and blocks re-entry after close processing', async () => {
    const prisma = {
      tradingStrategy: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      strategyAction: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      tradingOrder: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      tradingPosition: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const notifications = { publish: jest.fn() } as any;
    const service = new TestnetEmergencyStopService(prisma, {} as any, notifications, {} as any);

    const result = await service.exitUserPositions('user-1');

    expect(prisma.tradingStrategy.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { status: 'STOPPED' },
    }));
    expect(result).toEqual(expect.objectContaining({ reentryBlocked: true, positionsFound: 0, failedCloses: 0 }));
    expect(notifications.publish).toHaveBeenCalledWith(expect.objectContaining({ event: 'TESTNET_EMERGENCY_EXIT' }));
  });
});
