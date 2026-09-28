import type { AppModule } from '../../shared/module';
import { registerCategoriesDocs } from './categories.docs';
import { categoriesPublicRouter, categoriesRouter } from './categories.routes';

export const categoriesModule: AppModule = {
  name: 'categories',
  basePath: '/categories',
  router: categoriesRouter,
  publicRouter: categoriesPublicRouter,
  registerDocs: registerCategoriesDocs,
};

// Public API for other modules.
export { categoriesService, toCategoryDto, toPublicCategoryDto } from './categories.service';
export type { CategoryRecord } from './categories.repository';
export {
  CategoriesErrorCode,
  categorySchema,
  publicCategorySchema,
  categorySeoUrlSchema,
  publicCategorySeoUrlParamsSchema,
  type CategoryDto,
  type PublicCategoryDto,
  type CreateCategoryBody,
  type UpdateCategoryBody,
  type ListCategoriesQuery,
} from './categories.schema';
