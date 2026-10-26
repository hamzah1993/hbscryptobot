import { allowedOrigins, securityHeaders } from './http-security';

describe('HTTP security', () => {
  it('limits CORS to the configured frontend origins', () => {
    expect(allowedOrigins({ CORS_ORIGINS: 'https://app.example.com/, https://www.example.com' } as any))
      .toEqual(['https://app.example.com', 'https://www.example.com']);
    expect(allowedOrigins({ FRONTEND_URL: 'https://app.example.com' } as any)).toEqual(['https://app.example.com']);
    expect(allowedOrigins({} as any)).toBe(true);
  });

  it('sets the standard security headers', () => {
    const headers: Record<string, string> = {};
    const response = { setHeader: (name: string, value: string) => { headers[name] = value; }, removeHeader: jest.fn() } as any;
    const next = jest.fn();
    securityHeaders({} as any, response, next);
    expect(headers).toMatchObject({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
    expect(response.removeHeader).toHaveBeenCalledWith('X-Powered-By');
    expect(next).toHaveBeenCalled();
  });
});
