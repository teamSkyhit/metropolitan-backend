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
  CreateProductFeatureBody,
  CreateProductKeyBenefitBody,
  ListProductsQuery,
  ListPublicProductsQuery,
  ProductSpecificationItem,
  UpdateProductBody,
  UpdateProductFeatureBody,
  UpdateProductKeyBenefitBody,
} from './products.schema';

const productIncludes = {
  brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
  category: { select: { id: true, name: true, slug: true, imageUrl: true, bannerUrl: true } },
  galleryImages: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      media: { select: { id: true, publicUrl: true } },
    },
  },
  videos: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      media: { select: { id: true, publicUrl: true } },
    },
  },
  documents: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      media: { select: { id: true, publicUrl: true, fileName: true } },
    },
  },
  features: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
  keyBenefits: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
  relatedProducts: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      relatedProduct: {
        select: {
          id: true,
          name: true,
          slug: true,
          sku: true,
          imageUrl: true,
          price: true,
          priceVisibility: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  },
} satisfies Prisma.ProductInclude;

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
      imageUrl: true,
      bannerUrl: true,
    },
  },
  galleryImages: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      media: { select: { id: true, publicUrl: true } },
    },
  },
  videos: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      media: { select: { id: true, publicUrl: true } },
    },
  },
  documents: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      media: { select: { id: true, publicUrl: true, fileName: true } },
    },
  },
  features: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
  keyBenefits: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
  relatedProducts: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      relatedProduct: {
        select: {
          id: true,
          name: true,
          slug: true,
          sku: true,
          imageUrl: true,
          price: true,
          priceVisibility: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  },
} satisfies Prisma.ProductInclude;

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

  async isMediaUrlReferenced(url: string, id?: string): Promise<boolean> {
    const countProduct = await prisma.product.count({
      where: {
        OR: [{ imageUrl: url }, { ogImageUrl: url }],
        ...notDeleted,
      },
    });
    if (countProduct > 0) return true;

    if (id) {
      const countGallery = await prisma.productGalleryImage.count({
        where: {
          mediaId: id,
          ...notDeleted,
          product: notDeleted,
        },
      });
      if (countGallery > 0) return true;

      const countVideo = await prisma.productVideo.count({
        where: {
          mediaId: id,
          ...notDeleted,
          product: notDeleted,
        },
      });
      if (countVideo > 0) return true;

      const countDoc = await prisma.productDocument.count({
        where: {
          mediaId: id,
          ...notDeleted,
          product: notDeleted,
        },
      });
      if (countDoc > 0) return true;
    }

    return false;
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
        orderBy = [
          { priceVisibility: 'desc' },
          { price: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'asc' },
        ];
        break;
      case 'price_desc':
        orderBy = [
          { priceVisibility: 'desc' },
          { price: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'asc' },
        ];
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

  async findByIdsPublic(ids: string[]): Promise<PublicProductRecord[]> {
    if (ids.length === 0) return [];
    return prisma.product.findMany({
      where: {
        id: { in: ids },
        status: 'PUBLISHED',
        deletedAt: null,
        brand: { deletedAt: null, isActive: true },
        category: { deletedAt: null, isActive: true },
      },
      include: publicProductIncludes,
    });
  },

  async findByIds(ids: string[]): Promise<ProductRecord[]> {
    if (ids.length === 0) return [];
    return prisma.product.findMany({
      where: {
        id: { in: ids },
        ...notDeleted,
      },
      include: productIncludes,
    });
  },

  async lockProduct(productId: string, tx: Prisma.TransactionClient): Promise<void> {
    if (isUuid(productId)) {
      await tx.$executeRaw`SELECT id FROM products WHERE id = ${productId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    }
  },

  create(data: CreateProductBody & { slug: string }, actorId: string): Promise<ProductRecord> {
    return prisma.product.create({
      data: {
        name: data.name.trim(),
        slug: data.slug.trim().toLowerCase(),
        sku: data.sku.trim().toUpperCase(),
        brandId: data.brandId,
        categoryId: data.categoryId,
        shortDescription:
          data.shortDescription !== undefined && data.shortDescription !== null
            ? data.shortDescription.trim()
            : null,
        description:
          data.description !== undefined && data.description !== null ? data.description.trim() : null,
        overview: data.overview !== undefined && data.overview !== null ? data.overview.trim() : null,
        series: data.series !== undefined && data.series !== null ? data.series.trim() : null,
        price: data.price !== null && data.price !== undefined ? new Prisma.Decimal(data.price) : null,
        priceVisibility: data.priceVisibility,
        status: data.status,
        hotDeal: data.hotDeal,
        imageUrl: null,
        metaTitle: data.metaTitle !== undefined && data.metaTitle !== null ? data.metaTitle.trim() : null,
        metaDescription:
          data.metaDescription !== undefined && data.metaDescription !== null
            ? data.metaDescription.trim()
            : null,
        metaKeywords:
          data.metaKeywords !== undefined && data.metaKeywords !== null ? data.metaKeywords.trim() : null,
        canonicalUrl:
          data.canonicalUrl !== undefined && data.canonicalUrl !== null ? data.canonicalUrl.trim() : null,
        ogImageUrl: data.ogImageUrl !== undefined && data.ogImageUrl !== null ? data.ogImageUrl.trim() : null,
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
        ...(data.shortDescription !== undefined && {
          shortDescription: data.shortDescription !== null ? data.shortDescription.trim() : null,
        }),
        ...(data.description !== undefined && {
          description: data.description !== null ? data.description.trim() : null,
        }),
        ...(data.overview !== undefined && {
          overview: data.overview !== null ? data.overview.trim() : null,
        }),
        ...(data.series !== undefined && {
          series: data.series !== null ? data.series.trim() : null,
        }),
        ...(data.price !== undefined && {
          price: data.price !== null ? new Prisma.Decimal(data.price) : null,
        }),
        ...(data.priceVisibility !== undefined && { priceVisibility: data.priceVisibility }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.hotDeal !== undefined && { hotDeal: data.hotDeal }),
        ...(data.metaTitle !== undefined && {
          metaTitle: data.metaTitle !== null ? data.metaTitle.trim() : null,
        }),
        ...(data.metaDescription !== undefined && {
          metaDescription: data.metaDescription !== null ? data.metaDescription.trim() : null,
        }),
        ...(data.metaKeywords !== undefined && {
          metaKeywords: data.metaKeywords !== null ? data.metaKeywords.trim() : null,
        }),
        ...(data.canonicalUrl !== undefined && {
          canonicalUrl: data.canonicalUrl !== null ? data.canonicalUrl.trim() : null,
        }),
        ...(data.ogImageUrl !== undefined && {
          ogImageUrl: data.ogImageUrl !== null ? data.ogImageUrl.trim() : null,
        }),
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

  updateImage(
    id: string,
    imageUrl: string | null,
    actorId: string,
    tx?: Prisma.TransactionClient
  ): Promise<ProductRecord> {
    const client = tx ?? prisma;
    return client.product.update({
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

  countActiveGalleryImages(productId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx ?? prisma;
    return client.productGalleryImage.count({
      where: {
        productId,
        ...notDeleted,
      },
    });
  },

  findActiveGalleryImages(productId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.productGalleryImage.findMany({
      where: {
        productId,
        ...notDeleted,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        media: { select: { id: true, publicUrl: true } },
      },
    });
  },

  findActiveGalleryImageById(productId: string, galleryImageId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.productGalleryImage.findFirst({
      where: {
        id: galleryImageId,
        productId,
        ...notDeleted,
      },
      include: {
        media: { select: { id: true, publicUrl: true } },
      },
    });
  },

  findGalleryImageByMediaId(productId: string, mediaId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.productGalleryImage.findFirst({
      where: {
        productId,
        mediaId,
        ...notDeleted,
      },
    });
  },

  async addGalleryImage(
    productId: string,
    data: { mediaId: string; sortOrder: number; isPrimary: boolean },
    actorId: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? prisma;
    return client.productGalleryImage.create({
      data: {
        productId,
        mediaId: data.mediaId,
        sortOrder: data.sortOrder,
        isPrimary: data.isPrimary,
        ...createdBy(actorId),
      },
      include: {
        media: { select: { id: true, publicUrl: true } },
      },
    });
  },

  async removeGalleryImage(
    productId: string,
    galleryImageId: string,
    actorId: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? prisma;
    return client.productGalleryImage.update({
      where: { id: galleryImageId },
      data: softDeleteData(actorId),
    });
  },

  async setPrimaryGalleryImage(
    productId: string,
    galleryImageId: string,
    actorId: string,
    externalTx?: Prisma.TransactionClient
  ) {
    const run = async (tx: Prisma.TransactionClient) => {
      // Clear primary from all images of this product
      await tx.productGalleryImage.updateMany({
        where: { productId, ...notDeleted },
        data: { isPrimary: false, ...updatedBy(actorId) },
      });
      // Set primary on selected image
      const primaryImage = await tx.productGalleryImage.update({
        where: { id: galleryImageId },
        data: { isPrimary: true, ...updatedBy(actorId) },
        include: {
          media: { select: { id: true, publicUrl: true } },
        },
      });
      // Sync with product.imageUrl
      await tx.product.update({
        where: { id: productId },
        data: { imageUrl: primaryImage.media.publicUrl, ...updatedBy(actorId) },
      });
      return primaryImage;
    };

    if (externalTx) {
      return run(externalTx);
    }
    return prisma.$transaction(async (tx) => {
      await this.lockProduct(productId, tx);
      return run(tx);
    });
  },

  async reorderGalleryImages(
    productId: string,
    imageIds: string[],
    actorId: string,
    externalTx?: Prisma.TransactionClient
  ) {
    const run = async (tx: Prisma.TransactionClient) => {
      for (let i = 0; i < imageIds.length; i++) {
        await tx.productGalleryImage.update({
          where: { id: imageIds[i] },
          data: { sortOrder: i, ...updatedBy(actorId) },
        });
      }
    };

    if (externalTx) {
      return run(externalTx);
    }
    return prisma.$transaction(async (tx) => {
      await this.lockProduct(productId, tx);
      return run(tx);
    });
  },

  countActiveDocuments(productId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx ?? prisma;
    return client.productDocument.count({
      where: {
        productId,
        ...notDeleted,
      },
    });
  },

  findActiveDocuments(productId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.productDocument.findMany({
      where: {
        productId,
        ...notDeleted,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        media: { select: { id: true, publicUrl: true, fileName: true } },
      },
    });
  },

  findActiveDocumentById(productId: string, documentId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.productDocument.findFirst({
      where: {
        id: documentId,
        productId,
        ...notDeleted,
      },
      include: {
        media: { select: { id: true, publicUrl: true, fileName: true } },
      },
    });
  },

  findDocumentByMediaId(productId: string, mediaId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.productDocument.findFirst({
      where: {
        productId,
        mediaId,
        ...notDeleted,
      },
    });
  },

  async addDocument(
    productId: string,
    data: { mediaId: string; title: string; originalFileName?: string | null; sortOrder: number },
    actorId: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? prisma;
    return client.productDocument.create({
      data: {
        productId,
        mediaId: data.mediaId,
        title: data.title,
        originalFileName: data.originalFileName ?? null,
        sortOrder: data.sortOrder,
        ...createdBy(actorId),
      },
      include: {
        media: { select: { id: true, publicUrl: true, fileName: true } },
      },
    });
  },

  async removeDocument(
    productId: string,
    documentId: string,
    actorId: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? prisma;
    return client.productDocument.update({
      where: { id: documentId },
      data: softDeleteData(actorId),
    });
  },

  async updateDocumentTitle(
    productId: string,
    documentId: string,
    title: string,
    actorId: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? prisma;
    return client.productDocument.update({
      where: { id: documentId },
      data: { title, ...updatedBy(actorId) },
      include: {
        media: { select: { id: true, publicUrl: true, fileName: true } },
      },
    });
  },

  async reorderDocuments(
    productId: string,
    documentIds: string[],
    actorId: string,
    externalTx?: Prisma.TransactionClient
  ) {
    const run = async (tx: Prisma.TransactionClient) => {
      for (let i = 0; i < documentIds.length; i++) {
        await tx.productDocument.update({
          where: { id: documentIds[i] },
          data: { sortOrder: i, ...updatedBy(actorId) },
        });
      }
    };

    if (externalTx) {
      return run(externalTx);
    }
    return prisma.$transaction(async (tx) => {
      await this.lockProduct(productId, tx);
      return run(tx);
    });
  },

  countActiveVideos(productId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx ?? prisma;
    return client.productVideo.count({
      where: {
        productId,
        ...notDeleted,
      },
    });
  },

  findActiveVideos(productId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.productVideo.findMany({
      where: {
        productId,
        ...notDeleted,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        media: { select: { id: true, publicUrl: true } },
      },
    });
  },

  findActiveVideoById(productId: string, videoId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.productVideo.findFirst({
      where: {
        id: videoId,
        productId,
        ...notDeleted,
      },
      include: {
        media: { select: { id: true, publicUrl: true } },
      },
    });
  },

  findVideoByMediaId(productId: string, mediaId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.productVideo.findFirst({
      where: {
        productId,
        mediaId,
        ...notDeleted,
      },
    });
  },

  async addVideo(
    productId: string,
    data: { mediaId: string; title?: string | null; sortOrder: number },
    actorId: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? prisma;
    return client.productVideo.create({
      data: {
        productId,
        mediaId: data.mediaId,
        title: data.title ?? null,
        sortOrder: data.sortOrder,
        ...createdBy(actorId),
      },
      include: {
        media: { select: { id: true, publicUrl: true } },
      },
    });
  },

  async removeVideo(productId: string, videoId: string, actorId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.productVideo.update({
      where: { id: videoId },
      data: softDeleteData(actorId),
    });
  },

  async updateVideoTitle(
    productId: string,
    videoId: string,
    title: string | null,
    actorId: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? prisma;
    return client.productVideo.update({
      where: { id: videoId },
      data: { title, ...updatedBy(actorId) },
      include: {
        media: { select: { id: true, publicUrl: true } },
      },
    });
  },

  async reorderVideos(
    productId: string,
    videoIds: string[],
    actorId: string,
    externalTx?: Prisma.TransactionClient
  ) {
    const run = async (tx: Prisma.TransactionClient) => {
      for (let i = 0; i < videoIds.length; i++) {
        await tx.productVideo.update({
          where: { id: videoIds[i] },
          data: { sortOrder: i, ...updatedBy(actorId) },
        });
      }
    };

    if (externalTx) {
      return run(externalTx);
    }
    return prisma.$transaction(async (tx) => {
      await this.lockProduct(productId, tx);
      return run(tx);
    });
  },

  findActiveFeatureById(productId: string, featureId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.productFeature.findFirst({
      where: {
        id: featureId,
        productId,
        ...notDeleted,
      },
    });
  },

  async addFeature(
    productId: string,
    data: CreateProductFeatureBody,
    actorId: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? prisma;
    const sortOrder =
      data.sortOrder !== undefined
        ? data.sortOrder
        : await client.productFeature.count({
            where: { productId, ...notDeleted },
          });

    return client.productFeature.create({
      data: {
        productId,
        icon: data.icon.trim(),
        title: data.title.trim(),
        description: data.description.trim(),
        sortOrder,
        ...createdBy(actorId),
      },
    });
  },

  async updateFeature(
    productId: string,
    featureId: string,
    data: UpdateProductFeatureBody,
    actorId: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? prisma;
    return client.productFeature.update({
      where: { id: featureId },
      data: {
        ...(data.icon !== undefined && { icon: data.icon.trim() }),
        ...(data.title !== undefined && { title: data.title.trim() }),
        ...(data.description !== undefined && { description: data.description.trim() }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...updatedBy(actorId),
      },
    });
  },

  async removeFeature(productId: string, featureId: string, actorId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.productFeature.update({
      where: { id: featureId },
      data: softDeleteData(actorId),
    });
  },

  async reorderFeatures(
    productId: string,
    featureIds: string[],
    actorId: string,
    externalTx?: Prisma.TransactionClient
  ) {
    const run = async (tx: Prisma.TransactionClient) => {
      for (let i = 0; i < featureIds.length; i++) {
        await tx.productFeature.update({
          where: { id: featureIds[i] },
          data: { sortOrder: i, ...updatedBy(actorId) },
        });
      }
    };

    if (externalTx) {
      return run(externalTx);
    }
    return prisma.$transaction(async (tx) => {
      await this.lockProduct(productId, tx);
      return run(tx);
    });
  },

  findActiveKeyBenefitById(productId: string, benefitId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.productKeyBenefit.findFirst({
      where: {
        id: benefitId,
        productId,
        ...notDeleted,
      },
    });
  },

  async addKeyBenefit(
    productId: string,
    data: CreateProductKeyBenefitBody,
    actorId: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? prisma;
    const sortOrder =
      data.sortOrder !== undefined
        ? data.sortOrder
        : await client.productKeyBenefit.count({
            where: { productId, ...notDeleted },
          });

    return client.productKeyBenefit.create({
      data: {
        productId,
        icon: data.icon.trim(),
        title: data.title.trim(),
        description: data.description.trim(),
        sortOrder,
        ...createdBy(actorId),
      },
    });
  },

  async updateKeyBenefit(
    productId: string,
    benefitId: string,
    data: UpdateProductKeyBenefitBody,
    actorId: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? prisma;
    return client.productKeyBenefit.update({
      where: { id: benefitId },
      data: {
        ...(data.icon !== undefined && { icon: data.icon.trim() }),
        ...(data.title !== undefined && { title: data.title.trim() }),
        ...(data.description !== undefined && { description: data.description.trim() }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...updatedBy(actorId),
      },
    });
  },

  async removeKeyBenefit(
    productId: string,
    benefitId: string,
    actorId: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? prisma;
    return client.productKeyBenefit.update({
      where: { id: benefitId },
      data: softDeleteData(actorId),
    });
  },

  async reorderKeyBenefits(
    productId: string,
    benefitIds: string[],
    actorId: string,
    externalTx?: Prisma.TransactionClient
  ) {
    const run = async (tx: Prisma.TransactionClient) => {
      for (let i = 0; i < benefitIds.length; i++) {
        await tx.productKeyBenefit.update({
          where: { id: benefitIds[i] },
          data: { sortOrder: i, ...updatedBy(actorId) },
        });
      }
    };

    if (externalTx) {
      return run(externalTx);
    }
    return prisma.$transaction(async (tx) => {
      await this.lockProduct(productId, tx);
      return run(tx);
    });
  },

  async setRelatedProducts(
    productId: string,
    relatedProductIds: string[],
    actorId: string,
    externalTx?: Prisma.TransactionClient
  ) {
    const run = async (tx: Prisma.TransactionClient) => {
      await tx.productRelatedProduct.deleteMany({
        where: { productId },
      });
      for (let i = 0; i < relatedProductIds.length; i++) {
        await tx.productRelatedProduct.create({
          data: {
            productId,
            relatedProductId: relatedProductIds[i]!,
            sortOrder: i,
          },
        });
      }
    };

    if (externalTx) {
      return run(externalTx);
    }
    return prisma.$transaction(async (tx) => {
      await this.lockProduct(productId, tx);
      return run(tx);
    });
  },

  async withTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  },
};
