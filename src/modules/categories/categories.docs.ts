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
  categorySchema,
  createCategoryBodySchema,
  listCategoriesQuerySchema,
  publicCategorySchema,
  publicCategorySeoUrlParamsSchema,
  updateCategoryBodySchema,
} from './categories.schema';

export function registerCategoriesDocs(registry: OpenAPIRegistry): void {
  const adminTags = ['Categories'];
  const publicTags = ['Public - Categories'];
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
    path: '/public/categories',
    tags: publicTags,
    summary: 'List active categories',
    description: 'Public website endpoint. Returns non-deleted categories sorted by name ASC.',
    responses: {
      200: jsonResponse('Active categories list', successBody(z.array(publicCategorySchema))),
      ...errorResponses(500),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/public/categories/{seoUrl}',
    tags: publicTags,
    summary: 'Get public category by SEO URL',
    description: 'Public website endpoint. Returns category details for catalog and category pages.',
    request: { params: publicCategorySeoUrlParamsSchema },
    responses: {
      200: jsonResponse('Public category detail', successBody(publicCategorySchema)),
      ...errorResponses(400, 404, 500),
    },
  });

  // ── Admin Endpoints ────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/categories',
    tags: adminTags,
    security,
    summary: 'List categories',
    description: 'Requires `categories:read`. Supports pagination, search on name or SEO URL, and sorting.',
    request: { query: listCategoriesQuerySchema },
    responses: {
      200: jsonResponse('Paginated categories', paginatedBody(categorySchema)),
      ...errorResponses(400, 401, 403),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/categories',
    tags: adminTags,
    security,
    summary: 'Create a category',
    description: 'Requires `categories:create` (Super Admin or Sales Manager).',
    request: { body: json(createCategoryBodySchema) },
    responses: {
      201: jsonResponse('Created', successBody(categorySchema)),
      ...errorResponses(400, 401, 403, 409),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/categories/{id}',
    tags: adminTags,
    security,
    summary: 'Get category by ID',
    description: 'Requires `categories:read`.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Category', successBody(categorySchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/categories/{id}',
    tags: adminTags,
    security,
    summary: 'Update category',
    description: 'Requires `categories:update` (Super Admin or Sales Manager). Partial update supported.',
    request: { params: idParamsSchema, body: json(updateCategoryBodySchema) },
    responses: {
      200: jsonResponse('Updated', successBody(categorySchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/categories/{id}',
    tags: adminTags,
    security,
    summary: 'Update category (PUT)',
    description: 'Requires `categories:update` (Super Admin or Sales Manager). Supports update via PUT.',
    request: { params: idParamsSchema, body: json(updateCategoryBodySchema) },
    responses: {
      200: jsonResponse('Updated', successBody(categorySchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/categories/{id}',
    tags: adminTags,
    security,
    summary: 'Soft delete category',
    description:
      'Requires `categories:delete` (Super Admin or Sales Manager). SEO URLs stay reserved after deletion.',
    request: { params: idParamsSchema },
    responses: {
      204: { description: 'Deleted' },
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/categories/{id}/restore',
    tags: adminTags,
    security,
    summary: 'Restore a deleted category',
    description:
      'Requires `categories:update` (Super Admin or Sales Manager). Restores an archived category record.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Restored', successBody(categorySchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/categories/{id}/banner',
    tags: adminTags,
    security,
    summary: 'Upload category banner',
    description:
      'Requires `categories:update`. Accepts multipart/form-data. Maximum size 5 MB. PNG, JPEG, or WebP.',
    request: { params: idParamsSchema, body: multipart() },
    responses: {
      200: jsonResponse('Banner uploaded', successBody(categorySchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/categories/{id}/banner',
    tags: adminTags,
    security,
    summary: 'Remove category banner',
    description: 'Requires `categories:update`. Clears the category banner.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Banner removed', successBody(categorySchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });
}
