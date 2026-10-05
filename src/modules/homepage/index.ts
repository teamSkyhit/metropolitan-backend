import type { AppModule } from '../../shared/module';
import { registerHomepageDocs } from './homepage.docs';
import { homepagePublicRouter, homepageRouter } from './homepage.routes';

export const homepageModule: AppModule = {
  name: 'homepage',
  basePath: '/homepage',
  router: homepageRouter,
  publicRouter: homepagePublicRouter,
  registerDocs: registerHomepageDocs,
};

// Public API for other modules
export { homepageService, toHomepageSectionDto } from './homepage.service';
export type { HomepageSectionRecord } from './homepage.repository';
export {
  HomepageErrorCode,
  HomepageSectionType,
  HOMEPAGE_SECTION_TYPES,
  SINGLE_INSTANCE_SECTION_TYPES,
  ctaUrlSchema,
  heroSlideSchema,
  heroContentSchema,
  featuredProductsContentSchema,
  featuredCategoriesContentSchema,
  featuredBrandsContentSchema,
  promoBannerContentSchema,
  createHomepageSectionBodySchema,
  updateHomepageSectionBodySchema,
  reorderHomepageSectionsBodySchema,
  homepageSectionDtoSchema,
  publicHomepageSectionDtoSchema,
  publicHomepageResponseSchema,
  type HeroSlide,
  type HeroContent,
  type FeaturedProductsContent,
  type FeaturedCategoriesContent,
  type FeaturedBrandsContent,
  type PromoBannerContent,
  type CreateHomepageSectionBody,
  type UpdateHomepageSectionBody,
  type ReorderHomepageSectionsBody,
  type HomepageSectionDto,
  type PublicHomepageSectionDto,
  type PublicHomepageResponse,
} from './homepage.schema';
export { homepageRouter, homepagePublicRouter } from './homepage.routes';
