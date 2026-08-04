import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomUUID } from 'crypto';

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

type WebhookPayload = {
  id: string;
  createdAt: string;
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
  private readonly recent: StoredOperationalNotification[] = [];
  private readonly maxRecent = 500;
  private readonly webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL?.trim();
  private readonly webhookSecret = process.env.NOTIFICATION_WEBHOOK_SECRET?.trim();
  private readonly webhookMinimumSeverity = this.parseSeverity(
    process.env.NOTIFICATION_WEBHOOK_MIN_SEVERITY,
  );

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
    } else if (stored.severity === 'WARNING') {
      this.logger.warn(payload);
    } else {
      this.logger.log(payload);
    }

    if (this.shouldDeliverWebhook(stored.severity)) {
      void this.deliverWebhook(stored);
    }
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

  private parseSeverity(value?: string): NotificationSeverity {
    const normalized = value?.trim().toUpperCase();
    if (normalized === 'INFO' || normalized === 'WARNING' || normalized === 'CRITICAL') {
      return normalized;
    }
    return 'WARNING';
  }

  private shouldDeliverWebhook(severity: NotificationSeverity): boolean {
    if (!this.webhookUrl) return false;
    const rank: Record<NotificationSeverity, number> = {
      INFO: 1,
      WARNING: 2,
      CRITICAL: 3,
    };
    return rank[severity] >= rank[this.webhookMinimumSeverity];
  }

  private async deliverWebhook(notification: StoredOperationalNotification): Promise<void> {
    if (!this.webhookUrl) return;

    const payload: WebhookPayload = {
      id: notification.id,
      createdAt: notification.createdAt,
      event: notification.event,
      message: notification.message,
      severity: notification.severity,
      userId: notification.userId,
      strategyId: notification.strategyId,
      positionId: notification.positionId,
      orderId: notification.orderId,
      metadata: notification.metadata ? { ...notification.metadata } : undefined,
    };
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-hbs-webhook-timestamp': timestamp,
    };

    if (this.webhookSecret) {
      headers['x-hbs-webhook-signature'] = `sha256=${createHmac('sha256', this.webhookSecret)
        .update(`${timestamp}.${body}`)
        .digest('hex')}`;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        this.logger.warn(
          `Notification webhook delivery failed with HTTP ${response.status} for ${notification.id}`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown webhook delivery error';
      this.logger.warn(`Notification webhook delivery failed for ${notification.id}: ${message}`);
    }
  }
}
