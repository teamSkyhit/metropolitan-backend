import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors';
import { buildPaginationMeta, type Paginated } from '../../shared/http';
import { storageService, UPLOAD_LIMITS, validateFileSize, validateImageContent } from '../../shared/storage';
import { brandsRepository, type BrandRecord } from './brands.repository';
import {
  BrandsErrorCode,
  type BrandDto,
  type CreateBrandBody,
  type ListBrandsQuery,
  type PublicBrandDto,
  type UpdateBrandBody,
} from './brands.schema';

function handlePrismaUniqueError(err: unknown): void {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = Array.isArray(err.meta?.target)
      ? err.meta.target.join(',')
      : String(err.meta?.target ?? '');
    if (target.includes('name_key') || target.includes('name')) {
      throw AppError.conflict('A brand with this name already exists', BrandsErrorCode.NAME_TAKEN);
    }
    if (target.includes('slug')) {
      throw AppError.conflict('A brand with this slug already exists', BrandsErrorCode.SLUG_TAKEN);
    }
    throw AppError.conflict('A record with the same unique value already exists');
  }
}

/** Maps database record to Admin DTO. */
export function toBrandDto(record: BrandRecord): BrandDto {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    description: record.description,
    logoUrl: record.logoUrl,
    bannerUrl: record.bannerUrl,
    isActive: record.isActive,
    sortOrder: record.sortOrder,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Maps database record to Public DTO without internal audit fields. */
export function toPublicBrandDto(record: BrandRecord): PublicBrandDto {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    description: record.description,
    logoUrl: record.logoUrl,
    bannerUrl: record.bannerUrl,
  };
}

export function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function assertSlugAvailable(slug: string, exceptBrandId?: string): Promise<void> {
  const existing = await brandsRepository.findBySlugIncludingDeleted(slug);
  if (!existing || existing.id === exceptBrandId) return;
  if (existing.deletedAt) {
    throw AppError.conflict(
      'This slug belongs to a deleted brand. Please restore the deleted brand instead.',
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
      'This name belongs to a deleted brand. Please restore the deleted brand instead of creating a new one.',
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

  /** Public list: only active, non-deleted brands sorted by sortOrder ASC, then name ASC. */
  async listPublic(): Promise<PublicBrandDto[]> {
    const items = await brandsRepository.findManyPublic();
    return items.map(toPublicBrandDto);
  },

  /** Public slug lookup: only active, non-deleted brand. */
  async getBySlugPublic(slug: string): Promise<PublicBrandDto> {
    const record = await brandsRepository.findBySlugPublic(slug);
    if (!record) throw AppError.notFound('Brand');
    return toPublicBrandDto(record);
  },

  async create(body: CreateBrandBody, actorId: string): Promise<BrandDto> {
    const slug = body.slug?.trim() ? body.slug.trim() : generateSlug(body.name);
    await assertNameAvailable(body.name);
    await assertSlugAvailable(slug);
    try {
      const record = await brandsRepository.create({ ...body, slug }, actorId);
      return toBrandDto(record);
    } catch (err) {
      handlePrismaUniqueError(err);
      throw err;
    }
  },

  async update(id: string, body: UpdateBrandBody, actorId: string): Promise<BrandDto> {
    const existing = await brandsRepository.findById(id);
    if (!existing) throw AppError.notFound('Brand');

    if (body.name && body.name.trim().toLowerCase() !== existing.name.trim().toLowerCase()) {
      await assertNameAvailable(body.name, id);
    }
    if (body.slug && body.slug !== existing.slug) {
      await assertSlugAvailable(body.slug, id);
    }

    try {
      const updated = await brandsRepository.update(id, body, actorId);
      return toBrandDto(updated);
    } catch (err) {
      handlePrismaUniqueError(err);
      throw err;
    }
  },

  async softDelete(id: string, actorId: string): Promise<void> {
    const existing = await brandsRepository.findById(id);
    if (!existing) throw AppError.notFound('Brand');
    await brandsRepository.softDelete(id, actorId);
  },

  async restore(id: string, actorId: string): Promise<BrandDto> {
    const existing = await brandsRepository.findByIdIncludingDeleted(id);
    if (!existing) throw AppError.notFound('Brand');
    if (!existing.deletedAt) {
      throw AppError.conflict('Brand is not deleted', BrandsErrorCode.NOT_DELETED);
    }
    const restored = await brandsRepository.restore(id, actorId);
    return toBrandDto(restored);
  },

  async uploadLogo(id: string, file: Express.Multer.File, actorId: string): Promise<BrandDto> {
    const brand = await brandsRepository.findById(id);
    if (!brand) throw AppError.notFound('Brand');

    validateFileSize(file.size, UPLOAD_LIMITS.LOGO_MAX_BYTES, 'Logo');
    const validated = validateImageContent(file.buffer);

    if (brand.logoUrl) {
      await storageService.delete(brand.logoUrl);
    }

    const stored = await storageService.upload(
      {
        filename: `${randomUUID()}${validated.extension}`,
        buffer: file.buffer,
        mimeType: validated.mimeType,
        size: file.size,
      },
      'brands/logos'
    );

    const updated = await brandsRepository.updateLogo(id, stored.url, actorId);
    return toBrandDto(updated);
  },

  async removeLogo(id: string, actorId: string): Promise<BrandDto> {
    const brand = await brandsRepository.findById(id);
    if (!brand) throw AppError.notFound('Brand');

    if (brand.logoUrl) {
      await storageService.delete(brand.logoUrl);
    }

    const updated = await brandsRepository.updateLogo(id, null, actorId);
    return toBrandDto(updated);
  },

  async uploadBanner(id: string, file: Express.Multer.File, actorId: string): Promise<BrandDto> {
    const brand = await brandsRepository.findById(id);
    if (!brand) throw AppError.notFound('Brand');

    validateFileSize(file.size, UPLOAD_LIMITS.BANNER_MAX_BYTES, 'Banner');
    const validated = validateImageContent(file.buffer);

    if (brand.bannerUrl) {
      await storageService.delete(brand.bannerUrl);
    }

    const stored = await storageService.upload(
      {
        filename: `${randomUUID()}${validated.extension}`,
        buffer: file.buffer,
        mimeType: validated.mimeType,
        size: file.size,
      },
      'brands/banners'
    );

    const updated = await brandsRepository.updateBanner(id, stored.url, actorId);
    return toBrandDto(updated);
  },

  async removeBanner(id: string, actorId: string): Promise<BrandDto> {
    const brand = await brandsRepository.findById(id);
    if (!brand) throw AppError.notFound('Brand');

    if (brand.bannerUrl) {
      await storageService.delete(brand.bannerUrl);
    }

    const updated = await brandsRepository.updateBanner(id, null, actorId);
    return toBrandDto(updated);
  },
};
