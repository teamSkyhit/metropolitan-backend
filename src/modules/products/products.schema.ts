import { z } from 'zod';
import { paginationQuerySchema, sortOrderSchema } from '../../shared/http';

export const ProductsErrorCode = {
  SKU_TAKEN: 'PRODUCTS_SKU_TAKEN',
  SKU_BELONGS_TO_DELETED_PRODUCT: 'PRODUCTS_SKU_BELONGS_TO_DELETED_PRODUCT',
  BRAND_NOT_FOUND: 'PRODUCTS_BRAND_NOT_FOUND',
  BRAND_UNAVAILABLE: 'PRODUCTS_BRAND_UNAVAILABLE',
  CATEGORY_NOT_FOUND: 'PRODUCTS_CATEGORY_NOT_FOUND',
  CATEGORY_UNAVAILABLE: 'PRODUCTS_CATEGORY_UNAVAILABLE',
  NOT_DELETED: 'PRODUCTS_NOT_DELETED',
} as const;

export type ProductsErrorCode = (typeof ProductsErrorCode)[keyof typeof ProductsErrorCode];

export const productStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const productBrandSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
});

export const productCategorySummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
});

export const productSpecificationItemSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Specification key cannot be empty')
    .max(100, 'Specification key cannot exceed 100 characters'),
  value: z
    .string()
    .trim()
    .min(1, 'Specification value cannot be empty')
    .max(500, 'Specification value cannot exceed 500 characters'),
  unit: z.string().trim().max(50, 'Specification unit cannot exceed 50 characters').optional(),
});

export const productSpecificationsSchema = z
  .array(productSpecificationItemSchema)
  .max(100, 'Specifications list cannot exceed 100 items')
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      const lower = item.key.toLowerCase();
      if (seen.has(lower)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate specification key '${item.key}' is not allowed`,
          path: [index, 'key'],
        });
      }
      seen.add(lower);
    });
  });

export const updateProductSpecificationsBodySchema = z
  .object({
    specifications: productSpecificationsSchema,
  })
  .meta({ id: 'UpdateProductSpecificationsRequest' });

/** Admin Product DTO. Raw Prisma model mapped in the service. */
export const productSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    sku: z.string(),
    brandId: z.uuid(),
    categoryId: z.uuid(),
    description: z.string().nullable(),
    price: z.number().nullable(),
    priceVisibility: z.boolean(),
    status: productStatusSchema,
    hotDeal: z.boolean(),
    imageUrl: z.string().nullable(),
    specifications: z.array(productSpecificationItemSchema).nullable(),
    brand: productBrandSummarySchema.optional(),
    category: productCategorySummarySchema.optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Product' });

export const skuRegex = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;

export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

export const productSkuSchema = z
  .string()
  .trim()
  .min(1, 'SKU is required')
  .max(100, 'SKU cannot exceed 100 characters')
  .regex(
    skuRegex,
    'SKU must start with an alphanumeric character and may only contain letters, numbers, hyphens, underscores, dots, and slashes'
  );

export const updateProductSkuSchema = z
  .string()
  .trim()
  .min(1, 'SKU cannot be empty')
  .max(100, 'SKU cannot exceed 100 characters')
  .regex(
    skuRegex,
    'SKU must start with an alphanumeric character and may only contain letters, numbers, hyphens, underscores, dots, and slashes'
  )
  .optional();

export const createProductBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(200, 'Name cannot exceed 200 characters'),
    sku: productSkuSchema,
    brandId: z.uuid('Brand ID must be a valid UUID'),
    categoryId: z.uuid('Category ID must be a valid UUID'),
    description: z
      .string()
      .trim()
      .max(50000, 'Description cannot exceed 50000 characters')
      .nullable()
      .optional(),
    price: z
      .number()
      .min(0, 'Price must be non-negative')
      .max(999_999_999.99, 'Price is too high')
      .nullable()
      .optional(),
    priceVisibility: z.boolean().default(true),
    status: productStatusSchema.default('DRAFT'),
    hotDeal: z.boolean().default(false),
    specifications: productSpecificationsSchema.nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreateProductRequest' });

export const updateProductBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name cannot be empty')
      .max(200, 'Name cannot exceed 200 characters')
      .optional(),
    sku: updateProductSkuSchema,
    brandId: z.uuid('Brand ID must be a valid UUID').optional(),
    categoryId: z.uuid('Category ID must be a valid UUID').optional(),
    description: z
      .string()
      .trim()
      .max(50000, 'Description cannot exceed 50000 characters')
      .nullable()
      .optional(),
    price: z
      .number()
      .min(0, 'Price must be non-negative')
      .max(999_999_999.99, 'Price is too high')
      .nullable()
      .optional(),
    priceVisibility: z.boolean().optional(),
    status: productStatusSchema.optional(),
    hotDeal: z.boolean().optional(),
    specifications: productSpecificationsSchema.nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update')
  .meta({ id: 'UpdateProductRequest' });

export const listProductsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional().meta({ description: 'Matches product name or SKU' }),
  brandId: z.uuid().optional().meta({ description: 'Filter by brand ID' }),
  categoryId: z.uuid().optional().meta({ description: 'Filter by category ID' }),
  hotDeal: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .meta({ description: 'Filter by hot deal status' }),
  status: productStatusSchema.optional().meta({ description: 'Filter by publish status' }),
  sortBy: z.enum(['name', 'sku', 'price', 'status', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: sortOrderSchema,
});

export const publicProductBrandSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable().optional(),
    logoUrl: z.string().nullable().optional(),
    bannerUrl: z.string().nullable().optional(),
  })
  .meta({ id: 'PublicProductBrand' });

export const publicProductCategorySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable().optional(),
    bannerUrl: z.string().nullable().optional(),
  })
  .meta({ id: 'PublicProductCategory' });

/** Public product DTO for website listing and detail views. */
export const publicProductSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    sku: z.string(),
    description: z.string().nullable(),
    price: z.number().nullable(),
    hotDeal: z.boolean(),
    imageUrl: z.string().nullable(),
    specifications: z.array(productSpecificationItemSchema).nullable(),
    brand: publicProductBrandSchema,
    category: publicProductCategorySchema,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'PublicProduct' });

export const publicProductSortSchema = z
  .enum([
    'latest',
    'oldest',
    'name_asc',
    'name_desc',
    'name-asc',
    'name-desc',
    'price_asc',
    'price_desc',
    'price-asc',
    'price-desc',
  ])
  .default('latest')
  .transform((val) => {
    switch (val) {
      case 'oldest':
        return 'oldest';
      case 'name_asc':
      case 'name-asc':
        return 'name_asc';
      case 'name_desc':
      case 'name-desc':
        return 'name_desc';
      case 'price_asc':
      case 'price-asc':
        return 'price_asc';
      case 'price_desc':
      case 'price-desc':
        return 'price_desc';
      case 'latest':
      default:
        return 'latest';
    }
  });

export const listPublicProductsQuerySchema = paginationQuerySchema.extend({
  search: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .meta({ description: 'Search across product name, SKU, brand name, and category name' }),
  brand: z.string().trim().min(1).max(120).optional().meta({ description: 'Filter by brand slug or UUID' }),
  category: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .meta({ description: 'Filter by category slug or UUID' }),
  hotDeal: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .meta({ description: 'Filter by hot deal status' }),
  sort: publicProductSortSchema.meta({
    description: 'Sorting: latest, oldest, name_asc, name_desc, price_asc, price_desc',
  }),
});

export const publicProductSlugParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Product identifier (slug, SKU, or ID) is required')
    .max(120, 'Product identifier cannot exceed 120 characters'),
});

export type ProductDto = z.infer<typeof productSchema>;
export type PublicProductDto = z.infer<typeof publicProductSchema>;
export type PublicProductBrand = z.infer<typeof publicProductBrandSchema>;
export type PublicProductCategory = z.infer<typeof publicProductCategorySchema>;
export type CreateProductBody = z.infer<typeof createProductBodySchema>;
export type UpdateProductBody = z.infer<typeof updateProductBodySchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type ListPublicProductsQuery = z.infer<typeof listPublicProductsQuerySchema>;
export type PublicProductSlugParams = z.infer<typeof publicProductSlugParamsSchema>;
export type ProductSpecificationItem = z.infer<typeof productSpecificationItemSchema>;
export type UpdateProductSpecificationsBody = z.infer<typeof updateProductSpecificationsBodySchema>;
