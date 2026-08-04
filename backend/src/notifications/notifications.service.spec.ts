import { createHmac } from 'crypto';
import { NotificationsService } from './notifications.service';

type MockResponse = { ok: boolean; status: number };

describe('NotificationsService webhook delivery', () => {
  const originalEnvironment = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    process.env = { ...originalEnvironment };
    delete process.env.NOTIFICATION_WEBHOOK_URL;
    delete process.env.NOTIFICATION_WEBHOOK_SECRET;
    delete process.env.NOTIFICATION_WEBHOOK_MIN_SEVERITY;
    delete process.env.NOTIFICATION_WEBHOOK_MAX_ATTEMPTS;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...originalEnvironment };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('does not call a webhook when no URL is configured', async () => {
    const service = new NotificationsService();

    service.publish({ event: 'TEST_EVENT', message: 'No webhook', severity: 'CRITICAL' });
    await Promise.resolve();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('respects the minimum severity threshold', async () => {
    process.env.NOTIFICATION_WEBHOOK_URL = 'https://example.test/webhook';
    process.env.NOTIFICATION_WEBHOOK_MIN_SEVERITY = 'CRITICAL';
    const service = new NotificationsService();

    service.publish({ event: 'WARNING_EVENT', message: 'Below threshold', severity: 'WARNING' });
    await Promise.resolve();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('signs the exact timestamp and JSON body', async () => {
    process.env.NOTIFICATION_WEBHOOK_URL = 'https://example.test/webhook';
    process.env.NOTIFICATION_WEBHOOK_SECRET = 'top-secret';
    process.env.NOTIFICATION_WEBHOOK_MIN_SEVERITY = 'INFO';
    process.env.NOTIFICATION_WEBHOOK_MAX_ATTEMPTS = '1';
    jest.spyOn(Date, 'now').mockReturnValue(1_750_000_000_000);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 } satisfies MockResponse);
    const service = new NotificationsService();

    service.publish({
      event: 'SIGNED_EVENT',
      message: 'Signed payload',
      severity: 'WARNING',
      userId: 'user-1',
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, request] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const headers = request.headers as Record<string, string>;
    const body = String(request.body);
    const timestamp = headers['x-hbs-webhook-timestamp'];
    const expectedSignature = createHmac('sha256', 'top-secret')
      .update(`${timestamp}.${body}`)
      .digest('hex');

    expect(headers['x-hbs-webhook-signature']).toBe(`sha256=${expectedSignature}`);
    expect(headers['x-hbs-webhook-attempt']).toBe('1');
  });

  it('retries retryable responses and records delivery metrics', async () => {
    process.env.NOTIFICATION_WEBHOOK_URL = 'https://example.test/webhook';
    process.env.NOTIFICATION_WEBHOOK_MAX_ATTEMPTS = '3';
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 500 } satisfies MockResponse)
      .mockResolvedValueOnce({ ok: true, status: 204 } satisfies MockResponse);
    const service = new NotificationsService();

    service.publish({ event: 'RETRY_EVENT', message: 'Retry me', severity: 'CRITICAL' });
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(500);
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(service.getWebhookMetrics()).toMatchObject({
      attempted: 2,
      delivered: 1,
      failed: 0,
      retried: 1,
      lastStatusCode: 204,
    });
  });

  it('does not retry non-retryable client errors', async () => {
    process.env.NOTIFICATION_WEBHOOK_URL = 'https://example.test/webhook';
    process.env.NOTIFICATION_WEBHOOK_MAX_ATTEMPTS = '3';
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 400 } satisfies MockResponse);
    const service = new NotificationsService();

    service.publish({ event: 'CLIENT_ERROR', message: 'Do not retry', severity: 'CRITICAL' });
    await Promise.resolve();
    await jest.runAllTimersAsync();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(service.getWebhookMetrics()).toMatchObject({
      attempted: 1,
      delivered: 0,
      failed: 1,
      retried: 0,
      lastStatusCode: 400,
    });
  });
});
