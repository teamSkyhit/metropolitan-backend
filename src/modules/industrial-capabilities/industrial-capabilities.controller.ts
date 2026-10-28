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
  createIndustrialCapabilityBodySchema,
  listIndustrialCapabilitiesQuerySchema,
  reorderIndustrialCapabilitiesBodySchema,
  updateIndustrialCapabilityBodySchema,
  updateIndustrialCapabilitySectionSettingsSchema,
} from './industrial-capabilities.schema';
import { industrialCapabilitiesService } from './industrial-capabilities.service';

/** HTTP only: read validated input, call the service, send the response. */
export const industrialCapabilitiesController = {
  // ── CRM Admin Endpoints ──────────────────────────────────────────────────────

  list: handle({ query: listIndustrialCapabilitiesQuerySchema }, async (req, res) => {
    const { items, pagination } = await industrialCapabilitiesService.list(req.query);
    sendPaginated(res, items, pagination);
  }),

  getById: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await industrialCapabilitiesService.getById(req.params.id));
  }),

  create: handle({ body: createIndustrialCapabilityBodySchema }, async (req, res) => {
    sendCreated(res, await industrialCapabilitiesService.create(req.body, requireAuth(req).userId));
  }),

  update: handle({ params: idParamsSchema, body: updateIndustrialCapabilityBodySchema }, async (req, res) => {
    sendSuccess(
      res,
      await industrialCapabilitiesService.update(req.params.id, req.body, requireAuth(req).userId)
    );
  }),

  remove: handle({ params: idParamsSchema }, async (req, res) => {
    await industrialCapabilitiesService.softDelete(req.params.id, requireAuth(req).userId);
    sendNoContent(res);
  }),

  reorder: handle({ body: reorderIndustrialCapabilitiesBodySchema }, async (req, res) => {
    sendSuccess(res, await industrialCapabilitiesService.reorder(req.body, requireAuth(req).userId));
  }),

  uploadImage: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(
      res,
      await industrialCapabilitiesService.uploadImage(req.params.id, req.file!, requireAuth(req).userId)
    );
  }),

  removeImage: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await industrialCapabilitiesService.removeImage(req.params.id, requireAuth(req).userId));
  }),

  getSettings: handle({}, async (_req, res) => {
    sendSuccess(res, await industrialCapabilitiesService.getSectionSettings());
  }),

  updateSettings: handle({ body: updateIndustrialCapabilitySectionSettingsSchema }, async (req, res) => {
    sendSuccess(
      res,
      await industrialCapabilitiesService.updateSectionSettings(req.body, requireAuth(req).userId)
    );
  }),

  // ── Public Website Endpoint ──────────────────────────────────────────────────

  getPublic: handle({}, async (_req, res) => {
    sendSuccess(res, await industrialCapabilitiesService.getPublicData());
  }),
};
