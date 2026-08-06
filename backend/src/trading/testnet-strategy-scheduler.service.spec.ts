import { TestnetStrategySchedulerService } from './testnet-strategy-scheduler.service';

describe('TestnetStrategySchedulerService lock recovery', () => {
  function createService() {
    const prisma = {
      tradingStrategy: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'user-1' }]),
      },
    } as any;
    const runner = {
      runUserStrategies: jest.fn().mockResolvedValue([]),
    } as any;
    const redisLock = {
      acquire: jest.fn(),
      release: jest.fn(),
    } as any;
    const health = {
      markRedisAvailable: jest.fn(),
      markRedisUnavailable: jest.fn(),
      markRunnerTick: jest.fn(),
      markError: jest.fn(),
    } as any;

    return {
      service: new TestnetStrategySchedulerService(prisma, runner, redisLock, health),
      prisma,
      runner,
      redisLock,
      health,
    };
  }

  it('runs again after Redis lock acquisition fails', async () => {
    const { service, prisma, runner, redisLock } = createService();
    redisLock.acquire
      .mockRejectedValueOnce(new Error('Redis unavailable'))
      .mockResolvedValueOnce({ key: 'scheduler-lock', token: 'token' });
    redisLock.release.mockResolvedValue(true);

    await service.runAutomaticTestnetStrategies();
    await service.runAutomaticTestnetStrategies();

    expect(redisLock.acquire).toHaveBeenCalledTimes(2);
    expect(prisma.tradingStrategy.findMany).toHaveBeenCalledTimes(1);
    expect(runner.runUserStrategies).toHaveBeenCalledWith('user-1');
    expect(redisLock.release).toHaveBeenCalledTimes(1);
  });

  it('runs again after Redis lock release fails', async () => {
    const { service, prisma, redisLock } = createService();
    redisLock.acquire.mockResolvedValue({ key: 'scheduler-lock', token: 'token' });
    redisLock.release
      .mockRejectedValueOnce(new Error('Redis release failed'))
      .mockResolvedValueOnce(true);

    await service.runAutomaticTestnetStrategies();
    await service.runAutomaticTestnetStrategies();

    expect(redisLock.acquire).toHaveBeenCalledTimes(2);
    expect(prisma.tradingStrategy.findMany).toHaveBeenCalledTimes(2);
    expect(redisLock.release).toHaveBeenCalledTimes(2);
  });

  it('skips the current tick when another instance owns the lock and retries later', async () => {
    const { service, prisma, redisLock } = createService();
    redisLock.acquire
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ key: 'scheduler-lock', token: 'token' });
    redisLock.release.mockResolvedValue(true);

    await service.runAutomaticTestnetStrategies();
    await service.runAutomaticTestnetStrategies();

    expect(redisLock.acquire).toHaveBeenCalledTimes(2);
    expect(prisma.tradingStrategy.findMany).toHaveBeenCalledTimes(1);
    expect(redisLock.release).toHaveBeenCalledTimes(1);
  });
});
