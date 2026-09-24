import cors, { type CorsOptions } from 'cors';
import type { Request } from 'express';
import { config } from '../config/env';

export const PUBLIC_API_PREFIX = '/api/v1/public';

const baseOptions: CorsOptions = {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Captcha-Token'],
  exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
  maxAge: 600,
};

function isAllowed(origin: string, allowList: readonly string[]): boolean {
  // Local development with no list configured: allow everything.
  if (config.isLocal && allowList.length === 0) return true;
  return allowList.includes('*') || allowList.includes(origin);
}

/**
 * Public website endpoints (`/api/v1/public/*`) accept the website origins
 * (and the CRM origins); every other endpoint accepts only the CRM origins.
 * Requests without an Origin header (server-to-server, curl) are not affected by CORS.
 */
export const corsMiddleware = cors((req: Request, callback) => {
  const origin = req.header('Origin');
  const isPublic = req.originalUrl.startsWith(PUBLIC_API_PREFIX);
  const allowList = isPublic ? [...config.PUBLIC_CORS_ORIGINS, ...config.CORS_ORIGINS] : config.CORS_ORIGINS;

  callback(null, { ...baseOptions, origin: origin ? isAllowed(origin, allowList) : false });
});
