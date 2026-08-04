export type AuthRateLimitConfiguration = {
  ttlMilliseconds: number;
  registerMaxRequests: number;
  loginMaxRequests: number;
};

export const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getAuthRateLimitConfiguration = (
  environment: NodeJS.ProcessEnv = process.env,
): AuthRateLimitConfiguration => ({
  ttlMilliseconds: parsePositiveInteger(environment.AUTH_RATE_LIMIT_TTL_MS, 60_000),
  registerMaxRequests: parsePositiveInteger(
    environment.AUTH_REGISTER_RATE_LIMIT_MAX_REQUESTS,
    5,
  ),
  loginMaxRequests: parsePositiveInteger(environment.AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS, 10),
});
