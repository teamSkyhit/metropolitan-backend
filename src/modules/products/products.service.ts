import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors';
import { buildPaginationMeta, type Paginated } from '../../shared/http';
import { storageService, UPLOAD_LIMITS, validateFileSize, validateImageContent } from '../../shared/storage';
import { productsRepository, type ProductRecord } from './products.repository';
import {
  normalizeSku,
  ProductsErrorCode,
  type CreateProductBody,
  type ListProductsQuery,
  type ProductDto,
  type ProductSpecificationItem,
  type UpdateProductBody,
} from './products.schema';

function handlePrismaUniqueError(err: unknown): void {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = Array.isArray(err.meta?.target)
      ? err.meta.target.join(',')
      : String(err.meta?.target ?? '');
    if (target.includes('sku')) {
      throw AppError.conflict('A product with this SKU already exists', ProductsErrorCode.SKU_TAKEN);
    }
    throw AppError.conflict('A record with the same unique value already exists');
  }
}

/** Maps database record to Admin Product DTO. */
export function toProductDto(record: ProductRecord): ProductDto {
  return {
    id: record.id,
    name: record.name,
    sku: record.sku,
    brandId: record.brandId,
    categoryId: record.categoryId,
    description: record.description,
    price: record.price !== null ? record.price.toNumber() : null,
    priceVisibility: record.priceVisibility,
    status: record.status,
    hotDeal: record.hotDeal,
    imageUrl: record.imageUrl ?? null,
    specifications: Array.isArray(record.specifications)
      ? (record.specifications as unknown as ProductSpecificationItem[])
      : null,
    brand: record.brand
      ? {
          id: record.brand.id,
          name: record.brand.name,
          slug: record.brand.slug,
        }
      : undefined,
    category: record.category
      ? {
          id: record.category.id,
          name: record.category.name,
          slug: record.category.slug,
        }
      : undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function assertSkuAvailable(sku: string, exceptProductId?: string): Promise<void> {
  const normalizedSku = normalizeSku(sku);
  const existing = await productsRepository.findBySkuIncludingDeleted(normalizedSku);
  if (!existing || existing.id === exceptProductId) return;
  if (existing.deletedAt) {
    throw AppError.conflict(
      'This SKU belongs to a deleted product. Please restore the deleted product instead.',
      ProductsErrorCode.SKU_BELONGS_TO_DELETED_PRODUCT,
      { productId: existing.id }
    );
  }
  throw AppError.conflict('A product with this SKU already exists', ProductsErrorCode.SKU_TAKEN);
}

export interface BrandAssignableValidator {
  assertAssignable(
    id: string,
    options?: { notFoundCode?: string; unavailableCode?: string }
  ): Promise<unknown>;
}

export interface CategoryAssignableValidator {
  assertAssignable(
    id: string,
    options?: { notFoundCode?: string; unavailableCode?: string }
  ): Promise<unknown>;
}

let configuredBrandsService: BrandAssignableValidator | null = null;
let configuredCategoriesService: CategoryAssignableValidator | null = null;

/**
 * Wires cross-module brand and category assignable validators from the composition root
 * (src/routes/index.ts) to avoid circular imports between products, brands, and categories.
 */
export function registerProductAssignValidation(deps: {
  brandsService: BrandAssignableValidator;
  categoriesService: CategoryAssignableValidator;
}): void {
  configuredBrandsService = deps.brandsService;
  configuredCategoriesService = deps.categoriesService;
}

async function assertValidBrand(brandId: string): Promise<void> {
  const validator = configuredBrandsService;
  if (!validator) {
    throw AppError.internal('Brands service validator is not configured');
  }
  await validator.assertAssignable(brandId, {
    notFoundCode: ProductsErrorCode.BRAND_NOT_FOUND,
    unavailableCode: ProductsErrorCode.BRAND_UNAVAILABLE,
  });
}

async function assertValidCategory(categoryId: string): Promise<void> {
  const validator = configuredCategoriesService;
  if (!validator) {
    throw AppError.internal('Categories service validator is not configured');
  }
  await validator.assertAssignable(categoryId, {
    notFoundCode: ProductsErrorCode.CATEGORY_NOT_FOUND,
    unavailableCode: ProductsErrorCode.CATEGORY_UNAVAILABLE,
  });
}

export const productsService = {
  async list(query: ListProductsQuery): Promise<Paginated<ProductDto>> {
    const { items, total } = await productsRepository.findMany(query);
    return { items: items.map(toProductDto), pagination: buildPaginationMeta(query, total) };
  },

  async getById(id: string): Promise<ProductDto> {
    const record = await productsRepository.findById(id);
    if (!record) throw AppError.notFound('Product');
    return toProductDto(record);
  },

  async create(body: CreateProductBody, actorId: string): Promise<ProductDto> {
    await assertValidBrand(body.brandId);
    await assertValidCategory(body.categoryId);
    const normalizedSku = normalizeSku(body.sku);
    await assertSkuAvailable(normalizedSku);

    try {
      const record = await productsRepository.create({ ...body, sku: normalizedSku }, actorId);
      return toProductDto(record);
    } catch (err) {
      handlePrismaUniqueError(err);
      throw err;
    }
  },

  async update(id: string, body: UpdateProductBody, actorId: string): Promise<ProductDto> {
    const existing = await productsRepository.findById(id);
    if (!existing) throw AppError.notFound('Product');

    const normalizedSku = body.sku !== undefined ? normalizeSku(body.sku) : undefined;

    if (normalizedSku && normalizedSku !== existing.sku) {
      await assertSkuAvailable(normalizedSku, id);
    }
    if (body.brandId && body.brandId !== existing.brandId) {
      await assertValidBrand(body.brandId);
    }
    if (body.categoryId && body.categoryId !== existing.categoryId) {
      await assertValidCategory(body.categoryId);
    }

    try {
      const updated = await productsRepository.update(
        id,
        { ...body, ...(normalizedSku !== undefined && { sku: normalizedSku }) },
        actorId
      );
      return toProductDto(updated);
    } catch (err) {
      handlePrismaUniqueError(err);
      throw err;
    }
  },

  async softDelete(id: string, actorId: string): Promise<void> {
    const existing = await productsRepository.findById(id);
    if (!existing) throw AppError.notFound('Product');
    await productsRepository.softDelete(id, actorId);
  },

  async restore(id: string, actorId: string): Promise<ProductDto> {
    const existing = await productsRepository.findByIdIncludingDeleted(id);
    if (!existing) throw AppError.notFound('Product');
    if (!existing.deletedAt) {
      throw AppError.conflict('Product is not deleted', ProductsErrorCode.NOT_DELETED);
    }
    const restored = await productsRepository.restore(id, actorId);
    return toProductDto(restored);
  },

  async uploadImage(id: string, file: Express.Multer.File, actorId: string): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    validateFileSize(file.size, UPLOAD_LIMITS.PRODUCT_IMAGE_MAX_BYTES, 'Product image');
    const validated = validateImageContent(file.buffer);

    const oldImageUrl = product.imageUrl;

    const stored = await storageService.upload(
      {
        filename: `${randomUUID()}${validated.extension}`,
        buffer: file.buffer,
        mimeType: validated.mimeType,
        size: file.size,
      },
      'products/images'
    );

    const updated = await productsRepository.updateImage(id, stored.url, actorId);

    if (oldImageUrl && !oldImageUrl.includes('/media/')) {
      await storageService.delete(oldImageUrl).catch(() => {});
    }

    return toProductDto(updated);
  },

  async removeImage(id: string, actorId: string): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    const oldImageUrl = product.imageUrl;
    const updated = await productsRepository.updateImage(id, null, actorId);

    if (oldImageUrl && !oldImageUrl.includes('/media/')) {
      await storageService.delete(oldImageUrl).catch(() => {});
    }

    return toProductDto(updated);
  },

  async updateSpecifications(
    id: string,
    specifications: ProductSpecificationItem[],
    actorId: string
  ): Promise<ProductDto> {
    const product = await productsRepository.findById(id);
    if (!product) throw AppError.notFound('Product');

    const updated = await productsRepository.updateSpecifications(id, specifications, actorId);
    return toProductDto(updated);
  },

  async isMediaUrlReferenced(url: string): Promise<boolean> {
    return productsRepository.isMediaUrlReferenced(url);
  },
};
