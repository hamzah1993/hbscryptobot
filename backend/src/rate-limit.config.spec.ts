import {
  getGlobalRateLimitConfiguration,
  parsePositiveInteger,
} from './rate-limit.config';

describe('global API rate limit configuration', () => {
  it('uses the documented default values', () => {
    expect(getGlobalRateLimitConfiguration({})).toEqual({
      ttlMilliseconds: 60_000,
      maxRequests: 120,
    });
  });

  it('uses positive environment overrides', () => {
    expect(
      getGlobalRateLimitConfiguration({
        API_RATE_LIMIT_TTL_MS: '30000',
        API_RATE_LIMIT_MAX_REQUESTS: '75',
      }),
    ).toEqual({
      ttlMilliseconds: 30_000,
      maxRequests: 75,
    });
  });

  it.each([undefined, '', '0', '-1', 'invalid'])(
    'falls back for invalid positive integer input: %p',
    (value) => {
      expect(parsePositiveInteger(value, 42)).toBe(42);
    },
  );
});
