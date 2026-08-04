import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createClient, type RedisClientType } from 'redis';

export type RedisLock = {
  key: string;
  token: string;
};

@Injectable()
export class RedisLockService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisLockService.name);
  private readonly client: RedisClientType;
  private connection?: Promise<void>;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    });
    this.client.on('error', (error: Error) => {
      this.logger.warn(`Redis lock client error: ${error.message}`);
    });
  }

  async acquire(key: string, ttlMilliseconds: number): Promise<RedisLock | null> {
    await this.ensureConnected();
    const token = randomUUID();
    const result = await this.client.set(key, token, {
      NX: true,
      PX: ttlMilliseconds,
    });

    return result === 'OK' ? { key, token } : null;
  }

  async release(lock: RedisLock): Promise<boolean> {
    await this.ensureConnected();
    const result = await this.client.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      {
        keys: [lock.key],
        arguments: [lock.token],
      },
    );

    return result === 1;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.isOpen) return;
    this.connection ??= this.client.connect().finally(() => {
      this.connection = undefined;
    });
    await this.connection;
  }
}
