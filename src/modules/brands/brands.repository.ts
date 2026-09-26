import type { Brand, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  createdBy,
  notDeleted,
  restoreData,
  softDeleteData,
  updatedBy,
} from '../../shared/database/soft-delete';
import { toSkipTake } from '../../shared/http';
import type { CreateBrandBody, ListBrandsQuery, UpdateBrandBody } from './brands.schema';

export type BrandRecord = Brand;

export const brandsRepository = {
  findById(id: string): Promise<Brand | null> {
    return prisma.brand.findFirst({ where: { id, ...notDeleted } });
  },

  /** Includes soft-deleted brands (needed for restore and conflict checks). */
  findByIdIncludingDeleted(id: string): Promise<Brand | null> {
    return prisma.brand.findUnique({ where: { id } });
  },

  /** Includes soft-deleted brands, because unique slugs stay reserved after deletion. */
  findBySlugIncludingDeleted(slug: string): Promise<Brand | null> {
    return prisma.brand.findUnique({ where: { slug } });
  },

  /** Includes soft-deleted brands to enforce name uniqueness across brands via normalized nameKey. */
  findByNameIncludingDeleted(name: string): Promise<Brand | null> {
    const nameKey = name.trim().toLowerCase();
    return prisma.brand.findUnique({
      where: { nameKey },
    });
  },

  /** Public query: only active, non-deleted brands sorted by sortOrder ASC, then name ASC. Capped at 200. */
  findManyPublic(): Promise<Brand[]> {
    return prisma.brand.findMany({
      where: {
        ...notDeleted,
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 200,
    });
  },

  /** Public query: find active, non-deleted brand by slug. */
  findBySlugPublic(slug: string): Promise<Brand | null> {
    return prisma.brand.findFirst({
      where: {
        slug,
        isActive: true,
        ...notDeleted,
      },
    });
  },

  async findMany(query: ListBrandsQuery): Promise<{ items: Brand[]; total: number }> {
    const where: Prisma.BrandWhereInput = {
      ...notDeleted,
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        name: { contains: query.search, mode: 'insensitive' },
      }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.brand.findMany({
        where,
        ...toSkipTake(query),
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
      }),
      prisma.brand.count({ where }),
    ]);

    return { items, total };
  },

  create(data: CreateBrandBody & { slug: string }, actorId: string): Promise<Brand> {
    return prisma.brand.create({
      data: {
        name: data.name,
        nameKey: data.name.trim().toLowerCase(),
        slug: data.slug,
        description: data.description ?? null,
        logoUrl: data.logoUrl ?? null,
        bannerUrl: data.bannerUrl ?? null,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        ...createdBy(actorId),
      },
    });
  },

  update(id: string, data: UpdateBrandBody, actorId: string): Promise<Brand> {
    return prisma.brand.update({
      where: { id },
      data: {
        ...(data.name !== undefined && {
          name: data.name,
          nameKey: data.name.trim().toLowerCase(),
        }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
        ...(data.bannerUrl !== undefined && { bannerUrl: data.bannerUrl }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...updatedBy(actorId),
      },
    });
  },

  softDelete(id: string, actorId: string): Promise<Brand> {
    return prisma.brand.update({
      where: { id },
      data: softDeleteData(actorId),
    });
  },

  restore(id: string, actorId: string): Promise<Brand> {
    return prisma.brand.update({
      where: { id },
      data: restoreData(actorId),
    });
  },

  updateLogo(id: string, logoUrl: string | null, actorId: string): Promise<Brand> {
    return prisma.brand.update({
      where: { id },
      data: {
        logoUrl,
        ...updatedBy(actorId),
      },
    });
  },

  updateBanner(id: string, bannerUrl: string | null, actorId: string): Promise<Brand> {
    return prisma.brand.update({
      where: { id },
      data: {
        bannerUrl,
        ...updatedBy(actorId),
      },
    });
  },
};
