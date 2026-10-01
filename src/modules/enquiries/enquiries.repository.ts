import { type EnquiryStatus, Prisma } from '@prisma/client';
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

const recentSelect = {
  id: true,
  name: true,
  company: true,
  status: true,
  assignedTo: person,
  createdAt: true,
  _count: { select: { lineItems: true } },
} as const;

export type EnquirySummaryRecord = Prisma.EnquiryGetPayload<{ include: typeof summaryInclude }>;
export type EnquiryDetailRecord = Prisma.EnquiryGetPayload<{ include: typeof detailInclude }>;
export type RecentEnquiryRecord = Prisma.EnquiryGetPayload<{ select: typeof recentSelect }>;

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

  async getDashboardSummary(range: { from?: string; to?: string }): Promise<{
    totalEnquiries: number;
    unassigned: number;
    countsByStatus: Record<EnquiryStatus, number>;
  }> {
    const createdAt = toDateRangeFilter(range);
    const where: Prisma.EnquiryWhereInput = {
      ...notDeleted,
      ...(createdAt && { createdAt }),
    };
    const [countsByStatus, totalEnquiries, unassigned] = await prisma.$transaction([
      prisma.enquiry.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
        orderBy: { status: 'asc' },
      }),
      prisma.enquiry.count({ where }),
      prisma.enquiry.count({ where: { ...where, assignedToId: null } }),
    ]);

    const countMap: Record<EnquiryStatus, number> = {
      NEW: 0,
      ASSIGNED: 0,
      CONTACTED: 0,
      QUOTATION_SENT: 0,
      NEGOTIATION: 0,
      CLOSED_WON: 0,
      CLOSED_LOST: 0,
    };

    for (const group of countsByStatus) {
      const statusCount =
        group._count && typeof group._count === 'object' && 'status' in group._count
          ? (group._count.status as number)
          : 0;
      countMap[group.status] = statusCount;
    }

    return { totalEnquiries, unassigned, countsByStatus: countMap };
  },

  async getDashboardTrends(
    range: { from?: string; to?: string },
    groupBy: 'day' | 'week' | 'month'
  ): Promise<{ period: string; count: number }[]> {
    const createdAt = toDateRangeFilter(range);
    const conditions: Prisma.Sql[] = [Prisma.sql`"deleted_at" IS NULL`];
    if (createdAt?.gte) {
      conditions.push(Prisma.sql`"created_at" >= ${createdAt.gte}`);
    }
    if (createdAt?.lte) {
      conditions.push(Prisma.sql`"created_at" <= ${createdAt.lte}`);
    }
    const whereSql = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    let querySql: Prisma.Sql;
    switch (groupBy) {
      case 'month':
        querySql = Prisma.sql`
          SELECT
            TO_CHAR(DATE_TRUNC('month', "created_at" AT TIME ZONE 'UTC'), 'YYYY-MM') AS period,
            COUNT(*)::int AS count
          FROM "enquiries"
          ${whereSql}
          GROUP BY DATE_TRUNC('month', "created_at" AT TIME ZONE 'UTC')
          ORDER BY DATE_TRUNC('month', "created_at" AT TIME ZONE 'UTC') ASC
        `;
        break;
      case 'week':
        querySql = Prisma.sql`
          SELECT
            TO_CHAR(DATE_TRUNC('week', "created_at" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS period,
            COUNT(*)::int AS count
          FROM "enquiries"
          ${whereSql}
          GROUP BY DATE_TRUNC('week', "created_at" AT TIME ZONE 'UTC')
          ORDER BY DATE_TRUNC('week', "created_at" AT TIME ZONE 'UTC') ASC
        `;
        break;
      case 'day':
      default:
        querySql = Prisma.sql`
          SELECT
            TO_CHAR(DATE_TRUNC('day', "created_at" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS period,
            COUNT(*)::int AS count
          FROM "enquiries"
          ${whereSql}
          GROUP BY DATE_TRUNC('day', "created_at" AT TIME ZONE 'UTC')
          ORDER BY DATE_TRUNC('day', "created_at" AT TIME ZONE 'UTC') ASC
        `;
        break;
    }

    return prisma.$queryRaw<{ period: string; count: number }[]>(querySql);
  },

  findDashboardRecent(limit = 10): Promise<RecentEnquiryRecord[]> {
    return prisma.enquiry.findMany({
      where: notDeleted,
      select: recentSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  },
};
