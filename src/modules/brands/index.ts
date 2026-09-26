import type { AppModule } from '../../shared/module';
import { registerBrandsDocs } from './brands.docs';
import { brandsPublicRouter, brandsRouter } from './brands.routes';

export const brandsModule: AppModule = {
  name: 'brands',
  basePath: '/brands',
  router: brandsRouter,
  publicRouter: brandsPublicRouter,
  registerDocs: registerBrandsDocs,
};

// Public API for other modules.
export { brandsService, toBrandDto, toPublicBrandDto, generateSlug } from './brands.service';
export type { BrandRecord } from './brands.repository';
export {
  BrandsErrorCode,
  brandSchema,
  publicBrandSchema,
  type BrandDto,
  type PublicBrandDto,
  type CreateBrandBody,
  type UpdateBrandBody,
  type ListBrandsQuery,
} from './brands.schema';
