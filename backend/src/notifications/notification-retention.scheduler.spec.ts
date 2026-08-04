import { Logger } from '@nestjs/common';
import type { RedisLockService } from '../redis/redis-lock.service';
import { NotificationRetentionScheduler } from './notification-retention.scheduler';
import type { NotificationsService } from './notifications.service';

describe('NotificationRetentionScheduler', () => {
  const createNotifications = (notificationsDeleted = 0, metricsSnapshotsDeleted = 0) =>
    ({
      cleanupExpired: jest.fn().mockResolvedValue(notificationsDeleted),
      cleanupExpiredWebhookMetricsSnapshots: jest
        .fn()
        .mockResolvedValue(metricsSnapshotsDeleted),
    }) as unknown as NotificationsService;

  const createRedisLock = (acquired = true) =>
    ({
      acquire: jest
        .fn()
        .mockResolvedValue(acquired ? { key: 'retention-lock', token: 'token' } : null),
      release: jest.fn().mockResolvedValue(true),
    }) as unknown as RedisLockService;

  it('runs both retention cleanup operations', async () => {
    const notifications = createNotifications();
    const redisLock = createRedisLock();
    const scheduler = new NotificationRetentionScheduler(notifications, redisLock);

    await scheduler.cleanupExpiredNotifications();

    expect(notifications.cleanupExpired).toHaveBeenCalledTimes(1);
    expect(notifications.cleanupExpiredWebhookMetricsSnapshots).toHaveBeenCalledTimes(1);
    expect(redisLock.release).toHaveBeenCalledTimes(1);
  });

  it('logs separate deletion counts for notifications and webhook metrics snapshots', async () => {
    const notifications = createNotifications(12, 4);
    const redisLock = createRedisLock();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const scheduler = new NotificationRetentionScheduler(notifications, redisLock);

    await scheduler.cleanupExpiredNotifications();

    expect(log).toHaveBeenCalledWith('Deleted 12 expired operational notification(s)');
    expect(log).toHaveBeenCalledWith(
      'Deleted 4 expired notification webhook metrics snapshot(s)',
    );
  });

  it('does not log deletion messages when no records are removed', async () => {
    const notifications = createNotifications();
    const redisLock = createRedisLock();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const scheduler = new NotificationRetentionScheduler(notifications, redisLock);

    await scheduler.cleanupExpiredNotifications();

    expect(log).not.toHaveBeenCalled();
  });

  it('skips cleanup when another process owns the retention lock', async () => {
    const notifications = createNotifications();
    const redisLock = createRedisLock(false);
    const scheduler = new NotificationRetentionScheduler(notifications, redisLock);

    await scheduler.cleanupExpiredNotifications();

    expect(notifications.cleanupExpired).not.toHaveBeenCalled();
    expect(notifications.cleanupExpiredWebhookMetricsSnapshots).not.toHaveBeenCalled();
    expect(redisLock.release).not.toHaveBeenCalled();
  });
});
