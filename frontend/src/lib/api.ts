const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
};

type AuthResponse = {
  user: AuthUser;
  accessToken: string;
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

export const api = {
  register: (payload: { email: string; fullName: string; password: string }) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  me: (token: string) => request<AuthUser>('/users/me', { headers: { Authorization: `Bearer ${token}` } }),
};
