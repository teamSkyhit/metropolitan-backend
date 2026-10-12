import { z } from 'zod';
import { paginationQuerySchema, sortOrderSchema } from '../../shared/http';

export const ProductsErrorCode = {
  SKU_TAKEN: 'PRODUCTS_SKU_TAKEN',
  SKU_BELONGS_TO_DELETED_PRODUCT: 'PRODUCTS_SKU_BELONGS_TO_DELETED_PRODUCT',
  SLUG_TAKEN: 'PRODUCTS_SLUG_TAKEN',
  BRAND_NOT_FOUND: 'PRODUCTS_BRAND_NOT_FOUND',
  BRAND_UNAVAILABLE: 'PRODUCTS_BRAND_UNAVAILABLE',
  CATEGORY_NOT_FOUND: 'PRODUCTS_CATEGORY_NOT_FOUND',
  CATEGORY_UNAVAILABLE: 'PRODUCTS_CATEGORY_UNAVAILABLE',
  NOT_DELETED: 'PRODUCTS_NOT_DELETED',
  GALLERY_LIMIT_REACHED: 'PRODUCT_GALLERY_LIMIT_REACHED',
  DOCUMENT_LIMIT_REACHED: 'PRODUCT_DOCUMENT_LIMIT_REACHED',
  VIDEO_LIMIT_REACHED: 'PRODUCT_VIDEO_LIMIT_REACHED',
  PRODUCT_VIDEO_LIMIT_REACHED: 'PRODUCT_VIDEO_LIMIT_REACHED',
  GALLERY_IMAGE_NOT_FOUND: 'PRODUCT_GALLERY_IMAGE_NOT_FOUND',
  DOCUMENT_NOT_FOUND: 'PRODUCT_DOCUMENT_NOT_FOUND',
  VIDEO_NOT_FOUND: 'PRODUCT_VIDEO_NOT_FOUND',
  PRODUCT_VIDEO_NOT_FOUND: 'PRODUCT_VIDEO_NOT_FOUND',
  GALLERY_DUPLICATE_MEDIA: 'PRODUCT_GALLERY_DUPLICATE_MEDIA',
  DOCUMENT_DUPLICATE_MEDIA: 'PRODUCT_DOCUMENT_DUPLICATE_MEDIA',
  VIDEO_DUPLICATE_MEDIA: 'PRODUCT_VIDEO_DUPLICATE_MEDIA',
  INVALID_PDF_FILE: 'INVALID_PDF_FILE',
  PDF_FILE_TOO_LARGE: 'PDF_FILE_TOO_LARGE',
  INVALID_VIDEO_FILE: 'INVALID_VIDEO_FILE',
  VIDEO_FILE_TOO_LARGE: 'VIDEO_FILE_TOO_LARGE',
  FEATURE_NOT_FOUND: 'PRODUCT_FEATURE_NOT_FOUND',
  KEY_BENEFIT_NOT_FOUND: 'PRODUCT_KEY_BENEFIT_NOT_FOUND',
  CANNOT_RELATE_TO_SELF: 'PRODUCT_CANNOT_RELATE_TO_SELF',
  RELATED_PRODUCT_NOT_FOUND: 'PRODUCT_RELATED_PRODUCT_NOT_FOUND',
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

export const productGalleryItemSchema = z.object({
  id: z.uuid(),
  mediaId: z.uuid(),
  publicUrl: z.string(),
  sortOrder: z.number().int(),
  isPrimary: z.boolean(),
});
export type ProductGalleryItem = z.infer<typeof productGalleryItemSchema>;

export const productVideoItemSchema = z.object({
  id: z.uuid(),
  mediaId: z.uuid(),
  title: z.string().nullable().optional(),
  publicUrl: z.string(),
  sortOrder: z.number().int(),
});
export type ProductVideoItem = z.infer<typeof productVideoItemSchema>;

export const productDocumentItemSchema = z.object({
  id: z.uuid(),
  mediaId: z.uuid().optional(),
  title: z.string(),
  publicUrl: z.string(),
  originalFileName: z.string().nullable().optional(),
  sortOrder: z.number().int(),
});
export type ProductDocumentItem = z.infer<typeof productDocumentItemSchema>;

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

// Feature Schemas
export const productFeatureItemSchema = z.object({
  id: z.uuid(),
  icon: z.string().trim().min(1, 'Icon cannot be empty').max(100),
  title: z.string().trim().min(1, 'Title cannot be empty').max(200),
  description: z.string().trim().min(1, 'Description cannot be empty').max(2000),
  sortOrder: z.number().int(),
});
export type ProductFeatureItem = z.infer<typeof productFeatureItemSchema>;

export const createProductFeatureBodySchema = z
  .object({
    icon: z.string().trim().min(1, 'Icon is required').max(100),
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: z.string().trim().min(1, 'Description is required').max(2000),
    sortOrder: z.number().int().optional(),
  })
  .strict()
  .meta({ id: 'CreateProductFeatureRequest' });
export type CreateProductFeatureBody = z.infer<typeof createProductFeatureBodySchema>;

export const updateProductFeatureBodySchema = z
  .object({
    icon: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update')
  .meta({ id: 'UpdateProductFeatureRequest' });
export type UpdateProductFeatureBody = z.infer<typeof updateProductFeatureBodySchema>;

export const reorderProductFeaturesBodySchema = z
  .object({
    featureIds: z.array(z.uuid('Invalid feature ID')).min(1, 'At least one feature ID is required'),
  })
  .strict()
  .meta({ id: 'ReorderProductFeaturesRequest' });
export type ReorderProductFeaturesBody = z.infer<typeof reorderProductFeaturesBodySchema>;

export const productFeatureParamsSchema = z.object({
  id: z.uuid('Product ID must be a valid UUID'),
  featureId: z.uuid('Feature ID must be a valid UUID'),
});
export type ProductFeatureParams = z.infer<typeof productFeatureParamsSchema>;

// Key Benefit Schemas
export const productKeyBenefitItemSchema = z.object({
  id: z.uuid(),
  icon: z.string().trim().min(1, 'Icon cannot be empty').max(100),
  title: z.string().trim().min(1, 'Title cannot be empty').max(200),
  description: z.string().trim().min(1, 'Description cannot be empty').max(2000),
  sortOrder: z.number().int(),
});
export type ProductKeyBenefitItem = z.infer<typeof productKeyBenefitItemSchema>;

export const createProductKeyBenefitBodySchema = z
  .object({
    icon: z.string().trim().min(1, 'Icon is required').max(100),
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: z.string().trim().min(1, 'Description is required').max(2000),
    sortOrder: z.number().int().optional(),
  })
  .strict()
  .meta({ id: 'CreateProductKeyBenefitRequest' });
export type CreateProductKeyBenefitBody = z.infer<typeof createProductKeyBenefitBodySchema>;

export const updateProductKeyBenefitBodySchema = z
  .object({
    icon: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update')
  .meta({ id: 'UpdateProductKeyBenefitRequest' });
export type UpdateProductKeyBenefitBody = z.infer<typeof updateProductKeyBenefitBodySchema>;

export const reorderProductKeyBenefitsBodySchema = z
  .object({
    benefitIds: z.array(z.uuid('Invalid benefit ID')).min(1, 'At least one benefit ID is required'),
  })
  .strict()
  .meta({ id: 'ReorderProductKeyBenefitsRequest' });
export type ReorderProductKeyBenefitsBody = z.infer<typeof reorderProductKeyBenefitsBodySchema>;

export const productKeyBenefitParamsSchema = z.object({
  id: z.uuid('Product ID must be a valid UUID'),
  benefitId: z.uuid('Benefit ID must be a valid UUID'),
});
export type ProductKeyBenefitParams = z.infer<typeof productKeyBenefitParamsSchema>;

// Related Product Schemas
export const relatedProductSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  sku: z.string(),
  imageUrl: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  priceVisibility: z.boolean().default(true),
});
export type RelatedProductSummary = z.infer<typeof relatedProductSummarySchema>;

export const setRelatedProductsBodySchema = z
  .object({
    relatedProductIds: z
      .array(z.uuid('Invalid related product ID'))
      .max(20, 'Cannot exceed 20 related products'),
  })
  .strict()
  .meta({ id: 'SetRelatedProductsRequest' });
export type SetRelatedProductsBody = z.infer<typeof setRelatedProductsBodySchema>;

// SEO Schemas
export const productSeoSchema = z.object({
  metaTitle: z.string().nullable().optional(),
  metaDescription: z.string().nullable().optional(),
  metaKeywords: z.string().nullable().optional(),
  canonicalUrl: z.string().nullable().optional(),
  ogImageUrl: z.string().nullable().optional(),
});
export type ProductSeo = z.infer<typeof productSeoSchema>;

/** Admin Product DTO. Raw Prisma model mapped in the service. */
export const productSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    sku: z.string(),
    brandId: z.uuid(),
    categoryId: z.uuid(),
    shortDescription: z.string().nullable().optional(),
    description: z.string().nullable(),
    overview: z.string().nullable().optional(),
    series: z.string().nullable().optional(),
    price: z.number().nullable(),
    priceVisibility: z.boolean(),
    status: productStatusSchema,
    hotDeal: z.boolean(),
    imageUrl: z.string().nullable(),
    metaTitle: z.string().nullable().optional(),
    metaDescription: z.string().nullable().optional(),
    metaKeywords: z.string().nullable().optional(),
    canonicalUrl: z.string().nullable().optional(),
    ogImageUrl: z.string().nullable().optional(),
    gallery: z.array(productGalleryItemSchema).default([]),
    videos: z.array(productVideoItemSchema).default([]),
    documents: z.array(productDocumentItemSchema).default([]),
    specifications: z.array(productSpecificationItemSchema).nullable(),
    features: z.array(productFeatureItemSchema).default([]),
    keyBenefits: z.array(productKeyBenefitItemSchema).default([]),
    relatedProducts: z.array(relatedProductSummarySchema).default([]),
    seo: productSeoSchema.optional(),
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
    shortDescription: z
      .string()
      .trim()
      .max(500, 'Short description cannot exceed 500 characters')
      .nullable()
      .optional(),
    description: z
      .string()
      .trim()
      .max(50000, 'Description cannot exceed 50000 characters')
      .nullable()
      .optional(),
    overview: z.string().trim().max(50000, 'Overview cannot exceed 50000 characters').nullable().optional(),
    series: z.string().trim().max(100, 'Series cannot exceed 100 characters').nullable().optional(),
    price: z
      .number()
      .min(0, 'Price must be non-negative')
      .max(999_999_999.99, 'Price is too high')
      .nullable()
      .optional(),
    priceVisibility: z.boolean().default(true),
    status: productStatusSchema.default('DRAFT'),
    hotDeal: z.boolean().default(false),
    metaTitle: z.string().trim().max(200, 'Meta title cannot exceed 200 characters').nullable().optional(),
    metaDescription: z
      .string()
      .trim()
      .max(500, 'Meta description cannot exceed 500 characters')
      .nullable()
      .optional(),
    metaKeywords: z
      .string()
      .trim()
      .max(500, 'Meta keywords cannot exceed 500 characters')
      .nullable()
      .optional(),
    canonicalUrl: z
      .string()
      .trim()
      .url('Canonical URL must be a valid URL')
      .max(500, 'Canonical URL cannot exceed 500 characters')
      .nullable()
      .optional(),
    ogImageUrl: z.string().trim().max(500, 'OG image URL cannot exceed 500 characters').nullable().optional(),
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
    shortDescription: z
      .string()
      .trim()
      .max(500, 'Short description cannot exceed 500 characters')
      .nullable()
      .optional(),
    description: z
      .string()
      .trim()
      .max(50000, 'Description cannot exceed 50000 characters')
      .nullable()
      .optional(),
    overview: z.string().trim().max(50000, 'Overview cannot exceed 50000 characters').nullable().optional(),
    series: z.string().trim().max(100, 'Series cannot exceed 100 characters').nullable().optional(),
    price: z
      .number()
      .min(0, 'Price must be non-negative')
      .max(999_999_999.99, 'Price is too high')
      .nullable()
      .optional(),
    priceVisibility: z.boolean().optional(),
    status: productStatusSchema.optional(),
    hotDeal: z.boolean().optional(),
    metaTitle: z.string().trim().max(200, 'Meta title cannot exceed 200 characters').nullable().optional(),
    metaDescription: z
      .string()
      .trim()
      .max(500, 'Meta description cannot exceed 500 characters')
      .nullable()
      .optional(),
    metaKeywords: z
      .string()
      .trim()
      .max(500, 'Meta keywords cannot exceed 500 characters')
      .nullable()
      .optional(),
    canonicalUrl: z
      .string()
      .trim()
      .url('Canonical URL must be a valid URL')
      .max(500, 'Canonical URL cannot exceed 500 characters')
      .nullable()
      .optional(),
    ogImageUrl: z.string().trim().max(500, 'OG image URL cannot exceed 500 characters').nullable().optional(),
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
    imageUrl: z.string().nullable().optional(),
    bannerUrl: z.string().nullable().optional(),
  })
  .meta({ id: 'PublicProductCategory' });

export const publicProductGalleryItemSchema = z.object({
  id: z.uuid(),
  publicUrl: z.string(),
  sortOrder: z.number().int(),
  isPrimary: z.boolean(),
});
export type PublicProductGalleryItem = z.infer<typeof publicProductGalleryItemSchema>;

export const publicProductVideoItemSchema = z.object({
  id: z.uuid(),
  title: z.string().nullable().optional(),
  publicUrl: z.string(),
  sortOrder: z.number().int(),
});
export type PublicProductVideoItem = z.infer<typeof publicProductVideoItemSchema>;

export const publicProductDocumentItemSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  publicUrl: z.string(),
  originalFileName: z.string().nullable().optional(),
  sortOrder: z.number().int(),
});
export type PublicProductDocumentItem = z.infer<typeof publicProductDocumentItemSchema>;

export const publicRelatedProductItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  sku: z.string(),
  imageUrl: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  priceVisibility: z.string().or(z.boolean()).optional(),
});
export type PublicRelatedProductItem = z.infer<typeof publicRelatedProductItemSchema>;

/** Public product DTO for website listing and detail views. */
export const publicProductSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    sku: z.string(),
    shortDescription: z.string().nullable().optional(),
    description: z.string().nullable(),
    overview: z.string().nullable().optional(),
    series: z.string().nullable().optional(),
    price: z.number().nullable(),
    priceVisibility: z.string().or(z.boolean()).optional(),
    hotDeal: z.boolean(),
    imageUrl: z.string().nullable(),
    gallery: z.array(publicProductGalleryItemSchema).default([]),
    videos: z.array(publicProductVideoItemSchema).default([]),
    documents: z.array(publicProductDocumentItemSchema).default([]),
    specifications: z.array(productSpecificationItemSchema).nullable().optional(),
    features: z.array(productFeatureItemSchema).default([]),
    keyBenefits: z.array(productKeyBenefitItemSchema).default([]),
    brand: publicProductBrandSchema,
    category: publicProductCategorySchema,
    relatedProducts: z.array(relatedProductSummarySchema).default([]),
    seo: productSeoSchema.optional(),
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

export const reorderProductGalleryBodySchema = z
  .object({
    imageIds: z
      .array(z.uuid('Invalid image ID format'))
      .min(1, 'At least one image ID is required')
      .max(5, 'Cannot exceed 5 gallery images'),
  })
  .meta({ id: 'ReorderProductGalleryRequest' });

export const updateProductDocumentBodySchema = z
  .object({
    title: z.string().trim().min(1, 'Title cannot be empty').max(200, 'Title cannot exceed 200 characters'),
  })
  .meta({ id: 'UpdateProductDocumentRequest' });

export const uploadProductDocumentBodySchema = z
  .object({
    title: z.string().trim().max(200, 'Title cannot exceed 200 characters').optional(),
  })
  .optional();

export const reorderProductDocumentsBodySchema = z
  .object({
    documentIds: z
      .array(z.uuid('Invalid document ID format'))
      .min(1, 'At least one document ID is required')
      .max(3, 'Cannot exceed 3 documents'),
  })
  .meta({ id: 'ReorderProductDocumentsRequest' });

export const productGalleryParamsSchema = z.object({
  id: z.uuid('Product ID must be a valid UUID'),
  galleryImageId: z.uuid('Gallery image ID must be a valid UUID'),
});

export const productDocumentParamsSchema = z.object({
  id: z.uuid('Product ID must be a valid UUID'),
  documentId: z.uuid('Document ID must be a valid UUID'),
});

export const productVideoParamsSchema = z.object({
  id: z.uuid('Product ID must be a valid UUID'),
  videoId: z.uuid('Video ID must be a valid UUID'),
});

export const updateProductVideoBodySchema = z
  .object({
    title: z.string().trim().max(200, 'Title cannot exceed 200 characters').nullable().optional(),
  })
  .meta({ id: 'UpdateProductVideoRequest' });

export const uploadProductVideoBodySchema = z
  .object({
    title: z.string().trim().max(200, 'Title cannot exceed 200 characters').optional(),
  })
  .optional();

export const reorderProductVideosBodySchema = z
  .object({
    videoIds: z
      .array(z.uuid('Invalid video ID format'))
      .min(1, 'At least one video ID is required')
      .max(2, 'Cannot exceed 2 videos'),
  })
  .meta({ id: 'ReorderProductVideosRequest' });

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
export type ReorderProductGalleryBody = z.infer<typeof reorderProductGalleryBodySchema>;
export type UpdateProductDocumentBody = z.infer<typeof updateProductDocumentBodySchema>;
export type ReorderProductDocumentsBody = z.infer<typeof reorderProductDocumentsBodySchema>;
export type UpdateProductVideoBody = z.infer<typeof updateProductVideoBodySchema>;
export type ReorderProductVideosBody = z.infer<typeof reorderProductVideosBodySchema>;
export type ProductGalleryParams = z.infer<typeof productGalleryParamsSchema>;
export type ProductDocumentParams = z.infer<typeof productDocumentParamsSchema>;
export type ProductVideoParams = z.infer<typeof productVideoParamsSchema>;
