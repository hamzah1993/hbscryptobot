import { Injectable } from '@nestjs/common';

export type TestnetRunnerHealthSnapshot = {
  scheduler: 'HEALTHY' | 'DELAYED' | 'ERROR' | 'IDLE';
  orderSync: 'HEALTHY' | 'DELAYED' | 'ERROR' | 'IDLE';
  retryScheduler: 'HEALTHY' | 'DELAYED' | 'ERROR' | 'IDLE';
  redis: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  lastStrategyTickAt: string | null;
  lastOrderSyncAt: string | null;
  lastRetryTickAt: string | null;
  lastError: string | null;
};

@Injectable()
export class TestnetRunnerHealthService {
  private lastStrategyTickAt: Date | null = null;
  private lastOrderSyncAt: Date | null = null;
  private lastRetryTickAt: Date | null = null;
  private lastError: string | null = null;
  private redis: TestnetRunnerHealthSnapshot['redis'] = 'UNKNOWN';

  markStrategyTick() { this.lastStrategyTickAt = new Date(); }
  markOrderSync() { this.lastOrderSyncAt = new Date(); }
  markRetryTick() { this.lastRetryTickAt = new Date(); }
  markRedisAvailable() { this.redis = 'AVAILABLE'; }
  markRedisUnavailable(error: unknown) {
    this.redis = 'UNAVAILABLE';
    this.lastError = error instanceof Error ? error.message : String(error);
  }
  markError(error: unknown) {
    this.lastError = error instanceof Error ? error.message : String(error);
  }

  snapshot(): TestnetRunnerHealthSnapshot {
    return {
      scheduler: this.status(this.lastStrategyTickAt),
      orderSync: this.status(this.lastOrderSyncAt),
      retryScheduler: this.status(this.lastRetryTickAt),
      redis: this.redis,
      lastStrategyTickAt: this.lastStrategyTickAt?.toISOString() ?? null,
      lastOrderSyncAt: this.lastOrderSyncAt?.toISOString() ?? null,
      lastRetryTickAt: this.lastRetryTickAt?.toISOString() ?? null,
      lastError: this.lastError,
    };
  }

  private status(value: Date | null): TestnetRunnerHealthSnapshot['scheduler'] {
    if (!value) return 'IDLE';
    return Date.now() - value.getTime() > 30_000 ? 'DELAYED' : 'HEALTHY';
  }
}
