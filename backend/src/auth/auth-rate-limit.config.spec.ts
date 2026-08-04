import {
  getAuthRateLimitConfiguration,
  parsePositiveInteger,
} from './auth-rate-limit.config';

describe('authentication rate limit configuration', () => {
  it('uses the documented default values', () => {
    expect(getAuthRateLimitConfiguration({})).toEqual({
      ttlMilliseconds: 60_000,
      registerMaxRequests: 5,
      loginMaxRequests: 10,
    });
  });

  it('uses positive environment overrides', () => {
    expect(
      getAuthRateLimitConfiguration({
        AUTH_RATE_LIMIT_TTL_MS: '30000',
        AUTH_REGISTER_RATE_LIMIT_MAX_REQUESTS: '3',
        AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS: '7',
      }),
    ).toEqual({
      ttlMilliseconds: 30_000,
      registerMaxRequests: 3,
      loginMaxRequests: 7,
    });
  });

  it.each([undefined, '', '0', '-1', 'invalid'])(
    'falls back for invalid positive integer input: %p',
    (value) => {
      expect(parsePositiveInteger(value, 42)).toBe(42);
    },
  );
});
