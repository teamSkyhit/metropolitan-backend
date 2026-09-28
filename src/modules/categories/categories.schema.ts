import { z } from 'zod';
import { paginationQuerySchema, sortOrderSchema } from '../../shared/http';

export const CategoriesErrorCode = {
  SLUG_TAKEN: 'CATEGORIES_SLUG_TAKEN',
  SLUG_BELONGS_TO_DELETED_CATEGORY: 'CATEGORIES_SLUG_BELONGS_TO_DELETED_CATEGORY',
  NOT_DELETED: 'CATEGORIES_NOT_DELETED',
} as const;

export type CategoriesErrorCode = (typeof CategoriesErrorCode)[keyof typeof CategoriesErrorCode];

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const mediaUrlSchema = z
  .string()
  .trim()
  .max(500, 'URL cannot exceed 500 characters')
  .refine(
    (val) => /^https?:\/\//.test(val) || val.startsWith('/'),
    'Must be a valid HTTP(S) URL or relative path'
  )
  .nullable()
  .optional();

/** Admin response shape. Never return raw Prisma rows: map them in the service. */
export const categorySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    bannerUrl: z.string().nullable(),
    description: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Category' });

/** Public website DTO: excludes internal audit fields. */
export const publicCategorySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    bannerUrl: z.string().nullable(),
    description: z.string().nullable(),
  })
  .meta({ id: 'PublicCategory' });

export const categorySlugSchema = z
  .string()
  .trim()
  .min(1, 'Slug cannot be empty')
  .max(120, 'Slug cannot exceed 120 characters')
  .regex(slugRegex, 'Slug may only contain lowercase letters, numbers, and hyphens (e.g. category-name)');

export const publicCategorySlugParamsSchema = z.object({
  slug: categorySlugSchema,
});

export const createCategoryBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100, 'Name cannot exceed 100 characters'),
    slug: categorySlugSchema,
    bannerUrl: mediaUrlSchema,
    description: z
      .string()
      .trim()
      .max(2000, 'Description cannot exceed 2000 characters')
      .nullable()
      .optional(),
  })
  .meta({ id: 'CreateCategoryRequest' });

export const updateCategoryBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name cannot be empty')
      .max(100, 'Name cannot exceed 100 characters')
      .optional(),
    slug: categorySlugSchema.optional(),
    bannerUrl: mediaUrlSchema,
    description: z
      .string()
      .trim()
      .max(2000, 'Description cannot exceed 2000 characters')
      .nullable()
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update')
  .meta({ id: 'UpdateCategoryRequest' });

export const listCategoriesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional().meta({ description: 'Matches category name or slug' }),
  sortBy: z.enum(['name', 'slug', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: sortOrderSchema,
});

export type CategoryDto = z.infer<typeof categorySchema>;
export type PublicCategoryDto = z.infer<typeof publicCategorySchema>;
export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>;
export type UpdateCategoryBody = z.infer<typeof updateCategoryBodySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
