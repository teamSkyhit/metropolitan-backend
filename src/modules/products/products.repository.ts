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
import type {
  CreateProductBody,
  ListProductsQuery,
  ListPublicProductsQuery,
  ProductSpecificationItem,
  UpdateProductBody,
} from './products.schema';

const productIncludes = {
  brand: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
} as const;

export type ProductRecord = Prisma.ProductGetPayload<{
  include: typeof productIncludes;
}>;

const publicProductIncludes = {
  brand: {
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
      bannerUrl: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      bannerUrl: true,
    },
  },
} as const;

export type PublicProductRecord = Prisma.ProductGetPayload<{
  include: typeof publicProductIncludes;
}>;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

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
      where: { sku: sku.trim().toUpperCase() },
    });
  },

  /** Includes soft-deleted products, because unique slugs stay reserved after deletion. */
  findBySlugIncludingDeleted(slug: string): Promise<ProductRecord | null> {
    return prisma.product.findUnique({
      where: { slug: slug.trim().toLowerCase() },
      include: productIncludes,
    });
  },

  countLiveByBrandId(brandId: string): Promise<number> {
    return prisma.product.count({
      where: {
        brandId,
        ...notDeleted,
      },
    });
  },

  countLiveByCategoryId(categoryId: string): Promise<number> {
    return prisma.product.count({
      where: {
        categoryId,
        ...notDeleted,
      },
    });
  },

  isMediaUrlReferenced(url: string): Promise<boolean> {
    return prisma.product
      .count({
        where: {
          imageUrl: url,
          ...notDeleted,
        },
      })
      .then((count) => count > 0);
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

  async findManyPublic(
    query: ListPublicProductsQuery
  ): Promise<{ items: PublicProductRecord[]; total: number }> {
    const conditions: Prisma.ProductWhereInput[] = [
      { deletedAt: null },
      { status: 'PUBLISHED' },
      { brand: { deletedAt: null, isActive: true } },
      { category: { deletedAt: null, isActive: true } },
    ];

    if (query.brand) {
      if (isUuid(query.brand)) {
        conditions.push({ brandId: query.brand });
      } else {
        conditions.push({ brand: { slug: query.brand.toLowerCase() } });
      }
    }

    if (query.category) {
      if (isUuid(query.category)) {
        conditions.push({ categoryId: query.category });
      } else {
        conditions.push({ category: { slug: query.category.toLowerCase() } });
      }
    }

    if (query.hotDeal !== undefined) {
      conditions.push({ hotDeal: query.hotDeal });
    }

    if (query.search) {
      conditions.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { sku: { contains: query.search, mode: 'insensitive' } },
          { brand: { name: { contains: query.search, mode: 'insensitive' } } },
          { category: { name: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.ProductWhereInput = { AND: conditions };

    let orderBy: Prisma.ProductOrderByWithRelationInput[];
    switch (query.sort) {
      case 'oldest':
        orderBy = [{ createdAt: 'asc' }, { id: 'asc' }];
        break;
      case 'name_asc':
        orderBy = [{ name: 'asc' }, { id: 'asc' }];
        break;
      case 'name_desc':
        orderBy = [{ name: 'desc' }, { id: 'asc' }];
        break;
      case 'price_asc':
        orderBy = [{ price: 'asc' }, { id: 'asc' }];
        break;
      case 'price_desc':
        orderBy = [{ price: 'desc' }, { id: 'asc' }];
        break;
      case 'latest':
      default:
        orderBy = [{ createdAt: 'desc' }, { id: 'asc' }];
        break;
    }

    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: publicProductIncludes,
        ...toSkipTake(query),
        orderBy,
      }),
      prisma.product.count({ where }),
    ]);

    return { items, total };
  },

  async findByIdOrSkuPublic(identifier: string): Promise<PublicProductRecord | null> {
    const baseWhere: Prisma.ProductWhereInput = {
      status: 'PUBLISHED',
      deletedAt: null,
      brand: { deletedAt: null, isActive: true },
      category: { deletedAt: null, isActive: true },
    };

    if (isUuid(identifier)) {
      const byId = await prisma.product.findFirst({
        where: {
          id: identifier,
          ...baseWhere,
        },
        include: publicProductIncludes,
      });
      if (byId) return byId;
    }

    const bySku = await prisma.product.findFirst({
      where: {
        sku: identifier.trim().toUpperCase(),
        ...baseWhere,
      },
      include: publicProductIncludes,
    });
    if (bySku) return bySku;

    const bySlug = await prisma.product.findFirst({
      where: {
        slug: identifier.trim().toLowerCase(),
        ...baseWhere,
      },
      include: publicProductIncludes,
    });
    if (bySlug) return bySlug;

    return null;
  },

  create(data: CreateProductBody & { slug: string }, actorId: string): Promise<ProductRecord> {
    return prisma.product.create({
      data: {
        name: data.name.trim(),
        slug: data.slug.trim().toLowerCase(),
        sku: data.sku.trim().toUpperCase(),
        brandId: data.brandId,
        categoryId: data.categoryId,
        description:
          data.description !== undefined && data.description !== null ? data.description.trim() : null,
        price: data.price !== null && data.price !== undefined ? new Prisma.Decimal(data.price) : null,
        priceVisibility: data.priceVisibility,
        status: data.status,
        hotDeal: data.hotDeal,
        imageUrl: null,
        specifications:
          data.specifications !== undefined && data.specifications !== null
            ? (data.specifications as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        ...createdBy(actorId),
      },
      include: productIncludes,
    });
  },

  update(id: string, data: UpdateProductBody & { slug?: string }, actorId: string): Promise<ProductRecord> {
    return prisma.product.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.slug !== undefined && { slug: data.slug.trim().toLowerCase() }),
        ...(data.sku !== undefined && { sku: data.sku.trim().toUpperCase() }),
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
        ...(data.specifications !== undefined && {
          specifications:
            data.specifications !== null
              ? (data.specifications as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
        }),
        ...updatedBy(actorId),
      },
      include: productIncludes,
    });
  },

  updateImage(id: string, imageUrl: string | null, actorId: string): Promise<ProductRecord> {
    return prisma.product.update({
      where: { id },
      data: {
        imageUrl,
        ...updatedBy(actorId),
      },
      include: productIncludes,
    });
  },

  updateSpecifications(
    id: string,
    specifications: ProductSpecificationItem[] | null,
    actorId: string
  ): Promise<ProductRecord> {
    return prisma.product.update({
      where: { id },
      data: {
        specifications:
          specifications !== null ? (specifications as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
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
