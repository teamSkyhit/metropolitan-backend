import { z } from 'zod';
import { idParamsSchema } from '../../shared/http';

export const HomepageSectionType = {
  HERO: 'HERO',
  FEATURED_PRODUCTS: 'FEATURED_PRODUCTS',
  FEATURED_CATEGORIES: 'FEATURED_CATEGORIES',
  FEATURED_BRANDS: 'FEATURED_BRANDS',
  PROMO_BANNER: 'PROMO_BANNER',
} as const;

export type HomepageSectionType = (typeof HomepageSectionType)[keyof typeof HomepageSectionType];

export const HOMEPAGE_SECTION_TYPES = [
  HomepageSectionType.HERO,
  HomepageSectionType.FEATURED_PRODUCTS,
  HomepageSectionType.FEATURED_CATEGORIES,
  HomepageSectionType.FEATURED_BRANDS,
  HomepageSectionType.PROMO_BANNER,
] as const;

export const SINGLE_INSTANCE_SECTION_TYPES = new Set<HomepageSectionType>([
  HomepageSectionType.HERO,
  HomepageSectionType.FEATURED_PRODUCTS,
  HomepageSectionType.FEATURED_CATEGORIES,
  HomepageSectionType.FEATURED_BRANDS,
]);

export const HomepageErrorCode = {
  SECTION_NOT_FOUND: 'HOMEPAGE_SECTION_NOT_FOUND',
  SECTION_TYPE_INVALID: 'HOMEPAGE_SECTION_TYPE_INVALID',
  SECTION_DUPLICATE: 'HOMEPAGE_SECTION_DUPLICATE',
  REFERENCE_INVALID: 'HOMEPAGE_REFERENCE_INVALID',
  REORDER_INVALID: 'HOMEPAGE_REORDER_INVALID',
  TYPE_IMMUTABLE: 'HOMEPAGE_TYPE_IMMUTABLE',
} as const;

/** Safe CTA URL validator: allows relative paths starting with / or http/https URLs. */
export const ctaUrlSchema = z
  .string()
  .trim()
  .max(500, 'CTA URL cannot exceed 500 characters')
  .refine(
    (url) => {
      if (url.startsWith('/')) {
        return !url.startsWith('//') && !/\s/.test(url);
      }
      try {
        const parsed = new URL(url);
        return (
          parsed.protocol === 'https:' ||
          (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:')
        );
      } catch {
        return false;
      }
    },
    {
      message: 'CTA URL must be a valid relative path (e.g. /products) or a secure HTTP/HTTPS URL',
    }
  );

// --- Section-specific content schemas ---

export const heroSlideSchema = z
  .object({
    id: z.string().uuid().optional(),
    heading: z.string().trim().min(1, 'Heading is required').max(200, 'Heading cannot exceed 200 characters'),
    subheading: z.string().trim().max(500, 'Subheading cannot exceed 500 characters').optional().nullable(),
    mediaId: z.string().uuid('mediaId must be a valid UUID'),
    ctaLabel: z.string().trim().max(100, 'CTA label cannot exceed 100 characters').optional().nullable(),
    ctaUrl: ctaUrlSchema.optional().nullable(),
    sortOrder: z.number().int().min(0).max(100).default(0),
    isActive: z.boolean().default(true),
  })
  .strict();

export type HeroSlide = z.infer<typeof heroSlideSchema>;

export const heroContentSchema = z
  .object({
    slides: z
      .array(heroSlideSchema)
      .min(1, 'Hero section must contain at least 1 slide')
      .max(10, 'Hero section cannot exceed 10 slides'),
  })
  .strict();

export type HeroContent = z.infer<typeof heroContentSchema>;

export const featuredProductsContentSchema = z
  .object({
    productIds: z
      .array(z.string().uuid('Each productId must be a valid UUID'))
      .min(1, 'Featured products section must specify at least 1 product')
      .max(20, 'Featured products section cannot exceed 20 products')
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'productIds list cannot contain duplicates',
      }),
  })
  .strict();

export type FeaturedProductsContent = z.infer<typeof featuredProductsContentSchema>;

export const featuredCategoriesContentSchema = z
  .object({
    categoryIds: z
      .array(z.string().uuid('Each categoryId must be a valid UUID'))
      .min(1, 'Featured categories section must specify at least 1 category')
      .max(20, 'Featured categories section cannot exceed 20 categories')
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'categoryIds list cannot contain duplicates',
      }),
  })
  .strict();

export type FeaturedCategoriesContent = z.infer<typeof featuredCategoriesContentSchema>;

export const featuredBrandsContentSchema = z
  .object({
    brandIds: z
      .array(z.string().uuid('Each brandId must be a valid UUID'))
      .min(1, 'Featured brands section must specify at least 1 brand')
      .max(20, 'Featured brands section cannot exceed 20 brands')
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'brandIds list cannot contain duplicates',
      }),
  })
  .strict();

export type FeaturedBrandsContent = z.infer<typeof featuredBrandsContentSchema>;

export const promoBannerContentSchema = z
  .object({
    heading: z.string().trim().min(1, 'Heading is required').max(200, 'Heading cannot exceed 200 characters'),
    description: z.string().trim().max(500, 'Description cannot exceed 500 characters').optional().nullable(),
    mediaId: z.string().uuid('mediaId must be a valid UUID'),
    ctaLabel: z.string().trim().max(100, 'CTA label cannot exceed 100 characters').optional().nullable(),
    ctaUrl: ctaUrlSchema.optional().nullable(),
  })
  .strict();

export type PromoBannerContent = z.infer<typeof promoBannerContentSchema>;

export function getContentSchemaForType(type: HomepageSectionType): z.ZodTypeAny {
  switch (type) {
    case HomepageSectionType.HERO:
      return heroContentSchema;
    case HomepageSectionType.FEATURED_PRODUCTS:
      return featuredProductsContentSchema;
    case HomepageSectionType.FEATURED_CATEGORIES:
      return featuredCategoriesContentSchema;
    case HomepageSectionType.FEATURED_BRANDS:
      return featuredBrandsContentSchema;
    case HomepageSectionType.PROMO_BANNER:
      return promoBannerContentSchema;
    default:
      throw new Error(`Unsupported homepage section type: ${type}`);
  }
}

// --- Create & Update Schemas ---

const baseSectionFields = {
  title: z.string().trim().max(200, 'Title cannot exceed 200 characters').optional().nullable(),
  subtitle: z.string().trim().max(500, 'Subtitle cannot exceed 500 characters').optional().nullable(),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  isActive: z.boolean().default(true),
};

export const createHeroSectionSchema = z
  .object({
    type: z.literal(HomepageSectionType.HERO),
    ...baseSectionFields,
    content: heroContentSchema,
  })
  .strict();

export const createFeaturedProductsSectionSchema = z
  .object({
    type: z.literal(HomepageSectionType.FEATURED_PRODUCTS),
    ...baseSectionFields,
    content: featuredProductsContentSchema,
  })
  .strict();

export const createFeaturedCategoriesSectionSchema = z
  .object({
    type: z.literal(HomepageSectionType.FEATURED_CATEGORIES),
    ...baseSectionFields,
    content: featuredCategoriesContentSchema,
  })
  .strict();

export const createFeaturedBrandsSectionSchema = z
  .object({
    type: z.literal(HomepageSectionType.FEATURED_BRANDS),
    ...baseSectionFields,
    content: featuredBrandsContentSchema,
  })
  .strict();

export const createPromoBannerSectionSchema = z
  .object({
    type: z.literal(HomepageSectionType.PROMO_BANNER),
    ...baseSectionFields,
    content: promoBannerContentSchema,
  })
  .strict();

export const createHomepageSectionBodySchema = z.discriminatedUnion('type', [
  createHeroSectionSchema,
  createFeaturedProductsSectionSchema,
  createFeaturedCategoriesSectionSchema,
  createFeaturedBrandsSectionSchema,
  createPromoBannerSectionSchema,
]);

export type CreateHomepageSectionBody = z.infer<typeof createHomepageSectionBodySchema>;

export const updateHomepageSectionBodySchema = z
  .object({
    title: z.string().trim().max(200, 'Title cannot exceed 200 characters').optional().nullable(),
    subtitle: z.string().trim().max(500, 'Subtitle cannot exceed 500 characters').optional().nullable(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
    isActive: z.boolean().optional(),
    content: z.unknown().optional(),
  })
  .strict();

export type UpdateHomepageSectionBody = z.infer<typeof updateHomepageSectionBodySchema>;

export const reorderItemSchema = z
  .object({
    id: z.string().uuid('Each item id must be a valid UUID'),
    sortOrder: z.number().int().min(0).max(10000),
  })
  .strict();

export const reorderHomepageSectionsBodySchema = z
  .object({
    items: z
      .array(reorderItemSchema)
      .min(1, 'items array must contain at least 1 item')
      .max(50, 'items array cannot exceed 50 items')
      .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
        message: 'items array cannot contain duplicate section IDs',
      }),
  })
  .strict();

export type ReorderHomepageSectionsBody = z.infer<typeof reorderHomepageSectionsBodySchema>;

// --- DTO Schemas ---

export const homepageSectionDtoSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(HOMEPAGE_SECTION_TYPES),
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  content: z.unknown(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type HomepageSectionDto = z.infer<typeof homepageSectionDtoSchema>;

export const publicHeroSlideSchema = z.object({
  id: z.string(),
  heading: z.string(),
  subheading: z.string().nullable(),
  media: z.object({
    id: z.string().uuid(),
    publicUrl: z.string(),
    fileName: z.string(),
  }),
  ctaLabel: z.string().nullable(),
  ctaUrl: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export const publicPromoBannerSchema = z.object({
  heading: z.string(),
  description: z.string().nullable(),
  media: z.object({
    id: z.string().uuid(),
    publicUrl: z.string(),
    fileName: z.string(),
  }),
  ctaLabel: z.string().nullable(),
  ctaUrl: z.string().nullable(),
});

export const publicHomepageSectionDtoSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(HOMEPAGE_SECTION_TYPES),
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  sortOrder: z.number().int(),
  content: z.unknown(),
});

export type PublicHomepageSectionDto = z.infer<typeof publicHomepageSectionDtoSchema>;

export const publicHomepageResponseSchema = z.object({
  sections: z.array(publicHomepageSectionDtoSchema),
});

export type PublicHomepageResponse = z.infer<typeof publicHomepageResponseSchema>;

export { idParamsSchema };
