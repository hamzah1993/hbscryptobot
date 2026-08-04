const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message ?? 'Request failed');
  }

  return response.json() as Promise<T>;
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

export const notificationWebhookMetricsApi = {
  get: (token: string) =>
    request<NotificationWebhookMetrics>('/strategies/notifications/webhook-metrics', {
      headers: authHeaders(token),
    }),
};
