import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisLockService } from '../redis/redis-lock.service';
import { NotificationsService } from './notifications.service';

const NOTIFICATION_RETENTION_SCHEDULER_LOCK_KEY = 'hbs:lock:notification-retention-scheduler';
const NOTIFICATION_RETENTION_SCHEDULER_LOCK_TTL_MS = 5 * 60_000;

@Injectable()
export class NotificationRetentionScheduler {
  private readonly logger = new Logger(NotificationRetentionScheduler.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly redisLock: RedisLockService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredNotifications(): Promise<void> {
    const lock = await this.redisLock.acquire(
      NOTIFICATION_RETENTION_SCHEDULER_LOCK_KEY,
      NOTIFICATION_RETENTION_SCHEDULER_LOCK_TTL_MS,
    );

    if (!lock) return;

    try {
      const [notificationsDeleted, metricsSnapshotsDeleted] = await Promise.all([
        this.notifications.cleanupExpired(),
        this.notifications.cleanupExpiredWebhookMetricsSnapshots(),
      ]);

      if (notificationsDeleted > 0) {
        this.logger.log(`Deleted ${notificationsDeleted} expired operational notification(s)`);
      }
      if (metricsSnapshotsDeleted > 0) {
        this.logger.log(
          `Deleted ${metricsSnapshotsDeleted} expired notification webhook metrics snapshot(s)`,
        );
      }
    } finally {
      await this.redisLock.release(lock);
    }
  }
}
