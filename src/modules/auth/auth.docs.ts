import type { z } from 'zod';
import {
  BEARER_AUTH,
  errorResponses,
  jsonResponse,
  successBody,
  type OpenAPIRegistry,
} from '../../shared/docs/openapi';
import { userSchema } from '../users';
import {
  changePasswordBodySchema,
  loginBodySchema,
  logoutBodySchema,
  refreshBodySchema,
  sessionSchema,
  tokensSchema,
} from './auth.schema';

export function registerAuthDocs(registry: OpenAPIRegistry): void {
  const tags = ['Auth'];
  const security = [{ [BEARER_AUTH]: [] }];
  const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });

  registry.registerPath({
    method: 'post',
    path: '/auth/login',
    tags,
    summary: 'Sign in',
    description:
      'Returns the user and a token pair. If `user.mustChangePassword` is true, only `/auth/me`, ' +
      '`/auth/change-password` and `/auth/logout*` are allowed until the password is changed. ' +
      'The account locks temporarily after repeated failures (423).',
    request: { body: json(loginBodySchema) },
    responses: {
      200: jsonResponse('Signed in', successBody(sessionSchema)),
      ...errorResponses(400, 401, 403, 423, 429),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/refresh',
    tags,
    summary: 'Rotate the token pair',
    description:
      'Each refresh token works once. Reusing a rotated token revokes the whole session ' +
      '(`AUTH_REFRESH_TOKEN_REUSED`). Clients must not send concurrent refresh requests.',
    request: { body: json(refreshBodySchema) },
    responses: {
      200: jsonResponse('New tokens', successBody(tokensSchema)),
      ...errorResponses(400, 401, 429),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/logout',
    tags,
    summary: 'Sign out of this session',
    request: { body: json(logoutBodySchema) },
    responses: { 204: { description: 'Signed out' }, ...errorResponses(400, 429) },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/logout-all',
    tags,
    security,
    summary: 'Sign out of every session',
    responses: { 204: { description: 'Signed out everywhere' }, ...errorResponses(401) },
  });

  registry.registerPath({
    method: 'get',
    path: '/auth/me',
    tags,
    security,
    summary: 'Current user',
    responses: { 200: jsonResponse('Current user', successBody(userSchema)), ...errorResponses(401) },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/change-password',
    tags,
    security,
    summary: 'Change own password',
    description: 'Signs out every other session and returns a fresh token pair.',
    request: { body: json(changePasswordBodySchema) },
    responses: {
      200: jsonResponse('Password changed', successBody(sessionSchema)),
      ...errorResponses(400, 401, 429),
    },
  });
}
