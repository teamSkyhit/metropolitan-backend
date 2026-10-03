import { AppError } from '../../shared/errors';
import { buildPaginationMeta, type Paginated } from '../../shared/http';
import { logger } from '../../shared/logger';
import type { NotificationEmailProvider, SendEmailInput } from './providers/email-provider.interface';
import { NoopEmailProvider } from './providers/noop-email.provider';
import { notificationsRepository, type NotificationRecord } from './notifications.repository';
import {
  NOTIFICATION_TYPES,
  type ContactSubmittedNotificationEvent,
  type ListNotificationsQuery,
  type NotificationDto,
  type ReadAllResponse,
  type UnreadCountResponse,
} from './notifications.schema';
import { escapeHtml } from './utils/email-sanitizer';

export function toNotificationDto(record: NotificationRecord): NotificationDto {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    message: record.message,
    readAt: record.readAt?.toISOString() ?? null,
    entityType: record.entityType,
    entityId: record.entityId,
    createdAt: record.createdAt.toISOString(),
  };
}

export interface ContactRecipientResolver {
  resolveRecipients(): Promise<{ inAppUserIds: string[]; emails: string[] }>;
}

let activeEmailProvider: NotificationEmailProvider = new NoopEmailProvider();

/**
 * Default resolver returns empty lists. No hardcoded roles (SALES_MANAGER, SUPER_ADMIN)
 * are assumed. Role-based routing requires explicit senior business approval.
 */
let activeContactRecipientResolver: ContactRecipientResolver = {
  async resolveRecipients() {
    return { inAppUserIds: [], emails: [] };
  },
};

export const notificationsService = {
  setEmailProvider(provider: NotificationEmailProvider): void {
    activeEmailProvider = provider;
  },

  getEmailProvider(): NotificationEmailProvider {
    return activeEmailProvider;
  },

  setContactRecipientResolver(resolver: ContactRecipientResolver): void {
    activeContactRecipientResolver = resolver;
  },

  async list(recipientUserId: string, query: ListNotificationsQuery): Promise<Paginated<NotificationDto>> {
    const { items, total } = await notificationsRepository.findManyByRecipient(recipientUserId, query);
    return {
      items: items.map(toNotificationDto),
      pagination: buildPaginationMeta(query, total),
    };
  },

  async getUnreadCount(recipientUserId: string): Promise<UnreadCountResponse> {
    const count = await notificationsRepository.countUnreadByRecipient(recipientUserId);
    return { count };
  },

  async markAsRead(id: string, recipientUserId: string): Promise<NotificationDto> {
    const record = await notificationsRepository.markAsRead(id, recipientUserId, recipientUserId);
    if (!record) {
      throw AppError.notFound('Notification');
    }
    return toNotificationDto(record);
  },

  async markAllAsRead(recipientUserId: string): Promise<ReadAllResponse> {
    return notificationsRepository.markAllAsRead(recipientUserId, recipientUserId);
  },

  async createInAppNotification(input: {
    recipientUserId: string;
    type: string;
    title: string;
    message: string;
    entityType?: string | null;
    entityId?: string | null;
    idempotencyKey?: string | null;
  }): Promise<{ notification: NotificationDto; isDuplicate: boolean }> {
    const { record, isDuplicate } = await notificationsRepository.create(input);
    return { notification: toNotificationDto(record), isDuplicate };
  },

  async sendEmail(input: SendEmailInput): Promise<boolean> {
    try {
      const result = await activeEmailProvider.send(input);
      if (!result.success) {
        logger.warn(
          {
            provider: activeEmailProvider.name,
            error: result.error,
          },
          'Email delivery failed'
        );
        return false;
      }
      return true;
    } catch (err: unknown) {
      logger.warn(
        {
          provider: activeEmailProvider.name,
          error: err instanceof Error ? err.message : 'Unknown error',
        },
        'Email delivery exception occurred'
      );
      return false;
    }
  },

  async handleContactSubmitted(event: ContactSubmittedNotificationEvent): Promise<void> {
    try {
      const recipients = await activeContactRecipientResolver.resolveRecipients();

      if (recipients.inAppUserIds.length === 0 && recipients.emails.length === 0) {
        logger.debug({ contactId: event.id }, 'No notification recipients resolved for contact submission');
        return;
      }

      const safeSubject = event.subject ? ` - ${event.subject}` : '';
      const notificationTitle = `New Contact Inquiry: ${event.name}${safeSubject}`;
      const notificationMessage = `Inquiry received from ${event.name} (${event.email}).`;

      // 1. In-App Notifications for resolved users
      for (const userId of recipients.inAppUserIds) {
        const idempotencyKey = `contact:${event.id}:user:${userId}`;
        await notificationsRepository.create({
          recipientUserId: userId,
          type: NOTIFICATION_TYPES.CONTACT_SUBMISSION,
          title: notificationTitle,
          message: notificationMessage,
          entityType: 'ContactSubmission',
          entityId: event.id,
          idempotencyKey,
        });
      }

      // 2. Email Notifications for resolved addresses
      if (recipients.emails.length > 0) {
        const emailSubject = `[Metro CRM] New Contact Inquiry: ${event.name}`;
        const emailText =
          `A new contact form inquiry has been submitted.\n\n` +
          `Name: ${event.name}\n` +
          `Email: ${event.email}\n` +
          (event.mobile ? `Mobile: ${event.mobile}\n` : '') +
          (event.company ? `Company: ${event.company}\n` : '') +
          (event.subject ? `Subject: ${event.subject}\n` : '') +
          `Date: ${event.createdAt.toISOString()}\n\n` +
          `Access the CRM dashboard to view and respond.`;

        const emailHtml =
          `<p>A new contact form inquiry has been submitted.</p>` +
          `<ul>` +
          `<li><strong>Name:</strong> ${escapeHtml(event.name)}</li>` +
          `<li><strong>Email:</strong> ${escapeHtml(event.email)}</li>` +
          (event.mobile ? `<li><strong>Mobile:</strong> ${escapeHtml(event.mobile)}</li>` : '') +
          (event.company ? `<li><strong>Company:</strong> ${escapeHtml(event.company)}</li>` : '') +
          (event.subject ? `<li><strong>Subject:</strong> ${escapeHtml(event.subject)}</li>` : '') +
          `<li><strong>Date:</strong> ${escapeHtml(event.createdAt.toISOString())}</li>` +
          `</ul>` +
          `<p>Access the CRM dashboard to view full details.</p>`;

        for (const email of recipients.emails) {
          await this.sendEmail({
            to: email,
            subject: emailSubject,
            text: emailText,
            html: emailHtml,
            replyTo: event.email,
          });
        }
      }
    } catch (err: unknown) {
      // Must never crash caller or roll back contact submission
      logger.error(
        {
          contactId: event.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        },
        'Failed to process contact submission notification'
      );
    }
  },
};
