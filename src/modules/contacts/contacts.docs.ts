import type { z } from 'zod';
import {
  BEARER_AUTH,
  CAPTCHA_AUTH,
  errorResponses,
  jsonResponse,
  paginatedBody,
  successBody,
  type OpenAPIRegistry,
} from '../../shared/docs/openapi';
import { idParamsSchema } from '../../shared/http';
import { CONTACT_CAPTCHA_ACTION } from './contacts.routes';
import {
  contactDetailSchema,
  contactSummarySchema,
  listContactsQuerySchema,
  submitContactBodySchema,
  submitContactResponseSchema,
  updateContactStatusBodySchema,
} from './contacts.schema';

export function registerContactsDocs(registry: OpenAPIRegistry): void {
  const tags = ['Contacts'];
  const security = [{ [BEARER_AUTH]: [] }];
  const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });

  registry.registerPath({
    method: 'post',
    path: '/public/contacts',
    tags: ['Public website'],
    security: [{ [CAPTCHA_AUTH]: [] }],
    summary: 'Submit a contact form inquiry from the website',
    description:
      `Rate limited per IP. Requires a captcha token in \`X-Captcha-Token\` (action \`${CONTACT_CAPTCHA_ACTION}\` ` +
      'for reCAPTCHA v3 / Turnstile) when captcha provider is configured. Allowed from origins in PUBLIC_CORS_ORIGINS.',
    request: { body: json(submitContactBodySchema) },
    responses: {
      201: jsonResponse('Submitted', successBody(submitContactResponseSchema)),
      ...errorResponses(400, 429, 503),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/contacts',
    tags,
    security,
    summary: 'List contact form submissions',
    description: 'Requires `contacts:read`. Supports pagination, date range filtering, search, and sorting.',
    request: { query: listContactsQuerySchema },
    responses: {
      200: jsonResponse('Paginated contacts', paginatedBody(contactSummarySchema)),
      ...errorResponses(400, 401, 403),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/contacts/{id}',
    tags,
    security,
    summary: 'Contact submission details',
    description: 'Requires `contacts:read`.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Contact detail', successBody(contactDetailSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/contacts/{id}/status',
    tags,
    security,
    summary: 'Update contact submission status',
    description:
      'Requires `contacts:update`. Allowed transitions: NEW -> READ, NEW -> ARCHIVED, READ -> ARCHIVED. ' +
      'ARCHIVED is terminal. Returns 409 on invalid transition.',
    request: { params: idParamsSchema, body: json(updateContactStatusBodySchema) },
    responses: {
      200: jsonResponse('Contact detail', successBody(contactDetailSchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/contacts/{id}',
    tags,
    security,
    summary: 'Soft delete contact submission',
    description: 'Requires `contacts:delete` (Super Admin).',
    request: { params: idParamsSchema },
    responses: {
      204: { description: 'Deleted' },
      ...errorResponses(400, 401, 403, 404),
    },
  });
}
