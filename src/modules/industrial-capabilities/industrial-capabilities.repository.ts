import type { IndustrialCapability, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { createdBy, notDeleted, softDeleteData, updatedBy } from '../../shared/database/soft-delete';
import { toSkipTake } from '../../shared/http';
import type {
  CreateIndustrialCapabilityBody,
  IndustrialCapabilitySectionSettingsDto,
  ListIndustrialCapabilitiesQuery,
  UpdateIndustrialCapabilityBody,
  UpdateIndustrialCapabilitySectionSettingsBody,
} from './industrial-capabilities.schema';

export type IndustrialCapabilityRecord = IndustrialCapability;

export const industrialCapabilitiesRepository = {
  findById(id: string): Promise<IndustrialCapability | null> {
    return prisma.industrialCapability.findFirst({ where: { id, ...notDeleted } });
  },

  findByIdIncludingDeleted(id: string): Promise<IndustrialCapability | null> {
    return prisma.industrialCapability.findUnique({ where: { id } });
  },

  findBySlugIncludingDeleted(slug: string): Promise<IndustrialCapability | null> {
    return prisma.industrialCapability.findUnique({ where: { slug } });
  },

  findBySlug(slug: string): Promise<IndustrialCapability | null> {
    return prisma.industrialCapability.findFirst({ where: { slug, ...notDeleted } });
  },

  findByIds(ids: string[]): Promise<IndustrialCapability[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return prisma.industrialCapability.findMany({
      where: {
        id: { in: ids },
        ...notDeleted,
      },
    });
  },

  /** Public query: only active, non-deleted segments sorted by sortOrder ASC, with id ASC fallback. */
  findManyPublic(): Promise<IndustrialCapability[]> {
    return prisma.industrialCapability.findMany({
      where: {
        ...notDeleted,
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  },

  async findMany(
    query: ListIndustrialCapabilitiesQuery
  ): Promise<{ items: IndustrialCapability[]; total: number }> {
    const where: Prisma.IndustrialCapabilityWhereInput = {
      ...notDeleted,
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { slug: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.industrialCapability.findMany({
        where,
        ...toSkipTake(query),
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
      }),
      prisma.industrialCapability.count({ where }),
    ]);

    return { items, total };
  },

  create(data: CreateIndustrialCapabilityBody, actorId: string): Promise<IndustrialCapability> {
    return prisma.industrialCapability.create({
      data: {
        number: data.number ?? null,
        title: data.title,
        slug: data.slug,
        imageUrl: data.imageUrl ?? null,
        icon: data.icon ?? null,
        shortDescription: data.shortDescription ?? null,
        description: data.description ?? null,
        typicalProducts: data.typicalProducts ?? [],
        sortOrder: data.sortOrder,
        isActive: data.isActive,
        ...createdBy(actorId),
      },
    });
  },

  update(
    id: string,
    data: UpdateIndustrialCapabilityBody,
    actorId: string,
    tx?: Prisma.TransactionClient
  ): Promise<IndustrialCapability> {
    const db = tx ?? prisma;
    return db.industrialCapability.update({
      where: { id },
      data: {
        ...(data.number !== undefined && { number: data.number }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.shortDescription !== undefined && { shortDescription: data.shortDescription }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.typicalProducts !== undefined && { typicalProducts: data.typicalProducts }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...updatedBy(actorId),
      },
    });
  },

  updateImage(
    id: string,
    imageUrl: string | null,
    imageMediaId: string | null,
    actorId: string,
    tx?: Prisma.TransactionClient
  ): Promise<IndustrialCapability> {
    const db = tx ?? prisma;
    return db.industrialCapability.update({
      where: { id },
      data: {
        imageUrl,
        imageMediaId,
        ...updatedBy(actorId),
      },
    });
  },

  async reorder(capabilityIds: string[], actorId: string): Promise<IndustrialCapability[]> {
    return prisma.$transaction(async (tx) => {
      const updates = capabilityIds.map((id, index) =>
        tx.industrialCapability.update({
          where: { id },
          data: {
            sortOrder: index,
            ...updatedBy(actorId),
          },
        })
      );
      return Promise.all(updates);
    });
  },

  softDelete(id: string, actorId: string): Promise<IndustrialCapability> {
    return prisma.industrialCapability.update({
      where: { id },
      data: softDeleteData(actorId),
    });
  },

  isMediaUrlReferenced(url: string, id?: string): Promise<boolean> {
    const conditions: Prisma.IndustrialCapabilityWhereInput[] = [{ imageUrl: url }];
    if (id) {
      conditions.push({ imageMediaId: id });
    }
    return prisma.industrialCapability
      .count({
        where: {
          OR: conditions,
          ...notDeleted,
        },
      })
      .then((count) => count > 0);
  },

  async withTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  },

  // ── Section Header Settings (reusing homepage_sections table) ───────────────

  async restore(id: string, actorId: string): Promise<IndustrialCapability> {
    return prisma.industrialCapability.update({
      where: { id },
      data: {
        deletedAt: null,
        ...updatedBy(actorId),
      },
    });
  },

  async getSectionSettings(): Promise<IndustrialCapabilitySectionSettingsDto> {
    const settings = await prisma.industrialCapabilitySettings.findFirst();
    if (!settings) {
      return {
        eyebrow: 'OUR INDUSTRIAL CAPABILITIES',
        title: 'SIX CORE SEGMENTS',
        description: '',
      };
    }
    return {
      eyebrow: settings.eyebrow ?? 'OUR INDUSTRIAL CAPABILITIES',
      title: settings.title ?? 'SIX CORE SEGMENTS',
      description: settings.description ?? '',
    };
  },

  async upsertSectionSettings(
    settings: UpdateIndustrialCapabilitySectionSettingsBody,
    actorId: string
  ): Promise<IndustrialCapabilitySectionSettingsDto> {
    const existing = await prisma.industrialCapabilitySettings.findFirst();

    const currentSettings = await this.getSectionSettings();
    const updatedSettings: IndustrialCapabilitySectionSettingsDto = {
      eyebrow: settings.eyebrow !== undefined ? (settings.eyebrow ?? '') : currentSettings.eyebrow,
      title: settings.title !== undefined ? (settings.title ?? '') : currentSettings.title,
      description:
        settings.description !== undefined ? (settings.description ?? '') : currentSettings.description,
    };

    if (existing) {
      await prisma.industrialCapabilitySettings.update({
        where: { id: existing.id },
        data: {
          eyebrow: updatedSettings.eyebrow,
          title: updatedSettings.title,
          description: updatedSettings.description,
          ...updatedBy(actorId),
        },
      });
    } else {
      await prisma.industrialCapabilitySettings.create({
        data: {
          eyebrow: updatedSettings.eyebrow,
          title: updatedSettings.title,
          description: updatedSettings.description,
          ...createdBy(actorId),
        },
      });
    }

    return updatedSettings;
  },
};
