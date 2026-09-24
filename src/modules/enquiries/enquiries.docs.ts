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
import { ENQUIRY_CAPTCHA_ACTION } from './enquiries.routes';
import {
  addFollowUpBodySchema,
  assignEnquiryBodySchema,
  changeStatusBodySchema,
  enquiryDetailSchema,
  enquirySummarySchema,
  followUpSchema,
  listEnquiriesQuerySchema,
  submitEnquiryBodySchema,
  submitEnquiryResponseSchema,
  updateEnquiryBodySchema,
} from './enquiries.schema';
import { STATUS_TRANSITIONS } from './enquiries.service';

const transitionsTable = Object.entries(STATUS_TRANSITIONS)
  .map(([from, to]) => `- ${from} → ${to.length ? to.join(', ') : '(final)'}`)
  .join('\n');

export function registerEnquiriesDocs(registry: OpenAPIRegistry): void {
  const tags = ['Enquiries'];
  const security = [{ [BEARER_AUTH]: [] }];
  const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
  const detail = jsonResponse('Enquiry', successBody(enquiryDetailSchema));

  registry.registerPath({
    method: 'post',
    path: '/public/enquiries',
    tags: ['Public website'],
    security: [{ [CAPTCHA_AUTH]: [] }],
    summary: 'Submit an enquiry from the website',
    description:
      `Rate limited per IP. Requires a captcha token in \`X-Captcha-Token\` (action \`${ENQUIRY_CAPTCHA_ACTION}\` ` +
      'for reCAPTCHA v3 / Turnstile). Allowed from the origins in PUBLIC_CORS_ORIGINS.',
    request: { body: json(submitEnquiryBodySchema) },
    responses: {
      201: jsonResponse('Submitted', successBody(submitEnquiryResponseSchema)),
      ...errorResponses(400, 429, 503),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/enquiries',
    tags,
    security,
    summary: 'List enquiries',
    description: 'Requires `enquiries:read`.',
    request: { query: listEnquiriesQuerySchema },
    responses: {
      200: jsonResponse('Paginated enquiries', paginatedBody(enquirySummarySchema)),
      ...errorResponses(400, 401, 403),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/enquiries/{id}',
    tags,
    security,
    summary: 'Enquiry details with line items, follow-ups and status history',
    description: 'Requires `enquiries:read`.',
    request: { params: idParamsSchema },
    responses: { 200: detail, ...errorResponses(400, 401, 403, 404) },
  });

  registry.registerPath({
    method: 'patch',
    path: '/enquiries/{id}',
    tags,
    security,
    summary: 'Update sales notes',
    description: 'Requires `enquiries:update`.',
    request: { params: idParamsSchema, body: json(updateEnquiryBodySchema) },
    responses: { 200: detail, ...errorResponses(400, 401, 403, 404) },
  });

  registry.registerPath({
    method: 'post',
    path: '/enquiries/{id}/status',
    tags,
    security,
    summary: 'Change status',
    description: `Requires \`enquiries:update\`. Allowed transitions:\n\n${transitionsTable}\n\nNEW/ASSIGNED follow assignment.`,
    request: { params: idParamsSchema, body: json(changeStatusBodySchema) },
    responses: { 200: detail, ...errorResponses(400, 401, 403, 404, 409) },
  });

  registry.registerPath({
    method: 'put',
    path: '/enquiries/{id}/assignee',
    tags,
    security,
    summary: 'Assign or unassign',
    description:
      'Requires `enquiries:assign`. Assigning a NEW enquiry moves it to ASSIGNED; unassigning an ASSIGNED ' +
      'enquiry moves it back to NEW. Closed enquiries cannot be reassigned.',
    request: { params: idParamsSchema, body: json(assignEnquiryBodySchema) },
    responses: { 200: detail, ...errorResponses(400, 401, 403, 404, 409) },
  });

  registry.registerPath({
    method: 'post',
    path: '/enquiries/{id}/follow-ups',
    tags,
    security,
    summary: 'Add a follow-up note',
    description: 'Requires `enquiries:follow-up`.',
    request: { params: idParamsSchema, body: json(addFollowUpBodySchema) },
    responses: {
      201: jsonResponse('Created', successBody(followUpSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/enquiries/{id}',
    tags,
    security,
    summary: 'Soft delete',
    description: 'Requires `enquiries:delete` (Super Admin).',
    request: { params: idParamsSchema },
    responses: { 204: { description: 'Deleted' }, ...errorResponses(400, 401, 403, 404) },
  });
}
