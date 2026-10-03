import { z } from 'zod';
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
