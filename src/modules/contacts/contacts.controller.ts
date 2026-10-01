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
  listContactsQuerySchema,
  submitContactBodySchema,
  updateContactStatusBodySchema,
} from './contacts.schema';
import { contactsService } from './contacts.service';

export const contactsController = {
  submit: handle({ body: submitContactBodySchema }, async (req, res) => {
    sendCreated(res, await contactsService.submit(req.body, req.ip));
  }),

  list: handle({ query: listContactsQuerySchema }, async (req, res) => {
    const { items, pagination } = await contactsService.list(req.query);
    sendPaginated(res, items, pagination);
  }),

  getById: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await contactsService.getById(req.params.id));
  }),

  updateStatus: handle({ params: idParamsSchema, body: updateContactStatusBodySchema }, async (req, res) => {
    sendSuccess(res, await contactsService.updateStatus(req.params.id, req.body.status));
  }),

  remove: handle({ params: idParamsSchema }, async (req, res) => {
    await contactsService.softDelete(req.params.id, requireAuth(req).userId);
    sendNoContent(res);
  }),
};
