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
export {
  productsService,
  toProductDto,
  registerProductAssignValidation,
  type BrandAssignableValidator,
  type CategoryAssignableValidator,
} from './products.service';
export {
  productReferenceService,
  productUsageService,
  type ProductReferenceService,
} from './product-reference.service';
export type { ProductRecord } from './products.repository';
export {
  ProductsErrorCode,
  productSchema,
  productStatusSchema,
  productBrandSummarySchema,
  productCategorySummarySchema,
  productSpecificationItemSchema,
  productSpecificationsSchema,
  updateProductSpecificationsBodySchema,
  skuRegex,
  normalizeSku,
  productSkuSchema,
  updateProductSkuSchema,
  createProductBodySchema,
  updateProductBodySchema,
  listProductsQuerySchema,
  type ProductDto,
  type ProductStatus,
  type CreateProductBody,
  type UpdateProductBody,
  type ListProductsQuery,
  type ProductSpecificationItem,
  type UpdateProductSpecificationsBody,
} from './products.schema';
