import { handle, sendSuccess } from '../../shared/http';
import {
  dashboardSummaryQuerySchema,
  dashboardTrendsQuerySchema,
  recentEnquiriesQuerySchema,
} from './dashboard.schema';
import { dashboardService } from './dashboard.service';

export const dashboardController = {
  summary: handle({ query: dashboardSummaryQuerySchema }, async (req, res) => {
    sendSuccess(res, await dashboardService.getSummary(req.query));
  }),

  trends: handle({ query: dashboardTrendsQuerySchema }, async (req, res) => {
    sendSuccess(res, await dashboardService.getTrends(req.query));
  }),

  recentEnquiries: handle({ query: recentEnquiriesQuerySchema }, async (req, res) => {
    sendSuccess(res, await dashboardService.getRecentEnquiries(req.query));
  }),
};
