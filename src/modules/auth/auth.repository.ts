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
