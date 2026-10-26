import type { RedisLock, RedisLockService } from '../redis/redis-lock.service';

const DEFAULT_CONCURRENCY = 8;

/** Parallel workers for a scheduler pass, from an env variable (default 8). */
export function schedulerConcurrency(envName: string) {
  const configured = Number.parseInt(process.env[envName] ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 64) : DEFAULT_CONCURRENCY;
}

/** Runs `work` for every item with at most `limit` running at once; one item's failure never stops the rest. */
export async function forEachConcurrent<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await work(item).catch(() => undefined);
    }
  });
  await Promise.all(workers);
}

/**
 * Keeps a scheduler lock alive while a long pass runs, so another instance
 * cannot start the same pass when the pass outlasts the lock TTL. Returns a
 * function that stops the renewal.
 */
export function keepLockAlive(redisLock: RedisLockService, lock: RedisLock, ttlMilliseconds: number) {
  const timer = setInterval(() => {
    redisLock.extend(lock, ttlMilliseconds).catch(() => undefined);
  }, Math.max(Math.floor(ttlMilliseconds / 3), 1_000));
  timer.unref?.();
  return () => clearInterval(timer);
}
