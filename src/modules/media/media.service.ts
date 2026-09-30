import { randomUUID } from 'node:crypto';
import { AppError } from '../../shared/errors';
import { buildPaginationMeta, type Paginated } from '../../shared/http';
import { storageService, UPLOAD_LIMITS, validateFileSize, validateImageContent } from '../../shared/storage';
import { mediaRepository, type MediaRecord } from './media.repository';
import { MediaErrorCode, type ListMediaQuery, type MediaDto } from './media.schema';

export function toMediaDto(record: MediaRecord): MediaDto {
  return {
    id: record.id,
    fileName: record.fileName,
    storageKey: record.storageKey,
    publicUrl: record.publicUrl,
    thumbnailUrl: record.publicUrl,
    mimeType: record.mimeType,
    fileSize: record.fileSize,
    uploadedById: record.uploadedById,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export interface MediaReferenceChecker {
  name: string;
  checker: (url: string) => Promise<boolean>;
}

let configuredReferenceCheckers: MediaReferenceChecker[] = [];

/**
 * Registers reference checkers from the composition root (src/routes/index.ts)
 * to verify whether a media asset is actively referenced by other modules
 * before allowing deletion, preventing circular dependencies.
 */
export function registerMediaReferenceCheckers(checkers: MediaReferenceChecker[]): void {
  configuredReferenceCheckers = checkers;
}

export const mediaService = {
  async list(query: ListMediaQuery): Promise<Paginated<MediaDto>> {
    const { items, total } = await mediaRepository.findMany(query);
    return {
      items: items.map(toMediaDto),
      pagination: buildPaginationMeta(query, total),
    };
  },

  async getById(id: string): Promise<MediaDto> {
    const record = await mediaRepository.findById(id);
    if (!record) throw AppError.notFound('Media');
    return toMediaDto(record);
  },

  async upload(file: Express.Multer.File, actorId: string | null): Promise<MediaDto> {
    validateFileSize(file.size, UPLOAD_LIMITS.PRODUCT_IMAGE_MAX_BYTES, 'Media file');
    const validated = validateImageContent(file.buffer);

    const stored = await storageService.upload(
      {
        filename: `${randomUUID()}${validated.extension}`,
        buffer: file.buffer,
        mimeType: validated.mimeType,
        size: file.size,
      },
      'media'
    );

    const record = await mediaRepository.create({
      fileName: file.originalname?.trim() || stored.filename,
      storageKey: stored.path,
      publicUrl: stored.url,
      mimeType: validated.mimeType,
      fileSize: file.size,
      uploadedById: actorId,
    });

    return toMediaDto(record);
  },

  async remove(id: string): Promise<void> {
    const record = await mediaRepository.findById(id);
    if (!record) throw AppError.notFound('Media');

    for (const { name, checker } of configuredReferenceCheckers) {
      const isReferenced = await checker(record.publicUrl);
      if (isReferenced) {
        throw AppError.conflict(
          `Cannot delete media because it is actively referenced by live ${name} records`,
          MediaErrorCode.MEDIA_IN_USE,
          { mediaId: id, referencedIn: name, publicUrl: record.publicUrl }
        );
      }
    }

    await mediaRepository.softDelete(id);
    await storageService.delete(record.storageKey).catch(() => {});
  },
};
