import type { Media, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { notDeleted } from '../../shared/database/soft-delete';
import { toSkipTake } from '../../shared/http';
import type { ListMediaQuery } from './media.schema';

export type MediaRecord = Media;

export interface CreateMediaData {
  fileName: string;
  storageKey: string;
  publicUrl: string;
  mimeType: string;
  fileSize: number;
  uploadedById: string | null;
}

export const mediaRepository = {
  findById(id: string): Promise<MediaRecord | null> {
    return prisma.media.findFirst({
      where: { id, ...notDeleted },
    });
  },

  findByIds(ids: string[]): Promise<MediaRecord[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return prisma.media.findMany({
      where: {
        id: { in: ids },
        ...notDeleted,
      },
    });
  },

  findByIdIncludingDeleted(id: string): Promise<MediaRecord | null> {
    return prisma.media.findUnique({
      where: { id },
    });
  },

  async findMany(query: ListMediaQuery): Promise<{ items: MediaRecord[]; total: number }> {
    const searchTerm = query.search || query.q;
    const where: Prisma.MediaWhereInput = {
      ...notDeleted,
      ...(query.mimeType && {
        mimeType: { contains: query.mimeType, mode: 'insensitive' },
      }),
      ...(searchTerm && {
        fileName: { contains: searchTerm, mode: 'insensitive' },
      }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.media.findMany({
        where,
        ...toSkipTake(query),
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
      }),
      prisma.media.count({ where }),
    ]);

    return { items, total };
  },

  create(data: CreateMediaData): Promise<MediaRecord> {
    return prisma.media.create({
      data: {
        fileName: data.fileName,
        storageKey: data.storageKey,
        publicUrl: data.publicUrl,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        uploadedById: data.uploadedById,
      },
    });
  },

  softDelete(id: string): Promise<MediaRecord> {
    return prisma.media.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },
};
