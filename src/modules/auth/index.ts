import type { AppModule } from '../../shared/module';
import { registerAuthDocs } from './auth.docs';
import { authRouter } from './auth.routes';

export const authModule: AppModule = {
  name: 'auth',
  basePath: '/auth',
  router: authRouter,
  registerDocs: registerAuthDocs,
};
