import { prisma } from '../../config/database';

export const healthRepository = {
  async pingDatabase(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  },
};
