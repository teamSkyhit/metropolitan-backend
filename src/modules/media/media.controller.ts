import {
  handle,
  idParamsSchema,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../shared/http';
import { requireAuth } from '../../shared/security/auth-context';
import { listMediaQuerySchema } from './media.schema';
import { mediaService } from './media.service';

/** HTTP only: read validated input, call the service, send the response. */
export const mediaController = {
  list: handle({ query: listMediaQuerySchema }, async (req, res) => {
    const { items, pagination } = await mediaService.list(req.query);
    sendPaginated(res, items, pagination);
  }),

  getById: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await mediaService.getById(req.params.id));
  }),

  upload: handle({}, async (req, res) => {
    const auth = requireAuth(req);
    sendCreated(res, await mediaService.upload(req.file!, auth.userId));
  }),

  remove: handle({ params: idParamsSchema }, async (req, res) => {
    await mediaService.remove(req.params.id);
    sendNoContent(res);
  }),
};
