import { Global, Module } from '@nestjs/common';
import { NotificationRetentionScheduler } from './notification-retention.scheduler';
import { NotificationChannelsService } from './notification-channels.service';
import { NotificationsService } from './notifications.service';
import { TelegramConnectionService } from './telegram-connection.service';
import { TelegramWebhookController } from './telegram-webhook.controller';

@Global()
@Module({
  controllers: [TelegramWebhookController],
  providers: [NotificationsService, NotificationChannelsService, NotificationRetentionScheduler, TelegramConnectionService],
  exports: [NotificationsService, NotificationChannelsService, TelegramConnectionService],
})
export class NotificationsModule {}
