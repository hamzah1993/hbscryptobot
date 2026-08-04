import { Global, Module } from '@nestjs/common';
import { NotificationRetentionScheduler } from './notification-retention.scheduler';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  providers: [NotificationsService, NotificationRetentionScheduler],
  exports: [NotificationsService],
})
export class NotificationsModule {}
