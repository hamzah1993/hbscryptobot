import { Logger } from '@nestjs/common';
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

  it('runs both retention cleanup operations', async () => {
    const notifications = createNotifications();
    const scheduler = new NotificationRetentionScheduler(notifications);

    await scheduler.cleanupExpiredNotifications();

    expect(notifications.cleanupExpired).toHaveBeenCalledTimes(1);
    expect(notifications.cleanupExpiredWebhookMetricsSnapshots).toHaveBeenCalledTimes(1);
  });

  it('logs separate deletion counts for notifications and webhook metrics snapshots', async () => {
    const notifications = createNotifications(12, 4);
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const scheduler = new NotificationRetentionScheduler(notifications);

    await scheduler.cleanupExpiredNotifications();

    expect(log).toHaveBeenCalledWith('Deleted 12 expired operational notification(s)');
    expect(log).toHaveBeenCalledWith(
      'Deleted 4 expired notification webhook metrics snapshot(s)',
    );
  });

  it('does not log deletion messages when no records are removed', async () => {
    const notifications = createNotifications();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const scheduler = new NotificationRetentionScheduler(notifications);

    await scheduler.cleanupExpiredNotifications();

    expect(log).not.toHaveBeenCalled();
  });
});
