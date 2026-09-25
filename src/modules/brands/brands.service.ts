import { AppError } from '../../shared/errors';
import { buildPaginationMeta, type Paginated } from '../../shared/http';
import { brandsRepository, type BrandRecord } from './brands.repository';
import {
  BrandsErrorCode,
  type BrandDto,
  type CreateBrandBody,
  type ListBrandsQuery,
  type UpdateBrandBody,
} from './brands.schema';

/** Business rules live here. Throw AppError for expected failures. */
export function toBrandDto(record: BrandRecord): BrandDto {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    description: record.description,
    logoUrl: record.logoUrl,
    isActive: record.isActive,
    sortOrder: record.sortOrder,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function assertSlugAvailable(slug: string, exceptBrandId?: string): Promise<void> {
  const existing = await brandsRepository.findBySlugIncludingDeleted(slug);
  if (!existing || existing.id === exceptBrandId) return;
  if (existing.deletedAt) {
    throw AppError.conflict(
      'This slug belongs to a deleted brand. Choose a different slug.',
      BrandsErrorCode.SLUG_BELONGS_TO_DELETED_BRAND,
      { brandId: existing.id }
    );
  }
  throw AppError.conflict('A brand with this slug already exists', BrandsErrorCode.SLUG_TAKEN);
}

async function assertNameAvailable(name: string, exceptBrandId?: string): Promise<void> {
  const existing = await brandsRepository.findByNameIncludingDeleted(name);
  if (!existing || existing.id === exceptBrandId) return;
  if (existing.deletedAt) {
    throw AppError.conflict(
      'This name belongs to a deleted brand. Choose a different name.',
      BrandsErrorCode.NAME_BELONGS_TO_DELETED_BRAND,
      { brandId: existing.id }
    );
  }
  throw AppError.conflict('A brand with this name already exists', BrandsErrorCode.NAME_TAKEN);
}

export const brandsService = {
  async list(query: ListBrandsQuery): Promise<Paginated<BrandDto>> {
    const { items, total } = await brandsRepository.findMany(query);
    return { items: items.map(toBrandDto), pagination: buildPaginationMeta(query, total) };
  },

  async getById(id: string): Promise<BrandDto> {
    const record = await brandsRepository.findById(id);
    if (!record) throw AppError.notFound('Brand');
    return toBrandDto(record);
  },

  async create(body: CreateBrandBody, actorId: string): Promise<BrandDto> {
    await assertNameAvailable(body.name);
    await assertSlugAvailable(body.slug);
    const record = await brandsRepository.create(body, actorId);
    return toBrandDto(record);
  },

  async update(id: string, body: UpdateBrandBody, actorId: string): Promise<BrandDto> {
    const existing = await brandsRepository.findById(id);
    if (!existing) throw AppError.notFound('Brand');

    if (body.name && body.name.toLowerCase() !== existing.name.toLowerCase()) {
      await assertNameAvailable(body.name, id);
    }
    if (body.slug && body.slug !== existing.slug) {
      await assertSlugAvailable(body.slug, id);
    }

    const updated = await brandsRepository.update(id, body, actorId);
    return toBrandDto(updated);
  },

  async softDelete(id: string, actorId: string): Promise<void> {
    const existing = await brandsRepository.findById(id);
    if (!existing) throw AppError.notFound('Brand');
    await brandsRepository.softDelete(id, actorId);
  },
};
