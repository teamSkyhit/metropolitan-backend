import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { notDeleted } from '../../shared/database/soft-delete';
import { toSkipTake } from '../../shared/http';
import type { ListNotificationsQuery } from './notifications.schema';

export type NotificationRecord = Prisma.NotificationGetPayload<object>;

export interface CreateNotificationRecordInput {
  recipientUserId: string;
  type: string;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  idempotencyKey?: string | null;
}

export interface CreateNotificationResult {
  record: NotificationRecord;
  isDuplicate: boolean;
}

export const notificationsRepository = {
  async create(data: CreateNotificationRecordInput): Promise<CreateNotificationResult> {
    if (data.idempotencyKey) {
      const existing = await prisma.notification.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) {
        return { record: existing, isDuplicate: true };
      }
    }

    try {
      const record = await prisma.notification.create({
        data: {
          recipientUserId: data.recipientUserId,
          type: data.type,
          title: data.title,
          message: data.message,
          entityType: data.entityType ?? null,
          entityId: data.entityId ?? null,
          idempotencyKey: data.idempotencyKey ?? null,
          createdById: null,
          updatedById: null,
        },
      });
      return { record, isDuplicate: false };
    } catch (error: unknown) {
      if (
        data.idempotencyKey &&
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        const existing = await prisma.notification.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
        });
        if (existing) {
          return { record: existing, isDuplicate: true };
        }
      }
      throw error;
    }
  },

  async findManyByRecipient(
    recipientUserId: string,
    query: ListNotificationsQuery
  ): Promise<{ items: NotificationRecord[]; total: number }> {
    const where: Prisma.NotificationWhereInput = {
      recipientUserId,
      ...notDeleted,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const { skip, take } = toSkipTake(query);
    const orderBy: Prisma.NotificationOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy,
        skip,
        take,
      }),
      prisma.notification.count({ where }),
    ]);

    return { items, total };
  },

  countUnreadByRecipient(recipientUserId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        recipientUserId,
        readAt: null,
        ...notDeleted,
      },
    });
  },

  async markAsRead(id: string, recipientUserId: string, actorId: string): Promise<NotificationRecord | null> {
    const existing = await prisma.notification.findFirst({
      where: {
        id,
        recipientUserId,
        ...notDeleted,
      },
    });

    if (!existing) {
      return null;
    }

    if (existing.readAt) {
      return existing;
    }

    return prisma.notification.update({
      where: { id: existing.id },
      data: {
        readAt: new Date(),
        updatedById: actorId,
      },
    });
  },

  async markAllAsRead(recipientUserId: string, actorId: string): Promise<{ count: number }> {
    const result = await prisma.notification.updateMany({
      where: {
        recipientUserId,
        readAt: null,
        ...notDeleted,
      },
      data: {
        readAt: new Date(),
        updatedById: actorId,
      },
    });

    return { count: result.count };
  },
};
