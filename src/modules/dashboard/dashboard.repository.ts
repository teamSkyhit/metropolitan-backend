import { type EnquiryStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { notDeleted } from '../../shared/database/soft-delete';
import { toDateRangeFilter } from '../../shared/http';
import type {
  DashboardSummaryDto,
  DashboardSummaryQuery,
  DashboardTrendsQuery,
  TrendItemDto,
} from './dashboard.schema';

const recentEnquirySelect = {
  id: true,
  name: true,
  company: true,
  status: true,
  assignedTo: { select: { id: true, name: true } },
  createdAt: true,
  _count: { select: { lineItems: true } },
} as const;

export type DashboardRecentEnquiryRecord = Prisma.EnquiryGetPayload<{
  select: typeof recentEnquirySelect;
}>;

export const dashboardRepository = {
  async getSummary(query: DashboardSummaryQuery): Promise<DashboardSummaryDto> {
    const createdAt = toDateRangeFilter(query);
    const where: Prisma.EnquiryWhereInput = {
      ...notDeleted,
      ...(createdAt && { createdAt }),
    };

    const [countsByStatus, total, unassigned] = await prisma.$transaction([
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

    const pipeline = [
      { status: 'NEW' as const, count: countMap.NEW },
      { status: 'ASSIGNED' as const, count: countMap.ASSIGNED },
      { status: 'CONTACTED' as const, count: countMap.CONTACTED },
      { status: 'QUOTATION_SENT' as const, count: countMap.QUOTATION_SENT },
      { status: 'NEGOTIATION' as const, count: countMap.NEGOTIATION },
      { status: 'CLOSED_WON' as const, count: countMap.CLOSED_WON },
      { status: 'CLOSED_LOST' as const, count: countMap.CLOSED_LOST },
    ];

    return {
      totalEnquiries: total,
      unassigned,
      new: countMap.NEW,
      assigned: countMap.ASSIGNED,
      contacted: countMap.CONTACTED,
      quotationSent: countMap.QUOTATION_SENT,
      negotiation: countMap.NEGOTIATION,
      closedWon: countMap.CLOSED_WON,
      closedLost: countMap.CLOSED_LOST,
      pipeline,
    };
  },

  async getTrends(query: DashboardTrendsQuery): Promise<TrendItemDto[]> {
    const gte = query.from ? new Date(`${query.from}T00:00:00.000Z`) : null;
    const lte = query.to ? new Date(`${query.to}T23:59:59.999Z`) : null;

    const conditions: Prisma.Sql[] = [Prisma.sql`"deleted_at" IS NULL`];
    if (gte) {
      conditions.push(Prisma.sql`"created_at" >= ${gte}`);
    }
    if (lte) {
      conditions.push(Prisma.sql`"created_at" <= ${lte}`);
    }

    const whereSql = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    let querySql: Prisma.Sql;
    switch (query.groupBy) {
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

  findRecentEnquiries(limit = 10): Promise<DashboardRecentEnquiryRecord[]> {
    return prisma.enquiry.findMany({
      where: notDeleted,
      select: recentEnquirySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  },
};
