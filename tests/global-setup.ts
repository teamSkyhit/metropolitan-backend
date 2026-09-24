import { execSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

/**
 * Brings the dedicated test database up to date with the migrations once per run
 * (`migrate deploy` creates the database if it does not exist).
 * Tests empty the tables they use via `resetDatabase()`, so the database named in
 * .env.test must be a throwaway one: the name has to contain "_test".
 */
export default function setup(): void {
  const env = { ...process.env, ...loadEnv({ path: '.env.test', quiet: true }).parsed };
  if (!env.DATABASE_URL?.includes('_test')) {
    throw new Error('Refusing to run tests against a database whose name does not contain "_test"');
  }
  execSync('npx prisma migrate deploy', { env, stdio: ['ignore', 'ignore', 'inherit'] });
}
