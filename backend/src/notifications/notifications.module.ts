import { Global, Module } from '@nestjs/common';
import { NotificationRetentionScheduler } from './notification-retention.scheduler';
import { NotificationChannelsService } from './notification-channels.service';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  providers: [NotificationsService, NotificationChannelsService, NotificationRetentionScheduler],
  exports: [NotificationsService, NotificationChannelsService],
})
export class NotificationsModule {}
