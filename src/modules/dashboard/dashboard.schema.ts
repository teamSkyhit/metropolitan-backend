import { z } from 'zod';
import { dateRangeQuerySchema, withDateRangeCheck } from '../../shared/http';

export const MAX_TRENDS_RANGE_DAYS = 366;

export const enquiryStatusEnum = z.enum([
  'NEW',
  'ASSIGNED',
  'CONTACTED',
  'QUOTATION_SENT',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
]);

export type EnquiryStatusType = z.infer<typeof enquiryStatusEnum>;

export const dashboardSummaryQuerySchema = dateRangeQuerySchema;
export type DashboardSummaryQuery = z.infer<typeof dashboardSummaryQuerySchema>;

export const trendGroupByEnum = z.enum(['day', 'week', 'month']);
export type TrendGroupBy = z.infer<typeof trendGroupByEnum>;

export const dashboardTrendsQuerySchema = withDateRangeCheck(
  z.object({
    from: z.iso.date().meta({ description: 'Start date (YYYY-MM-DD, UTC, inclusive)' }),
    to: z.iso.date().meta({ description: 'End date (YYYY-MM-DD, UTC, inclusive)' }),
    groupBy: trendGroupByEnum.default('day'),
  })
).refine(
  ({ from, to }) =>
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000 <=
    MAX_TRENDS_RANGE_DAYS,
  { message: `Trend date range cannot exceed ${MAX_TRENDS_RANGE_DAYS} days`, path: ['to'] }
);
export type DashboardTrendsQuery = z.infer<typeof dashboardTrendsQuerySchema>;

export const recentEnquiriesQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(20, 'Limit cannot exceed 20')
    .default(10)
    .optional(),
});
export type RecentEnquiriesQuery = z.infer<typeof recentEnquiriesQuerySchema>;

export const statusPipelineItemSchema = z
  .object({
    status: enquiryStatusEnum,
    count: z.number().int().min(0).meta({ example: 12 }),
  })
  .meta({ id: 'StatusPipelineItem' });

export type StatusPipelineItemDto = z.infer<typeof statusPipelineItemSchema>;

export const dashboardSummarySchema = z
  .object({
    totalEnquiries: z.number().int().min(0),
    unassigned: z
      .number()
      .int()
      .min(0)
      .meta({ description: 'Count of active enquiries where assignedToId IS NULL', example: 4 }),
    new: z.number().int().min(0),
    assigned: z.number().int().min(0),
    contacted: z.number().int().min(0),
    quotationSent: z.number().int().min(0),
    negotiation: z.number().int().min(0),
    closedWon: z.number().int().min(0),
    closedLost: z.number().int().min(0),
    pipeline: z
      .array(statusPipelineItemSchema)
      .meta({ description: 'Pipeline status counts in operational progression order for charts' }),
  })
  .meta({ id: 'DashboardSummary' });

export type DashboardSummaryDto = z.infer<typeof dashboardSummarySchema>;

export const trendItemSchema = z
  .object({
    period: z.string().meta({ example: '2026-09-01' }),
    count: z.number().int().min(0).meta({ example: 8 }),
  })
  .meta({ id: 'DashboardTrendItem' });

export type TrendItemDto = z.infer<typeof trendItemSchema>;

export const dashboardTrendsSchema = z.array(trendItemSchema).meta({
  id: 'DashboardTrends',
  description:
    'Sparse time series buckets of enquiry counts. Periods with zero enquiries are omitted; frontend must zero-fill missing periods if continuous chart intervals are required.',
});

export const dashboardAnalyticsRecentEnquirySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    company: z.string().nullable(),
    status: enquiryStatusEnum,
    assignedTo: z
      .object({
        id: z.uuid(),
        name: z.string(),
      })
      .nullable(),
    itemCount: z.number().int().min(0),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'DashboardAnalyticsRecentEnquiry' });

export type DashboardRecentEnquiryDto = z.infer<typeof dashboardAnalyticsRecentEnquirySchema>;

export const dashboardRecentEnquiriesSchema = z
  .array(dashboardAnalyticsRecentEnquirySchema)
  .meta({ id: 'DashboardAnalyticsRecentEnquiries' });
