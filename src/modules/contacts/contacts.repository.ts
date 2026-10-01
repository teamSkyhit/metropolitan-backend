import type { ContactStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { notDeleted } from '../../shared/database/soft-delete';
import { toDateRangeFilter, toSkipTake } from '../../shared/http';
import type { ListContactsQuery, SubmitContactBody } from './contacts.schema';

export type ContactSubmissionRecord = Prisma.ContactSubmissionGetPayload<object>;

function buildWhere(query: ListContactsQuery): Prisma.ContactSubmissionWhereInput {
  const createdAt = toDateRangeFilter(query);
  const where: Prisma.ContactSubmissionWhereInput = {
    ...notDeleted,
    ...(query.status && { status: query.status }),
    ...(createdAt && { createdAt }),
  };

  if (query.search?.trim()) {
    const s = query.search.trim();
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { mobile: { contains: s, mode: 'insensitive' } },
      { company: { contains: s, mode: 'insensitive' } },
      { subject: { contains: s, mode: 'insensitive' } },
    ];
  }

  return where;
}

export const contactsRepository = {
  create(data: SubmitContactBody, sourceIp?: string): Promise<ContactSubmissionRecord> {
    return prisma.contactSubmission.create({
      data: {
        name: data.name,
        email: data.email,
        mobile: data.mobile ?? null,
        company: data.company ?? null,
        subject: data.subject ?? null,
        message: data.message,
        pageUrl: data.pageUrl ?? null,
        sourceIp: sourceIp ?? null,
      },
    });
  },

  async findMany(query: ListContactsQuery): Promise<{ items: ContactSubmissionRecord[]; total: number }> {
    const where = buildWhere(query);
    const { skip, take } = toSkipTake(query);
    const orderBy: Prisma.ContactSubmissionOrderByWithRelationInput = {
      [query.sortBy]: query.sortOrder,
    };

    const [items, total] = await Promise.all([
      prisma.contactSubmission.findMany({
        where,
        orderBy,
        skip,
        take,
      }),
      prisma.contactSubmission.count({ where }),
    ]);

    return { items, total };
  },

  findById(id: string): Promise<ContactSubmissionRecord | null> {
    return prisma.contactSubmission.findFirst({
      where: { id, ...notDeleted },
    });
  },

  updateStatus(id: string, status: ContactStatus): Promise<ContactSubmissionRecord> {
    return prisma.contactSubmission.update({
      where: { id },
      data: { status },
    });
  },

  async softDelete(id: string, _actorId?: string): Promise<void> {
    await prisma.contactSubmission.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },
};
