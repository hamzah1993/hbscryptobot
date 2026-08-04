import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationRetentionScheduler {
  private readonly logger = new Logger(NotificationRetentionScheduler.name);

  constructor(private readonly notifications: NotificationsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredNotifications(): Promise<void> {
    const deleted = await this.notifications.cleanupExpired();
    if (deleted > 0) {
      this.logger.log(`Deleted ${deleted} expired operational notification(s)`);
    }
  }
}
