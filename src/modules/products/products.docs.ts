import { z } from 'zod';
import {
  BEARER_AUTH,
  errorResponses,
  jsonResponse,
  paginatedBody,
  successBody,
  type OpenAPIRegistry,
} from '../../shared/docs/openapi';
import { idParamsSchema } from '../../shared/http';
import {
  createProductBodySchema,
  listProductsQuerySchema,
  listPublicProductsQuerySchema,
  productSchema,
  publicProductSchema,
  publicProductSlugParamsSchema,
  updateProductBodySchema,
  updateProductSpecificationsBodySchema,
} from './products.schema';

export function registerProductsDocs(registry: OpenAPIRegistry): void {
  const adminTags = ['Products'];
  const publicTags = ['Public - Products'];
  const security = [{ [BEARER_AUTH]: [] }];
  const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
  const multipart = () => ({
    content: {
      'multipart/form-data': {
        schema: z.object({
          image: z.string().meta({ format: 'binary', description: 'PNG, JPEG, or WebP image (max 5 MB)' }),
        }),
      },
    },
  });

  // ── Public Endpoints ───────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/public/products',
    tags: publicTags,
    summary: 'List public catalog products',
    description:
      'Public website endpoint. Returns active, published products whose brand and category are also active. Supports database-level pagination, search (name, SKU, brand, category), filters (brand, category, hotDeal), and sorting (latest, oldest, name_asc, name_desc, price_asc, price_desc).',
    request: { query: listPublicProductsQuerySchema },
    responses: {
      200: jsonResponse('Paginated public products', paginatedBody(publicProductSchema)),
      ...errorResponses(400, 500),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/public/products/{slug}',
    tags: publicTags,
    summary: 'Get public product by slug, SKU, or ID',
    description:
      'Public website endpoint. Returns product details for product pages. Only returns published products with active brand and category. Excludes internal audit fields and CRM-only data.',
    request: { params: publicProductSlugParamsSchema },
    responses: {
      200: jsonResponse('Public product detail', successBody(publicProductSchema)),
      ...errorResponses(400, 404, 500),
    },
  });

  // ── Admin Endpoints ────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/products',
    tags: adminTags,
    security,
    summary: 'List products',
    description:
      'Requires `products:read`. Supports pagination, search across name and SKU, filters for brand, category, hotDeal, status, and sorting.',
    request: { query: listProductsQuerySchema },
    responses: {
      200: jsonResponse('Paginated products', paginatedBody(productSchema)),
      ...errorResponses(400, 401, 403),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/products',
    tags: adminTags,
    security,
    summary: 'Create a product',
    description: 'Requires `products:create` (Super Admin or Sales Manager).',
    request: { body: json(createProductBodySchema) },
    responses: {
      201: jsonResponse('Created', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 409),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/products/{id}',
    tags: adminTags,
    security,
    summary: 'Get product by ID',
    description: 'Requires `products:read`.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Product detail', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/products/{id}',
    tags: adminTags,
    security,
    summary: 'Update product',
    description: 'Requires `products:update`. Accepts partial updates.',
    request: { params: idParamsSchema, body: json(updateProductBodySchema) },
    responses: {
      200: jsonResponse('Updated', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/products/{id}',
    tags: adminTags,
    security,
    summary: 'Soft-delete product',
    description: 'Requires `products:delete`. Preserves database row with deleted_at timestamp.',
    request: { params: idParamsSchema },
    responses: {
      204: { description: 'Product deleted' },
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/products/{id}/restore',
    tags: adminTags,
    security,
    summary: 'Restore soft-deleted product',
    description: 'Requires `products:update`. Clears deleted_at timestamp.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Restored product', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/products/{id}/image',
    tags: adminTags,
    security,
    summary: 'Upload product primary image',
    description:
      'Requires `products:update`. Accepts multipart/form-data. Maximum size 5 MB. PNG, JPEG, or WebP.',
    request: { params: idParamsSchema, body: multipart() },
    responses: {
      200: jsonResponse('Image uploaded', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/products/{id}/image',
    tags: adminTags,
    security,
    summary: 'Remove product primary image',
    description: 'Requires `products:update`. Clears the product image reference and removes stored file.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Image removed', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/products/{id}/specifications',
    tags: adminTags,
    security,
    summary: 'Update product specifications',
    description:
      'Requires `products:update`. Accepts structured specifications list (key, value, optional unit).',
    request: { params: idParamsSchema, body: json(updateProductSpecificationsBodySchema) },
    responses: {
      200: jsonResponse('Specifications updated', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });
}
