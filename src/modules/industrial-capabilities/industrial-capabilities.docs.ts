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
  createIndustrialCapabilityBodySchema,
  industrialCapabilitySchema,
  industrialCapabilitySectionSettingsSchema,
  listIndustrialCapabilitiesQuerySchema,
  publicIndustrialCapabilitiesDataSchema,
  reorderIndustrialCapabilitiesBodySchema,
  updateIndustrialCapabilityBodySchema,
  updateIndustrialCapabilitySectionSettingsSchema,
} from './industrial-capabilities.schema';

export function registerIndustrialCapabilitiesDocs(registry: OpenAPIRegistry): void {
  const adminTags = ['Industrial Capabilities'];
  const publicTags = ['Public - Industrial Capabilities'];
  const security = [{ [BEARER_AUTH]: [] }];
  const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
  const multipartImage = () => ({
    content: {
      'multipart/form-data': {
        schema: z.object({
          image: z.string().meta({ format: 'binary', description: 'PNG, JPEG, or WebP image (max 5 MB)' }),
        }),
      },
    },
  });

  // ── Public Website ──────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/public/industrial-capabilities',
    tags: publicTags,
    summary: 'Get public industrial capabilities section and segments',
    description:
      'Public endpoint returning the section header settings (eyebrow, title, description) and sorted active segments.',
    responses: {
      200: jsonResponse(
        'Public industrial capabilities data',
        successBody(publicIndustrialCapabilitiesDataSchema)
      ),
      ...errorResponses(500),
    },
  });

  // ── CRM Admin ───────────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/industrial-capabilities',
    tags: adminTags,
    security,
    summary: 'List industrial capabilities',
    description:
      'Requires `industrial-capabilities:read`. Supports pagination, search on title or slug, and sorting.',
    request: { query: listIndustrialCapabilitiesQuerySchema },
    responses: {
      200: jsonResponse('Paginated industrial capabilities', paginatedBody(industrialCapabilitySchema)),
      ...errorResponses(400, 401, 403),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/industrial-capabilities',
    tags: adminTags,
    security,
    summary: 'Create an industrial capability',
    description: 'Requires `industrial-capabilities:create`.',
    request: { body: json(createIndustrialCapabilityBodySchema) },
    responses: {
      201: jsonResponse('Created', successBody(industrialCapabilitySchema)),
      ...errorResponses(400, 401, 403, 409),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/industrial-capabilities/settings',
    tags: adminTags,
    security,
    summary: 'Get industrial capabilities section header settings',
    description: 'Requires `industrial-capabilities:read`.',
    responses: {
      200: jsonResponse('Section settings', successBody(industrialCapabilitySectionSettingsSchema)),
      ...errorResponses(401, 403),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/industrial-capabilities/settings',
    tags: adminTags,
    security,
    summary: 'Update industrial capabilities section header settings',
    description: 'Requires `industrial-capabilities:update`. Partial update supported.',
    request: { body: json(updateIndustrialCapabilitySectionSettingsSchema) },
    responses: {
      200: jsonResponse('Updated section settings', successBody(industrialCapabilitySectionSettingsSchema)),
      ...errorResponses(400, 401, 403),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/industrial-capabilities/reorder',
    tags: adminTags,
    security,
    summary: 'Reorder industrial capabilities',
    description:
      'Requires `industrial-capabilities:update`. Atomically updates sort orders based on the given array of IDs.',
    request: { body: json(reorderIndustrialCapabilitiesBodySchema) },
    responses: {
      200: jsonResponse('Reordered capabilities', successBody(z.array(industrialCapabilitySchema))),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/industrial-capabilities/{id}',
    tags: adminTags,
    security,
    summary: 'Get industrial capability by ID',
    description: 'Requires `industrial-capabilities:read`.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Industrial capability detail', successBody(industrialCapabilitySchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/industrial-capabilities/{id}',
    tags: adminTags,
    security,
    summary: 'Update industrial capability',
    description: 'Requires `industrial-capabilities:update`. Partial update supported.',
    request: { params: idParamsSchema, body: json(updateIndustrialCapabilityBodySchema) },
    responses: {
      200: jsonResponse('Updated', successBody(industrialCapabilitySchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/industrial-capabilities/{id}',
    tags: adminTags,
    security,
    summary: 'Delete industrial capability',
    description: 'Requires `industrial-capabilities:delete`. Soft-deletes the capability.',
    request: { params: idParamsSchema },
    responses: {
      204: { description: 'Deleted' },
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/industrial-capabilities/{id}/restore',
    tags: adminTags,
    security,
    summary: 'Restore a deleted industrial capability',
    description: 'Requires `industrial-capabilities:update`. Restores a soft-deleted capability.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Restored', successBody(industrialCapabilitySchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/industrial-capabilities/{id}/image',
    tags: adminTags,
    security,
    summary: 'Upload capability image',
    description: 'Requires `industrial-capabilities:update`. Uploads and attaches image.',
    request: { params: idParamsSchema, body: multipartImage() },
    responses: {
      200: jsonResponse('Image uploaded', successBody(industrialCapabilitySchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/industrial-capabilities/{id}/image',
    tags: adminTags,
    security,
    summary: 'Replace capability image',
    description: 'Requires `industrial-capabilities:update`. Safely replaces image asset.',
    request: { params: idParamsSchema, body: multipartImage() },
    responses: {
      200: jsonResponse('Image replaced', successBody(industrialCapabilitySchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/industrial-capabilities/{id}/image',
    tags: adminTags,
    security,
    summary: 'Remove capability image',
    description: 'Requires `industrial-capabilities:update`. Removes image asset and triggers media cleanup.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Image removed', successBody(industrialCapabilitySchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });
}
