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
  createUserBodySchema,
  listUsersQuerySchema,
  resetPasswordBodySchema,
  setUserStatusBodySchema,
  updateUserBodySchema,
  userLookupQuerySchema,
  userLookupSchema,
  userSchema,
} from './users.schema';

export function registerUsersDocs(registry: OpenAPIRegistry): void {
  const tags = ['Users'];
  const security = [{ [BEARER_AUTH]: [] }];
  const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
  const adminOnly = 'Requires `users:manage` (Super Admin). Only Sales Manager accounts can be modified.';

  registry.registerPath({
    method: 'get',
    path: '/users/lookup',
    tags,
    security,
    summary: 'Active users for pickers (id, name, role)',
    description: 'Requires `users:lookup`. Returns at most 50 users.',
    request: { query: userLookupQuerySchema },
    responses: {
      200: jsonResponse('Users', successBody(z.array(userLookupSchema))),
      ...errorResponses(400, 401, 403),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/users',
    tags,
    security,
    summary: 'List users',
    description: 'Requires `users:read`.',
    request: { query: listUsersQuerySchema },
    responses: {
      200: jsonResponse('Paginated users', paginatedBody(userSchema)),
      ...errorResponses(400, 401, 403),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/users',
    tags,
    security,
    summary: 'Create a Sales Manager',
    description: `${adminOnly} The password is temporary: the user must change it at first sign-in.`,
    request: { body: json(createUserBodySchema) },
    responses: {
      201: jsonResponse('Created', successBody(userSchema)),
      ...errorResponses(400, 401, 403, 409),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/users/{id}',
    tags,
    security,
    summary: 'Get a user',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('User', successBody(userSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/users/{id}',
    tags,
    security,
    summary: 'Update name / email',
    description: adminOnly,
    request: { params: idParamsSchema, body: json(updateUserBodySchema) },
    responses: {
      200: jsonResponse('Updated', successBody(userSchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/users/{id}/status',
    tags,
    security,
    summary: 'Activate or deactivate',
    description: `${adminOnly} Deactivation signs the user out everywhere immediately.`,
    request: { params: idParamsSchema, body: json(setUserStatusBodySchema) },
    responses: {
      200: jsonResponse('Updated', successBody(userSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/users/{id}/reset-password',
    tags,
    security,
    summary: 'Set a temporary password',
    description: `${adminOnly} Signs the user out everywhere and forces a password change at next sign-in.`,
    request: { params: idParamsSchema, body: json(resetPasswordBodySchema) },
    responses: {
      200: jsonResponse('Password reset', successBody(userSchema)),
      ...errorResponses(400, 401, 403, 404),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/users/{id}',
    tags,
    security,
    summary: 'Soft delete',
    description: `${adminOnly} The account can be restored later; its email stays reserved.`,
    request: { params: idParamsSchema },
    responses: { 204: { description: 'Deleted' }, ...errorResponses(400, 401, 403, 404) },
  });

  registry.registerPath({
    method: 'post',
    path: '/users/{id}/restore',
    tags,
    security,
    summary: 'Restore a deleted user',
    description: 'Requires `users:manage`.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Restored', successBody(userSchema)),
      ...errorResponses(400, 401, 403, 404, 409),
    },
  });
}
