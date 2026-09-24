import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './helpers/app';
import { createUser, DEFAULT_PASSWORD, signInAs, type Session } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

let admin: Session;

beforeEach(async () => {
  await resetDatabase();
  admin = await signInAs('SUPER_ADMIN');
});

const newSalesManager = {
  name: 'Ravi Kumar',
  email: 'Ravi.Kumar@Metro.test',
  password: 'Temp0raryPass',
};

describe('access control', () => {
  it('forbids Sales Managers from managing users', async () => {
    const sales = await signInAs('SALES_MANAGER');

    await api().get('/api/v1/users').set(sales.auth).expect(403);
    await api().post('/api/v1/users').set(sales.auth).send(newSalesManager).expect(403);
  });

  it('lets Sales Managers use the lookup', async () => {
    const sales = await signInAs('SALES_MANAGER');
    await createUser({ name: 'Inactive', isActive: false });
    await createUser({ name: 'Deleted', deletedAt: new Date() });

    const res = await api().get('/api/v1/users/lookup').set(sales.auth).expect(200);

    const names = res.body.data.map((u: { name: string }) => u.name);
    expect(names).not.toContain('Inactive');
    expect(names).not.toContain('Deleted');
    expect(Object.keys(res.body.data[0]).sort()).toEqual(['id', 'name', 'role']);
  });

  it('requires authentication', async () => {
    await api().get('/api/v1/users').expect(401);
  });
});

describe('POST /users', () => {
  it('creates a Sales Manager who must change the temporary password', async () => {
    const res = await api().post('/api/v1/users').set(admin.auth).send(newSalesManager).expect(201);

    expect(res.body.data).toMatchObject({
      name: 'Ravi Kumar',
      email: 'ravi.kumar@metro.test',
      role: 'SALES_MANAGER',
      isActive: true,
      mustChangePassword: true,
    });
    expect(res.body.data).not.toHaveProperty('passwordHash');

    const row = await prisma.user.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.createdById).toBe(admin.user.id);
  });

  it('rejects creating another Super Admin', async () => {
    await api()
      .post('/api/v1/users')
      .set(admin.auth)
      .send({ ...newSalesManager, role: 'SUPER_ADMIN' })
      .expect(400);
  });

  it('rejects weak passwords and invalid emails', async () => {
    const res = await api()
      .post('/api/v1/users')
      .set(admin.auth)
      .send({ name: 'X', email: 'nope', password: 'short' })
      .expect(400);

    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['body.name', 'body.email', 'body.password']));
  });

  it('rejects duplicate emails case-insensitively', async () => {
    await api().post('/api/v1/users').set(admin.auth).send(newSalesManager).expect(201);

    const res = await api()
      .post('/api/v1/users')
      .set(admin.auth)
      .send({ ...newSalesManager, email: 'RAVI.KUMAR@metro.test' })
      .expect(409);
    expect(res.body.error.code).toBe('USERS_EMAIL_TAKEN');
  });
});

describe('GET /users', () => {
  it('paginates, searches and filters', async () => {
    await createUser({ name: 'Anita Rao', email: 'anita@metro.test' });
    await createUser({ name: 'Vikram Shah', email: 'vikram@metro.test', isActive: false });
    await createUser({ name: 'Gone', deletedAt: new Date() });

    const all = await api().get('/api/v1/users?limit=2').set(admin.auth).expect(200);
    expect(all.body.meta.pagination).toMatchObject({ total: 3, limit: 2, totalPages: 2, hasNextPage: true });

    const search = await api().get('/api/v1/users?search=ANITA').set(admin.auth).expect(200);
    expect(search.body.data.map((u: { name: string }) => u.name)).toEqual(['Anita Rao']);

    const inactive = await api().get('/api/v1/users?isActive=false').set(admin.auth).expect(200);
    expect(inactive.body.data.map((u: { name: string }) => u.name)).toEqual(['Vikram Shah']);
  });

  it('validates query parameters', async () => {
    await api().get('/api/v1/users?limit=1000').set(admin.auth).expect(400);
    await api().get('/api/v1/users?role=KING').set(admin.auth).expect(400);
    await api().get('/api/v1/users?search=a&search=b').set(admin.auth).expect(400);
  });
});

describe('GET /users/:id', () => {
  it('returns 404 for unknown or deleted users and 400 for bad ids', async () => {
    const deleted = await createUser({ deletedAt: new Date() });

    await api().get('/api/v1/users/00000000-0000-4000-8000-000000000000').set(admin.auth).expect(404);
    await api().get(`/api/v1/users/${deleted.id}`).set(admin.auth).expect(404);
    await api().get('/api/v1/users/not-a-uuid').set(admin.auth).expect(400);
  });
});

describe('managing a Sales Manager', () => {
  it('updates name and email', async () => {
    const user = await createUser();

    const res = await api()
      .patch(`/api/v1/users/${user.id}`)
      .set(admin.auth)
      .send({ name: 'New Name', email: 'NEW@metro.test' })
      .expect(200);

    expect(res.body.data).toMatchObject({ name: 'New Name', email: 'new@metro.test' });
  });

  it('deactivation takes effect immediately and can be reversed', async () => {
    const sales = await signInAs('SALES_MANAGER');

    await api()
      .patch(`/api/v1/users/${sales.user.id}/status`)
      .set(admin.auth)
      .send({ isActive: false })
      .expect(200);

    await api().get('/api/v1/auth/me').set(sales.auth).expect(401);
    await api()
      .post('/api/v1/auth/login')
      .send({ email: sales.user.email, password: DEFAULT_PASSWORD })
      .expect(403);

    await api()
      .patch(`/api/v1/users/${sales.user.id}/status`)
      .set(admin.auth)
      .send({ isActive: true })
      .expect(200);
    await api()
      .post('/api/v1/auth/login')
      .send({ email: sales.user.email, password: DEFAULT_PASSWORD })
      .expect(200);
  });

  it('resets the password, signs the user out and forces a change', async () => {
    const sales = await signInAs('SALES_MANAGER');

    const res = await api()
      .post(`/api/v1/users/${sales.user.id}/reset-password`)
      .set(admin.auth)
      .send({ newPassword: 'Res3tPassword' })
      .expect(200);

    expect(res.body.data.mustChangePassword).toBe(true);
    await api().get('/api/v1/auth/me').set(sales.auth).expect(401);
    await api()
      .post('/api/v1/auth/login')
      .send({ email: sales.user.email, password: 'Res3tPassword' })
      .expect(200);
  });

  it('soft deletes and restores', async () => {
    const sales = await signInAs('SALES_MANAGER');

    await api().delete(`/api/v1/users/${sales.user.id}`).set(admin.auth).expect(204);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: sales.user.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.updatedById).toBe(admin.user.id);
    await api().get('/api/v1/auth/me').set(sales.auth).expect(401);
    await api().get(`/api/v1/users/${sales.user.id}`).set(admin.auth).expect(404);

    const conflict = await api()
      .post('/api/v1/users')
      .set(admin.auth)
      .send({ ...newSalesManager, email: sales.user.email })
      .expect(409);
    expect(conflict.body.error).toMatchObject({
      code: 'USERS_EMAIL_BELONGS_TO_DELETED_USER',
      details: { userId: sales.user.id },
    });

    await api().post(`/api/v1/users/${sales.user.id}/restore`).set(admin.auth).expect(200);
    await api().post(`/api/v1/users/${sales.user.id}/restore`).set(admin.auth).expect(409);
    await api().get(`/api/v1/users/${sales.user.id}`).set(admin.auth).expect(200);
  });

  it('refuses to modify Super Admin accounts', async () => {
    const otherAdmin = await createUser({ role: 'SUPER_ADMIN' });

    for (const request of [
      api().patch(`/api/v1/users/${otherAdmin.id}`).send({ name: 'Hacked' }),
      api().patch(`/api/v1/users/${otherAdmin.id}/status`).send({ isActive: false }),
      api().delete(`/api/v1/users/${otherAdmin.id}`),
      api().delete(`/api/v1/users/${admin.user.id}`),
    ]) {
      const res = await request.set(admin.auth).expect(403);
      expect(res.body.error.code).toBe('USERS_CANNOT_MODIFY_ADMIN');
    }
  });
});
