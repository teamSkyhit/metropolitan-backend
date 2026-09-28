import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  createdBy,
  notDeleted,
  restoreData,
  softDeleteData,
  updatedBy,
} from '../../shared/database/soft-delete';
import { toSkipTake } from '../../shared/http';
import type { CreateProductBody, ListProductsQuery, UpdateProductBody } from './products.schema';

const productIncludes = {
  brand: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
} as const;

export type ProductRecord = Prisma.ProductGetPayload<{
  include: typeof productIncludes;
}>;

export const productsRepository = {
  findById(id: string): Promise<ProductRecord | null> {
    return prisma.product.findFirst({
      where: { id, ...notDeleted },
      include: productIncludes,
    });
  },

  /** Includes soft-deleted products (needed for restore and conflict checks). */
  findByIdIncludingDeleted(id: string): Promise<ProductRecord | null> {
    return prisma.product.findUnique({
      where: { id },
      include: productIncludes,
    });
  },

  /** Includes soft-deleted products, because unique SKUs stay reserved after deletion. */
  findBySkuIncludingDeleted(sku: string) {
    return prisma.product.findUnique({
      where: { sku: sku.trim() },
    });
  },

  async findMany(query: ListProductsQuery): Promise<{ items: ProductRecord[]; total: number }> {
    const where: Prisma.ProductWhereInput = {
      ...notDeleted,
      ...(query.brandId !== undefined && { brandId: query.brandId }),
      ...(query.categoryId !== undefined && { categoryId: query.categoryId }),
      ...(query.hotDeal !== undefined && { hotDeal: query.hotDeal }),
      ...(query.status !== undefined && { status: query.status }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { sku: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: productIncludes,
        ...toSkipTake(query),
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
      }),
      prisma.product.count({ where }),
    ]);

    return { items, total };
  },

  create(data: CreateProductBody, actorId: string): Promise<ProductRecord> {
    return prisma.product.create({
      data: {
        name: data.name.trim(),
        sku: data.sku.trim(),
        brandId: data.brandId,
        categoryId: data.categoryId,
        description:
          data.description !== undefined && data.description !== null ? data.description.trim() : null,
        price: data.price !== null && data.price !== undefined ? new Prisma.Decimal(data.price) : null,
        priceVisibility: data.priceVisibility,
        status: data.status,
        hotDeal: data.hotDeal,
        ...createdBy(actorId),
      },
      include: productIncludes,
    });
  },

  update(id: string, data: UpdateProductBody, actorId: string): Promise<ProductRecord> {
    return prisma.product.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.sku !== undefined && { sku: data.sku.trim() }),
        ...(data.brandId !== undefined && { brandId: data.brandId }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.description !== undefined && {
          description: data.description !== null ? data.description.trim() : null,
        }),
        ...(data.price !== undefined && {
          price: data.price !== null ? new Prisma.Decimal(data.price) : null,
        }),
        ...(data.priceVisibility !== undefined && { priceVisibility: data.priceVisibility }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.hotDeal !== undefined && { hotDeal: data.hotDeal }),
        ...updatedBy(actorId),
      },
      include: productIncludes,
    });
  },

  softDelete(id: string, actorId: string) {
    return prisma.product.update({
      where: { id },
      data: softDeleteData(actorId),
    });
  },

  restore(id: string, actorId: string): Promise<ProductRecord> {
    return prisma.product.update({
      where: { id },
      data: restoreData(actorId),
      include: productIncludes,
    });
  },
};
