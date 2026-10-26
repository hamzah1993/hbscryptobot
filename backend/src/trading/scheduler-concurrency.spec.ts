import { forEachConcurrent, keepLockAlive } from './scheduler-concurrency';

describe('scheduler concurrency helpers', () => {
  it('processes every item with bounded parallelism and survives failures', async () => {
    const items = Array.from({ length: 250 }, (_, index) => index);
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await forEachConcurrent(items, 8, async (item) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setImmediate(resolve));
      running -= 1;
      if (item === 3) throw new Error('one user failed');
      done.push(item);
    });
    expect(done).toHaveLength(249);
    expect(peak).toBeLessThanOrEqual(8);
  });

  it('renews the lock until stopped', () => {
    jest.useFakeTimers();
    const redisLock = { extend: jest.fn().mockResolvedValue(true) } as any;
    const stop = keepLockAlive(redisLock, { key: 'k', token: 't' }, 30_000);
    jest.advanceTimersByTime(25_000);
    expect(redisLock.extend).toHaveBeenCalledTimes(2);
    stop();
    jest.advanceTimersByTime(60_000);
    expect(redisLock.extend).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});
