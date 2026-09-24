// The only file in this module allowed to use Prisma.
// import { prisma } from '../../config/database';
// import { notDeleted } from '../../shared/database/soft-delete';
// import { toSkipTake } from '../../shared/http';
import type { List__Module__Query } from './__module__.schema';

export interface __Module__Record {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export const __camel__Repository = {
  async findMany(query: List__Module__Query): Promise<{ items: __Module__Record[]; total: number }> {
    // TODO: replace with the Prisma model once it exists, e.g.
    // const where = { ...notDeleted };
    // const [items, total] = await prisma.$transaction([
    //   prisma.<model>.findMany({ where, ...toSkipTake(query), orderBy: { createdAt: 'desc' } }),
    //   prisma.<model>.count({ where }),
    // ]);
    // return { items, total };
    void query;
    return { items: [], total: 0 };
  },

  async findById(id: string): Promise<__Module__Record | null> {
    // TODO: return prisma.<model>.findFirst({ where: { id, ...notDeleted } });
    void id;
    return null;
  },
};
