import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  notificationsService,
  TestEmailProvider,
  assertNoHeaderInjection,
  assertValidEmail,
  escapeHtml,
} from '../src/modules/notifications';
import { api } from './helpers/app';
import { signInAs, type Session } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

let userA: Session;
let userB: Session;
const testEmailProvider = new TestEmailProvider();

beforeEach(async () => {
  await resetDatabase();
  userA = await signInAs('SALES_MANAGER', { name: 'User Alpha', email: 'user.alpha@metro.test' });
  userB = await signInAs('SALES_MANAGER', { name: 'User Beta', email: 'user.beta@metro.test' });

  testEmailProvider.clear();
  notificationsService.setEmailProvider(testEmailProvider);
  notificationsService.setContactRecipientResolver({
    async resolveRecipients() {
      return { inAppUserIds: [], emails: [] };
    },
  });
});

afterEach(() => {
  testEmailProvider.clear();
});

describe('Notifications Authentication & Endpoint Access', () => {
  it('requires authentication for all notification endpoints with 401', async () => {
    await api().get('/api/v1/notifications').expect(401);
    await api().get('/api/v1/notifications/unread-count').expect(401);
    await api().patch('/api/v1/notifications/read-all').expect(401);
    await api().patch('/api/v1/notifications/00000000-0000-4000-8000-000000000000/read').expect(401);
  });

  it('does not expose a public or generic notification send endpoint (returns 404)', async () => {
    await api().post('/api/v1/notifications').set(userA.auth).send({ title: 'Test' }).expect(404);
    await api().post('/api/v1/public/notifications').send({ title: 'Test' }).expect(404);
  });
});

describe('In-App Notification Ownership & IDOR Protection', () => {
  it('allows users to see only their own notifications', async () => {
    // Create one notification for User A, one for User B
    await notificationsService.createInAppNotification({
      recipientUserId: userA.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'Alert for Alpha',
      message: 'Inquiry received for Alpha',
    });

    await notificationsService.createInAppNotification({
      recipientUserId: userB.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'Alert for Beta',
      message: 'Inquiry received for Beta',
    });

    const resA = await api().get('/api/v1/notifications').set(userA.auth).expect(200);
    expect(resA.body.data).toHaveLength(1);
    expect(resA.body.data[0].title).toBe('Alert for Alpha');

    const resB = await api().get('/api/v1/notifications').set(userB.auth).expect(200);
    expect(resB.body.data).toHaveLength(1);
    expect(resB.body.data[0].title).toBe('Alert for Beta');
  });

  it('prevents IDOR: User B cannot mark User A notification as read (returns 404)', async () => {
    const { notification } = await notificationsService.createInAppNotification({
      recipientUserId: userA.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'Confidential Alert',
      message: 'For User A only',
    });

    // User B attempts to read User A's notification
    await api().patch(`/api/v1/notifications/${notification.id}/read`).set(userB.auth).expect(404);

    // Verify it is still unread in database
    const inDb = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(inDb.readAt).toBeNull();
  });

  it('correctly reports unread count per user', async () => {
    await notificationsService.createInAppNotification({
      recipientUserId: userA.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'A1',
      message: 'M1',
    });
    await notificationsService.createInAppNotification({
      recipientUserId: userA.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'A2',
      message: 'M2',
    });
    await notificationsService.createInAppNotification({
      recipientUserId: userB.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'B1',
      message: 'MB',
    });

    const countResA = await api().get('/api/v1/notifications/unread-count').set(userA.auth).expect(200);
    expect(countResA.body.data.count).toBe(2);

    const countResB = await api().get('/api/v1/notifications/unread-count').set(userB.auth).expect(200);
    expect(countResB.body.data.count).toBe(1);
  });
});

describe('Mark-Read & Read-All Semantics & Idempotency', () => {
  it('marks a single notification read and sets audit updatedById', async () => {
    const { notification } = await notificationsService.createInAppNotification({
      recipientUserId: userA.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'Task A',
      message: 'Description A',
    });

    const res = await api()
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set(userA.auth)
      .expect(200);

    expect(res.body.data.id).toBe(notification.id);
    expect(res.body.data.readAt).not.toBeNull();

    const inDb = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(inDb.readAt).not.toBeNull();
    expect(inDb.updatedById).toBe(userA.user.id);
  });

  it('is idempotent when marking a notification read multiple times', async () => {
    const { notification } = await notificationsService.createInAppNotification({
      recipientUserId: userA.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'Task A',
      message: 'Description A',
    });

    const res1 = await api()
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set(userA.auth)
      .expect(200);
    const readAt1 = res1.body.data.readAt;

    const res2 = await api()
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set(userA.auth)
      .expect(200);
    expect(res2.body.data.readAt).toBe(readAt1);
  });

  it('marks all unread notifications as read atomically without affecting other users', async () => {
    await notificationsService.createInAppNotification({
      recipientUserId: userA.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'A1',
      message: 'M1',
    });
    await notificationsService.createInAppNotification({
      recipientUserId: userA.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'A2',
      message: 'M2',
    });
    await notificationsService.createInAppNotification({
      recipientUserId: userB.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'B1',
      message: 'MB',
    });

    const readAllRes = await api().patch('/api/v1/notifications/read-all').set(userA.auth).expect(200);
    expect(readAllRes.body.data.count).toBe(2);

    // User A has 0 unread now
    const countA = await api().get('/api/v1/notifications/unread-count').set(userA.auth).expect(200);
    expect(countA.body.data.count).toBe(0);

    // User B still has 1 unread
    const countB = await api().get('/api/v1/notifications/unread-count').set(userB.auth).expect(200);
    expect(countB.body.data.count).toBe(1);

    // Calling read-all again is idempotent and returns count 0
    const repeatRes = await api().patch('/api/v1/notifications/read-all').set(userA.auth).expect(200);
    expect(repeatRes.body.data.count).toBe(0);
  });
});

describe('Listing, Ordering & Soft Delete', () => {
  it('lists notifications in latest first order with tie-breaker', async () => {
    await notificationsService.createInAppNotification({
      recipientUserId: userA.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'First Alert',
      message: 'First Message',
    });

    await notificationsService.createInAppNotification({
      recipientUserId: userA.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'Second Alert',
      message: 'Second Message',
    });

    const res = await api().get('/api/v1/notifications').set(userA.auth).expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].title).toBe('Second Alert');
    expect(res.body.data[1].title).toBe('First Alert');
  });

  it('supports unreadOnly query filter', async () => {
    const { notification: n1 } = await notificationsService.createInAppNotification({
      recipientUserId: userA.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'Read Item',
      message: 'M1',
    });

    await notificationsService.createInAppNotification({
      recipientUserId: userA.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'Unread Item',
      message: 'M2',
    });

    await api().patch(`/api/v1/notifications/${n1.id}/read`).set(userA.auth).expect(200);

    const unreadRes = await api().get('/api/v1/notifications?unreadOnly=true').set(userA.auth).expect(200);
    expect(unreadRes.body.data).toHaveLength(1);
    expect(unreadRes.body.data[0].title).toBe('Unread Item');
  });

  it('excludes soft-deleted notifications from list and unread count', async () => {
    const { notification } = await notificationsService.createInAppNotification({
      recipientUserId: userA.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'To Delete',
      message: 'Will be deleted',
    });

    // Soft delete directly in DB
    await prisma.notification.update({
      where: { id: notification.id },
      data: { deletedAt: new Date() },
    });

    const listRes = await api().get('/api/v1/notifications').set(userA.auth).expect(200);
    expect(listRes.body.data).toHaveLength(0);

    const countRes = await api().get('/api/v1/notifications/unread-count').set(userA.auth).expect(200);
    expect(countRes.body.data.count).toBe(0);
  });
});

describe('System Audit Semantics & In-App Idempotency', () => {
  it('stores null createdById and updatedById on system-created notification', async () => {
    const { notification } = await notificationsService.createInAppNotification({
      recipientUserId: userA.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'System Event',
      message: 'Automated notification',
    });

    const inDb = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(inDb.createdById).toBeNull();
    expect(inDb.updatedById).toBeNull();
  });

  it('deduplicates in-app notifications with the same idempotencyKey', async () => {
    const key = 'contact:1234:user:alpha';

    const first = await notificationsService.createInAppNotification({
      recipientUserId: userA.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'First Try',
      message: 'Message',
      idempotencyKey: key,
    });
    expect(first.isDuplicate).toBe(false);

    const second = await notificationsService.createInAppNotification({
      recipientUserId: userA.user.id,
      type: 'CONTACT_SUBMISSION',
      title: 'Second Try',
      message: 'Message',
      idempotencyKey: key,
    });
    expect(second.isDuplicate).toBe(true);
    expect(second.notification.id).toBe(first.notification.id);

    const count = await prisma.notification.count({ where: { recipientUserId: userA.user.id } });
    expect(count).toBe(1);
  });
});

describe('Email Security, Header Injection & Provider Failure Isolation', () => {
  it('detects and rejects CR or LF in header-controlled values', () => {
    expect(() => assertNoHeaderInjection('Safe subject', 'subject')).not.toThrow();
    expect(() => assertNoHeaderInjection('Injection\r\nBcc: hacker@evil.test', 'subject')).toThrow(
      /illegal carriage return/
    );
    expect(() => assertNoHeaderInjection('Header\nInjection', 'subject')).toThrow(/illegal carriage return/);
  });

  it('rejects invalid recipient email formats', () => {
    expect(() => assertValidEmail('valid.user@example.com')).not.toThrow();
    expect(() => assertValidEmail('bad-email')).toThrow(/Invalid recipient email/);
    expect(() => assertValidEmail('user@test\r\nBcc: evil@test.com')).toThrow(/illegal carriage return/);
  });

  it('safely escapes HTML characters in template strings', () => {
    const raw = '<script>alert("XSS")</script> & \'test\'';
    const escaped = escapeHtml(raw);
    expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt; &amp; &#39;test&#39;');
  });

  it('isolates email provider delivery failure so caller never throws', async () => {
    testEmailProvider.shouldFail = true;

    const result = await notificationsService.sendEmail({
      to: 'recipient@metro.test',
      subject: 'Test Subject',
      text: 'Test Body',
    });

    expect(result).toBe(false);
  });
});

describe('Contact Form Notification Integration', () => {
  it('safely no-ops when no recipients are configured', async () => {
    const validContact = {
      name: 'Aditi Sharma',
      email: 'aditi.sharma@example.test',
      message: 'Inquiry regarding product specifications.',
    };

    const res = await api().post('/api/v1/public/contacts').send(validContact).expect(201);
    expect(res.body.success).toBe(true);

    // No notifications created in database
    const totalNotifications = await prisma.notification.count();
    expect(totalNotifications).toBe(0);
    expect(testEmailProvider.getSent()).toHaveLength(0);
  });

  it('creates in-app notifications and sends email when recipients are resolved', async () => {
    notificationsService.setContactRecipientResolver({
      async resolveRecipients() {
        return {
          inAppUserIds: [userA.user.id],
          emails: ['alerts@metro.test'],
        };
      },
    });

    const validContact = {
      name: 'Karan Mehra',
      email: 'karan.mehra@example.test',
      message: 'Looking for industrial pump components.',
    };

    const res = await api().post('/api/v1/public/contacts').send(validContact).expect(201);
    expect(res.body.success).toBe(true);

    // In-app notification created for userA
    const inAppList = await prisma.notification.findMany({ where: { recipientUserId: userA.user.id } });
    expect(inAppList).toHaveLength(1);
    expect(inAppList[0]!.type).toBe('CONTACT_SUBMISSION');
    expect(inAppList[0]!.title).toContain('Karan Mehra');

    // Email delivered via test provider
    const sentEmails = testEmailProvider.getSent();
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe('alerts@metro.test');
    expect(sentEmails[0]!.subject).toContain('Karan Mehra');
    expect(sentEmails[0]!.replyTo).toBe('karan.mehra@example.test');
  });

  it('does not fail contact submission when email provider fails', async () => {
    notificationsService.setContactRecipientResolver({
      async resolveRecipients() {
        return {
          inAppUserIds: [userA.user.id],
          emails: ['alerts@metro.test'],
        };
      },
    });

    testEmailProvider.shouldFail = true;

    const validContact = {
      name: 'Rohan Gupta',
      email: 'rohan.gupta@example.test',
      message: 'Urgent quotation required.',
    };

    // Submission MUST succeed even though email failed
    const res = await api().post('/api/v1/public/contacts').send(validContact).expect(201);
    expect(res.body.success).toBe(true);

    // Contact was saved in DB
    const contactInDb = await prisma.contactSubmission.findUniqueOrThrow({
      where: { id: res.body.data.id },
    });
    expect(contactInDb.name).toBe('Rohan Gupta');
  });
});

describe('OpenAPI Documentation for Notifications', () => {
  it('registers all notification routes and schemas in /api/docs.json', async () => {
    const res = await api().get('/api/docs.json').expect(200);

    expect(res.body.paths).toHaveProperty('/notifications');
    expect(res.body.paths).toHaveProperty('/notifications/unread-count');
    expect(res.body.paths).toHaveProperty('/notifications/read-all');
    expect(res.body.paths).toHaveProperty('/notifications/{id}/read');

    expect(res.body.components.schemas).toHaveProperty('NotificationItem');
    expect(res.body.components.schemas).toHaveProperty('NotificationUnreadCountResponse');
    expect(res.body.components.schemas).toHaveProperty('NotificationReadAllResponse');
  });
});
