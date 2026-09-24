import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;

/** Merge into any list endpoint's query schema: `listQuerySchema = paginationQuerySchema.extend({...})`. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1).meta({ description: 'Page number (1-based)' }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(20)
    .meta({ description: `Page size (max ${MAX_PAGE_SIZE})` }),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}

export function toSkipTake({ page, limit }: PaginationQuery): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}

export function buildPaginationMeta({ page, limit }: PaginationQuery, total: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

/** `from` / `to` calendar dates (YYYY-MM-DD, interpreted in UTC, both inclusive). */
export const dateRangeFields = {
  from: z.iso.date().optional().meta({ description: 'Start date (YYYY-MM-DD, UTC, inclusive)' }),
  to: z.iso.date().optional().meta({ description: 'End date (YYYY-MM-DD, UTC, inclusive)' }),
};

/**
 * Adds the `from <= to` check to any object schema containing `dateRangeFields`.
 * Apply it last: `withDateRangeCheck(paginationQuerySchema.extend({ ...dateRangeFields, ... }))`.
 */
export function withDateRangeCheck<T extends z.ZodType<{ from?: string; to?: string }>>(schema: T): T {
  return schema.refine((range) => !range.from || !range.to || range.from <= range.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });
}

export const dateRangeQuerySchema = withDateRangeCheck(z.object(dateRangeFields));

export function toDateRangeFilter(range: {
  from?: string;
  to?: string;
}): { gte?: Date; lte?: Date } | undefined {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from && { gte: new Date(`${range.from}T00:00:00.000Z`) }),
    ...(range.to && { lte: new Date(`${range.to}T23:59:59.999Z`) }),
  };
}

export const idParamsSchema = z.object({
  id: z.uuid().meta({ description: 'Resource id (UUID)' }),
});
