import { Role as PrismaRole } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { Role } from '../src/shared/security/roles';
import { api } from './helpers/app';
import { createUser, DEFAULT_PASSWORD, signInAs } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

const login = (email: string, password = DEFAULT_PASSWORD) =>
  api().post('/api/v1/auth/login').send({ email, password });

beforeEach(async () => {
  await resetDatabase();
});

describe('roles', () => {
  it('keeps the code roles in sync with the database enum', () => {
    expect(Object.values(Role).sort()).toEqual(Object.values(PrismaRole).sort());
  });
});

describe('POST /auth/login', () => {
  it('returns the user and a token pair', async () => {
    const user = await createUser({ email: 'sales@metro.test' });

    const res = await login('SALES@metro.test').expect(200);

    expect(res.body.data.user).toMatchObject({
      id: user.id,
      email: 'sales@metro.test',
      role: 'SALES_MANAGER',
    });
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.tokens).toEqual({
      accessToken: expect.any(String),
      accessTokenExpiresIn: 900,
      refreshToken: expect.any(String),
      refreshTokenExpiresAt: expect.any(String),
    });
  });

  it('returns the same error for unknown email and wrong password', async () => {
    await createUser({ email: 'sales@metro.test' });

    const unknown = await login('nobody@metro.test').expect(401);
    const wrong = await login('sales@metro.test', 'WrongPassw0rd').expect(401);

    expect(unknown.body.error).toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('validates the body shape instead of passing objects to the database', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: { contains: '@' }, password: 'x' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('allows concurrent sign-ins of the same user', async () => {
    const user = await createUser();

    const results = await Promise.all([login(user.email), login(user.email), login(user.email)]);

    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
  });

  it('locks the account after repeated failures', async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i++) await login(user.email, 'WrongPassw0rd').expect(401);

    const res = await login(user.email).expect(423);

    expect(res.body.error.code).toBe('AUTH_ACCOUNT_LOCKED');
  });

  it('rejects deactivated accounts after checking the password', async () => {
    const user = await createUser({ isActive: false });

    await login(user.email, 'WrongPassw0rd').expect(401);
    const res = await login(user.email).expect(403);
    expect(res.body.error.code).toBe('AUTH_ACCOUNT_INACTIVE');
  });

  it('rejects soft-deleted accounts', async () => {
    const user = await createUser({ deletedAt: new Date() });

    await login(user.email).expect(401);
  });
});

describe('POST /auth/refresh', () => {
  const refresh = (refreshToken: string) => api().post('/api/v1/auth/refresh').send({ refreshToken });

  it('rotates the token pair', async () => {
    const session = await signInAs('SALES_MANAGER');

    const res = await refresh(session.refreshToken).expect(200);

    expect(res.body.data.refreshToken).not.toBe(session.refreshToken);
    await api()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`)
      .expect(200);
  });

  it('revokes the whole session when a rotated token is reused', async () => {
    const session = await signInAs('SALES_MANAGER');
    const rotated = await refresh(session.refreshToken).expect(200);

    const reuse = await refresh(session.refreshToken).expect(401);
    expect(reuse.body.error.code).toBe('AUTH_REFRESH_TOKEN_REUSED');

    // The legitimate new token is now revoked too.
    await refresh(rotated.body.data.refreshToken).expect(401);
  });

  it('lets exactly one of several concurrent refreshes succeed', async () => {
    const session = await signInAs('SALES_MANAGER');

    const results = await Promise.all([1, 2, 3].map(() => refresh(session.refreshToken)));

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it('stores only a hash of the refresh token', async () => {
    const session = await signInAs('SALES_MANAGER');

    const rows = await prisma.refreshToken.findMany();
    expect(rows.some((row) => row.tokenHash === session.refreshToken)).toBe(false);
  });

  it('rejects unknown and expired tokens', async () => {
    await refresh('x'.repeat(64)).expect(401);

    const session = await signInAs('SALES_MANAGER');
    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await refresh(session.refreshToken).expect(401);
    expect(res.body.error.code).toBe('AUTH_REFRESH_TOKEN_EXPIRED');
  });

  it('rejects tokens of users deactivated since sign-in', async () => {
    const session = await signInAs('SALES_MANAGER');
    await prisma.user.update({
      where: { id: session.user.id },
      data: { isActive: false, tokenVersion: { increment: 1 } },
    });

    await refresh(session.refreshToken).expect(401);
  });
});

describe('POST /auth/logout', () => {
  it('ends the session and is idempotent', async () => {
    const session = await signInAs('SALES_MANAGER');

    await api().post('/api/v1/auth/logout').send({ refreshToken: session.refreshToken }).expect(204);
    await api().post('/api/v1/auth/logout').send({ refreshToken: session.refreshToken }).expect(204);
    await api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
  });

  it('cannot be abused to revoke other sessions', async () => {
    const victim = await signInAs('SALES_MANAGER');

    await api()
      .post('/api/v1/auth/logout')
      .send({ refreshToken: { not: 'x' } })
      .expect(400);
    await api()
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'y'.repeat(40) })
      .expect(204);

    await api().post('/api/v1/auth/refresh').send({ refreshToken: victim.refreshToken }).expect(200);
  });
});

describe('POST /auth/logout-all', () => {
  it('invalidates every access and refresh token of the user', async () => {
    const first = await signInAs('SALES_MANAGER');
    const second = await login(first.user.email).expect(200);

    await api().post('/api/v1/auth/logout-all').set(first.auth).expect(204);

    await api().get('/api/v1/auth/me').set(first.auth).expect(401);
    await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: second.body.data.tokens.refreshToken })
      .expect(401);
  });
});

describe('GET /auth/me', () => {
  it('returns the current user', async () => {
    const session = await signInAs('SUPER_ADMIN');

    const res = await api().get('/api/v1/auth/me').set(session.auth).expect(200);

    expect(res.body.data).toMatchObject({ id: session.user.id, role: 'SUPER_ADMIN' });
  });

  it('requires a token', async () => {
    await api().get('/api/v1/auth/me').expect(401);
  });
});

describe('POST /auth/change-password', () => {
  it('forces users with a temporary password to change it first', async () => {
    const session = await signInAs('SALES_MANAGER', { mustChangePassword: true });

    const blocked = await api().get('/api/v1/users/lookup').set(session.auth).expect(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await api().get('/api/v1/auth/me').set(session.auth).expect(200);

    const res = await api()
      .post('/api/v1/auth/change-password')
      .set(session.auth)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'N3wPasswordX' })
      .expect(200);

    expect(res.body.data.user.mustChangePassword).toBe(false);
    const fresh = { Authorization: `Bearer ${res.body.data.tokens.accessToken}` };
    await api().get('/api/v1/users/lookup').set(fresh).expect(200);

    // Old tokens are revoked.
    await api().get('/api/v1/auth/me').set(session.auth).expect(401);
    await api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    await login(session.user.email, 'N3wPasswordX').expect(200);
  });

  it('rejects a wrong current password', async () => {
    const session = await signInAs('SALES_MANAGER');

    const res = await api()
      .post('/api/v1/auth/change-password')
      .set(session.auth)
      .send({ currentPassword: 'WrongPassw0rd', newPassword: 'N3wPasswordX' })
      .expect(400);

    expect(res.body.error.code).toBe('AUTH_INVALID_CURRENT_PASSWORD');
  });

  it('enforces the password policy', async () => {
    const session = await signInAs('SALES_MANAGER');

    await api()
      .post('/api/v1/auth/change-password')
      .set(session.auth)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'short' })
      .expect(400);
  });
});
