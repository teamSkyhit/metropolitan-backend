import { enquiriesDashboardQueryService } from '../enquiries';
import type {
  DashboardRecentEnquiryDto,
  DashboardSummaryDto,
  DashboardSummaryQuery,
  DashboardTrendsQuery,
  RecentEnquiriesQuery,
  TrendItemDto,
} from './dashboard.schema';

export const dashboardService = {
  getSummary(query: DashboardSummaryQuery): Promise<DashboardSummaryDto> {
    return enquiriesDashboardQueryService.getSummary(query);
  },

  getTrends(query: DashboardTrendsQuery): Promise<TrendItemDto[]> {
    return enquiriesDashboardQueryService.getTrends(query, query.groupBy);
  },

  getRecentEnquiries(query: RecentEnquiriesQuery): Promise<DashboardRecentEnquiryDto[]> {
    return enquiriesDashboardQueryService.getRecent(query.limit ?? 10);
  },
};
