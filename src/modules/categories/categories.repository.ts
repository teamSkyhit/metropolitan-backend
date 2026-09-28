import type { Category, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  createdBy,
  notDeleted,
  restoreData,
  softDeleteData,
  updatedBy,
} from '../../shared/database/soft-delete';
import { toSkipTake } from '../../shared/http';
import type { CreateCategoryBody, ListCategoriesQuery, UpdateCategoryBody } from './categories.schema';

export type CategoryRecord = Category;

export const categoriesRepository = {
  findById(id: string): Promise<Category | null> {
    return prisma.category.findFirst({ where: { id, ...notDeleted } });
  },

  /** Includes soft-deleted categories (needed for restore and conflict checks). */
  findByIdIncludingDeleted(id: string): Promise<Category | null> {
    return prisma.category.findUnique({ where: { id } });
  },

  /** Includes soft-deleted categories, because unique SEO URLs stay reserved after deletion. */
  findBySeoUrlIncludingDeleted(seoUrl: string): Promise<Category | null> {
    return prisma.category.findUnique({ where: { seoUrl } });
  },

  /** Public query: only non-deleted categories sorted by name ASC. Capped at 200. */
  findManyPublic(): Promise<Category[]> {
    return prisma.category.findMany({
      where: {
        ...notDeleted,
      },
      orderBy: [{ name: 'asc' }],
      take: 200,
    });
  },

  /** Public query: find non-deleted category by SEO URL. */
  findBySeoUrlPublic(seoUrl: string): Promise<Category | null> {
    return prisma.category.findFirst({
      where: {
        seoUrl,
        ...notDeleted,
      },
    });
  },

  async findMany(query: ListCategoriesQuery): Promise<{ items: Category[]; total: number }> {
    const where: Prisma.CategoryWhereInput = {
      ...notDeleted,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { seoUrl: { contains: query.search, mode: 'insensitive' } },
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
        seoUrl: data.seoUrl,
        banner: data.banner ?? null,
        description: data.description ?? null,
        ...createdBy(actorId),
      },
    });
  },

  update(id: string, data: UpdateCategoryBody, actorId: string): Promise<Category> {
    return prisma.category.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.seoUrl !== undefined && { seoUrl: data.seoUrl }),
        ...(data.banner !== undefined && { banner: data.banner }),
        ...(data.description !== undefined && { description: data.description }),
        ...updatedBy(actorId),
      },
    });
  },

  softDelete(id: string, actorId: string): Promise<Category> {
    return prisma.category.update({
      where: { id },
      data: softDeleteData(actorId),
    });
  },

  restore(id: string, actorId: string): Promise<Category> {
    return prisma.category.update({
      where: { id },
      data: restoreData(actorId),
    });
  },

  updateBanner(id: string, banner: string | null, actorId: string): Promise<Category> {
    return prisma.category.update({
      where: { id },
      data: {
        banner,
        ...updatedBy(actorId),
      },
    });
  },
};
