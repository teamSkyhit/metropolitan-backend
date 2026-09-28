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
  createCategoryBodySchema,
  listCategoriesQuerySchema,
  publicCategorySlugParamsSchema,
  updateCategoryBodySchema,
} from './categories.schema';
import { categoriesService } from './categories.service';

/** HTTP only: read validated input, call the service, send the response. */
export const categoriesController = {
  // ── Admin Endpoints ──────────────────────────────────────────────────────────

  list: handle({ query: listCategoriesQuerySchema }, async (req, res) => {
    const { items, pagination } = await categoriesService.list(req.query);
    sendPaginated(res, items, pagination);
  }),

  getById: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await categoriesService.getById(req.params.id));
  }),

  create: handle({ body: createCategoryBodySchema }, async (req, res) => {
    sendCreated(res, await categoriesService.create(req.body, requireAuth(req).userId));
  }),

  update: handle({ params: idParamsSchema, body: updateCategoryBodySchema }, async (req, res) => {
    sendSuccess(res, await categoriesService.update(req.params.id, req.body, requireAuth(req).userId));
  }),

  remove: handle({ params: idParamsSchema }, async (req, res) => {
    await categoriesService.softDelete(req.params.id, requireAuth(req).userId);
    sendNoContent(res);
  }),

  restore: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await categoriesService.restore(req.params.id, requireAuth(req).userId));
  }),

  uploadBanner: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await categoriesService.uploadBanner(req.params.id, req.file!, requireAuth(req).userId));
  }),

  removeBanner: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await categoriesService.removeBanner(req.params.id, requireAuth(req).userId));
  }),

  // ── Public Endpoints ─────────────────────────────────────────────────────────

  listPublic: handle({}, async (_req, res) => {
    sendSuccess(res, await categoriesService.listPublic());
  }),

  getBySlugPublic: handle({ params: publicCategorySlugParamsSchema }, async (req, res) => {
    sendSuccess(res, await categoriesService.getBySlugPublic(req.params.slug));
  }),
};
