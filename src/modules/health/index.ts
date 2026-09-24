import type { AppModule } from '../../shared/module';
import { registerHealthDocs } from './health.docs';
import { healthRouter } from './health.routes';

export const healthModule: AppModule = {
  name: 'health',
  basePath: '/health',
  router: healthRouter,
  registerDocs: registerHealthDocs,
};
