import type { AppModule } from '../../shared/module';
import { registerContactsDocs } from './contacts.docs';
import { contactsPublicRouter, contactsRouter } from './contacts.routes';

export const contactsModule: AppModule = {
  name: 'contacts',
  basePath: '/contacts',
  router: contactsRouter,
  publicRouter: contactsPublicRouter,
  registerDocs: registerContactsDocs,
};

export { contactsService } from './contacts.service';
export {
  ContactStatus,
  contactDetailSchema,
  contactStatusEnum,
  contactSummarySchema,
  listContactsQuerySchema,
  submitContactBodySchema,
  submitContactResponseSchema,
  updateContactStatusBodySchema,
  type ContactDetailDto,
  type ContactStatusType,
  type ContactSummaryDto,
  type ListContactsQuery,
  type SubmitContactBody,
  type SubmitContactResponse,
  type UpdateContactStatusBody,
} from './contacts.schema';
