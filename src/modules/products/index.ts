import type { AppModule } from '../../shared/module';
import { registerProductsDocs } from './products.docs';
import { productsPublicRouter, productsRouter } from './products.routes';

export const productsModule: AppModule = {
  name: 'products',
  basePath: '/products',
  router: productsRouter,
  publicRouter: productsPublicRouter,
  registerDocs: registerProductsDocs,
};

// Public API for other modules.
export {
  productsService,
  toProductDto,
  toPublicProductDto,
  generateSlug,
  registerProductAssignValidation,
  type BrandAssignableValidator,
  type CategoryAssignableValidator,
} from './products.service';
export {
  productReferenceService,
  productUsageService,
  type ProductReferenceService,
} from './product-reference.service';
export type { ProductRecord, PublicProductRecord } from './products.repository';
export {
  ProductsErrorCode,
  productSchema,
  publicProductSchema,
  publicProductBrandSchema,
  publicProductCategorySchema,
  publicProductSortSchema,
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
  listPublicProductsQuerySchema,
  publicProductSlugParamsSchema,
  type ProductDto,
  type PublicProductDto,
  type PublicProductBrand,
  type PublicProductCategory,
  type ProductStatus,
  type CreateProductBody,
  type UpdateProductBody,
  type ListProductsQuery,
  type ListPublicProductsQuery,
  type PublicProductSlugParams,
  type ProductSpecificationItem,
  type UpdateProductSpecificationsBody,
} from './products.schema';
export { productsRouter, productsPublicRouter } from './products.routes';
