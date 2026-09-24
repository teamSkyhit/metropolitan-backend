import { handle, idParamsSchema, sendPaginated, sendSuccess } from '../../shared/http';
import { list__Module__QuerySchema } from './__module__.schema';
import { __camel__Service } from './__module__.service';

/** HTTP only: read validated input, call the service, send the response. */
export const __camel__Controller = {
  list: handle({ query: list__Module__QuerySchema }, async (req, res) => {
    const { items, pagination } = await __camel__Service.list(req.query);
    sendPaginated(res, items, pagination);
  }),

  getById: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await __camel__Service.getById(req.params.id));
  }),
};
