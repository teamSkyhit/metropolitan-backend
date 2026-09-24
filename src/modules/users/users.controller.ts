import {
  handle,
  idParamsSchema,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../shared/http';
import { requireAuth } from '../../shared/security/auth-context';
import {
  createUserBodySchema,
  listUsersQuerySchema,
  resetPasswordBodySchema,
  setUserStatusBodySchema,
  updateUserBodySchema,
  userLookupQuerySchema,
} from './users.schema';
import { usersService } from './users.service';

export const usersController = {
  list: handle({ query: listUsersQuerySchema }, async (req, res) => {
    const { items, pagination } = await usersService.list(req.query);
    sendPaginated(res, items, pagination);
  }),

  lookup: handle({ query: userLookupQuerySchema }, async (req, res) => {
    sendSuccess(res, await usersService.lookup(req.query));
  }),

  getById: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await usersService.getById(req.params.id));
  }),

  create: handle({ body: createUserBodySchema }, async (req, res) => {
    sendCreated(res, await usersService.create(req.body, requireAuth(req).userId));
  }),

  update: handle({ params: idParamsSchema, body: updateUserBodySchema }, async (req, res) => {
    sendSuccess(res, await usersService.update(req.params.id, req.body, requireAuth(req).userId));
  }),

  setStatus: handle({ params: idParamsSchema, body: setUserStatusBodySchema }, async (req, res) => {
    sendSuccess(res, await usersService.setActive(req.params.id, req.body.isActive, requireAuth(req).userId));
  }),

  resetPassword: handle({ params: idParamsSchema, body: resetPasswordBodySchema }, async (req, res) => {
    sendSuccess(
      res,
      await usersService.resetPassword(req.params.id, req.body.newPassword, requireAuth(req).userId)
    );
  }),

  remove: handle({ params: idParamsSchema }, async (req, res) => {
    await usersService.softDelete(req.params.id, requireAuth(req).userId);
    sendNoContent(res);
  }),

  restore: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await usersService.restore(req.params.id, requireAuth(req).userId));
  }),
};
