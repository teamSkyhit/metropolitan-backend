import pino from 'pino';
import { config } from '../config/env';

/**
 * Application logger. Use `req.log` inside request handlers (it carries the
 * request id); use this logger for startup, jobs and other non-request code.
 */
export const logger = pino({
  level: config.isTest ? 'silent' : config.LOG_LEVEL,
  base: { env: config.APP_ENV },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-captcha-token"]',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.passwordHash',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[REDACTED]',
  },
  ...(config.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname,env' },
    },
  }),
});
