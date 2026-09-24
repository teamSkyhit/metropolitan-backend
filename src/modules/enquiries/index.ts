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
