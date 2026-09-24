import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './helpers/app';
import { signInAs, type Session } from './helpers/auth';
import { resetDatabase } from './helpers/db';

describe('__Module__ module', () => {
  let admin: Session;

  beforeEach(async () => {
    await resetDatabase();
    admin = await signInAs('SUPER_ADMIN');
  });

  it('requires authentication', async () => {
    const res = await api().get('/api/v1/__module__').expect(401);

    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('lists __module__', async () => {
    const res = await api().get('/api/v1/__module__').set(admin.auth).expect(200);

    expect(res.body).toMatchObject({ success: true, data: expect.any(Array), meta: { pagination: expect.any(Object) } });
  });

  // TODO: cover the happy path, validation errors (400), permission denials (403 with a
  // SALES_MANAGER session) and not-found cases for every endpoint. See docs/MODULE_STANDARD.md.
});
