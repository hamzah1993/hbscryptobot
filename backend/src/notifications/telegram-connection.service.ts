import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number | string; type?: string };
  };
};

export type TelegramConnectionLink = {
  url: string;
  expiresAt: string;
};

@Injectable()
export class TelegramConnectionService implements OnModuleInit {
  private readonly logger = new Logger(TelegramConnectionService.name);
  private readonly connectionLifetimeMs = 10 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    if (!this.connectionEnvironmentConfigured()) return;
    await this.configureWebhook();
  }

  async createConnectionLink(userId: string): Promise<TelegramConnectionLink> {
    const username = this.botUsername();
    this.assertConnectionConfigured();

    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.connectionLifetimeMs);

    await this.prisma.telegramConnectionToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.prisma.telegramConnectionToken.create({
      data: { userId, tokenHash: this.hashToken(rawToken), expiresAt },
    });

    return {
      url: `https://t.me/${username}?start=${rawToken}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async disconnect(userId: string): Promise<{ disconnected: true }> {
    await this.prisma.notificationPreference.updateMany({
      where: { userId },
      data: { telegramEnabled: false, telegramChatId: null },
    });
    await this.prisma.telegramConnectionToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    return { disconnected: true };
  }

  async processWebhook(update: TelegramUpdate, webhookSecret: string | undefined): Promise<{ ok: true }> {
    if (!this.webhookSecretMatches(webhookSecret)) {
      throw new BadRequestException('Invalid Telegram webhook secret');
    }

    const text = update.message?.text?.trim() ?? '';
    const match = /^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{20,64})$/.exec(text);
    if (!match) return { ok: true };

    const chatIdValue = update.message?.chat?.id;
    const chatType = update.message?.chat?.type;
    if ((typeof chatIdValue !== 'number' && typeof chatIdValue !== 'string') || chatType !== 'private') {
      return { ok: true };
    }
    const chatId = String(chatIdValue);
    const tokenHash = this.hashToken(match[1]);
    const token = await this.prisma.telegramConnectionToken.findUnique({ where: { tokenHash } });
    const now = new Date();

    if (!token || token.usedAt || token.expiresAt <= now) {
      await this.sendBotMessage(chatId, 'This HBS connection link is invalid or expired. Generate a new link in Notifications.');
      return { ok: true };
    }

    const claimed = await this.prisma.telegramConnectionToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) {
      await this.sendBotMessage(chatId, 'This HBS connection link has already been used. Generate a new link in Notifications.');
      return { ok: true };
    }

    const alreadyLinked = await this.prisma.notificationPreference.findFirst({
      where: { telegramChatId: chatId, NOT: { userId: token.userId } },
      select: { userId: true },
    });
    if (alreadyLinked) {
      await this.sendBotMessage(chatId, 'This Telegram account is already connected to another HBS account. Disconnect it there first.');
      return { ok: true };
    }

    await this.prisma.notificationPreference.upsert({
      where: { userId: token.userId },
      create: { userId: token.userId, telegramEnabled: true, telegramChatId: chatId },
      update: { telegramEnabled: true, telegramChatId: chatId },
    });
    await this.sendBotMessage(chatId, 'Telegram connected to HBS Trading successfully. You can now receive trading and security alerts.');
    return { ok: true };
  }

  private assertConnectionConfigured(): void {
    if (!this.connectionEnvironmentConfigured()) {
      throw new BadRequestException('Telegram connection is not configured on the server');
    }
  }

  private connectionEnvironmentConfigured(): boolean {
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

  private botUsername(): string {
    const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') ?? '';
    if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) {
      throw new BadRequestException('Telegram bot username is not configured on the server');
    }
    return username;
  }

  private webhookSecretMatches(received: string | undefined): boolean {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!expected || !received) return false;
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);
    return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
  }

  private async configureWebhook(): Promise<void> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN!.trim();
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL!.trim();
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET!.trim();
    if (!/^https:\/\//i.test(webhookUrl) || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
      this.logger.error('Telegram webhook configuration is invalid; HTTPS URL and a Telegram-compatible secret are required');
      return;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: secret,
          allowed_updates: ['message'],
          drop_pending_updates: false,
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        this.logger.error(`Telegram webhook registration returned HTTP ${response.status}`);
        return;
      }
      this.logger.log('Telegram connection webhook registered');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown Telegram provider error';
      this.logger.error(`Telegram webhook registration failed: ${message}`);
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async sendBotMessage(chatId: string, text: string): Promise<void> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!botToken) return;
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) this.logger.warn(`Telegram connection reply returned HTTP ${response.status}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown Telegram provider error';
      this.logger.warn(`Telegram connection reply failed: ${message}`);
    }
  }
}
