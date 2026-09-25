import type { z } from 'zod';
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
  updateBrandBodySchema,
} from './brands.schema';

export function registerBrandsDocs(registry: OpenAPIRegistry): void {
  const tags = ['Brands'];
  const security = [{ [BEARER_AUTH]: [] }];
  const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });

  registry.registerPath({
    method: 'get',
    path: '/brands',
    tags,
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
    tags,
    security,
    summary: 'Create a brand',
    description: 'Requires `brands:create` (Super Admin).',
    request: { body: json(createBrandBodySchema) },
    responses: {
      201: jsonResponse('Created', successBody(brandSchema)),
      ...errorResponses(400, 401, 403, 409),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/brands/{id}',
    tags,
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
    tags,
    security,
    summary: 'Update brand',
    description: 'Requires `brands:update` (Super Admin).',
    request: { params: idParamsSchema, body: json(updateBrandBodySchema) },
    responses: {
      200: jsonResponse('Updated', successBody(brandSchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/brands/{id}',
    tags,
    security,
    summary: 'Soft delete brand',
    description: 'Requires `brands:delete` (Super Admin). Slugs stay reserved after deletion.',
    request: { params: idParamsSchema },
    responses: {
      204: { description: 'Deleted' },
      ...errorResponses(400, 401, 403, 404),
    },
  });
}
