import { handle, idParamsSchema, sendPaginated, sendSuccess } from '../../shared/http';
import { requireAuth } from '../../shared/security/auth-context';
import { listNotificationsQuerySchema } from './notifications.schema';
import { notificationsService } from './notifications.service';

export const notificationsController = {
  list: handle({ query: listNotificationsQuerySchema }, async (req, res) => {
    const userId = requireAuth(req).userId;
    const { items, pagination } = await notificationsService.list(userId, req.query);
    sendPaginated(res, items, pagination);
  }),

  getUnreadCount: handle({}, async (req, res) => {
    const userId = requireAuth(req).userId;
    sendSuccess(res, await notificationsService.getUnreadCount(userId));
  }),

  markAsRead: handle({ params: idParamsSchema }, async (req, res) => {
    const userId = requireAuth(req).userId;
    sendSuccess(res, await notificationsService.markAsRead(req.params.id, userId));
  }),

  markAllAsRead: handle({}, async (req, res) => {
    const userId = requireAuth(req).userId;
    sendSuccess(res, await notificationsService.markAllAsRead(userId));
  }),
};
