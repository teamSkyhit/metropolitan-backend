import { Router } from 'express';
import { authenticate, authorize, rateLimiters, requireCaptcha } from '../../middleware';
import { Permission } from '../../shared/security/permissions';
import { contactsController } from './contacts.controller';

export const CONTACT_CAPTCHA_ACTION = 'contact_submit';

// Public website: /api/v1/public/contacts
export const contactsPublicRouter = Router();

contactsPublicRouter.post(
  '/',
  rateLimiters.publicForm,
  requireCaptcha({ action: CONTACT_CAPTCHA_ACTION }),
  contactsController.submit
);

// CRM: /api/v1/contacts
export const contactsRouter = Router();

contactsRouter.use(authenticate());

contactsRouter.get('/', authorize(Permission.CONTACTS_READ), contactsController.list);
contactsRouter.get('/:id', authorize(Permission.CONTACTS_READ), contactsController.getById);
contactsRouter.patch('/:id/status', authorize(Permission.CONTACTS_UPDATE), contactsController.updateStatus);
contactsRouter.delete('/:id', authorize(Permission.CONTACTS_DELETE), contactsController.remove);
