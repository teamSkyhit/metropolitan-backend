import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './helpers/app';
import { resetDatabase } from './helpers/db';

describe('__Module__ module', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('requires authentication', async () => {
    const res = await api().get('/api/v1/__module__').expect(401);

    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  // TODO: cover the happy path, validation errors, permission denials (403)
  // and not-found cases for every endpoint. See docs/MODULE_STANDARD.md.
});
