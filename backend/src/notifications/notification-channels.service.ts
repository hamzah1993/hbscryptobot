import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { NotificationSeverity as PrismaNotificationSeverity } from '@prisma/client';
import nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationSeverity, StoredOperationalNotification } from './notifications.service';

export type NotificationChannelSettings = {
  email: {
    enabled: boolean;
    address: string;
    minimumSeverity: NotificationSeverity;
    providerConfigured: boolean;
  };
  telegram: {
    enabled: boolean;
    chatId: string;
    connected: boolean;
    minimumSeverity: NotificationSeverity;
    providerConfigured: boolean;
    connectionConfigured: boolean;
  };
};

export type NotificationChannelSettingsInput = {
  email?: { enabled?: boolean; address?: string; minimumSeverity?: NotificationSeverity };
  telegram?: { enabled?: boolean; minimumSeverity?: NotificationSeverity };
};

type Channel = 'EMAIL' | 'TELEGRAM';

const severityRank: Record<NotificationSeverity, number> = {
  INFO: 1,
  WARNING: 2,
  CRITICAL: 3,
};

@Injectable()
export class NotificationChannelsService {
  private readonly logger = new Logger(NotificationChannelsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string): Promise<NotificationChannelSettings> {
    const [user, preference] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
      this.prisma.notificationPreference.findUnique({ where: { userId } }),
    ]);
    if (!user) throw new BadRequestException('User account was not found');

    return {
      email: {
        enabled: preference?.emailEnabled ?? false,
        address: preference?.emailAddress || user.email,
        minimumSeverity: (preference?.emailMinimumSeverity as NotificationSeverity | undefined) ?? 'WARNING',
        providerConfigured: this.emailProviderConfigured(),
      },
      telegram: {
        enabled: preference?.telegramEnabled ?? false,
        chatId: preference?.telegramChatId ?? '',
        connected: Boolean(preference?.telegramChatId),
        minimumSeverity: (preference?.telegramMinimumSeverity as NotificationSeverity | undefined) ?? 'WARNING',
        providerConfigured: this.telegramProviderConfigured(),
        connectionConfigured: this.telegramConnectionConfigured(),
      },
    };
  }

  async updateSettings(userId: string, input: NotificationChannelSettingsInput): Promise<NotificationChannelSettings> {
    const current = await this.getSettings(userId);
    const emailAddress = input.email?.address?.trim() ?? current.email.address;
    const telegramChatId = current.telegram.chatId;
    const emailEnabled = input.email?.enabled ?? current.email.enabled;
    const telegramEnabled = input.telegram?.enabled ?? current.telegram.enabled;
    const emailMinimumSeverity = this.validateSeverity(input.email?.minimumSeverity ?? current.email.minimumSeverity);
    const telegramMinimumSeverity = this.validateSeverity(input.telegram?.minimumSeverity ?? current.telegram.minimumSeverity);

    if (emailAddress && !/^\S+@\S+\.\S+$/.test(emailAddress)) {
      throw new BadRequestException('Enter a valid notification email address');
    }
    if (emailEnabled && !emailAddress) throw new BadRequestException('Email address is required');
    if (telegramEnabled && !telegramChatId) throw new BadRequestException('Connect Telegram before enabling notifications');

    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        emailEnabled,
        emailAddress: emailAddress || null,
        emailMinimumSeverity: emailMinimumSeverity as PrismaNotificationSeverity,
        telegramEnabled,
        telegramChatId: telegramChatId || null,
        telegramMinimumSeverity: telegramMinimumSeverity as PrismaNotificationSeverity,
      },
      update: {
        emailEnabled,
        emailAddress: emailAddress || null,
        emailMinimumSeverity: emailMinimumSeverity as PrismaNotificationSeverity,
        telegramEnabled,
        telegramChatId: telegramChatId || null,
        telegramMinimumSeverity: telegramMinimumSeverity as PrismaNotificationSeverity,
      },
    });

    return this.getSettings(userId);
  }

  async deliver(notification: StoredOperationalNotification): Promise<void> {
    if (!notification.userId) return;
    try {
      const settings = await this.getSettings(notification.userId);
      const tasks: Promise<void>[] = [];
      if (settings.email.enabled && severityRank[notification.severity] >= severityRank[settings.email.minimumSeverity]) {
        tasks.push(this.sendEmail(settings.email.address, notification));
      }
      if (settings.telegram.enabled && severityRank[notification.severity] >= severityRank[settings.telegram.minimumSeverity]) {
        tasks.push(this.sendTelegram(settings.telegram.chatId, notification));
      }
      await Promise.allSettled(tasks);
    } catch (error: unknown) {
      this.logDeliveryFailure('channels', notification.id, error);
    }
  }

  async sendTest(userId: string, channel: Channel): Promise<{ delivered: true; channel: Channel }> {
    const settings = await this.getSettings(userId);
    const testNotification: StoredOperationalNotification = {
      id: `test-${Date.now()}`,
      createdAt: new Date().toISOString(),
      event: 'NOTIFICATION_TEST',
      message: 'HBS Trading notification channel is configured correctly.',
      severity: 'INFO',
      userId,
      metadata: { test: true },
    };

    if (channel === 'EMAIL') {
      if (!settings.email.enabled) throw new BadRequestException('Enable email notifications before testing');
      if (!this.emailProviderConfigured()) throw new BadRequestException('Email provider is not configured on the server');
      await this.sendEmail(settings.email.address, testNotification, true);
    } else {
      if (!settings.telegram.enabled) throw new BadRequestException('Enable Telegram notifications before testing');
      if (!this.telegramProviderConfigured()) throw new BadRequestException('Telegram provider is not configured on the server');
      await this.sendTelegram(settings.telegram.chatId, testNotification, true);
    }
    return { delivered: true, channel };
  }

  async sendSecurityEmail(address: string, subject: string, message: string): Promise<boolean> {
    if (!this.emailProviderConfigured()) {
      this.logger.warn('Security email skipped: email provider is not configured');
      return false;
    }

    try {
      const port = this.smtpPort();
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST!.trim(),
        port,
        secure: this.smtpSecure(port),
        auth: process.env.SMTP_USER?.trim()
          ? { user: process.env.SMTP_USER.trim(), pass: process.env.SMTP_PASSWORD ?? '' }
          : undefined,
        connectionTimeout: 5_000,
        greetingTimeout: 5_000,
        socketTimeout: 8_000,
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM!.trim(),
        to: address,
        subject,
        text: message,
      });
      return true;
    } catch (error: unknown) {
      this.logDeliveryFailure('Security email', 'security-email', error);
      return false;
    }
  }

  private async sendTelegram(chatId: string, notification: StoredOperationalNotification, propagate = false): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      this.logger.warn(`Telegram notification skipped for ${notification.id}: provider is not configured`);
      return;
    }
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: this.formatPlainText(notification), disable_web_page_preview: true }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(`Telegram returned HTTP ${response.status}`);
    } catch (error: unknown) {
      this.logDeliveryFailure('Telegram', notification.id, error);
      if (propagate) throw new BadRequestException('Telegram test delivery failed');
    }
  }

  private async sendEmail(address: string, notification: StoredOperationalNotification, propagate = false): Promise<void> {
    if (!this.emailProviderConfigured()) {
      this.logger.warn(`Email notification skipped for ${notification.id}: provider is not configured`);
      return;
    }
    try {
      const port = this.smtpPort();
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST!.trim(),
        port,
        secure: this.smtpSecure(port),
        auth: process.env.SMTP_USER?.trim()
          ? { user: process.env.SMTP_USER.trim(), pass: process.env.SMTP_PASSWORD ?? '' }
          : undefined,
        connectionTimeout: 5_000,
        greetingTimeout: 5_000,
        socketTimeout: 8_000,
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM!.trim(),
        to: address,
        subject: `[HBS Trading] ${notification.severity} · ${this.eventLabel(notification.event)}`,
        text: this.formatPlainText(notification),
      });
    } catch (error: unknown) {
      this.logDeliveryFailure('Email', notification.id, error);
      if (propagate) throw new BadRequestException('Email test delivery failed');
    }
  }

  private formatPlainText(notification: StoredOperationalNotification): string {
    const lines = [
      `HBS Trading · ${notification.severity}`,
      this.eventLabel(notification.event),
      notification.message,
      '',
      `Time: ${notification.createdAt}`,
    ];
    if (notification.strategyId) lines.push(`Strategy: ${notification.strategyId}`);
    if (notification.positionId) lines.push(`Position: ${notification.positionId}`);
    if (notification.orderId) lines.push(`Order: ${notification.orderId}`);
    if (notification.metadata && Object.keys(notification.metadata).length > 0) {
      lines.push(`Context: ${JSON.stringify(notification.metadata)}`);
    }
    return lines.join('\n');
  }

  private eventLabel(event: string): string {
    return event.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private telegramProviderConfigured(): boolean {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
  }

  private telegramConnectionConfigured(): boolean {
    const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') ?? '';
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL?.trim() ?? '';
    return Boolean(
      process.env.TELEGRAM_BOT_TOKEN?.trim()
      && /^[A-Za-z0-9_]{5,32}$/.test(username)
      && /^[A-Za-z0-9_-]{1,256}$/.test(secret)
      && /^https:\/\//i.test(webhookUrl),
    );
  }

  private emailProviderConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim());
  }

  private smtpPort(): number {
    const parsed = Number.parseInt(process.env.SMTP_PORT ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 587;
  }

  private smtpSecure(port: number): boolean {
    const configured = process.env.SMTP_SECURE?.trim().toLowerCase();
    if (configured === 'true') return true;
    if (configured === 'false') return false;
    return port === 465;
  }

  private validateSeverity(value: NotificationSeverity): NotificationSeverity {
    if (value === 'INFO' || value === 'WARNING' || value === 'CRITICAL') return value;
    throw new BadRequestException('Minimum severity must be INFO, WARNING, or CRITICAL');
  }

  private logDeliveryFailure(channel: string, notificationId: string, error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unknown provider error';
    this.logger.warn(`${channel} notification delivery failed for ${notificationId}: ${message}`);
  }
}
