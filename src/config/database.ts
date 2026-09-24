import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

export async function connectDatabase(maxRetries = 5, retryDelayMs = 2000): Promise<void> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      attempt++;
      console.log(`🔌 Connecting to PostgreSQL database (attempt ${attempt}/${maxRetries})...`);
      await prisma.$connect();
      // Execute a lightweight query to verify the connection
      await prisma.$queryRaw`SELECT 1`;
      console.log('✅ PostgreSQL database connected successfully via Prisma');
      return;
    } catch (error) {
      console.error(
        `⚠️  Database connection attempt ${attempt} failed:`,
        error instanceof Error ? error.message : error
      );
      if (attempt >= maxRetries) {
        throw new Error(
          `Unable to connect to PostgreSQL database after ${maxRetries} attempts: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

export async function checkDatabaseHealth(): Promise<'connected' | 'disconnected'> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'connected';
  } catch {
    return 'disconnected';
  }
}
