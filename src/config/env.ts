import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Typed, validated application configuration.
 *
 * Every environment variable the app reads is declared here. The process
 * refuses to start when a value is missing or invalid, so misconfiguration
 * surfaces at boot instead of at the first request that needs it.
 */

if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

const commaList = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Deployment target. Drives the stricter checks below. */
    APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
    PORT: z.coerce.number().int().positive().default(5000),
    HOST: z.string().default('0.0.0.0'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a PostgreSQL connection string'),

    /** Number of reverse proxies in front of the app (needed for correct client IPs). */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    BODY_LIMIT: z.string().default('100kb'),
    API_DOCS_ENABLED: booleanString.optional(),

    /** Origins of the CRM frontend(s), comma separated. */
    CORS_ORIGINS: commaList.default([]),
    /** Origins of the public website(s) allowed to call /api/v1/public/*. */
    PUBLIC_CORS_ORIGINS: commaList.default([]),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z
      .string()
      .regex(/^\d+[smhd]$/, 'JWT_ACCESS_TTL must look like 15m, 1h, 30s or 1d')
      .default('15m'),
    JWT_ISSUER: z.string().default('metro-crm-api'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),

    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60 * 1000),
    /** Requests per window per IP across the whole API. */
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    /** Requests per window per IP for login / token refresh. */
    RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(20),
    /** Submissions per window per IP for public website forms. */
    RATE_LIMIT_PUBLIC_MAX: z.coerce.number().int().positive().default(10),

    CAPTCHA_PROVIDER: z.enum(['none', 'turnstile', 'recaptcha', 'hcaptcha']).default('none'),
    CAPTCHA_SECRET_KEY: z.string().optional(),
    /** reCAPTCHA v3 only: minimum score (0.0 - 1.0) to accept. */
    CAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),
    /** Optional allow-list of hostnames the captcha must have been solved on. */
    CAPTCHA_ALLOWED_HOSTNAMES: commaList.default([]),
    CAPTCHA_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  })
  .superRefine((env, ctx) => {
    if (env.CAPTCHA_PROVIDER !== 'none' && !env.CAPTCHA_SECRET_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['CAPTCHA_SECRET_KEY'],
        message: 'CAPTCHA_SECRET_KEY is required when CAPTCHA_PROVIDER is set',
      });
    }

    if (env.APP_ENV === 'local') return;

    for (const key of ['CORS_ORIGINS', 'PUBLIC_CORS_ORIGINS'] as const) {
      if (env[key].includes('*')) {
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} must not contain "*" outside local` });
      }
    }
    if (env.CORS_ORIGINS.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS is required outside local',
      });
    }
    if (env.APP_ENV === 'production' && env.CAPTCHA_PROVIDER === 'none') {
      ctx.addIssue({
        code: 'custom',
        path: ['CAPTCHA_PROVIDER'],
        message: 'A captcha provider is required in production',
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema> & {
  isProduction: boolean;
  isTest: boolean;
  isLocal: boolean;
  apiDocsEnabled: boolean;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = result.data;
  return Object.freeze({
    ...env,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    isLocal: env.APP_ENV === 'local',
    apiDocsEnabled: env.API_DOCS_ENABLED ?? env.APP_ENV !== 'production',
  });
}

export const config = loadConfig();
