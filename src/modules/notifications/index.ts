import type { AppModule } from '../../shared/module';
import { registerNotificationsDocs } from './notifications.docs';
import { notificationsRouter } from './notifications.routes';

export const notificationsModule: AppModule = {
  name: 'notifications',
  basePath: '/notifications',
  router: notificationsRouter,
  registerDocs: registerNotificationsDocs,
};

export { notificationsService, type ContactRecipientResolver } from './notifications.service';
export {
  NOTIFICATION_TYPES,
  notificationDtoSchema,
  listNotificationsQuerySchema,
  readAllResponseSchema,
  unreadCountResponseSchema,
  type ContactSubmittedNotificationEvent,
  type ListNotificationsQuery,
  type NotificationDto,
  type NotificationTypeValue,
  type ReadAllResponse,
  type UnreadCountResponse,
} from './notifications.schema';
export type {
  NotificationEmailProvider,
  SendEmailInput,
  SendEmailResult,
} from './providers/email-provider.interface';
export { NoopEmailProvider } from './providers/noop-email.provider';
export { TestEmailProvider } from './providers/test-email.provider';
export {
  assertNoHeaderInjection,
  assertValidEmail,
  escapeHtml,
  validateEmailHeaders,
  HEADER_INJECTION_REGEX,
} from './utils/email-sanitizer';
