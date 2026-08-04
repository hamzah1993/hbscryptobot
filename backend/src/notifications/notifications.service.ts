import { Injectable, Logger } from '@nestjs/common';

export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type OperationalNotification = {
  event: string;
  message: string;
  severity: NotificationSeverity;
  userId?: string;
  strategyId?: string;
  positionId?: string;
  orderId?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  publish(notification: OperationalNotification): void {
    const context = {
      event: notification.event,
      severity: notification.severity,
      userId: notification.userId,
      strategyId: notification.strategyId,
      positionId: notification.positionId,
      orderId: notification.orderId,
      metadata: notification.metadata,
    };

    const payload = `${notification.message} ${JSON.stringify(context)}`;

    if (notification.severity === 'CRITICAL') {
      this.logger.error(payload);
      return;
    }

    if (notification.severity === 'WARNING') {
      this.logger.warn(payload);
      return;
    }

    this.logger.log(payload);
  }
}
