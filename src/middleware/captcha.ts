import type { RequestHandler } from 'express';
import { config } from '../config/env';
import { AppError, ErrorCode } from '../shared/errors';
import { logger } from '../shared/logger';

export const CAPTCHA_HEADER = 'X-Captcha-Token';

const VERIFY_URLS = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
  hcaptcha: 'https://api.hcaptcha.com/siteverify',
} as const;

interface SiteVerifyResponse {
  success: boolean;
  /** reCAPTCHA v3 only */
  score?: number;
  /** reCAPTCHA v3 and Turnstile */
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
}

export interface CaptchaOptions {
  /** Expected action name (reCAPTCHA v3 / Turnstile). Must match what the website sends. */
  action?: string;
}

export async function verifyCaptchaToken(
  token: string,
  remoteIp: string | undefined,
  options: CaptchaOptions = {}
) {
  const provider = config.CAPTCHA_PROVIDER;
  if (provider === 'none') return;

  const form = new URLSearchParams({ secret: config.CAPTCHA_SECRET_KEY ?? '', response: token });
  if (remoteIp) form.set('remoteip', remoteIp);

  let result: SiteVerifyResponse;
  try {
    const response = await fetch(VERIFY_URLS[provider], {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(config.CAPTCHA_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Captcha provider responded with HTTP ${response.status}`);
    result = (await response.json()) as SiteVerifyResponse;
  } catch (err) {
    logger.error({ err, provider }, 'Captcha verification request failed');
    // Fail closed: never accept a submission we could not verify.
    throw AppError.serviceUnavailable(
      'Captcha verification is temporarily unavailable, please retry',
      ErrorCode.CAPTCHA_UNAVAILABLE
    );
  }

  const reject = (reason: string) => {
    logger.warn({ provider, reason, errorCodes: result['error-codes'] }, 'Captcha rejected');
    return AppError.badRequest('Captcha verification failed', ErrorCode.CAPTCHA_FAILED);
  };

  if (!result.success) throw reject('unsuccessful');
  if (provider === 'recaptcha' && (result.score ?? 0) < config.CAPTCHA_MIN_SCORE) throw reject('low-score');
  if (options.action && result.action !== undefined && result.action !== options.action) {
    throw reject('action-mismatch');
  }
  if (
    config.CAPTCHA_ALLOWED_HOSTNAMES.length > 0 &&
    !config.CAPTCHA_ALLOWED_HOSTNAMES.includes(result.hostname ?? '')
  ) {
    throw reject('hostname-mismatch');
  }
}

/**
 * Requires a valid captcha token in the `X-Captcha-Token` header.
 * Provider and secret come from CAPTCHA_PROVIDER / CAPTCHA_SECRET_KEY.
 * With CAPTCHA_PROVIDER=none (local development only) the check is skipped.
 */
export function requireCaptcha(options: CaptchaOptions = {}): RequestHandler {
  return async (req, _res, next) => {
    if (config.CAPTCHA_PROVIDER === 'none') {
      next();
      return;
    }

    const token = req.get(CAPTCHA_HEADER);
    if (!token) {
      throw AppError.badRequest(
        `Captcha token is required in the ${CAPTCHA_HEADER} header`,
        ErrorCode.CAPTCHA_REQUIRED
      );
    }

    await verifyCaptchaToken(token, req.ip, options);
    next();
  };
}
