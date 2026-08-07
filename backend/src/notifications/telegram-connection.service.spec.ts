import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import type { PrismaService } from '../prisma/prisma.service';
import { TelegramConnectionService } from './telegram-connection.service';

describe('TelegramConnectionService', () => {
  const originalEnvironment = { ...process.env };
  const originalFetch = global.fetch;
  let prisma: any;

  beforeEach(() => {
    process.env = {
      ...originalEnvironment,
      TELEGRAM_BOT_TOKEN: 'bot-token',
      TELEGRAM_BOT_USERNAME: 'HBS_Trading_Alerts_Bot',
      TELEGRAM_WEBHOOK_SECRET: 'telegram_webhook_secret',
      TELEGRAM_WEBHOOK_URL: 'https://api.example.com/api/notifications/telegram/webhook',
    };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    prisma = {
      telegramConnectionToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
      },
      notificationPreference: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const service = () => new TelegramConnectionService(prisma as PrismaService);

  it('creates a short-lived deep link and stores only the token hash', async () => {
    const before = Date.now();
    const result = await service().createConnectionLink('user-1');
    const rawToken = new URL(result.url).searchParams.get('start')!;
    const stored = prisma.telegramConnectionToken.create.mock.calls[0][0].data;

    expect(result.url).toMatch(/^https:\/\/t\.me\/HBS_Trading_Alerts_Bot\?start=/);
    expect(stored.userId).toBe('user-1');
    expect(stored.tokenHash).toBe(createHash('sha256').update(rawToken).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(rawToken);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThanOrEqual(before + 9 * 60 * 1000);
    expect(prisma.telegramConnectionToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1', usedAt: null } }));
  });

  it('registers the secured webhook with Telegram at backend startup', async () => {
    await service().onModuleInit();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/setWebhook',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          url: 'https://api.example.com/api/notifications/telegram/webhook',
          secret_token: 'telegram_webhook_secret',
          allowed_updates: ['message'],
          drop_pending_updates: false,
        }),
      }),
    );
  });

  it('links a private Telegram chat, enables alerts, and consumes the token once', async () => {
    const rawToken = 'abcdefghijklmnopqrstuvwxyzABCDE1234567890abc';
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    prisma.telegramConnectionToken.findUnique.mockResolvedValue({
      id: 'connection-1', userId: 'user-1', tokenHash, usedAt: null, expiresAt: new Date(Date.now() + 60_000),
    });

    await service().processWebhook(
      { message: { text: `/start ${rawToken}`, chat: { id: 123456789, type: 'private' } } },
      'telegram_webhook_secret',
    );

    expect(prisma.telegramConnectionToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'connection-1', usedAt: null }) }));
    expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', telegramEnabled: true, telegramChatId: '123456789' },
      update: { telegramEnabled: true, telegramChatId: '123456789' },
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendMessage',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects requests that do not carry the configured Telegram webhook secret', async () => {
    await expect(service().processWebhook({}, 'wrong-secret')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.telegramConnectionToken.findUnique).not.toHaveBeenCalled();
  });

  it('does not reuse expired or already-used connection links', async () => {
    const rawToken = 'abcdefghijklmnopqrstuvwxyzABCDE1234567890abc';
    prisma.telegramConnectionToken.findUnique.mockResolvedValue({
      id: 'connection-1', userId: 'user-1', usedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    });

    await service().processWebhook(
      { message: { text: `/start ${rawToken}`, chat: { id: 123, type: 'private' } } },
      'telegram_webhook_secret',
    );

    expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled();
  });

  it('refuses to attach a Telegram chat that belongs to another HBS account', async () => {
    const rawToken = 'abcdefghijklmnopqrstuvwxyzABCDE1234567890abc';
    prisma.telegramConnectionToken.findUnique.mockResolvedValue({
      id: 'connection-1', userId: 'user-2', usedAt: null, expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.notificationPreference.findFirst.mockResolvedValue({ userId: 'user-1' });

    await service().processWebhook(
      { message: { text: `/start ${rawToken}`, chat: { id: 123, type: 'private' } } },
      'telegram_webhook_secret',
    );

    expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled();
  });

  it('disconnects Telegram and invalidates outstanding connection links', async () => {
    await service().disconnect('user-1');
    expect(prisma.notificationPreference.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { telegramEnabled: false, telegramChatId: null },
    });
    expect(prisma.telegramConnectionToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1', usedAt: null } }));
  });
});
