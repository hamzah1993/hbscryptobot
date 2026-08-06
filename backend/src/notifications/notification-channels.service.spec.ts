import { BadRequestException } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { PrismaService } from '../prisma/prisma.service';
import { NotificationChannelsService } from './notification-channels.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

describe('NotificationChannelsService', () => {
  const originalEnvironment = { ...process.env };
  const originalFetch = global.fetch;
  let prisma: any;

  beforeEach(() => {
    process.env = { ...originalEnvironment };
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_SECURE;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    delete process.env.SMTP_FROM;
    global.fetch = jest.fn();
    jest.mocked(nodemailer.createTransport).mockReset();
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'owner@example.com' }) },
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const service = () => new NotificationChannelsService(prisma as PrismaService);

  it('defaults destinations safely with both external channels disabled', async () => {
    const settings = await service().getSettings('user-1');
    expect(settings).toEqual({
      email: { enabled: false, address: 'owner@example.com', minimumSeverity: 'WARNING', providerConfigured: false },
      telegram: { enabled: false, chatId: '', minimumSeverity: 'WARNING', providerConfigured: false },
    });
  });

  it('persists per-user destinations and severity thresholds', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'telegram-token';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_FROM = 'alerts@example.com';
    prisma.notificationPreference.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        emailEnabled: true,
        emailAddress: 'alerts-to@example.com',
        emailMinimumSeverity: 'CRITICAL',
        telegramEnabled: true,
        telegramChatId: '123456',
        telegramMinimumSeverity: 'INFO',
      });

    const result = await service().updateSettings('user-1', {
      email: { enabled: true, address: 'alerts-to@example.com', minimumSeverity: 'CRITICAL' },
      telegram: { enabled: true, chatId: '123456', minimumSeverity: 'INFO' },
    });

    expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1' },
      create: expect.objectContaining({ emailEnabled: true, emailMinimumSeverity: 'CRITICAL', telegramChatId: '123456', telegramMinimumSeverity: 'INFO' }),
    }));
    expect(result.email.providerConfigured).toBe(true);
    expect(result.telegram.providerConfigured).toBe(true);
  });

  it('sends Telegram lifecycle context and respects the configured severity threshold', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'telegram-token';
    prisma.notificationPreference.findUnique.mockResolvedValue({
      emailEnabled: false,
      emailAddress: null,
      emailMinimumSeverity: 'WARNING',
      telegramEnabled: true,
      telegramChatId: '98765',
      telegramMinimumSeverity: 'WARNING',
    });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
    const instance = service();

    await instance.deliver({ id: 'n-info', createdAt: '2026-08-06T10:00:00.000Z', event: 'ENTRY_FILLED', message: 'Entry filled', severity: 'INFO', userId: 'user-1' });
    expect(global.fetch).not.toHaveBeenCalled();

    await instance.deliver({
      id: 'n-warning', createdAt: '2026-08-06T10:01:00.000Z', event: 'DCA_FILLED', message: 'DCA filled', severity: 'WARNING', userId: 'user-1', strategyId: 's-1', positionId: 'p-1', orderId: 'o-1', metadata: { level: 2 },
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bottelegram-token/sendMessage');
    const payload = JSON.parse(String(request.body));
    expect(payload.chat_id).toBe('98765');
    expect(payload.text).toContain('Strategy: s-1');
    expect(payload.text).toContain('Order: o-1');
    expect(payload.text).toContain('"level":2');
  });

  it('uses SMTP for email delivery and keeps provider failures isolated', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_FROM = 'HBS <alerts@example.com>';
    prisma.notificationPreference.findUnique.mockResolvedValue({
      emailEnabled: true,
      emailAddress: 'owner@example.com',
      emailMinimumSeverity: 'INFO',
      telegramEnabled: false,
      telegramChatId: null,
      telegramMinimumSeverity: 'WARNING',
    });
    const sendMail = jest.fn().mockRejectedValue(new Error('SMTP offline'));
    jest.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as any);

    await expect(service().deliver({ id: 'n-1', createdAt: new Date().toISOString(), event: 'CYCLE_COMPLETED', message: 'Cycle complete', severity: 'INFO', userId: 'user-1' })).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.com', subject: expect.stringContaining('Cycle Completed') }));
  });

  it('rejects test delivery until the selected provider is configured', async () => {
    prisma.notificationPreference.findUnique.mockResolvedValue({
      emailEnabled: false,
      emailAddress: null,
      emailMinimumSeverity: 'WARNING',
      telegramEnabled: true,
      telegramChatId: '123',
      telegramMinimumSeverity: 'WARNING',
    });
    await expect(service().sendTest('user-1', 'TELEGRAM')).rejects.toBeInstanceOf(BadRequestException);
  });
});
