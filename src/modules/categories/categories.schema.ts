import { z } from 'zod';
import { paginationQuerySchema, sortOrderSchema } from '../../shared/http';
import { iconSchema } from '../../shared/validators/icon';

export const CategoriesErrorCode = {
  NAME_TAKEN: 'CATEGORIES_NAME_TAKEN',
  SLUG_TAKEN: 'CATEGORIES_SLUG_TAKEN',
  NAME_BELONGS_TO_DELETED_CATEGORY: 'CATEGORIES_NAME_BELONGS_TO_DELETED_CATEGORY',
  SLUG_BELONGS_TO_DELETED_CATEGORY: 'CATEGORIES_SLUG_BELONGS_TO_DELETED_CATEGORY',
  NOT_DELETED: 'CATEGORIES_NOT_DELETED',
  INVALID_PARENT: 'CATEGORIES_INVALID_PARENT',
  CIRCULAR_PARENT: 'CATEGORIES_CIRCULAR_PARENT',
  HAS_CHILDREN: 'CATEGORIES_HAS_CHILDREN',
  HAS_PRODUCTS: 'CATEGORIES_HAS_PRODUCTS',
  IMAGE_NOT_FOUND: 'CATEGORY_IMAGE_NOT_FOUND',
  BANNER_NOT_FOUND: 'CATEGORY_BANNER_NOT_FOUND',
  INVALID_ICON: 'INVALID_CATEGORY_ICON',
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
    imageUrl: z.string().nullable().optional(),
    imageMediaId: z.uuid().nullable().optional(),
    bannerUrl: z.string().nullable(),
    bannerMediaId: z.uuid().nullable().optional(),
    icon: z.string().nullable().optional(),
    description: z.string().nullable(),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
    parentId: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Category' });

/** Public website DTO: excludes internal audit fields and sortOrder per current DTO policy. */
export const publicCategorySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    imageUrl: z.string().nullable().optional(),
    bannerUrl: z.string().nullable(),
    icon: z.string().nullable().optional(),
    description: z.string().nullable(),
    parentId: z.uuid().nullable(),
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
    imageUrl: mediaUrlSchema,
    bannerUrl: mediaUrlSchema,
    icon: iconSchema.nullable().optional(),
    description: z
      .string()
      .trim()
      .max(2000, 'Description cannot exceed 2000 characters')
      .nullable()
      .optional(),
    isActive: z.boolean().optional().default(true),
    sortOrder: z
      .number()
      .int('Sort order must be an integer')
      .min(0, 'Sort order cannot be negative')
      .optional()
      .default(0),
    parentId: z.uuid('Parent ID must be a valid UUID').nullable().optional(),
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
    imageUrl: mediaUrlSchema,
    bannerUrl: mediaUrlSchema,
    icon: iconSchema.nullable().optional(),
    description: z
      .string()
      .trim()
      .max(2000, 'Description cannot exceed 2000 characters')
      .nullable()
      .optional(),
    isActive: z.boolean().optional(),
    sortOrder: z
      .number()
      .int('Sort order must be an integer')
      .min(0, 'Sort order cannot be negative')
      .optional(),
    parentId: z.uuid('Parent ID must be a valid UUID').nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update')
  .meta({ id: 'UpdateCategoryRequest' });

export const reorderCategoriesBodySchema = z
  .object({
    categoryIds: z
      .array(z.string().uuid('Each categoryId must be a valid UUID'))
      .min(1, 'Provide at least one category ID to reorder')
      .refine((ids) => new Set(ids).size === ids.length, 'categoryIds must not contain duplicates'),
  })
  .meta({ id: 'ReorderCategoriesRequest' });

export const listCategoriesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional().meta({ description: 'Matches category name or slug' }),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .meta({ description: 'Filter by active status' }),
  parentId: z.uuid().optional().meta({ description: 'Filter by parent category ID' }),
  sortBy: z.enum(['name', 'slug', 'sortOrder', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: sortOrderSchema,
});

export type CategoryDto = z.infer<typeof categorySchema>;
export type PublicCategoryDto = z.infer<typeof publicCategorySchema>;
export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>;
export type UpdateCategoryBody = z.infer<typeof updateCategoryBodySchema>;
export type ReorderCategoriesBody = z.infer<typeof reorderCategoriesBodySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
