import { AppError } from '../../shared/errors';
import { buildPaginationMeta, type Paginated } from '../../shared/http';
import { logger } from '../../shared/logger';
import type { NotificationEmailProvider, SendEmailInput } from './providers/email-provider.interface';
import { NoopEmailProvider } from './providers/noop-email.provider';
import { notificationsRepository, type NotificationRecord } from './notifications.repository';
import {
  NOTIFICATION_TYPES,
  type ContactSubmittedNotificationEvent,
  type CreateNotificationInput,
  type ListNotificationsQuery,
  type NotificationDto,
  type ReadAllResponse,
  type UnreadCountResponse,
} from './notifications.schema';
import { escapeHtml, validateEmailHeaders } from './utils/email-sanitizer';

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
 * In-memory registry of dispatched contact email IDs within the current runtime session.
 * Real durable cross-process email idempotency requires a persistent delivery queue/table.
 */
const dispatchedContactEmailIds = new Set<string>();

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

  clearDispatchHistory(): void {
    dispatchedContactEmailIds.clear();
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

  async createInAppNotification(
    input: CreateNotificationInput
  ): Promise<{ notification: NotificationDto; isDuplicate: boolean }> {
    const { record, isDuplicate } = await notificationsRepository.create(input);
    return { notification: toNotificationDto(record), isDuplicate };
  },

  async sendEmail(input: SendEmailInput): Promise<boolean> {
    validateEmailHeaders(input);

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

      // 1. Construct deterministic readable title clamped safely to 200 characters without trailing separators
      const trimmedName = event.name.trim();
      const trimmedSubject = event.subject?.trim();
      let notificationTitle = trimmedSubject
        ? `New Contact Inquiry: ${trimmedName} — ${trimmedSubject}`
        : `New Contact Inquiry: ${trimmedName}`;

      if (notificationTitle.length > 200) {
        notificationTitle = notificationTitle.slice(0, 200).trimEnd();
        notificationTitle = notificationTitle.replace(/[\s—–-]+$/, '').trimEnd();
      }

      // Clamp message safely to 2000 characters
      let notificationMessage = `Inquiry received from ${trimmedName} (${event.email.trim()}).`;
      if (notificationMessage.length > 2000) {
        notificationMessage = notificationMessage.slice(0, 2000);
      }

      // 2. In-App Notifications for resolved users (durable DB idempotency)
      let allInAppDuplicates = recipients.inAppUserIds.length > 0;
      for (const userId of recipients.inAppUserIds) {
        const idempotencyKey = `contact:${event.id}:user:${userId}`;
        const result = await notificationsRepository.create({
          recipientUserId: userId,
          type: NOTIFICATION_TYPES.CONTACT_SUBMISSION,
          title: notificationTitle,
          message: notificationMessage,
          entityType: 'ContactSubmission',
          entityId: event.id,
          idempotencyKey,
        });
        if (!result.isDuplicate) {
          allInAppDuplicates = false;
        }
      }

      // 3. Email Notifications for resolved addresses
      // Prevent duplicate sends within the runtime dispatch path
      const alreadyDispatchedEmails =
        (recipients.inAppUserIds.length > 0 && allInAppDuplicates) || dispatchedContactEmailIds.has(event.id);

      if (recipients.emails.length > 0 && !alreadyDispatchedEmails) {
        const cleanName = trimmedName.replace(/[\r\n\u2028\u2029]/g, ' ');
        const emailSubject = `[Metro CRM] New Contact Inquiry: ${cleanName}`;
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
            replyTo: event.email.trim(),
          });
        }

        dispatchedContactEmailIds.add(event.id);
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
