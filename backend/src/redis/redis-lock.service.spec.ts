import { RedisLockService } from './redis-lock.service';

const clients: any[] = [];

jest.mock('redis', () => ({
  createClient: jest.fn(() => {
    const client = {
      isOpen: false,
      on: jest.fn(),
      connect: jest.fn(async function () {
        client.isOpen = true;
        return client;
      }),
      set: jest.fn(),
      eval: jest.fn(),
      quit: jest.fn(async () => {
        client.isOpen = false;
      }),
    };
    clients.push(client);
    return client;
  }),
}));

describe('RedisLockService', () => {
  beforeEach(() => {
    clients.length = 0;
    jest.clearAllMocks();
  });

  it('acquires a lock with NX and PX options', async () => {
    const service = new RedisLockService();
    const client = clients[0];
    client.set.mockResolvedValue('OK');

    const lock = await service.acquire('hbs:lock:test', 30_000);

    expect(lock).toEqual({
      key: 'hbs:lock:test',
      token: expect.any(String),
    });
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.set).toHaveBeenCalledWith('hbs:lock:test', lock?.token, {
      NX: true,
      PX: 30_000,
    });
  });

  it('returns null when the lock is already owned', async () => {
    const service = new RedisLockService();
    const client = clients[0];
    client.set.mockResolvedValue(null);

    await expect(service.acquire('hbs:lock:test', 30_000)).resolves.toBeNull();
  });

  it('releases only a lock with the matching ownership token', async () => {
    const service = new RedisLockService();
    const client = clients[0];
    client.eval.mockResolvedValue(1);

    await expect(
      service.release({ key: 'hbs:lock:test', token: 'owner-token' }),
    ).resolves.toBe(true);

    expect(client.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('get'"), {
      keys: ['hbs:lock:test'],
      arguments: ['owner-token'],
    });
  });

  it('reports a failed release when ownership no longer matches', async () => {
    const service = new RedisLockService();
    const client = clients[0];
    client.eval.mockResolvedValue(0);

    await expect(
      service.release({ key: 'hbs:lock:test', token: 'stale-token' }),
    ).resolves.toBe(false);
  });

  it('reuses an open connection and closes it during shutdown', async () => {
    const service = new RedisLockService();
    const client = clients[0];
    client.set.mockResolvedValue('OK');

    await service.acquire('hbs:lock:first', 1_000);
    await service.acquire('hbs:lock:second', 1_000);
    await service.onModuleDestroy();

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.quit).toHaveBeenCalledTimes(1);
  });
});
