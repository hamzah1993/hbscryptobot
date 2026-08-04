export type RateLimitConfiguration = {
  ttlMilliseconds: number;
  maxRequests: number;
};

export const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getGlobalRateLimitConfiguration = (
  environment: NodeJS.ProcessEnv = process.env,
): RateLimitConfiguration => ({
  ttlMilliseconds: parsePositiveInteger(environment.API_RATE_LIMIT_TTL_MS, 60_000),
  maxRequests: parsePositiveInteger(environment.API_RATE_LIMIT_MAX_REQUESTS, 120),
});
