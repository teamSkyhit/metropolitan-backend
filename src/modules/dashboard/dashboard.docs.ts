import {
  BEARER_AUTH,
  errorResponses,
  jsonResponse,
  successBody,
  type OpenAPIRegistry,
} from '../../shared/docs/openapi';
import {
  dashboardRecentEnquiriesSchema,
  dashboardSummaryQuerySchema,
  dashboardSummarySchema,
  dashboardTrendsQuerySchema,
  dashboardTrendsSchema,
  recentEnquiriesQuerySchema,
} from './dashboard.schema';

export function registerDashboardDocs(registry: OpenAPIRegistry): void {
  const tags = ['Dashboard'];
  const security = [{ [BEARER_AUTH]: [] }];

  registry.registerPath({
    method: 'get',
    path: '/dashboard/summary',
    tags,
    security,
    summary: 'CRM dashboard enquiry summary and pipeline metrics',
    description:
      'Requires `dashboard:read`. Returns operational summary counts and chart-ready status pipeline. ' +
      '`unassigned` means `assignedToId IS NULL`. With no date range, the summary is all-time.',
    request: { query: dashboardSummaryQuerySchema },
    responses: {
      200: jsonResponse('Dashboard summary', successBody(dashboardSummarySchema)),
      ...errorResponses(400, 401, 403),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/dashboard/trends',
    tags,
    security,
    summary: 'CRM dashboard enquiry trends over time',
    description:
      'Requires `dashboard:read`. Both UTC dates are required and the inclusive range is capped at 366 days. ' +
      'Returns a sparse result set aggregated by day, week, or month: periods with zero enquiries are omitted. ' +
      'Clients must zero-fill missing periods when a continuous chart is required.',
    request: { query: dashboardTrendsQuerySchema },
    responses: {
      200: jsonResponse('Dashboard trends', successBody(dashboardTrendsSchema)),
      ...errorResponses(400, 401, 403),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/dashboard/recent-enquiries',
    tags,
    security,
    summary: 'Recent enquiries list for CRM dashboard',
    description: 'Requires `dashboard:read`. Returns newest enquiries with safe, minimal dashboard fields.',
    request: { query: recentEnquiriesQuerySchema },
    responses: {
      200: jsonResponse('Recent enquiries', successBody(dashboardRecentEnquiriesSchema)),
      ...errorResponses(400, 401, 403),
    },
  });
}
