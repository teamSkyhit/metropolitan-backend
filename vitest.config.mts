import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

const env = loadEnv({ path: '.env.test', quiet: true }).parsed ?? {};

export default defineConfig({
  test: {
    environment: 'node',
    env,
    globalSetup: ['tests/global-setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Integration tests share one database, so run files sequentially.
    fileParallelism: false,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/types/**'],
      reporter: ['text-summary', 'html'],
    },
  },
});
