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
  addFollowUpBodySchema,
  assignEnquiryBodySchema,
  changeStatusBodySchema,
  listEnquiriesQuerySchema,
  submitEnquiryBodySchema,
  updateEnquiryBodySchema,
} from './enquiries.schema';
import { enquiriesService } from './enquiries.service';

export const enquiriesController = {
  /** Public website submission. */
  submit: handle({ body: submitEnquiryBodySchema }, async (req, res) => {
    sendCreated(res, await enquiriesService.submit(req.body, req.ip));
  }),

  list: handle({ query: listEnquiriesQuerySchema }, async (req, res) => {
    const { items, pagination } = await enquiriesService.list(req.query);
    sendPaginated(res, items, pagination);
  }),

  getById: handle({ params: idParamsSchema }, async (req, res) => {
    sendSuccess(res, await enquiriesService.getById(req.params.id));
  }),

  update: handle({ params: idParamsSchema, body: updateEnquiryBodySchema }, async (req, res) => {
    sendSuccess(
      res,
      await enquiriesService.updateSalesNotes(req.params.id, req.body.salesNotes, requireAuth(req).userId)
    );
  }),

  changeStatus: handle({ params: idParamsSchema, body: changeStatusBodySchema }, async (req, res) => {
    sendSuccess(res, await enquiriesService.changeStatus(req.params.id, req.body, requireAuth(req).userId));
  }),

  assign: handle({ params: idParamsSchema, body: assignEnquiryBodySchema }, async (req, res) => {
    sendSuccess(
      res,
      await enquiriesService.assign(req.params.id, req.body.assignedToId, requireAuth(req).userId)
    );
  }),

  addFollowUp: handle({ params: idParamsSchema, body: addFollowUpBodySchema }, async (req, res) => {
    sendCreated(
      res,
      await enquiriesService.addFollowUp(req.params.id, req.body.note, requireAuth(req).userId)
    );
  }),

  remove: handle({ params: idParamsSchema }, async (req, res) => {
    await enquiriesService.softDelete(req.params.id, requireAuth(req).userId);
    sendNoContent(res);
  }),
};
