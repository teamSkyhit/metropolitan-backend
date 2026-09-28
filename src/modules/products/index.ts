import type { AppModule } from '../../shared/module';
import { registerProductsDocs } from './products.docs';
import { productsRouter } from './products.routes';

export const productsModule: AppModule = {
  name: 'products',
  basePath: '/products',
  router: productsRouter,
  registerDocs: registerProductsDocs,
};

// Public API for other modules.
export { productsService, toProductDto } from './products.service';
export { productsRepository, type ProductRecord } from './products.repository';
export {
  ProductsErrorCode,
  productSchema,
  productStatusSchema,
  productBrandSummarySchema,
  productCategorySummarySchema,
  createProductBodySchema,
  updateProductBodySchema,
  listProductsQuerySchema,
  type ProductDto,
  type ProductStatus,
  type CreateProductBody,
  type UpdateProductBody,
  type ListProductsQuery,
} from './products.schema';
