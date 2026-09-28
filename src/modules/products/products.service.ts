import { Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors';
import { buildPaginationMeta, type Paginated } from '../../shared/http';
import { brandsRepository } from '../brands';
import { categoriesRepository } from '../categories';
import { productsRepository, type ProductRecord } from './products.repository';
import {
  ProductsErrorCode,
  type CreateProductBody,
  type ListProductsQuery,
  type ProductDto,
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
  const existing = await productsRepository.findBySkuIncludingDeleted(sku);
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

async function assertValidBrand(brandId: string): Promise<void> {
  const brand = await brandsRepository.findByIdIncludingDeleted(brandId);
  if (!brand) {
    throw AppError.badRequest('Selected brand does not exist', ProductsErrorCode.BRAND_NOT_FOUND);
  }
  if (brand.deletedAt) {
    throw AppError.badRequest(
      'Cannot assign a deleted brand to product',
      ProductsErrorCode.BRAND_UNAVAILABLE
    );
  }
}

async function assertValidCategory(categoryId: string): Promise<void> {
  const category = await categoriesRepository.findByIdIncludingDeleted(categoryId);
  if (!category) {
    throw AppError.badRequest('Selected category does not exist', ProductsErrorCode.CATEGORY_NOT_FOUND);
  }
  if (category.deletedAt) {
    throw AppError.badRequest(
      'Cannot assign a deleted category to product',
      ProductsErrorCode.CATEGORY_UNAVAILABLE
    );
  }
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
    await assertSkuAvailable(body.sku.trim());

    try {
      const record = await productsRepository.create(body, actorId);
      return toProductDto(record);
    } catch (err) {
      handlePrismaUniqueError(err);
      throw err;
    }
  },

  async update(id: string, body: UpdateProductBody, actorId: string): Promise<ProductDto> {
    const existing = await productsRepository.findById(id);
    if (!existing) throw AppError.notFound('Product');

    if (body.sku && body.sku.trim() !== existing.sku) {
      await assertSkuAvailable(body.sku.trim(), id);
    }
    if (body.brandId && body.brandId !== existing.brandId) {
      await assertValidBrand(body.brandId);
    }
    if (body.categoryId && body.categoryId !== existing.categoryId) {
      await assertValidCategory(body.categoryId);
    }

    try {
      const updated = await productsRepository.update(id, body, actorId);
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
};
