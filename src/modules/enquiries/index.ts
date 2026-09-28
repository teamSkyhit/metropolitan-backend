import type { AppModule } from '../../shared/module';
import { registerEnquiriesDocs } from './enquiries.docs';
import { enquiriesPublicRouter, enquiriesRouter } from './enquiries.routes';

export const enquiriesModule: AppModule = {
  name: 'enquiries',
  basePath: '/enquiries',
  router: enquiriesRouter,
  publicRouter: enquiriesPublicRouter,
  registerDocs: registerEnquiriesDocs,
};

export { enquiriesService } from './enquiries.service';
export {
  EnquiriesErrorCode,
  EnquiryStatus,
  enquiryDashboardSchema,
  dashboardRecentEnquirySchema,
  enquirySummarySchema,
  enquiryDetailSchema,
  type EnquiryDashboardDto,
  type DashboardRecentEnquiryDto,
  type EnquirySummaryDto,
  type EnquiryDetailDto,
} from './enquiries.schema';
