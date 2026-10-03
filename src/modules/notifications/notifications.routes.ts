import { Router } from 'express';
import { authenticate, authorize } from '../../middleware';
import { Permission } from '../../shared/security/permissions';
import { notificationsController } from './notifications.controller';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate());

notificationsRouter.get('/', authorize(Permission.NOTIFICATIONS_READ), notificationsController.list);
notificationsRouter.get(
  '/unread-count',
  authorize(Permission.NOTIFICATIONS_READ),
  notificationsController.getUnreadCount
);
notificationsRouter.patch(
  '/read-all',
  authorize(Permission.NOTIFICATIONS_READ),
  notificationsController.markAllAsRead
);
notificationsRouter.patch(
  '/:id/read',
  authorize(Permission.NOTIFICATIONS_READ),
  notificationsController.markAsRead
);
