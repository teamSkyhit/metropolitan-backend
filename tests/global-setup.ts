import { execSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

/**
 * Brings the dedicated test database up to date with the migrations once per run
 * (`migrate deploy` creates the database if it does not exist).
 * Tests empty the tables they use via `resetDatabase()`, so the database named in
 * .env.test must be a throwaway one: the name has to contain "_test".
 */
export default function setup(): void {
  if (process.env.SKIP_DB_MIGRATE === 'true') {
    return;
  }
  const env = { ...process.env, ...loadEnv({ path: '.env.test', quiet: true }).parsed };
  if (!env.DATABASE_URL?.includes('_test')) {
    throw new Error('Refusing to run tests against a database whose name does not contain "_test"');
  }
  try {
    execSync('npx prisma migrate deploy', { env, stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (err: unknown) {
    const errorMsg = (err as { stderr?: Buffer })?.stderr?.toString() ?? String(err);
    if (errorMsg.includes('P1001') || errorMsg.includes("Can't reach database server")) {
      if (
        process.env.CI === 'true' ||
        process.env.REQUIRE_DB === 'true' ||
        process.env.ALLOW_OFFLINE_TESTS !== 'true'
      ) {
        throw new Error(
          'ENVIRONMENT BLOCKED: PostgreSQL is unreachable at localhost:5432. Integration tests require a live database. Set ALLOW_OFFLINE_TESTS=true only for unit-only local workflows.',
          { cause: err }
        );
      }
      console.warn(
        '⚠️  ENVIRONMENT BLOCKED: Database server unreachable at localhost:5432 — skipping test database migration. Integration tests requiring a live database will fail.'
      );
      return;
    }
    throw err;
  }
}
