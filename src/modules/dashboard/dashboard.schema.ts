import { z } from 'zod';
import { dateRangeFields, dateRangeQuerySchema, withDateRangeCheck } from '../../shared/http';

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
    ...dateRangeFields,
    groupBy: trendGroupByEnum.default('day'),
  })
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
    count: z.number().int().min(0),
  })
  .meta({ id: 'StatusPipelineItem' });

export type StatusPipelineItemDto = z.infer<typeof statusPipelineItemSchema>;

export const dashboardSummarySchema = z
  .object({
    totalEnquiries: z.number().int().min(0),
    unassigned: z.number().int().min(0),
    new: z.number().int().min(0),
    assigned: z.number().int().min(0),
    contacted: z.number().int().min(0),
    quotationSent: z.number().int().min(0),
    negotiation: z.number().int().min(0),
    closedWon: z.number().int().min(0),
    closedLost: z.number().int().min(0),
    pipeline: z.array(statusPipelineItemSchema),
  })
  .meta({ id: 'DashboardSummary' });

export type DashboardSummaryDto = z.infer<typeof dashboardSummarySchema>;

export const trendItemSchema = z
  .object({
    period: z.string(),
    count: z.number().int().min(0),
  })
  .meta({ id: 'DashboardTrendItem' });

export type TrendItemDto = z.infer<typeof trendItemSchema>;

export const dashboardTrendsSchema = z.array(trendItemSchema).meta({ id: 'DashboardTrends' });

export const dashboardRecentEnquirySchema = z
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
  .meta({ id: 'DashboardRecentEnquiry' });

export type DashboardRecentEnquiryDto = z.infer<typeof dashboardRecentEnquirySchema>;

export const dashboardRecentEnquiriesSchema = z
  .array(dashboardRecentEnquirySchema)
  .meta({ id: 'DashboardRecentEnquiries' });
