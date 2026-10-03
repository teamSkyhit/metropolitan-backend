import { Router } from 'express';
import { authenticate } from '../../middleware';
import { notificationsController } from './notifications.controller';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate());

notificationsRouter.get('/', notificationsController.list);
notificationsRouter.get('/unread-count', notificationsController.getUnreadCount);
notificationsRouter.patch('/read-all', notificationsController.markAllAsRead);
notificationsRouter.patch('/:id/read', notificationsController.markAsRead);
