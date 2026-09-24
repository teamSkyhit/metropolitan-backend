import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import { config } from '../config/env';
import { AppError } from '../shared/errors';

/**
 * Rate limiters keyed by client IP (set TRUST_PROXY correctly behind a proxy).
 *
 * The store is in-memory, which is correct for a single instance. If the
 * API is ever scaled to several instances, plug a shared store (e.g. Redis)
 * into `createRateLimiter` so limits are enforced across instances.
 */
export function createRateLimiter(options: {
  name: string;
  limit: number;
  windowMs?: number;
}): RateLimitRequestHandler {
  return rateLimit({
    identifier: options.name,
    windowMs: options.windowMs ?? config.RATE_LIMIT_WINDOW_MS,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(AppError.tooManyRequests()),
  });
}

export const rateLimiters = {
  /** Applied to the whole API. */
  global: createRateLimiter({ name: 'global', limit: config.RATE_LIMIT_MAX }),
  /** Login, token refresh and other credential endpoints. */
  auth: createRateLimiter({ name: 'auth', limit: config.RATE_LIMIT_AUTH_MAX }),
  /** Public website form submissions (enquiries, contact, ...). */
  publicForm: createRateLimiter({ name: 'public-form', limit: config.RATE_LIMIT_PUBLIC_MAX }),
};
