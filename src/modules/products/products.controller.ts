import {
  handle,
  idParamsSchema,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../shared/http';
import { requireAuth } from '../../shared/security/auth-context';
import { createProductBodySchema, listProductsQuerySchema, updateProductBodySchema } from './products.schema';
import { productsService } from './products.service';

/** HTTP only: read validated input, call the service, send the response. */
export const productsController = {
  list: handle({ query: listProductsQuerySchema }, async (req, res) => {
    const { items, pagination } = await productsService.list(req.query);
    sendPaginated(res, items, pagination);
  }),

  getById: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await productsService.getById(req.params.id));
  }),

  create: handle({ body: createProductBodySchema }, async (req, res) => {
    sendCreated(res, await productsService.create(req.body, requireAuth(req).userId));
  }),

  update: handle({ params: idParamsSchema, body: updateProductBodySchema }, async (req, res) => {
    sendSuccess(res, await productsService.update(req.params.id, req.body, requireAuth(req).userId));
  }),

  remove: handle({ params: idParamsSchema }, async (req, res) => {
    await productsService.softDelete(req.params.id, requireAuth(req).userId);
    sendNoContent(res);
  }),

  restore: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await productsService.restore(req.params.id, requireAuth(req).userId));
  }),
};
