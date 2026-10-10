import type { Category, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../shared/errors';
import {
  createdBy,
  notDeleted,
  restoreData,
  softDeleteData,
  updatedBy,
} from '../../shared/database/soft-delete';
import { toSkipTake } from '../../shared/http';
import {
  CategoriesErrorCode,
  type CreateCategoryBody,
  type ListCategoriesQuery,
  type UpdateCategoryBody,
} from './categories.schema';

export type CategoryRecord = Category;

export const categoriesRepository = {
  findById(id: string): Promise<Category | null> {
    return prisma.category.findFirst({ where: { id, ...notDeleted } });
  },

  /** Includes soft-deleted categories (needed for restore and conflict checks). */
  findByIdIncludingDeleted(id: string): Promise<Category | null> {
    return prisma.category.findUnique({ where: { id } });
  },

  /** Includes soft-deleted categories, because unique slugs stay reserved after deletion. */
  findBySlugIncludingDeleted(slug: string): Promise<Category | null> {
    return prisma.category.findUnique({ where: { slug } });
  },

  /** Includes soft-deleted categories to enforce name uniqueness across categories via normalized nameKey. */
  findByNameIncludingDeleted(name: string): Promise<Category | null> {
    const nameKey = name.trim().toLowerCase();
    return prisma.category.findUnique({
      where: { nameKey },
    });
  },

  /** Public query: only active, non-deleted categories sorted by sortOrder ASC, then name ASC. Capped at 200. */
  findManyPublic(): Promise<Category[]> {
    return prisma.category.findMany({
      where: {
        ...notDeleted,
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 200,
    });
  },

  /** Public query: find active, non-deleted category by slug. */
  findBySlugPublic(slug: string): Promise<Category | null> {
    return prisma.category.findFirst({
      where: {
        slug,
        isActive: true,
        ...notDeleted,
      },
    });
  },

  async findByIdsPublic(ids: string[]): Promise<Category[]> {
    if (ids.length === 0) return [];
    return prisma.category.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        ...notDeleted,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  },

  async findByIds(ids: string[]): Promise<Category[]> {
    if (ids.length === 0) return [];
    return prisma.category.findMany({
      where: {
        id: { in: ids },
        ...notDeleted,
      },
    });
  },

  isMediaUrlReferenced(url: string, id?: string): Promise<boolean> {
    const conditions: Prisma.CategoryWhereInput[] = [{ bannerUrl: url }, { imageUrl: url }];
    if (id) {
      conditions.push({ imageMediaId: id }, { bannerMediaId: id });
    }
    return prisma.category
      .count({
        where: {
          OR: conditions,
          ...notDeleted,
        },
      })
      .then((count) => count > 0);
  },

  /** Checks if any direct live child categories exist for the given parent category id. */
  hasLiveChildren(parentId: string): Promise<boolean> {
    return prisma.category
      .count({
        where: {
          parentId,
          ...notDeleted,
        },
      })
      .then((count) => count > 0);
  },

  async findMany(query: ListCategoriesQuery): Promise<{ items: Category[]; total: number }> {
    const where: Prisma.CategoryWhereInput = {
      ...notDeleted,
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.parentId !== undefined && { parentId: query.parentId }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { slug: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.category.findMany({
        where,
        ...toSkipTake(query),
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
      }),
      prisma.category.count({ where }),
    ]);

    return { items, total };
  },

  create(data: CreateCategoryBody, actorId: string): Promise<Category> {
    return prisma.category.create({
      data: {
        name: data.name,
        nameKey: data.name.trim().toLowerCase(),
        slug: data.slug,
        imageUrl: data.imageUrl ?? null,
        bannerUrl: data.bannerUrl ?? null,
        description: data.description ?? null,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        parentId: data.parentId ?? null,
        ...createdBy(actorId),
      },
    });
  },

  update(id: string, data: UpdateCategoryBody, actorId: string): Promise<Category> {
    return prisma.category.update({
      where: { id },
      data: {
        ...(data.name !== undefined && {
          name: data.name,
          nameKey: data.name.trim().toLowerCase(),
        }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.bannerUrl !== undefined && { bannerUrl: data.bannerUrl }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.parentId !== undefined && { parentId: data.parentId }),
        ...updatedBy(actorId),
      },
    });
  },

  /**
   * Atomically checks for live child categories and soft-deletes the category within a single database transaction.
   * Prevents TOCTOU races where a child category could be inserted concurrently between checking and soft deleting.
   */
  async softDelete(id: string, actorId: string): Promise<Category> {
    return prisma.$transaction(async (tx) => {
      const liveChildrenCount = await tx.category.count({
        where: {
          parentId: id,
          ...notDeleted,
        },
      });
      if (liveChildrenCount > 0) {
        throw AppError.conflict(
          'Category cannot be deleted while it has active child categories.',
          CategoriesErrorCode.HAS_CHILDREN
        );
      }

      return tx.category.update({
        where: { id },
        data: softDeleteData(actorId),
      });
    });
  },

  restore(id: string, actorId: string): Promise<Category> {
    return prisma.category.update({
      where: { id },
      data: restoreData(actorId),
    });
  },

  updateImage(
    id: string,
    imageUrl: string | null,
    imageMediaId: string | null,
    actorId: string
  ): Promise<Category> {
    return prisma.category.update({
      where: { id },
      data: {
        imageUrl,
        imageMediaId,
        ...updatedBy(actorId),
      },
    });
  },

  updateBanner(
    id: string,
    bannerUrl: string | null,
    bannerMediaId: string | null = null,
    actorId: string = ''
  ): Promise<Category> {
    return prisma.category.update({
      where: { id },
      data: {
        bannerUrl,
        bannerMediaId,
        ...updatedBy(actorId),
      },
    });
  },
};
