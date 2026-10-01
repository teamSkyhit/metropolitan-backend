import { dashboardRepository, type DashboardRecentEnquiryRecord } from './dashboard.repository';
import type {
  DashboardRecentEnquiryDto,
  DashboardSummaryDto,
  DashboardSummaryQuery,
  DashboardTrendsQuery,
  RecentEnquiriesQuery,
  TrendItemDto,
} from './dashboard.schema';

export function toDashboardRecentEnquiryDto(record: DashboardRecentEnquiryRecord): DashboardRecentEnquiryDto {
  return {
    id: record.id,
    name: record.name,
    company: record.company,
    status: record.status,
    assignedTo: record.assignedTo ? { id: record.assignedTo.id, name: record.assignedTo.name } : null,
    itemCount: record._count.lineItems,
    createdAt: record.createdAt.toISOString(),
  };
}

export const dashboardService = {
  getSummary(query: DashboardSummaryQuery): Promise<DashboardSummaryDto> {
    return dashboardRepository.getSummary(query);
  },

  getTrends(query: DashboardTrendsQuery): Promise<TrendItemDto[]> {
    return dashboardRepository.getTrends(query);
  },

  async getRecentEnquiries(query: RecentEnquiriesQuery): Promise<DashboardRecentEnquiryDto[]> {
    const limit = query.limit ?? 10;
    const records = await dashboardRepository.findRecentEnquiries(limit);
    return records.map(toDashboardRecentEnquiryDto);
  },
};
