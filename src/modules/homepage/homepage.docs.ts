import { z } from 'zod';
import {
  BEARER_AUTH,
  errorResponses,
  jsonResponse,
  successBody,
  type OpenAPIRegistry,
} from '../../shared/docs/openapi';
import { idParamsSchema } from '../../shared/http';
import {
  createHomepageSectionBodySchema,
  homepageSectionDtoSchema,
  publicHomepageResponseSchema,
  reorderHomepageSectionsBodySchema,
  updateHomepageSectionBodySchema,
} from './homepage.schema';

export function registerHomepageDocs(registry: OpenAPIRegistry): void {
  const tags = ['Homepage'];
  const security = [{ [BEARER_AUTH]: [] }];
  const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });

  // Public website endpoint
  registry.registerPath({
    method: 'get',
    path: '/public/homepage',
    tags: ['Public website'],
    security: [],
    summary: 'Get active homepage sections with resolved public entities',
    description:
      'Unauthenticated public read-only endpoint returning active, non-deleted homepage sections in sort order. ' +
      'References to products, categories, brands, and media are resolved to public-safe DTOs. Stale references are omitted.',
    responses: {
      200: jsonResponse('Active public homepage sections', successBody(publicHomepageResponseSchema)),
      ...errorResponses(429),
    },
  });

  // CRM endpoints
  registry.registerPath({
    method: 'get',
    path: '/homepage/sections',
    tags,
    security,
    summary: 'List all homepage sections (CRM)',
    description: 'Requires `homepage:read`. Returns all non-deleted sections ordered by sortOrder ASC.',
    responses: {
      200: jsonResponse('List of homepage sections', successBody(z.array(homepageSectionDtoSchema))),
      ...errorResponses(401, 403),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/homepage/sections/reorder',
    tags,
    security,
    summary: 'Reorder homepage sections atomically (CRM)',
    description:
      'Requires `homepage:update`. Updates sortOrder for the specified sections atomically inside a transaction.',
    request: { body: json(reorderHomepageSectionsBodySchema) },
    responses: {
      200: jsonResponse('Sections reordered', successBody(z.array(homepageSectionDtoSchema))),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/homepage/sections/{id}',
    tags,
    security,
    summary: 'Get homepage section detail (CRM)',
    description: 'Requires `homepage:read`.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Homepage section detail', successBody(homepageSectionDtoSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/homepage/sections',
    tags,
    security,
    summary: 'Create a new homepage section (CRM)',
    description:
      'Requires `homepage:create`. Content schema is strictly validated against section type. ' +
      'Enforces single-instance constraint on HERO, FEATURED_PRODUCTS, FEATURED_CATEGORIES, and FEATURED_BRANDS. ' +
      'HERO slide IDs are UUIDs; missing IDs are assigned once and persisted. ' +
      'Text fields are stored and returned as plain strings. HTML is not interpreted or sanitized as rich text. ' +
      'Consumers must render these values as text, not via raw HTML.',
    request: { body: json(createHomepageSectionBodySchema) },
    responses: {
      201: jsonResponse('Homepage section created', successBody(homepageSectionDtoSchema)),
      ...errorResponses(400, 401, 403, 409),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/homepage/sections/{id}',
    tags,
    security,
    summary: 'Update a homepage section (CRM)',
    description:
      'Requires `homepage:update`. Section type cannot be modified. ' +
      'Only explicitly supplied fields are written. Content changes are re-validated against the existing section ' +
      'type and module service boundaries. Activating an inactive section revalidates its effective references before persistence. ' +
      'HERO slide IDs must be unique UUIDs and are preserved when supplied on later updates. ' +
      'Text fields are stored and returned as plain strings. HTML is not interpreted or sanitized as rich text. ' +
      'Consumers must render these values as text, not via raw HTML.',
    request: { params: idParamsSchema, body: json(updateHomepageSectionBodySchema) },
    responses: {
      200: jsonResponse('Homepage section updated', successBody(homepageSectionDtoSchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/homepage/sections/{id}',
    tags,
    security,
    summary: 'Soft-delete a homepage section (CRM)',
    description: 'Requires `homepage:delete`. Soft-deletes the section and captures actor audit info.',
    request: { params: idParamsSchema },
    responses: {
      204: { description: 'Deleted' },
      ...errorResponses(400, 401, 403, 404),
    },
  });
}
