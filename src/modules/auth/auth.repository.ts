import type { RefreshToken, User } from '@prisma/client';
import { prisma } from '../../config/database';
import { updatedBy } from '../../shared/database/soft-delete';

export const authRepository = {
  createRefreshToken(data: {
    userId: string;
    familyId: string;
    tokenHash: string;
    tokenVersion: number;
    expiresAt: Date;
    createdByIp?: string;
    userAgent?: string;
  }): Promise<RefreshToken> {
    return prisma.refreshToken.create({ data });
  },

  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  },

  /**
   * Revokes the token only if it is still active. Returns false when another
   * request already rotated it (concurrent use), which callers treat as reuse.
   */
  async revokeIfActive(id: string): Promise<boolean> {
    const { count } = await prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count === 1;
  },

  /**
   * Atomically revokes the old refresh token (only if active) and creates the new one in a single transaction.
   * Returns null if the old token was already rotated/revoked concurrently.
   */
  async rotateRefreshToken(
    oldTokenId: string,
    newTokenData: {
      userId: string;
      familyId: string;
      tokenHash: string;
      tokenVersion: number;
      expiresAt: Date;
      createdByIp?: string;
      userAgent?: string;
    }
  ): Promise<RefreshToken | null> {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { id: oldTokenId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count !== 1) {
        return null;
      }
      return tx.refreshToken.create({ data: newTokenData });
    });
  },

  async revokeFamily(familyId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  async revokeAllForUser(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  /**
   * Atomically increments user.tokenVersion (invalidating all active access tokens)
   * and revokes all active refresh tokens for the user in a single database transaction.
   */
  async logoutEverywhere(userId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  },

  /**
   * Atomically updates user password (clearing mustChangePassword, resetting failed attempts/locks,
   * incrementing tokenVersion, updating passwordChangedAt), revokes all active refresh tokens for the user,
   * and creates the new active refresh token within a single database transaction.
   */
  async changePasswordTransaction(
    userId: string,
    passwordHash: string,
    newRefreshTokenData: {
      familyId: string;
      tokenHash: string;
      expiresAt: Date;
      createdByIp?: string;
      userAgent?: string;
    }
  ): Promise<{ updatedUser: User; newRefreshToken: RefreshToken }> {
    return prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
          tokenVersion: { increment: 1 },
          ...updatedBy(userId),
        },
      });

      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      const newRefreshToken = await tx.refreshToken.create({
        data: {
          userId,
          familyId: newRefreshTokenData.familyId,
          tokenHash: newRefreshTokenData.tokenHash,
          tokenVersion: updatedUser.tokenVersion,
          expiresAt: newRefreshTokenData.expiresAt,
          createdByIp: newRefreshTokenData.createdByIp,
          userAgent: newRefreshTokenData.userAgent,
        },
      });

      return { updatedUser, newRefreshToken };
    });
  },
};
