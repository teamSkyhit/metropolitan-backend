import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors';
import { buildPaginationMeta, type Paginated } from '../../shared/http';
import { storageService, UPLOAD_LIMITS, validateFileSize, validateImageContent } from '../../shared/storage';
import { productReferenceService } from '../products';
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
    if (target.includes('name_key') || target.includes('name')) {
      throw AppError.conflict('A category with this name already exists', CategoriesErrorCode.NAME_TAKEN);
    }
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
    isActive: record.isActive,
    sortOrder: record.sortOrder,
    parentId: record.parentId,
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
    parentId: record.parentId,
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

async function assertNameAvailable(name: string, exceptCategoryId?: string): Promise<void> {
  const existing = await categoriesRepository.findByNameIncludingDeleted(name);
  if (!existing || existing.id === exceptCategoryId) return;
  if (existing.deletedAt) {
    throw AppError.conflict(
      'This name belongs to a deleted category. Please restore the deleted category instead of creating a new one.',
      CategoriesErrorCode.NAME_BELONGS_TO_DELETED_CATEGORY,
      { categoryId: existing.id }
    );
  }
  throw AppError.conflict('A category with this name already exists', CategoriesErrorCode.NAME_TAKEN);
}

async function assertValidParent(
  categoryId: string | undefined,
  parentId: string | null | undefined
): Promise<void> {
  if (!parentId) return;
  if (categoryId && parentId === categoryId) {
    throw AppError.badRequest('A category cannot be its own parent', CategoriesErrorCode.INVALID_PARENT);
  }
  const parent = await categoriesRepository.findByIdIncludingDeleted(parentId);
  if (!parent) {
    throw AppError.badRequest('Parent category does not exist', CategoriesErrorCode.INVALID_PARENT);
  }
  if (parent.deletedAt) {
    throw AppError.badRequest(
      'Cannot assign a deleted category as parent',
      CategoriesErrorCode.INVALID_PARENT
    );
  }

  // Prevent circular parent relationships
  if (categoryId) {
    let currentParentId: string | null = parent.parentId;
    while (currentParentId) {
      if (currentParentId === categoryId) {
        throw AppError.badRequest(
          'Circular category parent relationship detected',
          CategoriesErrorCode.CIRCULAR_PARENT
        );
      }
      const ancestor = await categoriesRepository.findByIdIncludingDeleted(currentParentId);
      currentParentId = ancestor?.parentId ?? null;
    }
  }
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

  /** Public list: only active, non-deleted categories sorted by sortOrder ASC, then name ASC. */
  async listPublic(): Promise<PublicCategoryDto[]> {
    const items = await categoriesRepository.findManyPublic();
    return items.map(toPublicCategoryDto);
  },

  /** Public slug lookup: only active, non-deleted category. */
  async getBySlugPublic(slug: string): Promise<PublicCategoryDto> {
    const record = await categoriesRepository.findBySlugPublic(slug);
    if (!record) throw AppError.notFound('Category');
    return toPublicCategoryDto(record);
  },

  async create(body: CreateCategoryBody, actorId: string): Promise<CategoryDto> {
    await assertNameAvailable(body.name);
    await assertSlugAvailable(body.slug);
    await assertValidParent(undefined, body.parentId);
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

    if (body.name && body.name.trim().toLowerCase() !== existing.name.trim().toLowerCase()) {
      await assertNameAvailable(body.name, id);
    }
    if (body.slug && body.slug !== existing.slug) {
      await assertSlugAvailable(body.slug, id);
    }
    if (body.parentId !== undefined && body.parentId !== existing.parentId) {
      await assertValidParent(id, body.parentId);
    }

    try {
      const updated = await categoriesRepository.update(id, body, actorId);
      return toCategoryDto(updated);
    } catch (err) {
      handlePrismaUniqueError(err);
      throw err;
    }
  },

  async assertAssignable(
    id: string,
    options?: { notFoundCode?: string; unavailableCode?: string }
  ): Promise<CategoryRecord> {
    const category = await categoriesRepository.findByIdIncludingDeleted(id);
    if (!category) {
      throw AppError.badRequest(
        'Selected category does not exist',
        options?.notFoundCode ?? 'PRODUCTS_CATEGORY_NOT_FOUND'
      );
    }
    if (category.deletedAt) {
      throw AppError.badRequest(
        'Cannot assign a deleted category to product',
        options?.unavailableCode ?? 'PRODUCTS_CATEGORY_UNAVAILABLE'
      );
    }
    return category;
  },

  async softDelete(id: string, actorId: string): Promise<void> {
    const existing = await categoriesRepository.findById(id);
    if (!existing) throw AppError.notFound('Category');

    const hasLiveProducts = await productReferenceService.hasLiveProductsForCategory(id);
    if (hasLiveProducts) {
      throw AppError.conflict(
        'Cannot delete category because it has associated live products',
        CategoriesErrorCode.HAS_PRODUCTS
      );
    }

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
