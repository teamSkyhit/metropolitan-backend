import { PrismaClient } from '@prisma/client';
import { logger } from '../shared/logger';

/**
 * The single Prisma client for the process.
 *
 * Only repository files (`*.repository.ts`) may import this. ESLint enforces it.
 */
export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'query' },
  ],
});

prisma.$on('warn', (event) => logger.warn({ target: event.target }, event.message));
prisma.$on('error', (event) => logger.error({ target: event.target }, event.message));
prisma.$on('query', (event) =>
  logger.trace({ durationMs: event.duration, query: event.query }, 'prisma query')
);

export async function connectDatabase(maxRetries = 5, retryDelayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      logger.info('Database connected');
      return;
    } catch (err) {
      logger.warn(
        { attempt, maxRetries, err: err instanceof Error ? err.message : err },
        'Database connection failed'
      );
      if (attempt === maxRetries) {
        throw new Error(`Unable to connect to the database after ${maxRetries} attempts`, { cause: err });
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
