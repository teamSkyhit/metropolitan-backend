import { z } from 'zod';
import { AppError } from '../../shared/errors';
import { paginationQuerySchema } from '../../shared/http';

export const NOTIFICATION_TYPES = {
  CONTACT_SUBMISSION: 'CONTACT_SUBMISSION',
} as const;

export type NotificationTypeValue = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const booleanString = z.enum(['true', 'false']).transform((val) => val === 'true');

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unreadOnly: booleanString.optional().meta({
    description: 'When true, returns only unread notifications (readAt IS NULL)',
  }),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const notificationDtoSchema = z
  .object({
    id: z.uuid(),
    type: z.string(),
    title: z.string(),
    message: z.string(),
    readAt: z.iso.datetime().nullable(),
    entityType: z.string().nullable(),
    entityId: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'NotificationItem' });

export type NotificationDto = z.infer<typeof notificationDtoSchema>;

export const unreadCountResponseSchema = z
  .object({
    count: z.number().int().min(0),
  })
  .meta({ id: 'NotificationUnreadCountResponse' });

export type UnreadCountResponse = z.infer<typeof unreadCountResponseSchema>;

export const readAllResponseSchema = z
  .object({
    count: z.number().int().min(0),
  })
  .meta({ id: 'NotificationReadAllResponse' });

export type ReadAllResponse = z.infer<typeof readAllResponseSchema>;

export interface CreateNotificationInput {
  recipientUserId: string;
  type: string;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  idempotencyKey?: string | null;
}

export interface ValidatedCreateNotificationInput {
  recipientUserId: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  idempotencyKey: string | null;
}

export const createNotificationCommandSchema = z.object({
  recipientUserId: z.uuid('Invalid recipientUserId: must be a valid UUID'),
  type: z
    .string()
    .min(1, 'Notification type cannot be empty')
    .max(50, 'Notification type must not exceed 50 characters'),
  title: z
    .string()
    .min(1, 'Notification title cannot be empty')
    .transform((val) => {
      let clamped = val.slice(0, 200).trimEnd();
      clamped = clamped.replace(/[\s—–-]+$/, '').trimEnd();
      return clamped.length > 0 ? clamped : val.slice(0, 200);
    }),
  message: z.string().transform((val) => val.slice(0, 2000)),
  entityType: z.string().max(50, 'entityType must not exceed 50 characters').nullable().optional(),
  entityId: z
    .uuid('Invalid entityId: must be a valid UUID')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  idempotencyKey: z.string().max(128, 'idempotencyKey must not exceed 128 characters').nullable().optional(),
});

export function normalizeAndValidateCreateNotificationInput(
  input: CreateNotificationInput
): ValidatedCreateNotificationInput {
  const result = createNotificationCommandSchema.safeParse(input);
  if (!result.success) {
    const firstIssue = result.error.issues?.[0];
    const firstError = firstIssue?.message ?? 'Invalid notification input';
    throw AppError.badRequest(firstError);
  }
  return {
    recipientUserId: result.data.recipientUserId,
    type: result.data.type,
    title: result.data.title,
    message: result.data.message,
    entityType: result.data.entityType ?? null,
    entityId: result.data.entityId ?? null,
    idempotencyKey: result.data.idempotencyKey ?? null,
  };
}

/** Internal payload passed from Contact form or other domain events */
export interface ContactSubmittedNotificationEvent {
  id: string;
  name: string;
  email: string;
  mobile?: string | null;
  company?: string | null;
  subject?: string | null;
  createdAt: Date;
}
