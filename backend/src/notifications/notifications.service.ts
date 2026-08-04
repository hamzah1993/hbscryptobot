import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type NotificationSeverity as PrismaNotificationSeverity } from '@prisma/client';
import { createHmac, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

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

export type NotificationWebhookMetrics = {
  attempted: number;
  delivered: number;
  failed: number;
  retried: number;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastStatusCode?: number;
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
  private readonly webhookMaxAttempts = this.parseWebhookMaxAttempts(
    process.env.NOTIFICATION_WEBHOOK_MAX_ATTEMPTS,
  );
  private readonly webhookMetrics: NotificationWebhookMetrics = {
    attempted: 0,
    delivered: 0,
    failed: 0,
    retried: 0,
  };

  constructor(private readonly prisma: PrismaService) {}

  publish(notification: OperationalNotification): void {
    const stored: StoredOperationalNotification = {
      ...notification,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };

    this.recent.unshift(stored);
    if (this.recent.length > this.maxRecent) this.recent.length = this.maxRecent;

    if (stored.userId) {
      void this.persist(stored);
    }

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

  async listRecent(userId: string, limit = 100): Promise<StoredOperationalNotification[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 100, 1), 500);

    try {
      const notifications = await this.prisma.operationalNotification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
      });

      return notifications.map((notification) => ({
        id: notification.id,
        event: notification.event,
        message: notification.message,
        severity: notification.severity as NotificationSeverity,
        userId: notification.userId,
        strategyId: notification.strategyId ?? undefined,
        positionId: notification.positionId ?? undefined,
        orderId: notification.orderId ?? undefined,
        metadata: notification.metadata
          ? { ...(notification.metadata as Record<string, unknown>) }
          : undefined,
        createdAt: notification.createdAt.toISOString(),
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown notification history error';
      this.logger.warn(`Persistent notification history read failed for ${userId}: ${message}`);

      return this.recent
        .filter((notification) => notification.userId === userId)
        .slice(0, safeLimit)
        .map((notification) => ({
          ...notification,
          metadata: notification.metadata ? { ...notification.metadata } : undefined,
        }));
    }
  }

  getWebhookMetrics(): NotificationWebhookMetrics {
    return { ...this.webhookMetrics };
  }

  private async persist(notification: StoredOperationalNotification): Promise<void> {
    if (!notification.userId) return;

    try {
      await this.prisma.operationalNotification.create({
        data: {
          id: notification.id,
          userId: notification.userId,
          event: notification.event,
          message: notification.message,
          severity: notification.severity as PrismaNotificationSeverity,
          strategyId: notification.strategyId,
          positionId: notification.positionId,
          orderId: notification.orderId,
          metadata: notification.metadata as Prisma.InputJsonValue | undefined,
          createdAt: new Date(notification.createdAt),
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown notification persistence error';
      this.logger.warn(`Operational notification persistence failed for ${notification.id}: ${message}`);
    }
  }

  private parseSeverity(value?: string): NotificationSeverity {
    const normalized = value?.trim().toUpperCase();
    if (normalized === 'INFO' || normalized === 'WARNING' || normalized === 'CRITICAL') {
      return normalized;
    }
    return 'WARNING';
  }

  private parseWebhookMaxAttempts(value?: string): number {
    const parsed = Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed)) return 3;
    return Math.min(Math.max(parsed, 1), 5);
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

    for (let attempt = 1; attempt <= this.webhookMaxAttempts; attempt += 1) {
      const attemptAt = new Date().toISOString();
      this.webhookMetrics.attempted += 1;
      this.webhookMetrics.lastAttemptAt = attemptAt;
      if (attempt > 1) this.webhookMetrics.retried += 1;

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-hbs-webhook-timestamp': timestamp,
        'x-hbs-webhook-attempt': String(attempt),
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

        this.webhookMetrics.lastStatusCode = response.status;
        if (response.ok) {
          this.webhookMetrics.delivered += 1;
          this.webhookMetrics.lastSuccessAt = new Date().toISOString();
          return;
        }

        const retryable = response.status === 429 || response.status >= 500;
        this.logger.warn(
          `Notification webhook delivery failed with HTTP ${response.status} for ${notification.id} on attempt ${attempt}`,
        );
        if (!retryable || attempt === this.webhookMaxAttempts) {
          this.webhookMetrics.failed += 1;
          this.webhookMetrics.lastFailureAt = new Date().toISOString();
          return;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown webhook delivery error';
        this.webhookMetrics.lastStatusCode = undefined;
        this.logger.warn(
          `Notification webhook delivery failed for ${notification.id} on attempt ${attempt}: ${message}`,
        );
        if (attempt === this.webhookMaxAttempts) {
          this.webhookMetrics.failed += 1;
          this.webhookMetrics.lastFailureAt = new Date().toISOString();
          return;
        }
      }

      await this.delay(500 * 2 ** (attempt - 1));
    }
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
