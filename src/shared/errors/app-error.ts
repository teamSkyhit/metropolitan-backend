import { ErrorCode } from './error-codes';

/**
 * The only error type services should throw for expected failures.
 * Anything else reaching the error handler is treated as a bug (HTTP 500)
 * and its message is never sent to the client.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, code: string = ErrorCode.BAD_REQUEST, details?: unknown) {
    return new AppError(400, code, message, details);
  }

  static validation(details: unknown, message = 'Request validation failed') {
    return new AppError(400, ErrorCode.VALIDATION_ERROR, message, details);
  }

  static unauthorized(message = 'Authentication required', code: string = ErrorCode.UNAUTHENTICATED) {
    return new AppError(401, code, message);
  }

  static forbidden(
    message = 'You do not have permission to perform this action',
    code: string = ErrorCode.FORBIDDEN
  ) {
    return new AppError(403, code, message);
  }

  static notFound(resource = 'Resource', code: string = ErrorCode.NOT_FOUND) {
    return new AppError(404, code, `${resource} not found`);
  }

  static conflict(message: string, code: string = ErrorCode.CONFLICT, details?: unknown) {
    return new AppError(409, code, message, details);
  }

  static tooManyRequests(message = 'Too many requests, please try again later') {
    return new AppError(429, ErrorCode.RATE_LIMITED, message);
  }

  static serviceUnavailable(
    message = 'Service temporarily unavailable',
    code: string = ErrorCode.SERVICE_UNAVAILABLE,
    details?: unknown
  ) {
    return new AppError(503, code, message, details);
  }

  static internal(message = 'An unexpected error occurred', cause?: unknown) {
    return new AppError(500, ErrorCode.INTERNAL_ERROR, message, undefined, { cause });
  }
}
