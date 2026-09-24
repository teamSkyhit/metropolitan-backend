import type { ErrorRequestHandler, RequestHandler } from 'express';
import { config } from '../config/env';
import { AppError, ErrorCode, normalizeError } from '../shared/errors';
import { logger } from '../shared/logger';

export const notFoundHandler: RequestHandler = (req) => {
  throw new AppError(404, ErrorCode.ROUTE_NOT_FOUND, `Route not found: ${req.method} ${req.path}`);
};

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const appError = normalizeError(err);
  const log = req.log ?? logger;

  if (appError.statusCode >= 500) {
    log.error({ err }, 'Request failed with an unexpected error');
  } else {
    log.debug({ code: appError.code }, appError.message);
  }

  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined && { details: appError.details }),
      requestId: req.id,
      ...(config.NODE_ENV === 'development' &&
        appError.statusCode >= 500 &&
        err instanceof Error && { debug: { message: err.message, stack: err.stack } }),
    },
  });
};
