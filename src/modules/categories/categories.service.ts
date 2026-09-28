import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors';
import { buildPaginationMeta, type Paginated } from '../../shared/http';
import { storageService, UPLOAD_LIMITS, validateFileSize, validateImageContent } from '../../shared/storage';
import { categoriesRepository, type CategoryRecord } from './categories.repository';
import {
  CategoriesErrorCode,
  type CategoryDto,
  type CreateCategoryBody,
  type ListCategoriesQuery,
  type PublicCategoryDto,
  type UpdateCategoryBody,
} from './categories.schema';

function handlePrismaUniqueError(err: unknown): void {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = Array.isArray(err.meta?.target)
      ? err.meta.target.join(',')
      : String(err.meta?.target ?? '');
    if (target.includes('slug')) {
      throw AppError.conflict('A category with this slug already exists', CategoriesErrorCode.SLUG_TAKEN);
    }
    throw AppError.conflict('A record with the same unique value already exists');
  }
}

/** Maps database record to Admin DTO. */
export function toCategoryDto(record: CategoryRecord): CategoryDto {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    bannerUrl: record.bannerUrl,
    description: record.description,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Maps database record to Public DTO without internal audit fields. */
export function toPublicCategoryDto(record: CategoryRecord): PublicCategoryDto {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    bannerUrl: record.bannerUrl,
    description: record.description,
  };
}

async function assertSlugAvailable(slug: string, exceptCategoryId?: string): Promise<void> {
  const existing = await categoriesRepository.findBySlugIncludingDeleted(slug);
  if (!existing || existing.id === exceptCategoryId) return;
  if (existing.deletedAt) {
    throw AppError.conflict(
      'This slug belongs to a deleted category. Please restore the deleted category instead.',
      CategoriesErrorCode.SLUG_BELONGS_TO_DELETED_CATEGORY,
      { categoryId: existing.id }
    );
  }
  throw AppError.conflict('A category with this slug already exists', CategoriesErrorCode.SLUG_TAKEN);
}

export const categoriesService = {
  async list(query: ListCategoriesQuery): Promise<Paginated<CategoryDto>> {
    const { items, total } = await categoriesRepository.findMany(query);
    return { items: items.map(toCategoryDto), pagination: buildPaginationMeta(query, total) };
  },

  async getById(id: string): Promise<CategoryDto> {
    const record = await categoriesRepository.findById(id);
    if (!record) throw AppError.notFound('Category');
    return toCategoryDto(record);
  },

  /** Public list: only non-deleted categories sorted by name ASC. */
  async listPublic(): Promise<PublicCategoryDto[]> {
    const items = await categoriesRepository.findManyPublic();
    return items.map(toPublicCategoryDto);
  },

  /** Public slug lookup: only non-deleted category. */
  async getBySlugPublic(slug: string): Promise<PublicCategoryDto> {
    const record = await categoriesRepository.findBySlugPublic(slug);
    if (!record) throw AppError.notFound('Category');
    return toPublicCategoryDto(record);
  },

  async create(body: CreateCategoryBody, actorId: string): Promise<CategoryDto> {
    await assertSlugAvailable(body.slug);
    try {
      const record = await categoriesRepository.create(body, actorId);
      return toCategoryDto(record);
    } catch (err) {
      handlePrismaUniqueError(err);
      throw err;
    }
  },

  async update(id: string, body: UpdateCategoryBody, actorId: string): Promise<CategoryDto> {
    const existing = await categoriesRepository.findById(id);
    if (!existing) throw AppError.notFound('Category');

    if (body.slug && body.slug !== existing.slug) {
      await assertSlugAvailable(body.slug, id);
    }

    try {
      const updated = await categoriesRepository.update(id, body, actorId);
      return toCategoryDto(updated);
    } catch (err) {
      handlePrismaUniqueError(err);
      throw err;
    }
  },

  async softDelete(id: string, actorId: string): Promise<void> {
    const existing = await categoriesRepository.findById(id);
    if (!existing) throw AppError.notFound('Category');
    await categoriesRepository.softDelete(id, actorId);
  },

  async restore(id: string, actorId: string): Promise<CategoryDto> {
    const existing = await categoriesRepository.findByIdIncludingDeleted(id);
    if (!existing) throw AppError.notFound('Category');
    if (!existing.deletedAt) {
      throw AppError.conflict('Category is not deleted', CategoriesErrorCode.NOT_DELETED);
    }
    const restored = await categoriesRepository.restore(id, actorId);
    return toCategoryDto(restored);
  },

  async uploadBanner(id: string, file: Express.Multer.File, actorId: string): Promise<CategoryDto> {
    const category = await categoriesRepository.findById(id);
    if (!category) throw AppError.notFound('Category');

    validateFileSize(file.size, UPLOAD_LIMITS.BANNER_MAX_BYTES, 'Banner');
    const validated = validateImageContent(file.buffer);

    if (category.bannerUrl) {
      await storageService.delete(category.bannerUrl);
    }

    const stored = await storageService.upload(
      {
        filename: `${randomUUID()}${validated.extension}`,
        buffer: file.buffer,
        mimeType: validated.mimeType,
        size: file.size,
      },
      'categories/banners'
    );

    const updated = await categoriesRepository.updateBanner(id, stored.url, actorId);
    return toCategoryDto(updated);
  },

  async removeBanner(id: string, actorId: string): Promise<CategoryDto> {
    const category = await categoriesRepository.findById(id);
    if (!category) throw AppError.notFound('Category');

    if (category.bannerUrl) {
      await storageService.delete(category.bannerUrl);
    }

    const updated = await categoriesRepository.updateBanner(id, null, actorId);
    return toCategoryDto(updated);
  },
};
