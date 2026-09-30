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
import { listMediaQuerySchema, mediaSchema } from './media.schema';

export function registerMediaDocs(registry: OpenAPIRegistry): void {
  const adminTags = ['Media Library'];
  const security = [{ [BEARER_AUTH]: [] }];
  const multipart = () => ({
    content: {
      'multipart/form-data': {
        schema: z.object({
          file: z.string().meta({ format: 'binary', description: 'PNG, JPEG, or WebP image (max 5 MB)' }),
        }),
      },
    },
  });

  // ── CRM Endpoints ──────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/media',
    tags: adminTags,
    security,
    summary: 'List media assets',
    description:
      'Requires `media:read`. Supports pagination, search by filename, filter by MIME type, and latest/oldest sorting.',
    request: { query: listMediaQuerySchema },
    responses: {
      200: jsonResponse('Paginated media items', paginatedBody(mediaSchema)),
      ...errorResponses(400, 401, 403),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/media/{id}',
    tags: adminTags,
    security,
    summary: 'Get media asset by ID',
    description: 'Requires `media:read`.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Media detail', successBody(mediaSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/media/upload',
    tags: adminTags,
    security,
    summary: 'Upload media asset',
    description:
      'Requires `media:create`. Accepts multipart/form-data with field `file`. Maximum 5 MB. PNG, JPEG, or WebP.',
    request: { body: multipart() },
    responses: {
      201: jsonResponse('Uploaded media asset', successBody(mediaSchema)),
      ...errorResponses(400, 401, 403),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/media/{id}',
    tags: adminTags,
    security,
    summary: 'Delete media asset',
    description:
      'Requires `media:delete`. Protected: returns 409 if the media file is currently referenced by any live Product, Brand, or Category.',
    request: { params: idParamsSchema },
    responses: {
      204: { description: 'Media asset deleted' },
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });
}
