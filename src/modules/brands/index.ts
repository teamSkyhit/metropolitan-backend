import type { AppModule } from '../../shared/module';
import { registerBrandsDocs } from './brands.docs';
import { brandsRouter } from './brands.routes';

export const brandsModule: AppModule = {
  name: 'brands',
  basePath: '/brands',
  router: brandsRouter,
  registerDocs: registerBrandsDocs,
};

// Public API for other modules.
export { brandsService, toBrandDto } from './brands.service';
export type { BrandRecord } from './brands.repository';
export { brandSchema, brandsSchema, type BrandDto, type BrandsDto } from './brands.schema';
