import { Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error';

export interface UniqueFieldMapping {
  fieldSubstring: string;
  errorCode: string;
  errorMessage: string;
}

/**
 * Normalizes Prisma P2002 unique constraint violations into domain-specific AppError.conflict instances.
 * Keeps services decoupled from direct Prisma error checking.
 */
export function translatePrismaUniqueError(
  err: unknown,
  mappings: UniqueFieldMapping[],
  defaultMessage = 'A record with the same unique value already exists'
): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = Array.isArray(err.meta?.target)
      ? err.meta.target.join(',')
      : String(err.meta?.target ?? '');

    for (const mapping of mappings) {
      if (target.includes(mapping.fieldSubstring)) {
        throw AppError.conflict(mapping.errorMessage, mapping.errorCode);
      }
    }

    throw AppError.conflict(defaultMessage);
  }
  throw err;
}
