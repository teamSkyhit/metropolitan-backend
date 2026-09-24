import type { Prisma, User } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  createdBy,
  notDeleted,
  restoreData,
  softDeleteData,
  updatedBy,
} from '../../shared/database/soft-delete';
import { toSkipTake } from '../../shared/http';
import type { Role } from '../../shared/security/roles';
import type { ListUsersQuery, UserLookupQuery } from './users.schema';

export type UserRecord = User;

export const usersRepository = {
  findById(id: string): Promise<User | null> {
    return prisma.user.findFirst({ where: { id, ...notDeleted } });
  },

  /** Includes soft-deleted users (needed for email conflict and restore checks). */
  findByIdIncludingDeleted(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  /** Includes soft-deleted users, because emails stay reserved after deletion. */
  findByEmailIncludingDeleted(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  findActiveByEmail(email: string): Promise<User | null> {
    return prisma.user.findFirst({ where: { email, ...notDeleted } });
  },

  async findMany(query: ListUsersQuery): Promise<{ items: User[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      ...notDeleted,
      ...(query.role && { role: query.role }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({ where, ...toSkipTake(query), orderBy: { createdAt: 'desc' } }),
      prisma.user.count({ where }),
    ]);
    return { items, total };
  },

  lookup(query: UserLookupQuery): Promise<{ id: string; name: string; role: Role }[]> {
    return prisma.user.findMany({
      where: {
        ...notDeleted,
        isActive: true,
        ...(query.role && { role: query.role }),
        ...(query.search && { name: { contains: query.search, mode: 'insensitive' } }),
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
      take: 50,
    });
  },

  create(
    data: { name: string; email: string; passwordHash: string; role: Role; mustChangePassword: boolean },
    actorId: string | null
  ): Promise<User> {
    return prisma.user.create({ data: { ...data, ...createdBy(actorId) } });
  },

  update(id: string, data: { name?: string; email?: string }, actorId: string): Promise<User> {
    return prisma.user.update({ where: { id }, data: { ...data, ...updatedBy(actorId) } });
  },

  /** Deactivating also revokes every issued token (tokenVersion bump). */
  setActive(id: string, isActive: boolean, actorId: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        isActive,
        ...(!isActive && { tokenVersion: { increment: 1 } }),
        ...updatedBy(actorId),
      },
    });
  },

  /** Sets a new password hash and revokes every issued token. */
  setPassword(
    id: string,
    passwordHash: string,
    options: { mustChangePassword: boolean; actorId: string }
  ): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: options.mustChangePassword,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
        ...updatedBy(options.actorId),
      },
    });
  },

  revokeAllTokens(id: string): Promise<User> {
    return prisma.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
  },

  softDelete(id: string, actorId: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { ...softDeleteData(actorId), tokenVersion: { increment: 1 } },
    });
  },

  restore(id: string, actorId: string): Promise<User> {
    return prisma.user.update({ where: { id }, data: restoreData(actorId) });
  },

  /** Atomically counts a failed sign-in and locks the account once the limit is reached. */
  async recordFailedLogin(id: string, maxAttempts: number, lockMinutes: number): Promise<void> {
    const { failedLoginAttempts } = await prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    if (failedLoginAttempts >= maxAttempts) {
      await prisma.user.update({
        where: { id },
        data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + lockMinutes * 60_000) },
      });
    }
  },

  recordSuccessfulLogin(id: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  },
};
