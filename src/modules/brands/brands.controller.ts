import { z } from 'zod';
import {
  handle,
  idParamsSchema,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../shared/http';
import { requireAuth } from '../../shared/security/auth-context';
import { createBrandBodySchema, listBrandsQuerySchema, updateBrandBodySchema } from './brands.schema';
import { brandsService } from './brands.service';

const slugParamsSchema = z.object({
  slug: z.string().trim().min(1, 'Slug is required'),
});

/** HTTP only: read validated input, call the service, send the response. */
export const brandsController = {
  // ── Admin Endpoints ──────────────────────────────────────────────────────────

  list: handle({ query: listBrandsQuerySchema }, async (req, res) => {
    const { items, pagination } = await brandsService.list(req.query);
    sendPaginated(res, items, pagination);
  }),

  getById: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await brandsService.getById(req.params.id));
  }),

  create: handle({ body: createBrandBodySchema }, async (req, res) => {
    sendCreated(res, await brandsService.create(req.body, requireAuth(req).userId));
  }),

  update: handle({ params: idParamsSchema, body: updateBrandBodySchema }, async (req, res) => {
    sendSuccess(res, await brandsService.update(req.params.id, req.body, requireAuth(req).userId));
  }),

  remove: handle({ params: idParamsSchema }, async (req, res) => {
    await brandsService.softDelete(req.params.id, requireAuth(req).userId);
    sendNoContent(res);
  }),

  restore: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await brandsService.restore(req.params.id, requireAuth(req).userId));
  }),

  uploadLogo: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await brandsService.uploadLogo(req.params.id, req.file!, requireAuth(req).userId));
  }),

  removeLogo: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await brandsService.removeLogo(req.params.id, requireAuth(req).userId));
  }),

  uploadBanner: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await brandsService.uploadBanner(req.params.id, req.file!, requireAuth(req).userId));
  }),

  removeBanner: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await brandsService.removeBanner(req.params.id, requireAuth(req).userId));
  }),

  // ── Public Endpoints ─────────────────────────────────────────────────────────

  listPublic: handle({}, async (_req, res) => {
    sendSuccess(res, await brandsService.listPublic());
  }),

  getBySlugPublic: handle({ params: slugParamsSchema }, async (req, res) => {
    sendSuccess(res, await brandsService.getBySlugPublic(req.params.slug));
  }),
};
