import type { HomepageSection, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { createdBy, notDeleted, softDeleteData, updatedBy } from '../../shared/database/soft-delete';
import type { UpdateHomepageSectionBody } from './homepage.schema';

export type HomepageSectionRecord = HomepageSection;

export interface CreateHomepageSectionData {
  type: string;
  title?: string | null;
  subtitle?: string | null;
  content: unknown;
  sortOrder?: number;
  isActive?: boolean;
}

export const homepageRepository = {
  findById(id: string): Promise<HomepageSectionRecord | null> {
    return prisma.homepageSection.findFirst({
      where: { id, ...notDeleted },
    });
  },

  findByIdIncludingDeleted(id: string): Promise<HomepageSectionRecord | null> {
    return prisma.homepageSection.findUnique({
      where: { id },
    });
  },

  findMany(): Promise<HomepageSectionRecord[]> {
    return prisma.homepageSection.findMany({
      where: notDeleted,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  },

  findManyPublic(): Promise<HomepageSectionRecord[]> {
    return prisma.homepageSection.findMany({
      where: {
        ...notDeleted,
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  },

  findActiveByType(type: string, exceptId?: string): Promise<HomepageSectionRecord | null> {
    return prisma.homepageSection.findFirst({
      where: {
        type,
        isActive: true,
        ...notDeleted,
        ...(exceptId && { id: { not: exceptId } }),
      },
    });
  },

  create(data: CreateHomepageSectionData, actorId: string): Promise<HomepageSectionRecord> {
    return prisma.homepageSection.create({
      data: {
        type: data.type,
        title: data.title ?? null,
        subtitle: data.subtitle ?? null,
        content: data.content as unknown as Prisma.InputJsonValue,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
        ...createdBy(actorId),
      },
    });
  },

  update(
    id: string,
    data: Omit<UpdateHomepageSectionBody, 'type'>,
    actorId: string
  ): Promise<HomepageSectionRecord> {
    return prisma.homepageSection.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.subtitle !== undefined && { subtitle: data.subtitle }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.content !== undefined && {
          content: data.content as unknown as Prisma.InputJsonValue,
        }),
        ...updatedBy(actorId),
      },
    });
  },

  async reorder(
    items: { id: string; sortOrder: number }[],
    actorId: string
  ): Promise<HomepageSectionRecord[]> {
    return prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.homepageSection.updateMany({
          where: { id: item.id, ...notDeleted },
          data: {
            sortOrder: item.sortOrder,
            ...updatedBy(actorId),
          },
        });
      }
      return tx.homepageSection.findMany({
        where: notDeleted,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
    });
  },

  softDelete(id: string, actorId: string): Promise<HomepageSectionRecord> {
    return prisma.homepageSection.update({
      where: { id },
      data: softDeleteData(actorId),
    });
  },

  async isMediaReferenced(url: string, id?: string): Promise<boolean> {
    if (id) {
      const count = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count
        FROM "homepage_sections"
        WHERE "deleted_at" IS NULL
          AND "is_active" = true
          AND ("content"::text ILIKE ${'%' + url + '%'} OR "content"::text ILIKE ${'%' + id + '%'})
      `;
      return Number(count[0]?.count ?? 0) > 0;
    }

    const count = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count
      FROM "homepage_sections"
      WHERE "deleted_at" IS NULL
        AND "is_active" = true
        AND "content"::text ILIKE ${'%' + url + '%'}
    `;
    return Number(count[0]?.count ?? 0) > 0;
  },

  async isMediaUrlReferenced(url: string, id?: string): Promise<boolean> {
    return this.isMediaReferenced(url, id);
  },
};
