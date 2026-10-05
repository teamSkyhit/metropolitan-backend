import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors';
import { brandsService } from '../brands';
import { categoriesService } from '../categories';
import { mediaService } from '../media';
import { productsService } from '../products';
import { homepageRepository, type HomepageSectionRecord } from './homepage.repository';
import {
  getContentSchemaForType,
  HomepageErrorCode,
  HomepageSectionType,
  SINGLE_INSTANCE_SECTION_TYPES,
  type CreateHomepageSectionBody,
  type FeaturedBrandsContent,
  type FeaturedCategoriesContent,
  type FeaturedProductsContent,
  type HeroContent,
  type HeroSlide,
  type HomepageSectionDto,
  type PromoBannerContent,
  type PublicHomepageResponse,
  type PublicHomepageSectionDto,
  type ReorderHomepageSectionsBody,
  type UpdateHomepageSectionBody,
} from './homepage.schema';

function handleHomepageUniqueError(err: unknown, sectionType: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw AppError.conflict(
      `An active ${sectionType} section already exists. Disable or update the existing section.`,
      HomepageErrorCode.SECTION_DUPLICATE
    );
  }
  throw err;
}

export function toHomepageSectionDto(record: HomepageSectionRecord): HomepageSectionDto {
  return {
    id: record.id,
    type: record.type as HomepageSectionType,
    title: record.title,
    subtitle: record.subtitle,
    content: record.content,
    sortOrder: record.sortOrder,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function validateSectionReferences(type: HomepageSectionType, content: unknown): Promise<unknown> {
  switch (type) {
    case HomepageSectionType.HERO: {
      const hero = content as HeroContent;
      const mediaIds = hero.slides.map((s) => s.mediaId);
      const mediaList = await mediaService.getByIds(mediaIds);
      const mediaMap = new Map(mediaList.map((m) => [m.id, m]));

      for (const slide of hero.slides) {
        const media = mediaMap.get(slide.mediaId);
        if (!media) {
          throw AppError.badRequest(
            `Referenced media ${slide.mediaId} does not exist or has been deleted`,
            HomepageErrorCode.REFERENCE_INVALID,
            { mediaId: slide.mediaId }
          );
        }
        if (!media.mimeType.startsWith('image/')) {
          throw AppError.badRequest(
            `Referenced media ${slide.mediaId} is not an image (type: ${media.mimeType})`,
            HomepageErrorCode.REFERENCE_INVALID,
            { mediaId: slide.mediaId }
          );
        }
        if (!slide.id) {
          slide.id = randomUUID();
        }
      }
      return hero;
    }

    case HomepageSectionType.PROMO_BANNER: {
      const promo = content as PromoBannerContent;
      try {
        const media = await mediaService.getById(promo.mediaId);
        if (!media.mimeType.startsWith('image/')) {
          throw AppError.badRequest(
            `Referenced media ${promo.mediaId} is not an image`,
            HomepageErrorCode.REFERENCE_INVALID,
            { mediaId: promo.mediaId }
          );
        }
      } catch (err) {
        if (err instanceof AppError && err.statusCode === 404) {
          throw AppError.badRequest(
            `Referenced media ${promo.mediaId} does not exist or has been deleted`,
            HomepageErrorCode.REFERENCE_INVALID,
            { mediaId: promo.mediaId }
          );
        }
        throw err;
      }
      return promo;
    }

    case HomepageSectionType.FEATURED_PRODUCTS: {
      const { productIds } = content as FeaturedProductsContent;
      const products = await productsService.getByIdsPublic(productIds);
      if (products.length !== productIds.length) {
        const foundIds = new Set(products.map((p) => p.id));
        const missingIds = productIds.filter((id) => !foundIds.has(id));
        throw AppError.badRequest(
          `One or more referenced products do not exist, are not published, or belong to inactive/deleted brands/categories: ${missingIds.join(', ')}`,
          HomepageErrorCode.REFERENCE_INVALID,
          { missingIds }
        );
      }
      return content;
    }

    case HomepageSectionType.FEATURED_CATEGORIES: {
      const { categoryIds } = content as FeaturedCategoriesContent;
      const categories = await categoriesService.getByIdsPublic(categoryIds);
      if (categories.length !== categoryIds.length) {
        const foundIds = new Set(categories.map((c) => c.id));
        const missingIds = categoryIds.filter((id) => !foundIds.has(id));
        throw AppError.badRequest(
          `One or more referenced categories do not exist, are inactive, or are deleted: ${missingIds.join(', ')}`,
          HomepageErrorCode.REFERENCE_INVALID,
          { missingIds }
        );
      }
      return content;
    }

    case HomepageSectionType.FEATURED_BRANDS: {
      const { brandIds } = content as FeaturedBrandsContent;
      const brands = await brandsService.getByIdsPublic(brandIds);
      if (brands.length !== brandIds.length) {
        const foundIds = new Set(brands.map((b) => b.id));
        const missingIds = brandIds.filter((id) => !foundIds.has(id));
        throw AppError.badRequest(
          `One or more referenced brands do not exist, are inactive, or are deleted: ${missingIds.join(', ')}`,
          HomepageErrorCode.REFERENCE_INVALID,
          { missingIds }
        );
      }
      return content;
    }

    default:
      throw AppError.badRequest(`Unsupported section type: ${type}`, HomepageErrorCode.SECTION_TYPE_INVALID);
  }
}

export const homepageService = {
  async list(): Promise<HomepageSectionDto[]> {
    const records = await homepageRepository.findMany();
    return records.map(toHomepageSectionDto);
  },

  async getById(id: string): Promise<HomepageSectionDto> {
    const record = await homepageRepository.findById(id);
    if (!record) {
      throw AppError.notFound('HomepageSection', HomepageErrorCode.SECTION_NOT_FOUND);
    }
    return toHomepageSectionDto(record);
  },

  async create(body: CreateHomepageSectionBody, actorId: string): Promise<HomepageSectionDto> {
    if (SINGLE_INSTANCE_SECTION_TYPES.has(body.type) && body.isActive !== false) {
      const existing = await homepageRepository.findActiveByType(body.type);
      if (existing) {
        throw AppError.conflict(
          `An active ${body.type} section already exists. Disable or update the existing section.`,
          HomepageErrorCode.SECTION_DUPLICATE,
          { existingSectionId: existing.id }
        );
      }
    }

    const validatedContent = await validateSectionReferences(body.type, body.content);

    try {
      const record = await homepageRepository.create(
        {
          ...body,
          content: validatedContent as unknown as CreateHomepageSectionBody['content'],
        },
        actorId
      );

      return toHomepageSectionDto(record);
    } catch (err) {
      handleHomepageUniqueError(err, body.type);
    }
  },

  async update(id: string, body: UpdateHomepageSectionBody, actorId: string): Promise<HomepageSectionDto> {
    const existing = await homepageRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('HomepageSection', HomepageErrorCode.SECTION_NOT_FOUND);
    }

    const sectionType = existing.type as HomepageSectionType;

    // Check single-instance duplication if activating
    const targetIsActive = body.isActive !== undefined ? body.isActive : existing.isActive;
    if (targetIsActive && !existing.isActive && SINGLE_INSTANCE_SECTION_TYPES.has(sectionType)) {
      const duplicate = await homepageRepository.findActiveByType(sectionType, id);
      if (duplicate) {
        throw AppError.conflict(
          `An active ${sectionType} section already exists. Disable or update the existing section.`,
          HomepageErrorCode.SECTION_DUPLICATE,
          { existingSectionId: duplicate.id }
        );
      }
    }

    let updatedContent = existing.content;
    if (body.content !== undefined) {
      const schema = getContentSchemaForType(sectionType);
      const parsedContent = schema.parse(body.content);
      updatedContent = (await validateSectionReferences(sectionType, parsedContent)) as typeof updatedContent;
    }

    try {
      const updated = await homepageRepository.update(
        id,
        {
          title: body.title,
          subtitle: body.subtitle,
          sortOrder: body.sortOrder,
          isActive: body.isActive,
          content: updatedContent,
        },
        actorId
      );

      return toHomepageSectionDto(updated);
    } catch (err) {
      handleHomepageUniqueError(err, sectionType);
    }
  },

  async reorder(body: ReorderHomepageSectionsBody, actorId: string): Promise<HomepageSectionDto[]> {
    const existingSections = await homepageRepository.findMany();
    const existingIds = new Set(existingSections.map((s) => s.id));

    for (const item of body.items) {
      if (!existingIds.has(item.id)) {
        throw AppError.notFound('HomepageSection', HomepageErrorCode.SECTION_NOT_FOUND);
      }
    }

    const updated = await homepageRepository.reorder(body.items, actorId);
    return updated.map(toHomepageSectionDto);
  },

  async softDelete(id: string, actorId: string): Promise<void> {
    const existing = await homepageRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('HomepageSection', HomepageErrorCode.SECTION_NOT_FOUND);
    }
    await homepageRepository.softDelete(id, actorId);
  },

  async getPublicHomepage(): Promise<PublicHomepageResponse> {
    const sections = await homepageRepository.findManyPublic();
    if (sections.length === 0) {
      return { sections: [] };
    }

    // 1. Gather all referenced IDs in one pass to avoid N+1 queries
    const allMediaIds = new Set<string>();
    const allProductIds = new Set<string>();
    const allCategoryIds = new Set<string>();
    const allBrandIds = new Set<string>();

    for (const section of sections) {
      const content = section.content as Record<string, unknown>;
      switch (section.type) {
        case HomepageSectionType.HERO: {
          const slides = (content.slides as HeroSlide[]) || [];
          for (const s of slides) {
            if (s.isActive && s.mediaId) allMediaIds.add(s.mediaId);
          }
          break;
        }
        case HomepageSectionType.PROMO_BANNER: {
          if (content.mediaId) allMediaIds.add(content.mediaId as string);
          break;
        }
        case HomepageSectionType.FEATURED_PRODUCTS: {
          const ids = (content.productIds as string[]) || [];
          for (const id of ids) allProductIds.add(id);
          break;
        }
        case HomepageSectionType.FEATURED_CATEGORIES: {
          const ids = (content.categoryIds as string[]) || [];
          for (const id of ids) allCategoryIds.add(id);
          break;
        }
        case HomepageSectionType.FEATURED_BRANDS: {
          const ids = (content.brandIds as string[]) || [];
          for (const id of ids) allBrandIds.add(id);
          break;
        }
      }
    }

    // 2. Batch fetch via module service boundaries
    const [mediaList, publicProducts, publicCategories, publicBrands] = await Promise.all([
      allMediaIds.size > 0 ? mediaService.getByIds([...allMediaIds]) : Promise.resolve([]),
      allProductIds.size > 0 ? productsService.getByIdsPublic([...allProductIds]) : Promise.resolve([]),
      allCategoryIds.size > 0 ? categoriesService.getByIdsPublic([...allCategoryIds]) : Promise.resolve([]),
      allBrandIds.size > 0 ? brandsService.getByIdsPublic([...allBrandIds]) : Promise.resolve([]),
    ]);

    const mediaMap = new Map(
      mediaList.map((m) => [
        m.id,
        {
          id: m.id,
          publicUrl: m.publicUrl,
          fileName: m.fileName,
        },
      ])
    );
    const productsMap = new Map(publicProducts.map((p) => [p.id, p]));
    const categoriesMap = new Map(publicCategories.map((c) => [c.id, c]));
    const brandsMap = new Map(publicBrands.map((b) => [b.id, b]));

    // 3. Assemble public sections with safe data and stale-reference filtering
    const resolvedSections: PublicHomepageSectionDto[] = [];

    for (const section of sections) {
      const type = section.type as HomepageSectionType;
      const content = section.content as Record<string, unknown>;

      switch (type) {
        case HomepageSectionType.HERO: {
          const slides = (content.slides as HeroSlide[]) || [];
          const activeSlidesWithMedia = slides
            .filter((s) => s.isActive && mediaMap.has(s.mediaId))
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((s) => ({
              id: s.id ?? randomUUID(),
              heading: s.heading,
              subheading: s.subheading ?? null,
              media: mediaMap.get(s.mediaId)!,
              ctaLabel: s.ctaLabel ?? null,
              ctaUrl: s.ctaUrl ?? null,
              sortOrder: s.sortOrder,
              isActive: s.isActive,
            }));

          // Stale policy: if 0 valid slides remain, omit the entire hero section
          if (activeSlidesWithMedia.length === 0) continue;

          resolvedSections.push({
            id: section.id,
            type,
            title: section.title,
            subtitle: section.subtitle,
            sortOrder: section.sortOrder,
            content: {
              slides: activeSlidesWithMedia,
            },
          });
          break;
        }

        case HomepageSectionType.PROMO_BANNER: {
          const media = mediaMap.get(content.mediaId as string);
          // Stale policy: if promo banner's media was deleted, omit section
          if (!media) continue;

          resolvedSections.push({
            id: section.id,
            type,
            title: section.title,
            subtitle: section.subtitle,
            sortOrder: section.sortOrder,
            content: {
              heading: content.heading,
              description: content.description ?? null,
              media,
              ctaLabel: content.ctaLabel ?? null,
              ctaUrl: content.ctaUrl ?? null,
            },
          });
          break;
        }

        case HomepageSectionType.FEATURED_PRODUCTS: {
          const ids = (content.productIds as string[]) || [];
          const items = ids
            .map((id) => productsMap.get(id))
            .filter((p): p is NonNullable<typeof p> => p !== undefined);

          // Stale policy: if all referenced products are deleted/draft/unavailable, omit section
          if (items.length === 0) continue;

          resolvedSections.push({
            id: section.id,
            type,
            title: section.title,
            subtitle: section.subtitle,
            sortOrder: section.sortOrder,
            content: { items },
          });
          break;
        }

        case HomepageSectionType.FEATURED_CATEGORIES: {
          const ids = (content.categoryIds as string[]) || [];
          const items = ids
            .map((id) => categoriesMap.get(id))
            .filter((c): c is NonNullable<typeof c> => c !== undefined);

          // Stale policy: if all referenced categories are deleted/inactive, omit section
          if (items.length === 0) continue;

          resolvedSections.push({
            id: section.id,
            type,
            title: section.title,
            subtitle: section.subtitle,
            sortOrder: section.sortOrder,
            content: { items },
          });
          break;
        }

        case HomepageSectionType.FEATURED_BRANDS: {
          const ids = (content.brandIds as string[]) || [];
          const items = ids
            .map((id) => brandsMap.get(id))
            .filter((b): b is NonNullable<typeof b> => b !== undefined);

          // Stale policy: if all referenced brands are deleted/inactive, omit section
          if (items.length === 0) continue;

          resolvedSections.push({
            id: section.id,
            type,
            title: section.title,
            subtitle: section.subtitle,
            sortOrder: section.sortOrder,
            content: { items },
          });
          break;
        }
      }
    }

    return { sections: resolvedSections };
  },

  async isMediaUrlReferenced(url: string, id?: string): Promise<boolean> {
    return homepageRepository.isMediaReferenced(url, id);
  },
};
