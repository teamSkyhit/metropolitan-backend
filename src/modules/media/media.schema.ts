import { z } from 'zod';
import { paginationQuerySchema, sortOrderSchema } from '../../shared/http';

export const MediaErrorCode = {
  MEDIA_IN_USE: 'MEDIA_IN_USE',
  NOT_FOUND: 'MEDIA_NOT_FOUND',
} as const;

export type MediaErrorCode = (typeof MediaErrorCode)[keyof typeof MediaErrorCode];

/** CRM Media Item DTO for WordPress-style media grid. */
export const mediaSchema = z
  .object({
    id: z.uuid(),
    fileName: z.string(),
    storageKey: z.string(),
    publicUrl: z.string(),
    thumbnailUrl: z.string(),
    mimeType: z.string(),
    fileSize: z.number().int(),
    uploadedById: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Media' });

export const listMediaQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional().meta({ description: 'Search by filename' }),
  q: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .meta({ description: 'Search by filename (alias for search)' }),
  mimeType: z.string().trim().min(1).max(100).optional().meta({ description: 'Filter by MIME type' }),
  sortBy: z.enum(['createdAt', 'fileName', 'fileSize']).default('createdAt'),
  sortOrder: sortOrderSchema.default('desc'),
});

export type MediaDto = z.infer<typeof mediaSchema>;
export type ListMediaQuery = z.infer<typeof listMediaQuerySchema>;
