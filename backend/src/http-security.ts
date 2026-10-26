import type { NextFunction, Request, Response } from 'express';

/**
 * Browser origins allowed to call the API: CORS_ORIGINS (comma-separated),
 * else FRONTEND_URL. With neither set (local development) every origin is allowed.
 */
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] | true {
  const list = (env.CORS_ORIGINS || env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return list.length ? list : true;
}

/** Security headers for a JSON API (the same protections helmet applies by default). */
export function securityHeaders(_request: Request, response: Response, next: NextFunction) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.removeHeader('X-Powered-By');
  next();
}
