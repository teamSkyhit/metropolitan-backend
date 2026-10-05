import { handle, idParamsSchema, sendCreated, sendNoContent, sendSuccess } from '../../shared/http';
import { requireAuth } from '../../shared/security/auth-context';
import {
  createHomepageSectionBodySchema,
  reorderHomepageSectionsBodySchema,
  updateHomepageSectionBodySchema,
} from './homepage.schema';
import { homepageService } from './homepage.service';

export const homepageController = {
  list: handle({}, async (_req, res) => {
    const sections = await homepageService.list();
    sendSuccess(res, sections);
  }),

  getById: handle({ params: idParamsSchema }, async (req, res) => {
    const section = await homepageService.getById(req.params.id);
    sendSuccess(res, section);
  }),

  create: handle({ body: createHomepageSectionBodySchema }, async (req, res) => {
    const actorId = requireAuth(req).userId;
    const section = await homepageService.create(req.body, actorId);
    sendCreated(res, section);
  }),

  update: handle({ params: idParamsSchema, body: updateHomepageSectionBodySchema }, async (req, res) => {
    const actorId = requireAuth(req).userId;
    const section = await homepageService.update(req.params.id, req.body, actorId);
    sendSuccess(res, section);
  }),

  reorder: handle({ body: reorderHomepageSectionsBodySchema }, async (req, res) => {
    const actorId = requireAuth(req).userId;
    const sections = await homepageService.reorder(req.body, actorId);
    sendSuccess(res, sections);
  }),

  delete: handle({ params: idParamsSchema }, async (req, res) => {
    const actorId = requireAuth(req).userId;
    await homepageService.softDelete(req.params.id, actorId);
    sendNoContent(res);
  }),

  getPublicHomepage: handle({}, async (_req, res) => {
    const data = await homepageService.getPublicHomepage();
    sendSuccess(res, data);
  }),
};
