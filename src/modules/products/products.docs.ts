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
  productDocumentParamsSchema,
  productGalleryParamsSchema,
  productSchema,
  productVideoParamsSchema,
  publicProductSchema,
  publicProductSlugParamsSchema,
  reorderProductDocumentsBodySchema,
  reorderProductGalleryBodySchema,
  reorderProductVideosBodySchema,
  updateProductBodySchema,
  updateProductDocumentBodySchema,
  updateProductSpecificationsBodySchema,
  updateProductVideoBodySchema,
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
  const multipartGallery = () => ({
    content: {
      'multipart/form-data': {
        schema: z.object({
          images: z.string().meta({
            format: 'binary',
            description: 'Product gallery image(s) (PNG, JPEG, WebP, max 5 MB each, max 5 total)',
          }),
        }),
      },
    },
  });
  const multipartVideos = () => ({
    content: {
      'multipart/form-data': {
        schema: z.object({
          videos: z.string().meta({
            format: 'binary',
            description: 'Product video(s) (MP4 or WebM, max 100 MB each, max 2 total)',
          }),
          title: z.string().optional().meta({ description: 'Optional video display title' }),
        }),
      },
    },
  });
  const multipartDocuments = () => ({
    content: {
      'multipart/form-data': {
        schema: z.object({
          documents: z.string().meta({
            format: 'binary',
            description: 'PDF document(s) (application/pdf only, max 10 MB each, max 3 total)',
          }),
          title: z.string().optional().meta({ description: 'Optional document display title' }),
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
      'Public website endpoint. Returns product details for product pages including gallery images and PDF documents. Only returns published products with active brand and category. Excludes internal audit fields and CRM-only data.',
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
    description: 'Requires `products:read`. Includes full gallery images and PDF documents.',
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

  // ── Product Gallery Endpoints ──────────────────────────────────────────────

  registry.registerPath({
    method: 'post',
    path: '/products/{id}/gallery',
    tags: adminTags,
    security,
    summary: 'Upload product gallery image(s)',
    description:
      'Requires `products:update`. Accepts multipart/form-data with field `images`. Max 5 active images per product, max 5 MB each. PNG, JPEG, or WebP.',
    request: { params: idParamsSchema, body: multipartGallery() },
    responses: {
      200: jsonResponse('Gallery image uploaded', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/products/{id}/gallery/reorder',
    tags: adminTags,
    security,
    summary: 'Reorder product gallery images',
    description: 'Requires `products:update`. Reorders active gallery images according to given ID order.',
    request: { params: idParamsSchema, body: json(reorderProductGalleryBodySchema) },
    responses: {
      200: jsonResponse('Gallery reordered', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/products/{id}/gallery/{galleryImageId}/primary',
    tags: adminTags,
    security,
    summary: 'Set primary gallery image',
    description:
      'Requires `products:update`. Designates selected gallery image as primary and syncs product.imageUrl.',
    request: { params: productGalleryParamsSchema },
    responses: {
      200: jsonResponse('Primary image updated', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/products/{id}/gallery/{galleryImageId}',
    tags: adminTags,
    security,
    summary: 'Delete gallery image',
    description:
      'Requires `products:update`. Removes image from gallery. If deleted image was primary, automatically falls back to next available image.',
    request: { params: productGalleryParamsSchema },
    responses: {
      200: jsonResponse('Gallery image removed', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  // ── Product Videos Endpoints ───────────────────────────────────────────────

  registry.registerPath({
    method: 'post',
    path: '/products/{id}/videos',
    tags: adminTags,
    security,
    summary: 'Upload product video(s)',
    description:
      'Requires `products:update`. Accepts multipart/form-data with canonical field `videos`. Max 2 active videos per product, max 100 MB each. Allowed formats: MP4 (video/mp4), WebM (video/webm).',
    request: { params: idParamsSchema, body: multipartVideos() },
    responses: {
      200: jsonResponse('Video uploaded', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/products/{id}/videos/reorder',
    tags: adminTags,
    security,
    summary: 'Reorder product videos',
    description: 'Requires `products:update`. Reorders active videos according to given ID order.',
    request: { params: idParamsSchema, body: json(reorderProductVideosBodySchema) },
    responses: {
      200: jsonResponse('Videos reordered', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/products/{id}/videos/{videoId}',
    tags: adminTags,
    security,
    summary: 'Update product video title',
    description: 'Requires `products:update`. Updates the optional title of the video.',
    request: { params: productVideoParamsSchema, body: json(updateProductVideoBodySchema) },
    responses: {
      200: jsonResponse('Video updated', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/products/{id}/videos/{videoId}',
    tags: adminTags,
    security,
    summary: 'Delete product video',
    description: 'Requires `products:update`. Removes video reference.',
    request: { params: productVideoParamsSchema },
    responses: {
      200: jsonResponse('Video removed', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  // ── Product Documents (PDFs) Endpoints ─────────────────────────────────────

  registry.registerPath({
    method: 'post',
    path: '/products/{id}/documents',
    tags: adminTags,
    security,
    summary: 'Upload product PDF document(s)',
    description:
      'Requires `products:update`. Accepts multipart/form-data with canonical field `documents`. Max 3 active PDFs per product, max 10 MB each. application/pdf only.',
    request: { params: idParamsSchema, body: multipartDocuments() },
    responses: {
      200: jsonResponse('Document uploaded', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/products/{id}/documents/reorder',
    tags: adminTags,
    security,
    summary: 'Reorder product documents',
    description: 'Requires `products:update`. Reorders active documents according to given ID order.',
    request: { params: idParamsSchema, body: json(reorderProductDocumentsBodySchema) },
    responses: {
      200: jsonResponse('Documents reordered', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/products/{id}/documents/{documentId}',
    tags: adminTags,
    security,
    summary: 'Update product document title',
    description: 'Requires `products:update`. Updates the title of the document.',
    request: { params: productDocumentParamsSchema, body: json(updateProductDocumentBodySchema) },
    responses: {
      200: jsonResponse('Document updated', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/products/{id}/documents/{documentId}',
    tags: adminTags,
    security,
    summary: 'Delete product document',
    description: 'Requires `products:update`. Removes PDF document reference.',
    request: { params: productDocumentParamsSchema },
    responses: {
      200: jsonResponse('Document removed', successBody(productSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  // ── Product Specifications ────────────────────────────────────────────────

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
