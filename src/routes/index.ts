import { Router } from 'express';
import { healthModule } from '../modules/health';
import type { AppModule } from '../shared/module';

/**
 * Composition root: every feature module is listed here, in mount order.
 * `npm run gen:module <name>` inserts new modules above the marker.
 */
export const modules: readonly AppModule[] = [
  healthModule,
  // @generator:modules
];

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
