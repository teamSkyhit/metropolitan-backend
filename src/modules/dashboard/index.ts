import type { AppModule } from '../../shared/module';
import { registerDashboardDocs } from './dashboard.docs';
import { dashboardRouter } from './dashboard.routes';

export const dashboardModule: AppModule = {
  name: 'dashboard',
  basePath: '/dashboard',
  router: dashboardRouter,
  registerDocs: registerDashboardDocs,
};

export { dashboardService } from './dashboard.service';
export {
  dashboardRecentEnquiriesSchema,
  dashboardAnalyticsRecentEnquirySchema,
  dashboardSummaryQuerySchema,
  dashboardSummarySchema,
  dashboardTrendsQuerySchema,
  dashboardTrendsSchema,
  recentEnquiriesQuerySchema,
  statusPipelineItemSchema,
  trendGroupByEnum,
  trendItemSchema,
  MAX_TRENDS_RANGE_DAYS,
  type DashboardRecentEnquiryDto,
  type DashboardSummaryDto,
  type DashboardSummaryQuery,
  type DashboardTrendsQuery,
  type RecentEnquiriesQuery,
  type StatusPipelineItemDto,
  type TrendGroupBy,
  type TrendItemDto,
} from './dashboard.schema';
