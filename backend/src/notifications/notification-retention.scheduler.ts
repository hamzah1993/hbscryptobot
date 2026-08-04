import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisLockService, type RedisLock } from '../redis/redis-lock.service';
import { NotificationsService } from './notifications.service';

const NOTIFICATION_RETENTION_SCHEDULER_LOCK_KEY = 'hbs:lock:notification-retention-scheduler';
const DEFAULT_NOTIFICATION_RETENTION_SCHEDULER_LOCK_TTL_MS = 5 * 60_000;

const getLockTtlMilliseconds = (): number => {
  const value = Number.parseInt(
    process.env.NOTIFICATION_RETENTION_SCHEDULER_LOCK_TTL_MS ?? '',
    10,
  );
  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_NOTIFICATION_RETENTION_SCHEDULER_LOCK_TTL_MS;
};

@Injectable()
export class NotificationRetentionScheduler {
  private readonly logger = new Logger(NotificationRetentionScheduler.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly redisLock: RedisLockService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredNotifications(): Promise<void> {
    let lock: RedisLock | null = null;

    try {
      lock = await this.redisLock.acquire(
        NOTIFICATION_RETENTION_SCHEDULER_LOCK_KEY,
        getLockTtlMilliseconds(),
      );

      if (!lock) return;

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
    } catch (error) {
      this.logger.error(
        'Scheduled notification retention cleanup failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      if (lock) {
        try {
          await this.redisLock.release(lock);
        } catch (error) {
          this.logger.warn(
            `Failed to release the notification retention scheduler lock: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  }
}
