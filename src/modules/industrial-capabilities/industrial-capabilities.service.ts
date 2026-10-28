import { randomUUID } from 'node:crypto';
import { translatePrismaUniqueError } from '../../shared/database';
import { AppError } from '../../shared/errors';
import { buildPaginationMeta, type Paginated } from '../../shared/http';
import { logger } from '../../shared/logger';
import { storageService, UPLOAD_LIMITS, validateFileSize, validateImageContent } from '../../shared/storage';
import { mediaService } from '../media';
import {
  industrialCapabilitiesRepository,
  type IndustrialCapabilityRecord,
} from './industrial-capabilities.repository';
import {
  IndustrialCapabilitiesErrorCode,
  type CreateIndustrialCapabilityBody,
  type IndustrialCapabilityDto,
  type IndustrialCapabilitySectionSettingsDto,
  type ListIndustrialCapabilitiesQuery,
  type PublicIndustrialCapabilitiesDataDto,
  type PublicIndustrialCapabilitySegmentDto,
  type ReorderIndustrialCapabilitiesBody,
  type UpdateIndustrialCapabilityBody,
  type UpdateIndustrialCapabilitySectionSettingsBody,
} from './industrial-capabilities.schema';

function handleUniqueError(err: unknown): never {
  translatePrismaUniqueError(err, [
    {
      fieldSubstring: 'slug',
      errorCode: IndustrialCapabilitiesErrorCode.SLUG_CONFLICT,
      errorMessage: 'An industrial capability with this slug already exists',
    },
  ]);
}

/** Maps database record to CRM Admin DTO */
export function toIndustrialCapabilityDto(record: IndustrialCapabilityRecord): IndustrialCapabilityDto {
  const typicalProducts = Array.isArray(record.typicalProducts) ? (record.typicalProducts as string[]) : [];

  return {
    id: record.id,
    number: record.number,
    title: record.title,
    slug: record.slug,
    imageUrl: record.imageUrl,
    imageMediaId: record.imageMediaId,
    icon: record.icon,
    shortDescription: record.shortDescription,
    description: record.description,
    typicalProducts,
    sortOrder: record.sortOrder,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Maps database record to Public website segment (excludes internal audit and media IDs) */
export function toPublicSegmentDto(record: IndustrialCapabilityRecord): PublicIndustrialCapabilitySegmentDto {
  const typicalProducts = Array.isArray(record.typicalProducts) ? (record.typicalProducts as string[]) : [];

  return {
    id: record.id,
    number: record.number,
    title: record.title,
    slug: record.slug,
    imageUrl: record.imageUrl,
    icon: record.icon,
    shortDescription: record.shortDescription,
    description: record.description,
    typicalProducts,
    sortOrder: record.sortOrder,
  };
}

async function assertSlugAvailable(slug: string, exceptId?: string): Promise<void> {
  const existing = await industrialCapabilitiesRepository.findBySlugIncludingDeleted(slug);
  if (!existing || existing.id === exceptId) return;

  if (existing.deletedAt) {
    throw AppError.conflict(
      'This slug belongs to a deleted industrial capability. Please restore or use a different slug.',
      IndustrialCapabilitiesErrorCode.SLUG_BELONGS_TO_DELETED,
      { capabilityId: existing.id }
    );
  }

  throw AppError.conflict(
    'An industrial capability with this slug already exists',
    IndustrialCapabilitiesErrorCode.SLUG_CONFLICT
  );
}

/**
 * Safely cleans up replaced or removed capability media.
 * If media-backed (oldMediaId exists), delegates exclusively to mediaService.deleteIfUnreferenced.
 * If legacy URL-only, deletes directly via storageService.
 * Never calls storageService.delete directly when mediaId is present.
 */
async function cleanupOldMedia(
  capabilityId: string,
  oldMediaId: string | null | undefined,
  oldUrl: string | null | undefined,
  actorId: string
): Promise<void> {
  if (oldMediaId) {
    try {
      await mediaService.deleteIfUnreferenced(oldMediaId, actorId);
    } catch (err) {
      logger.warn(
        { err, capabilityId, oldMediaId },
        'Non-blocking error during capability media cleanup via mediaService'
      );
    }
  } else if (oldUrl) {
    try {
      await storageService.delete(oldUrl);
    } catch (err) {
      logger.warn(
        { err, capabilityId, oldUrl },
        'Non-blocking error during capability legacy URL storage deletion'
      );
    }
  }
}

export const industrialCapabilitiesService = {
  async list(query: ListIndustrialCapabilitiesQuery): Promise<Paginated<IndustrialCapabilityDto>> {
    const { items, total } = await industrialCapabilitiesRepository.findMany(query);
    return {
      items: items.map(toIndustrialCapabilityDto),
      pagination: buildPaginationMeta(query, total),
    };
  },

  async getById(id: string): Promise<IndustrialCapabilityDto> {
    const record = await industrialCapabilitiesRepository.findById(id);
    if (!record) {
      throw AppError.notFound('IndustrialCapability', IndustrialCapabilitiesErrorCode.NOT_FOUND);
    }
    return toIndustrialCapabilityDto(record);
  },

  async getBySlug(slug: string): Promise<IndustrialCapabilityDto> {
    const record = await industrialCapabilitiesRepository.findBySlugIncludingDeleted(slug);
    if (!record || record.deletedAt !== null) {
      throw AppError.notFound('IndustrialCapability', IndustrialCapabilitiesErrorCode.NOT_FOUND);
    }
    return toIndustrialCapabilityDto(record);
  },

  async create(body: CreateIndustrialCapabilityBody, actorId: string): Promise<IndustrialCapabilityDto> {
    await assertSlugAvailable(body.slug);

    try {
      const record = await industrialCapabilitiesRepository.create(body, actorId);
      return toIndustrialCapabilityDto(record);
    } catch (err) {
      handleUniqueError(err);
    }
  },

  async update(
    id: string,
    body: UpdateIndustrialCapabilityBody,
    actorId: string
  ): Promise<IndustrialCapabilityDto> {
    const existing = await industrialCapabilitiesRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('IndustrialCapability', IndustrialCapabilitiesErrorCode.NOT_FOUND);
    }

    if (body.slug && body.slug !== existing.slug) {
      await assertSlugAvailable(body.slug, id);
    }

    try {
      const updated = await industrialCapabilitiesRepository.update(id, body, actorId);
      return toIndustrialCapabilityDto(updated);
    } catch (err) {
      handleUniqueError(err);
    }
  },

  async softDelete(id: string, actorId: string): Promise<void> {
    const existing = await industrialCapabilitiesRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('IndustrialCapability', IndustrialCapabilitiesErrorCode.NOT_FOUND);
    }
    await industrialCapabilitiesRepository.softDelete(id, actorId);
  },

  async reorder(
    body: ReorderIndustrialCapabilitiesBody,
    actorId: string
  ): Promise<IndustrialCapabilityDto[]> {
    const existing = await industrialCapabilitiesRepository.findByIds(body.capabilityIds);
    if (existing.length !== body.capabilityIds.length) {
      throw AppError.notFound('IndustrialCapability', IndustrialCapabilitiesErrorCode.NOT_FOUND);
    }

    const updated = await industrialCapabilitiesRepository.reorder(body.capabilityIds, actorId);
    return updated.map(toIndustrialCapabilityDto);
  },

  async uploadImage(
    id: string,
    file: Express.Multer.File,
    actorId: string
  ): Promise<IndustrialCapabilityDto> {
    const capability = await industrialCapabilitiesRepository.findById(id);
    if (!capability) {
      throw AppError.notFound('IndustrialCapability', IndustrialCapabilitiesErrorCode.NOT_FOUND);
    }

    validateFileSize(file.size, UPLOAD_LIMITS.PRODUCT_IMAGE_MAX_BYTES, 'Capability image');
    const validated = validateImageContent(file.buffer);

    const oldImageUrl = capability.imageUrl;
    const oldImageMediaId = capability.imageMediaId;

    const stored = await storageService.upload(
      {
        filename: `${randomUUID()}${validated.extension}`,
        buffer: file.buffer,
        mimeType: validated.mimeType,
        size: file.size,
      },
      'industrial-capabilities/images'
    );

    let updated: IndustrialCapabilityRecord;
    try {
      updated = await industrialCapabilitiesRepository.withTransaction(async (tx) => {
        const mediaRecord = await mediaService.createManagedMedia(
          {
            fileName: file.originalname || stored.filename,
            storageKey: stored.path,
            publicUrl: stored.url,
            mimeType: validated.mimeType,
            fileSize: file.size,
            uploadedById: actorId,
            actorId,
          },
          tx
        );

        return industrialCapabilitiesRepository.updateImage(id, stored.url, mediaRecord.id, actorId, tx);
      });
    } catch (err) {
      await storageService.delete(stored.path).catch(() => {});
      throw err;
    }

    await cleanupOldMedia(id, oldImageMediaId, oldImageUrl, actorId);

    return toIndustrialCapabilityDto(updated);
  },

  async removeImage(id: string, actorId: string): Promise<IndustrialCapabilityDto> {
    const capability = await industrialCapabilitiesRepository.findById(id);
    if (!capability) {
      throw AppError.notFound('IndustrialCapability', IndustrialCapabilitiesErrorCode.NOT_FOUND);
    }
    if (!capability.imageUrl) {
      throw AppError.notFound(
        'Capability image does not exist',
        IndustrialCapabilitiesErrorCode.IMAGE_NOT_FOUND
      );
    }

    const oldImageUrl = capability.imageUrl;
    const oldImageMediaId = capability.imageMediaId;

    const updated = await industrialCapabilitiesRepository.updateImage(id, null, null, actorId);

    await cleanupOldMedia(id, oldImageMediaId, oldImageUrl, actorId);

    return toIndustrialCapabilityDto(updated);
  },

  // ── Public Website API ───────────────────────────────────────────────────────

  async getPublicData(): Promise<PublicIndustrialCapabilitiesDataDto> {
    const [sectionSettings, records] = await Promise.all([
      industrialCapabilitiesRepository.getSectionSettings(),
      industrialCapabilitiesRepository.findManyPublic(),
    ]);

    return {
      section: {
        eyebrow: sectionSettings.eyebrow,
        title: sectionSettings.title,
        description: sectionSettings.description,
      },
      segments: records.map(toPublicSegmentDto),
    };
  },

  // ── Section Settings ─────────────────────────────────────────────────────────

  async getSectionSettings(): Promise<IndustrialCapabilitySectionSettingsDto> {
    return industrialCapabilitiesRepository.getSectionSettings();
  },

  async updateSectionSettings(
    body: UpdateIndustrialCapabilitySectionSettingsBody,
    actorId: string
  ): Promise<IndustrialCapabilitySectionSettingsDto> {
    return industrialCapabilitiesRepository.upsertSectionSettings(body, actorId);
  },

  // ── Media Reference Checker ──────────────────────────────────────────────────

  async isMediaUrlReferenced(url: string, id?: string): Promise<boolean> {
    return industrialCapabilitiesRepository.isMediaUrlReferenced(url, id);
  },
};
