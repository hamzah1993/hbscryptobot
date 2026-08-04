import { Logger } from '@nestjs/common';
import { NotificationRetentionScheduler } from './notification-retention.scheduler';
import type { NotificationsService } from './notifications.service';

describe('NotificationRetentionScheduler', () => {
  it('runs retention cleanup', async () => {
    const notifications = {
      cleanupExpired: jest.fn().mockResolvedValue(0),
    } as unknown as NotificationsService;
    const scheduler = new NotificationRetentionScheduler(notifications);

    await scheduler.cleanupExpiredNotifications();

    expect(notifications.cleanupExpired).toHaveBeenCalledTimes(1);
  });

  it('logs the deleted notification count when cleanup removes records', async () => {
    const notifications = {
      cleanupExpired: jest.fn().mockResolvedValue(12),
    } as unknown as NotificationsService;
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const scheduler = new NotificationRetentionScheduler(notifications);

    await scheduler.cleanupExpiredNotifications();

    expect(log).toHaveBeenCalledWith('Deleted 12 expired operational notification(s)');
  });

  it('does not log a deletion message when no records are removed', async () => {
    const notifications = {
      cleanupExpired: jest.fn().mockResolvedValue(0),
    } as unknown as NotificationsService;
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const scheduler = new NotificationRetentionScheduler(notifications);

    await scheduler.cleanupExpiredNotifications();

    expect(log).not.toHaveBeenCalled();
  });
});
