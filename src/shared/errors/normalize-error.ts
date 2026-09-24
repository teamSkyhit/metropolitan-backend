import { Prisma } from '@prisma/client';
import { ZodError, type z } from 'zod';
import { AppError } from './app-error';
import { ErrorCode } from './error-codes';

export interface FieldIssue {
  field: string;
  message: string;
  code: string;
}

export function formatZodIssues(issues: z.core.$ZodIssue[]): FieldIssue[] {
  return issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/** Errors raised by Express' body parser carry a `type` and an HTTP status. */
interface HttpParserError extends Error {
  type?: string;
  status?: number;
  statusCode?: number;
  expose?: boolean;
}

function fromParserError(err: HttpParserError): AppError | null {
  switch (err.type) {
    case 'entity.parse.failed':
      return AppError.badRequest('Request body contains malformed JSON', ErrorCode.MALFORMED_JSON);
    case 'entity.too.large':
      return new AppError(413, ErrorCode.PAYLOAD_TOO_LARGE, 'Request body is too large');
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return new AppError(415, ErrorCode.UNSUPPORTED_MEDIA_TYPE, 'Unsupported request encoding');
  }

  const status = err.status ?? err.statusCode;
  if (err.expose && status && status >= 400 && status < 500) {
    return new AppError(status, ErrorCode.BAD_REQUEST, err.message);
  }
  return null;
}

function fromPrismaError(err: unknown): AppError | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return AppError.conflict('A record with the same unique value already exists', ErrorCode.CONFLICT, {
          fields: err.meta?.target,
        });
      case 'P2025':
        return AppError.notFound('Record');
      case 'P2003':
        return AppError.badRequest('A referenced record does not exist', ErrorCode.BAD_REQUEST, {
          field: err.meta?.field_name,
        });
      case 'P2000':
        return AppError.badRequest('A value is too long for its field', ErrorCode.VALIDATION_ERROR, {
          field: err.meta?.column_name,
        });
      case 'P1001':
      case 'P1002':
      case 'P1017':
        return AppError.serviceUnavailable('Database is unavailable');
    }
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return AppError.serviceUnavailable('Database is unavailable');
  }
  return null;
}

/**
 * Converts anything thrown inside a request into an AppError.
 * Unknown errors become a generic 500 so internals never leak to clients.
 */
export function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return AppError.validation(formatZodIssues(err.issues));

  const prismaError = fromPrismaError(err);
  if (prismaError) return prismaError;

  if (err instanceof Error) {
    const parserError = fromParserError(err as HttpParserError);
    if (parserError) return parserError;
  }

  return AppError.internal(undefined, err);
}
