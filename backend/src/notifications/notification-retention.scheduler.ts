import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationRetentionScheduler {
  private readonly logger = new Logger(NotificationRetentionScheduler.name);

  constructor(private readonly notifications: NotificationsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredNotifications(): Promise<void> {
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
  }
}
