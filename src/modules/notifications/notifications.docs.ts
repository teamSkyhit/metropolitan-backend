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
  listNotificationsQuerySchema,
  notificationDtoSchema,
  readAllResponseSchema,
  unreadCountResponseSchema,
} from './notifications.schema';

export function registerNotificationsDocs(registry: OpenAPIRegistry): void {
  const tags = ['Notifications'];
  const security = [{ [BEARER_AUTH]: [] }];

  registry.registerPath({
    method: 'get',
    path: '/notifications',
    tags,
    security,
    summary: "List current authenticated user's notifications",
    description:
      'Returns paginated notifications belonging to the authenticated user, ordered latest first. ' +
      'Supports optional `unreadOnly=true` filtering.',
    request: { query: listNotificationsQuerySchema },
    responses: {
      200: jsonResponse('Notifications list', paginatedBody(notificationDtoSchema)),
      ...errorResponses(400, 401),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/notifications/unread-count',
    tags,
    security,
    summary: 'Get unread notification count',
    description: 'Returns the number of unread, non-deleted notifications belonging to the current user.',
    responses: {
      200: jsonResponse('Unread count', successBody(unreadCountResponseSchema)),
      ...errorResponses(401),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/notifications/read-all',
    tags,
    security,
    summary: 'Mark all unread notifications as read',
    description:
      'Atomically marks all unread notifications belonging to the current user as read. Idempotent.',
    responses: {
      200: jsonResponse('Count of marked notifications', successBody(readAllResponseSchema)),
      ...errorResponses(401),
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/notifications/{id}/read',
    tags,
    security,
    summary: 'Mark a notification as read',
    description:
      'Marks a single notification as read. The notification must belong to the authenticated user. ' +
      'Returns 404 if the notification does not exist or belongs to another user.',
    request: { params: idParamsSchema },
    responses: {
      200: jsonResponse('Updated notification', successBody(notificationDtoSchema)),
      ...errorResponses(400, 401, 404),
    },
  });
}
