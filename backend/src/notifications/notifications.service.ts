import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

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

export type StoredOperationalNotification = OperationalNotification & {
  id: string;
  createdAt: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly recent: StoredOperationalNotification[] = [];
  private readonly maxRecent = 500;

  publish(notification: OperationalNotification): void {
    const stored: StoredOperationalNotification = {
      ...notification,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };

    this.recent.unshift(stored);
    if (this.recent.length > this.maxRecent) this.recent.length = this.maxRecent;

    const context = {
      id: stored.id,
      createdAt: stored.createdAt,
      event: stored.event,
      severity: stored.severity,
      userId: stored.userId,
      strategyId: stored.strategyId,
      positionId: stored.positionId,
      orderId: stored.orderId,
      metadata: stored.metadata,
    };

    const payload = `${stored.message} ${JSON.stringify(context)}`;

    if (stored.severity === 'CRITICAL') {
      this.logger.error(payload);
      return;
    }

    if (stored.severity === 'WARNING') {
      this.logger.warn(payload);
      return;
    }

    this.logger.log(payload);
  }

  listRecent(userId: string, limit = 100): StoredOperationalNotification[] {
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 100, 1), 500);
    return this.recent
      .filter((notification) => notification.userId === userId)
      .slice(0, safeLimit)
      .map((notification) => ({
        ...notification,
        metadata: notification.metadata ? { ...notification.metadata } : undefined,
      }));
  }
}
