import type { RefreshToken } from '@prisma/client';
import { prisma } from '../../config/database';

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
};
