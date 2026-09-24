import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import type { ResponseConfig } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

/**
 * OpenAPI documentation is generated from the same zod schemas used for
 * validation. Each module registers its paths in `<module>.docs.ts`.
 */
export type { OpenAPIRegistry };

export const BEARER_AUTH = 'bearerAuth';
export const CAPTCHA_AUTH = 'captchaToken';

export const errorBodySchema = z
  .object({
    success: z.literal(false),
    error: z.object({
      code: z.string().meta({ example: 'VALIDATION_ERROR' }),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string(),
    }),
  })
  .meta({ id: 'ErrorResponse' });

export const paginationMetaSchema = z
  .object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
    hasNextPage: z.boolean(),
    hasPrevPage: z.boolean(),
  })
  .meta({ id: 'PaginationMeta' });

export function successBody<T extends z.ZodType>(data: T) {
  return z.object({ success: z.literal(true), data });
}

export function paginatedBody<T extends z.ZodType>(item: T) {
  return z.object({
    success: z.literal(true),
    data: z.array(item),
    meta: z.object({ pagination: paginationMetaSchema }),
  });
}

export function jsonResponse(description: string, schema: z.ZodType): ResponseConfig {
  return { description, content: { 'application/json': { schema } } };
}

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Invalid request',
  401: 'Missing, invalid or expired access token',
  403: 'Not allowed',
  404: 'Not found',
  409: 'Conflict',
  413: 'Payload too large',
  423: 'Account temporarily locked',
  429: 'Rate limit exceeded',
  503: 'Dependency unavailable',
};

/** Standard error responses for `registerPath({ responses: { ...errorResponses(400, 401) } })`. */
export function errorResponses(...statuses: number[]): Record<number, ResponseConfig> {
  return Object.fromEntries(
    statuses.map((status) => [status, jsonResponse(ERROR_DESCRIPTIONS[status] ?? 'Error', errorBodySchema)])
  );
}

export function createRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', BEARER_AUTH, {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });
  registry.registerComponent('securitySchemes', CAPTCHA_AUTH, {
    type: 'apiKey',
    in: 'header',
    name: 'X-Captcha-Token',
    description: 'Captcha token from the configured provider (Turnstile / reCAPTCHA / hCaptcha)',
  });
  return registry;
}

export function generateDocument(registry: OpenAPIRegistry) {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Metro Industrial CRM API',
      version: process.env.npm_package_version ?? '1.0.0',
      description:
        'All responses use the envelope `{ success, data, meta? }` or `{ success: false, error: { code, message, details?, requestId } }`.',
    },
    servers: [{ url: '/api/v1' }],
  });
}
