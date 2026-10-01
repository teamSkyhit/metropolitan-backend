import { enquiriesRepository } from './enquiries.repository';

export interface EnquiriesDashboardDateRange {
  from?: string;
  to?: string;
}

type EnquiriesDashboardStatusCounts = {
  NEW: number;
  ASSIGNED: number;
  CONTACTED: number;
  QUOTATION_SENT: number;
  NEGOTIATION: number;
  CLOSED_WON: number;
  CLOSED_LOST: number;
};

export interface EnquiriesDashboardSummary {
  totalEnquiries: number;
  unassigned: number;
  new: number;
  assigned: number;
  contacted: number;
  quotationSent: number;
  negotiation: number;
  closedWon: number;
  closedLost: number;
  pipeline: { status: keyof EnquiriesDashboardStatusCounts; count: number }[];
}

export interface EnquiriesDashboardRecentItem {
  id: string;
  name: string;
  company: string | null;
  status: keyof EnquiriesDashboardStatusCounts;
  assignedTo: { id: string; name: string } | null;
  itemCount: number;
  createdAt: string;
}

export const enquiriesDashboardQueryService = {
  async getSummary(range: EnquiriesDashboardDateRange): Promise<EnquiriesDashboardSummary> {
    const { totalEnquiries, unassigned, countsByStatus } =
      await enquiriesRepository.getDashboardSummary(range);
    const pipeline: { status: keyof EnquiriesDashboardStatusCounts; count: number }[] = [
      { status: 'NEW', count: countsByStatus.NEW },
      { status: 'ASSIGNED', count: countsByStatus.ASSIGNED },
      { status: 'CONTACTED', count: countsByStatus.CONTACTED },
      { status: 'QUOTATION_SENT', count: countsByStatus.QUOTATION_SENT },
      { status: 'NEGOTIATION', count: countsByStatus.NEGOTIATION },
      { status: 'CLOSED_WON', count: countsByStatus.CLOSED_WON },
      { status: 'CLOSED_LOST', count: countsByStatus.CLOSED_LOST },
    ];

    return {
      totalEnquiries,
      unassigned,
      new: countsByStatus.NEW,
      assigned: countsByStatus.ASSIGNED,
      contacted: countsByStatus.CONTACTED,
      quotationSent: countsByStatus.QUOTATION_SENT,
      negotiation: countsByStatus.NEGOTIATION,
      closedWon: countsByStatus.CLOSED_WON,
      closedLost: countsByStatus.CLOSED_LOST,
      pipeline,
    };
  },

  getTrends(range: EnquiriesDashboardDateRange, groupBy: 'day' | 'week' | 'month') {
    return enquiriesRepository.getDashboardTrends(range, groupBy);
  },

  async getRecent(limit = 10): Promise<EnquiriesDashboardRecentItem[]> {
    const records = await enquiriesRepository.findDashboardRecent(limit);
    return records.map((record) => ({
      id: record.id,
      name: record.name,
      company: record.company,
      status: record.status,
      assignedTo: record.assignedTo,
      itemCount: record._count.lineItems,
      createdAt: record.createdAt.toISOString(),
    }));
  },
};
