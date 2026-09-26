import { Router } from 'express';
import { registerAuthUserResolver } from '../middleware';
import { authModule } from '../modules/auth';
import { brandsModule } from '../modules/brands';
import { enquiriesModule } from '../modules/enquiries';
import { healthModule } from '../modules/health';
import { usersModule, usersService } from '../modules/users';
import type { AppModule } from '../shared/module';

/**
 * Composition root: every feature module is listed here, in mount order.
 * `npm run gen:module <name>` inserts new modules above the marker.
 */
export const modules: readonly AppModule[] = [
  healthModule,
  authModule,
  usersModule,
  enquiriesModule,
  brandsModule,
  // @generator:modules
];

// `authenticate()` looks users up through the users module.
registerAuthUserResolver(usersService.resolveAuthState);

/** Builds the /api/v1 router from the module list. */
export function createApiRouter(): Router {
  const router = Router();
  const publicRouter = Router();

  for (const module of modules) {
    if (module.publicRouter) publicRouter.use(module.basePath, module.publicRouter);
    if (module.router) router.use(module.basePath, module.router);
  }

  router.use('/public', publicRouter);
  return router;
}
