import { Injectable } from '@nestjs/common';

export type SystemHeartbeatName = 'liveStrategyScheduler' | 'liveOrderSync' | 'liveRetryScheduler';

@Injectable()
export class SystemHeartbeatService {
  private readonly startedAt = new Date();
  private readonly beats = new Map<SystemHeartbeatName, Date>();

  mark(name: SystemHeartbeatName) {
    this.beats.set(name, new Date());
  }

  snapshot() {
    return {
      startedAt: this.startedAt.toISOString(),
      liveStrategyScheduler: this.beats.get('liveStrategyScheduler')?.toISOString() ?? null,
      liveOrderSync: this.beats.get('liveOrderSync')?.toISOString() ?? null,
      liveRetryScheduler: this.beats.get('liveRetryScheduler')?.toISOString() ?? null,
    };
  }
}
