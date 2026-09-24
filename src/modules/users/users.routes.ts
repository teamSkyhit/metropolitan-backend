import { Router } from 'express';
import { authenticate, authorize } from '../../middleware';
import { Permission } from '../../shared/security/permissions';
import { usersController } from './users.controller';

export const usersRouter = Router();

usersRouter.use(authenticate());

usersRouter.get('/lookup', authorize(Permission.USERS_LOOKUP), usersController.lookup);
usersRouter.get('/', authorize(Permission.USERS_READ), usersController.list);
usersRouter.post('/', authorize(Permission.USERS_MANAGE), usersController.create);
usersRouter.get('/:id', authorize(Permission.USERS_READ), usersController.getById);
usersRouter.patch('/:id', authorize(Permission.USERS_MANAGE), usersController.update);
usersRouter.patch('/:id/status', authorize(Permission.USERS_MANAGE), usersController.setStatus);
usersRouter.post('/:id/reset-password', authorize(Permission.USERS_MANAGE), usersController.resetPassword);
usersRouter.delete('/:id', authorize(Permission.USERS_MANAGE), usersController.remove);
usersRouter.post('/:id/restore', authorize(Permission.USERS_MANAGE), usersController.restore);
