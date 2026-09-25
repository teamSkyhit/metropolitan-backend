import { z } from 'zod';
import { paginationQuerySchema, sortOrderSchema } from '../../shared/http';

export const BrandsErrorCode = {
  NAME_TAKEN: 'BRANDS_NAME_TAKEN',
  SLUG_TAKEN: 'BRANDS_SLUG_TAKEN',
  NAME_BELONGS_TO_DELETED_BRAND: 'BRANDS_NAME_BELONGS_TO_DELETED_BRAND',
  SLUG_BELONGS_TO_DELETED_BRAND: 'BRANDS_SLUG_BELONGS_TO_DELETED_BRAND',
} as const;

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Response shape. Never return raw Prisma rows: map them in the service. */
export const brandSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    logoUrl: z.string().nullable(),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Brand' });

export const brandsSchema = brandSchema;

export const createBrandBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100, 'Name cannot exceed 100 characters'),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, 'Slug is required')
      .max(120, 'Slug cannot exceed 120 characters')
      .regex(slugRegex, 'Slug may only contain lowercase letters, numbers, and hyphens (e.g. brand-name)'),
    description: z
      .string()
      .trim()
      .max(2000, 'Description cannot exceed 2000 characters')
      .nullable()
      .optional(),
    logoUrl: z
      .string()
      .trim()
      .url('Logo URL must be a valid URL')
      .max(500, 'Logo URL cannot exceed 500 characters')
      .nullable()
      .optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(1_000_000).default(0),
  })
  .meta({ id: 'CreateBrandRequest' });

export const updateBrandBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name cannot be empty')
      .max(100, 'Name cannot exceed 100 characters')
      .optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, 'Slug cannot be empty')
      .max(120, 'Slug cannot exceed 120 characters')
      .regex(slugRegex, 'Slug may only contain lowercase letters, numbers, and hyphens (e.g. brand-name)')
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, 'Description cannot exceed 2000 characters')
      .nullable()
      .optional(),
    logoUrl: z
      .string()
      .trim()
      .url('Logo URL must be a valid URL')
      .max(500, 'Logo URL cannot exceed 500 characters')
      .nullable()
      .optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1_000_000).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update')
  .meta({ id: 'UpdateBrandRequest' });

export const listBrandsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional().meta({ description: 'Matches brand name' }),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .meta({ description: 'Filter by active status' }),
  sortBy: z.enum(['name', 'sortOrder', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: sortOrderSchema,
});

export type BrandDto = z.infer<typeof brandSchema>;
export type BrandsDto = BrandDto;
export type CreateBrandBody = z.infer<typeof createBrandBodySchema>;
export type UpdateBrandBody = z.infer<typeof updateBrandBodySchema>;
export type ListBrandsQuery = z.infer<typeof listBrandsQuerySchema>;
