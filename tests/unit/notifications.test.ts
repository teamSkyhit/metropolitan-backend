import { describe, expect, it, vi, beforeEach } from 'vitest';
import { notificationsService } from '../../src/modules/notifications/notifications.service';
import { notificationsRepository } from '../../src/modules/notifications/notifications.repository';
import { TestEmailProvider } from '../../src/modules/notifications/providers/test-email.provider';
import { NoopEmailProvider } from '../../src/modules/notifications/providers/noop-email.provider';
import { configureContactNotifications } from '../../src/routes';
import { NOTIFICATION_TYPES } from '../../src/modules/notifications/notifications.schema';

describe('Notifications Wiring & Contact Submission (unit)', () => {
  const testEmailProvider = new TestEmailProvider();

  beforeEach(() => {
    vi.restoreAllMocks();
    testEmailProvider.clear();
    notificationsService.clearDispatchHistory();
  });

  it('composition root wires default resolver and NoopEmailProvider', async () => {
    // Reset via composition root helper
    configureContactNotifications({
      emailProvider: new NoopEmailProvider(),
      resolver: {
        async resolveRecipients() {
          return { inAppUserIds: [], emails: [] };
        },
      },
    });

    expect(notificationsService.getEmailProvider()).toBeInstanceOf(NoopEmailProvider);

    const event = {
      id: 'contact-001',
      name: 'John Doe',
      email: 'john@example.test',
      message: 'Hello world',
      createdAt: new Date(),
    };

    // When default empty resolver is active, no in-app creation or email is triggered
    const createSpy = vi.spyOn(notificationsRepository, 'create');
    await notificationsService.handleContactSubmitted(event);

    expect(createSpy).not.toHaveBeenCalled();
  });

  it('creates in-app notifications and sends email when recipients are resolved', async () => {
    notificationsService.setEmailProvider(testEmailProvider);
    notificationsService.setContactRecipientResolver({
      async resolveRecipients() {
        return {
          inAppUserIds: ['user-1'],
          emails: ['sales@metro.test'],
        };
      },
    });

    const createSpy = vi.spyOn(notificationsRepository, 'create').mockResolvedValue({
      record: {
        id: 'notif-1',
        recipientUserId: 'user-1',
        type: NOTIFICATION_TYPES.CONTACT_SUBMISSION,
        title: 'New Contact Inquiry: John Doe',
        message: 'Inquiry received from John Doe (john@example.test).',
        readAt: null,
        entityType: 'ContactSubmission',
        entityId: 'contact-002',
        idempotencyKey: 'contact:contact-002:user:user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdById: null,
        updatedById: null,
      },
      isDuplicate: false,
    });

    const event = {
      id: 'contact-002',
      name: 'John Doe',
      email: 'john@example.test',
      message: 'Product inquiry',
      createdAt: new Date(),
    };

    await notificationsService.handleContactSubmitted(event);

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: 'user-1',
        type: NOTIFICATION_TYPES.CONTACT_SUBMISSION,
        entityId: 'contact-002',
      })
    );

    const sent = testEmailProvider.getSent();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('sales@metro.test');
    expect(sent[0]!.subject).toContain('John Doe');
  });

  it('enforces idempotency and avoids duplicate notifications or duplicate emails', async () => {
    notificationsService.setEmailProvider(testEmailProvider);
    notificationsService.setContactRecipientResolver({
      async resolveRecipients() {
        return {
          inAppUserIds: ['user-1'],
          emails: ['sales@metro.test'],
        };
      },
    });

    // First run creates non-duplicate
    vi.spyOn(notificationsRepository, 'create').mockResolvedValueOnce({
      record: {
        id: 'notif-1',
        recipientUserId: 'user-1',
        type: NOTIFICATION_TYPES.CONTACT_SUBMISSION,
        title: 'New Contact Inquiry: John Doe',
        message: 'Inquiry received',
        readAt: null,
        entityType: 'ContactSubmission',
        entityId: 'contact-003',
        idempotencyKey: 'contact:contact-003:user:user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdById: null,
        updatedById: null,
      },
      isDuplicate: false,
    });

    const event = {
      id: 'contact-003',
      name: 'John Doe',
      email: 'john@example.test',
      message: 'Product inquiry',
      createdAt: new Date(),
    };

    await notificationsService.handleContactSubmitted(event);
    expect(testEmailProvider.getSent()).toHaveLength(1);

    // Second run with same event ID: repository returns duplicate
    vi.spyOn(notificationsRepository, 'create').mockResolvedValueOnce({
      record: {
        id: 'notif-1',
        recipientUserId: 'user-1',
        type: NOTIFICATION_TYPES.CONTACT_SUBMISSION,
        title: 'New Contact Inquiry: John Doe',
        message: 'Inquiry received',
        readAt: null,
        entityType: 'ContactSubmission',
        entityId: 'contact-003',
        idempotencyKey: 'contact:contact-003:user:user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdById: null,
        updatedById: null,
      },
      isDuplicate: true,
    });

    await notificationsService.handleContactSubmitted(event);
    // Email count must still be 1 (no duplicate email send)
    expect(testEmailProvider.getSent()).toHaveLength(1);
  });

  it('safely isolates recipient resolver errors without throwing', async () => {
    notificationsService.setContactRecipientResolver({
      async resolveRecipients() {
        throw new Error('Database lookup failed inside resolver');
      },
    });

    const event = {
      id: 'contact-004',
      name: 'John Doe',
      email: 'john@example.test',
      message: 'Product inquiry',
      createdAt: new Date(),
    };

    // Must not throw or reject
    await expect(notificationsService.handleContactSubmitted(event)).resolves.toBeUndefined();
  });

  it('safely isolates email delivery failure without throwing', async () => {
    testEmailProvider.shouldFail = true;
    notificationsService.setEmailProvider(testEmailProvider);
    notificationsService.setContactRecipientResolver({
      async resolveRecipients() {
        return {
          inAppUserIds: [],
          emails: ['sales@metro.test'],
        };
      },
    });

    const event = {
      id: 'contact-005',
      name: 'John Doe',
      email: 'john@example.test',
      message: 'Product inquiry',
      createdAt: new Date(),
    };

    await expect(notificationsService.handleContactSubmitted(event)).resolves.toBeUndefined();
  });
});
