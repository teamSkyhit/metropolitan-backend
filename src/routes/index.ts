import { Router } from 'express';
import { rateLimiters, registerAuthUserResolver } from '../middleware';
import { authModule } from '../modules/auth';
import { brandsModule, brandsService } from '../modules/brands';
import { enquiriesModule } from '../modules/enquiries';
import { healthModule } from '../modules/health';
import { usersModule, usersService } from '../modules/users';
import { categoriesModule, categoriesService } from '../modules/categories';
import { mediaModule, registerMediaReferenceCheckers } from '../modules/media';
import { productsModule, productsService, registerProductAssignValidation } from '../modules/products';
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
  categoriesModule,
  productsModule,
  mediaModule,
  // @generator:modules
];

// `authenticate()` looks users up through the users module.
registerAuthUserResolver(usersService.resolveAuthState);

// Wire cross-module validation through service boundaries without circular module dependencies.
registerProductAssignValidation({
  brandsService,
  categoriesService,
});

registerMediaReferenceCheckers([
  { name: 'Product', checker: (url) => productsService.isMediaUrlReferenced(url) },
  { name: 'Brand', checker: (url) => brandsService.isMediaUrlReferenced(url) },
  { name: 'Category', checker: (url) => categoriesService.isMediaUrlReferenced(url) },
]);

const CATALOG_BASE_PATHS = new Set(['/brands', '/categories', '/products']);

/** Builds the /api/v1 router from the module list. */
export function createApiRouter(): Router {
  const router = Router();
  const publicRouter = Router();

  for (const module of modules) {
    if (module.publicRouter) {
      if (CATALOG_BASE_PATHS.has(module.basePath)) {
        publicRouter.use(module.basePath, rateLimiters.publicCatalog, module.publicRouter);
      } else {
        publicRouter.use(module.basePath, module.publicRouter);
      }
    }
    if (module.router) router.use(module.basePath, module.router);
  }

  router.use('/public', publicRouter);
  return router;
}
