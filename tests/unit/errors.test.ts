import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, normalizeError } from '../../src/shared/errors';

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test', meta });
}

describe('normalizeError', () => {
  it('passes AppError through unchanged', () => {
    const err = AppError.notFound('Enquiry');

    expect(normalizeError(err)).toBe(err);
    expect(err.message).toBe('Enquiry not found');
  });

  it('turns ZodError into a 400 with field details', () => {
    const result = z.object({ email: z.email() }).safeParse({ email: 'nope' });
    const err = normalizeError(result.error);

    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual([expect.objectContaining({ field: 'email' })]);
  });

  it.each([
    ['P2002', 409, 'CONFLICT'],
    ['P2025', 404, 'NOT_FOUND'],
    ['P2003', 400, 'BAD_REQUEST'],
    ['P2000', 400, 'VALIDATION_ERROR'],
    ['P1001', 503, 'SERVICE_UNAVAILABLE'],
  ])('maps Prisma %s to HTTP %i %s', (code, status, errorCode) => {
    const err = normalizeError(prismaError(code));

    expect(err.statusCode).toBe(status);
    expect(err.code).toBe(errorCode);
  });

  it('hides the message of unknown errors', () => {
    const err = normalizeError(new Error('password=hunter2 leaked in SQL'));

    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.message).not.toContain('hunter2');
  });
});
