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
  brandSchema,
  createBrandBodySchema,
  listBrandsQuerySchema,
  publicBrandSchema,
  publicBrandSlugParamsSchema,
  updateBrandBodySchema,
} from './brands.schema';

export function registerBrandsDocs(registry: OpenAPIRegistry): void {
  const adminTags = ['Brands'];
  const publicTags = ['Public - Brands'];
  const security = [{ [BEARER_AUTH]: [] }];
  const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
  const multipart = () => ({
    content: {
      'multipart/form-data': {
        schema: z.object({
          file: z.string().meta({ format: 'binary', description: 'PNG, JPEG, or WebP image' }),
        }),
      },
    },
  });

  // ── Public Endpoints ───────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/public/brands',
    tags: publicTags,
    summary: 'List active brands',
    description:
      'Public website endpoint. Returns only active, non-deleted brands sorted by sortOrder ASC, then name ASC.',
    responses: {
      200: jsonResponse('Active brands list', successBody(z.array(publicBrandSchema))),
      ...errorResponses(500),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/public/brands/{slug}',
    tags: publicTags,
    summary: 'Get public brand by slug',
    description: 'Public website endpoint. Returns brand details for brand landing pages.',
    request: { params: publicBrandSlugParamsSchema },
    responses: {
      200: jsonResponse('Public brand detail', successBody(publicBrandSchema)),
      ...errorResponses(400, 404, 500),
    },
  });

  // ── Admin Endpoints ────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/brands',
    tags: adminTags,
    security,
    summary: 'List brands',
    description: 'Requires `brands:read`. Supports pagination, name search, active filter, and sorting.',
    request: { query: listBrandsQuerySchema },
    responses: {
      200: jsonResponse('Paginated brands', paginatedBody(brandSchema)),
      ...errorResponses(400, 401, 403),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/brands',
    tags: adminTags,
    security,
    summary: 'Create a brand',
    description: 'Requires `brands:create` (Super Admin or Sales Manager).',
    request: { body: json(createBrandBodySchema) },
    responses: {
      201: jsonResponse('Created', successBody(brandSchema)),
      ...errorResponses(400, 401, 403, 409),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/brands/{id}',
    tags: adminTags,
    security,
    summary: 'Get brand by ID',
    description: 'Requires `brands:read`.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Brand', successBody(brandSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/brands/{id}',
    tags: adminTags,
    security,
    summary: 'Update brand',
    description: 'Requires `brands:update` (Super Admin or Sales Manager). Partial update supported.',
    request: { params: idParamsSchema, body: json(updateBrandBodySchema) },
    responses: {
      200: jsonResponse('Updated', successBody(brandSchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/brands/{id}',
    tags: adminTags,
    security,
    summary: 'Soft delete brand',
    description:
      'Requires `brands:delete` (Super Admin or Sales Manager). Names and slugs stay reserved after deletion.',
    request: { params: idParamsSchema },
    responses: {
      204: { description: 'Deleted' },
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/brands/{id}/restore',
    tags: adminTags,
    security,
    summary: 'Restore a deleted brand',
    description:
      'Requires `brands:update` (Super Admin or Sales Manager). Restores an archived brand record.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Restored', successBody(brandSchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/brands/{id}/logo',
    tags: adminTags,
    security,
    summary: 'Upload brand logo',
    description:
      'Requires `brands:update`. Accepts multipart/form-data. Maximum size 2 MB. PNG, JPEG, or WebP.',
    request: { params: idParamsSchema, body: multipart() },
    responses: {
      200: jsonResponse('Logo uploaded', successBody(brandSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/brands/{id}/logo',
    tags: adminTags,
    security,
    summary: 'Remove brand logo',
    description: 'Requires `brands:update`. Clears the brand logo.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Logo removed', successBody(brandSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/brands/{id}/banner',
    tags: adminTags,
    security,
    summary: 'Upload brand banner',
    description:
      'Requires `brands:update`. Accepts multipart/form-data. Maximum size 5 MB. PNG, JPEG, or WebP.',
    request: { params: idParamsSchema, body: multipart() },
    responses: {
      200: jsonResponse('Banner uploaded', successBody(brandSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/brands/{id}/banner',
    tags: adminTags,
    security,
    summary: 'Remove brand banner',
    description: 'Requires `brands:update`. Clears the brand banner.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Banner removed', successBody(brandSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });
}
