import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/http';

/** Response shape. Never return raw Prisma rows: map them in the service. */
export const __camel__Schema = z
  .object({
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: '__Module__' });

export const list__Module__QuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional(),
});

export type __Module__Dto = z.infer<typeof __camel__Schema>;
export type List__Module__Query = z.infer<typeof list__Module__QuerySchema>;
