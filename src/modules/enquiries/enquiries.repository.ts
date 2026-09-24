import { type EnquiryStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { notDeleted, softDeleteData, updatedBy } from '../../shared/database/soft-delete';
import { toDateRangeFilter, toSkipTake } from '../../shared/http';
import type { ListEnquiriesQuery, SubmitEnquiryBody } from './enquiries.schema';

const person = { select: { id: true, name: true } } as const;

const summaryInclude = {
  assignedTo: person,
  _count: { select: { lineItems: true } },
} satisfies Prisma.EnquiryInclude;

const detailInclude = {
  assignedTo: person,
  lineItems: { orderBy: { position: 'asc' } },
  followUps: { orderBy: { createdAt: 'asc' }, include: { author: person } },
  statusChanges: { orderBy: { createdAt: 'asc' }, include: { changedBy: person } },
  _count: { select: { lineItems: true } },
} satisfies Prisma.EnquiryInclude;

export type EnquirySummaryRecord = Prisma.EnquiryGetPayload<{ include: typeof summaryInclude }>;
export type EnquiryDetailRecord = Prisma.EnquiryGetPayload<{ include: typeof detailInclude }>;

export interface StatusUpdate {
  from: EnquiryStatus;
  to: EnquiryStatus;
  note?: string;
}

function buildWhere(query: ListEnquiriesQuery): Prisma.EnquiryWhereInput {
  const where: Prisma.EnquiryWhereInput = { ...notDeleted };
  if (query.status) where.status = { in: query.status };
  if (query.assignedTo) where.assignedToId = query.assignedTo === 'unassigned' ? null : query.assignedTo;
  const createdAt = toDateRangeFilter(query);
  if (createdAt) where.createdAt = createdAt;
  if (query.search) {
    const contains = { contains: query.search, mode: 'insensitive' } as const;
    where.OR = [
      { name: contains },
      { company: contains },
      { email: contains },
      { mobile: contains },
      { lineItems: { some: { sku: contains } } },
    ];
  }
  return where;
}

export const enquiriesRepository = {
  /** Creates the enquiry, its line items and the initial status entry atomically. */
  create(
    input: SubmitEnquiryBody,
    sourceIp: string | undefined
  ): Promise<{ id: string; status: EnquiryStatus; createdAt: Date }> {
    const { lineItems, ...fields } = input;
    return prisma.enquiry.create({
      data: {
        ...fields,
        sourceIp: sourceIp?.slice(0, 64),
        lineItems: { create: lineItems.map((item, position) => ({ ...item, position })) },
        statusChanges: { create: { toStatus: 'NEW' } },
      },
      select: { id: true, status: true, createdAt: true },
    });
  },

  async findMany(query: ListEnquiriesQuery): Promise<{ items: EnquirySummaryRecord[]; total: number }> {
    const where = buildWhere(query);
    const [items, total] = await prisma.$transaction([
      prisma.enquiry.findMany({
        where,
        include: summaryInclude,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      prisma.enquiry.count({ where }),
    ]);
    return { items, total };
  },

  findById(id: string): Promise<EnquiryDetailRecord | null> {
    return prisma.enquiry.findFirst({ where: { id, ...notDeleted }, include: detailInclude });
  },

  async updateSalesNotes(id: string, salesNotes: string | null, actorId: string): Promise<void> {
    await prisma.enquiry.update({ where: { id }, data: { salesNotes, ...updatedBy(actorId) } });
  },

  /**
   * Applies a status change only if the enquiry is still in `from` (optimistic
   * concurrency) and records it in the history. Returns false if it changed meanwhile.
   */
  changeStatus(id: string, change: StatusUpdate, actorId: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const closing = change.to === 'CLOSED_WON' || change.to === 'CLOSED_LOST';
      const { count } = await tx.enquiry.updateMany({
        where: { id, status: change.from, ...notDeleted },
        data: { status: change.to, closedAt: closing ? new Date() : null, ...updatedBy(actorId) },
      });
      if (count === 0) return false;
      await tx.enquiryStatusChange.create({
        data: {
          enquiryId: id,
          fromStatus: change.from,
          toStatus: change.to,
          changedById: actorId,
          note: change.note,
        },
      });
      return true;
    });
  },

  /** Sets the assignee and, when needed, the matching status change, atomically. */
  assign(
    id: string,
    expectedStatus: EnquiryStatus,
    assignedToId: string | null,
    statusChange: StatusUpdate | null,
    actorId: string
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.enquiry.updateMany({
        where: { id, status: expectedStatus, ...notDeleted },
        data: {
          assignedToId,
          assignedAt: assignedToId ? new Date() : null,
          ...(statusChange && { status: statusChange.to }),
          ...updatedBy(actorId),
        },
      });
      if (count === 0) return false;
      if (statusChange) {
        await tx.enquiryStatusChange.create({
          data: {
            enquiryId: id,
            fromStatus: statusChange.from,
            toStatus: statusChange.to,
            changedById: actorId,
            note: statusChange.note,
          },
        });
      }
      return true;
    });
  },

  addFollowUp(enquiryId: string, authorId: string, note: string) {
    return prisma.$transaction(async (tx) => {
      const followUp = await tx.enquiryFollowUp.create({
        data: { enquiryId, authorId, note },
        include: { author: person },
      });
      // Touch the enquiry so "recently updated" sorting reflects activity.
      await tx.enquiry.update({ where: { id: enquiryId }, data: updatedBy(authorId) });
      return followUp;
    });
  },

  async softDelete(id: string, actorId: string): Promise<void> {
    await prisma.enquiry.update({ where: { id }, data: softDeleteData(actorId) });
  },
};
