import { Router } from 'express';
import { authenticate, authorize, rateLimiters, requireCaptcha } from '../../middleware';
import { Permission } from '../../shared/security/permissions';
import { enquiriesController } from './enquiries.controller';

/** The website must request the captcha with this action name (reCAPTCHA v3 / Turnstile). */
export const ENQUIRY_CAPTCHA_ACTION = 'enquiry_submit';

// Public website: /api/v1/public/enquiries
export const enquiriesPublicRouter = Router();

enquiriesPublicRouter.post(
  '/',
  rateLimiters.publicForm,
  requireCaptcha({ action: ENQUIRY_CAPTCHA_ACTION }),
  enquiriesController.submit
);

// CRM: /api/v1/enquiries
export const enquiriesRouter = Router();

enquiriesRouter.use(authenticate());

enquiriesRouter.get('/', authorize(Permission.ENQUIRIES_READ), enquiriesController.list);
enquiriesRouter.get('/:id', authorize(Permission.ENQUIRIES_READ), enquiriesController.getById);
enquiriesRouter.patch('/:id', authorize(Permission.ENQUIRIES_UPDATE), enquiriesController.update);
enquiriesRouter.post('/:id/status', authorize(Permission.ENQUIRIES_UPDATE), enquiriesController.changeStatus);
enquiriesRouter.put('/:id/assignee', authorize(Permission.ENQUIRIES_ASSIGN), enquiriesController.assign);
enquiriesRouter.post(
  '/:id/follow-ups',
  authorize(Permission.ENQUIRIES_FOLLOW_UP),
  enquiriesController.addFollowUp
);
enquiriesRouter.delete('/:id', authorize(Permission.ENQUIRIES_DELETE), enquiriesController.remove);
