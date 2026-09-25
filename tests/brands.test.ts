import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { BrandsErrorCode } from '../src/modules/brands/brands.schema';
import { api } from './helpers/app';
import { signInAs, type Session } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

let admin: Session;
let sales: Session;

beforeEach(async () => {
  await resetDatabase();
  admin = await signInAs('SUPER_ADMIN');
  sales = await signInAs('SALES_MANAGER');
});

const sampleBrand = {
  name: 'Schneider Electric',
  slug: 'schneider-electric',
  description: 'Global specialist in energy management and automation',
  logoUrl: 'https://example.com/logos/schneider.png',
  isActive: true,
  sortOrder: 10,
};

describe('Brands Access Control & Authentication', () => {
  it('rejects unauthenticated requests on all brand endpoints with 401', async () => {
    const id = randomUUID();
    await api().get('/api/v1/brands').expect(401);
    await api().post('/api/v1/brands').send(sampleBrand).expect(401);
    await api().get(`/api/v1/brands/${id}`).expect(401);
    await api().patch(`/api/v1/brands/${id}`).send({ name: 'New' }).expect(401);
    await api().delete(`/api/v1/brands/${id}`).expect(401);
  });

  it('allows Sales Managers to read brands', async () => {
    const created = await api().post('/api/v1/brands').set(admin.auth).send(sampleBrand).expect(201);

    const listRes = await api().get('/api/v1/brands').set(sales.auth).expect(200);
    expect(listRes.body.success).toBe(true);

    const getRes = await api().get(`/api/v1/brands/${created.body.data.id}`).set(sales.auth).expect(200);
    expect(getRes.body.data.id).toBe(created.body.data.id);
  });

  it('forbids Sales Managers from creating, updating, or deleting brands with 403', async () => {
    const created = await api().post('/api/v1/brands').set(admin.auth).send(sampleBrand).expect(201);
    const id = created.body.data.id;

    await api().post('/api/v1/brands').set(sales.auth).send({ name: 'Siemens', slug: 'siemens' }).expect(403);

    await api()
      .patch(`/api/v1/brands/${id}`)
      .set(sales.auth)
      .send({ name: 'Schneider Electric Updated' })
      .expect(403);

    await api().delete(`/api/v1/brands/${id}`).set(sales.auth).expect(403);
  });
});

describe('POST /api/v1/brands', () => {
  it('creates a brand with full payload', async () => {
    const res = await api().post('/api/v1/brands').set(admin.auth).send(sampleBrand).expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      name: 'Schneider Electric',
      slug: 'schneider-electric',
      description: 'Global specialist in energy management and automation',
      logoUrl: 'https://example.com/logos/schneider.png',
      isActive: true,
      sortOrder: 10,
    });
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.createdAt).toBeDefined();
    expect(res.body.data.updatedAt).toBeDefined();

    const row = await prisma.brand.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.createdById).toBe(admin.user.id);
  });

  it('creates a brand with minimal payload and defaults', async () => {
    const res = await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'ABB', slug: 'abb' })
      .expect(201);

    expect(res.body.data).toMatchObject({
      name: 'ABB',
      slug: 'abb',
      description: null,
      logoUrl: null,
      isActive: true,
      sortOrder: 0,
    });
  });

  it('rejects invalid payload with 400', async () => {
    // Missing required fields
    await api().post('/api/v1/brands').set(admin.auth).send({}).expect(400);

    // Empty name
    await api().post('/api/v1/brands').set(admin.auth).send({ name: '', slug: 'valid-slug' }).expect(400);

    // Invalid slug formats (uppercase, spaces, special chars)
    await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'Valid Name', slug: 'INVALID SLUG' })
      .expect(400);

    await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'Valid Name', slug: 'invalid_slug_with_underscores' })
      .expect(400);

    // Invalid URL
    await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'Valid Name', slug: 'valid-slug', logoUrl: 'not-a-valid-url' })
      .expect(400);

    // Negative sort order
    await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'Valid Name', slug: 'valid-slug', sortOrder: -5 })
      .expect(400);
  });

  it('rejects duplicate brand name with 409', async () => {
    await api().post('/api/v1/brands').set(admin.auth).send(sampleBrand).expect(201);

    const res = await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'Schneider Electric', slug: 'schneider-different-slug' })
      .expect(409);

    expect(res.body.error.code).toBe(BrandsErrorCode.NAME_TAKEN);
  });

  it('rejects duplicate brand slug with 409', async () => {
    await api().post('/api/v1/brands').set(admin.auth).send(sampleBrand).expect(201);

    const res = await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'Different Name', slug: 'schneider-electric' })
      .expect(409);

    expect(res.body.error.code).toBe(BrandsErrorCode.SLUG_TAKEN);
  });

  it('rejects reuse of slug or name belonging to a soft-deleted brand with 409', async () => {
    const created = await api().post('/api/v1/brands').set(admin.auth).send(sampleBrand).expect(201);
    await api().delete(`/api/v1/brands/${created.body.data.id}`).set(admin.auth).expect(204);

    // Slug belongs to deleted brand
    const resSlug = await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'Unique Name', slug: 'schneider-electric' })
      .expect(409);
    expect(resSlug.body.error.code).toBe(BrandsErrorCode.SLUG_BELONGS_TO_DELETED_BRAND);

    // Name belongs to deleted brand
    const resName = await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'Schneider Electric', slug: 'unique-slug' })
      .expect(409);
    expect(resName.body.error.code).toBe(BrandsErrorCode.NAME_BELONGS_TO_DELETED_BRAND);
  });
});

describe('GET /api/v1/brands', () => {
  beforeEach(async () => {
    await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'ABB', slug: 'abb', sortOrder: 3, isActive: true })
      .expect(201);
    await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'Siemens', slug: 'siemens', sortOrder: 1, isActive: true })
      .expect(201);
    await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'Honeywell', slug: 'honeywell', sortOrder: 2, isActive: false })
      .expect(201);
  });

  it('lists brands with pagination metadata', async () => {
    const res = await api().get('/api/v1/brands?page=1&limit=2').set(admin.auth).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: true,
      hasPrevPage: false,
    });
  });

  it('searches brands by name', async () => {
    const res = await api().get('/api/v1/brands?search=iem').set(admin.auth).expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Siemens');
  });

  it('filters brands by isActive status', async () => {
    const activeRes = await api().get('/api/v1/brands?isActive=true').set(admin.auth).expect(200);
    expect(activeRes.body.data).toHaveLength(2);
    expect(activeRes.body.data.every((b: { isActive: boolean }) => b.isActive)).toBe(true);

    const inactiveRes = await api().get('/api/v1/brands?isActive=false').set(admin.auth).expect(200);
    expect(inactiveRes.body.data).toHaveLength(1);
    expect(inactiveRes.body.data[0].name).toBe('Honeywell');
  });

  it('sorts brands by specified field and order', async () => {
    const res = await api().get('/api/v1/brands?sortBy=sortOrder&sortOrder=asc').set(admin.auth).expect(200);

    const names = res.body.data.map((b: { name: string }) => b.name);
    expect(names).toEqual(['Siemens', 'Honeywell', 'ABB']);
  });

  it('excludes soft-deleted brands from list', async () => {
    const created = await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'Omron', slug: 'omron' })
      .expect(201);

    await api().delete(`/api/v1/brands/${created.body.data.id}`).set(admin.auth).expect(204);

    const res = await api().get('/api/v1/brands').set(admin.auth).expect(200);
    const names = res.body.data.map((b: { name: string }) => b.name);
    expect(names).not.toContain('Omron');
  });
});

describe('GET /api/v1/brands/:id', () => {
  it('returns brand detail by ID', async () => {
    const created = await api().post('/api/v1/brands').set(admin.auth).send(sampleBrand).expect(201);

    const res = await api().get(`/api/v1/brands/${created.body.data.id}`).set(admin.auth).expect(200);
    expect(res.body.data).toMatchObject(sampleBrand);
    expect(res.body.data.id).toBe(created.body.data.id);
  });

  it('returns 404 for nonexistent brand ID', async () => {
    await api().get(`/api/v1/brands/${randomUUID()}`).set(admin.auth).expect(404);
  });

  it('returns 404 for soft-deleted brand', async () => {
    const created = await api().post('/api/v1/brands').set(admin.auth).send(sampleBrand).expect(201);
    await api().delete(`/api/v1/brands/${created.body.data.id}`).set(admin.auth).expect(204);

    await api().get(`/api/v1/brands/${created.body.data.id}`).set(admin.auth).expect(404);
  });

  it('returns 400 for invalid UUID param', async () => {
    await api().get('/api/v1/brands/invalid-uuid').set(admin.auth).expect(400);
  });
});

describe('PATCH /api/v1/brands/:id', () => {
  it('updates brand fields and records updatedById', async () => {
    const created = await api().post('/api/v1/brands').set(admin.auth).send(sampleBrand).expect(201);
    const id = created.body.data.id;

    const res = await api()
      .patch(`/api/v1/brands/${id}`)
      .set(admin.auth)
      .send({
        name: 'Schneider Electric SE',
        description: 'Updated description',
        sortOrder: 99,
        isActive: false,
      })
      .expect(200);

    expect(res.body.data).toMatchObject({
      name: 'Schneider Electric SE',
      slug: 'schneider-electric',
      description: 'Updated description',
      sortOrder: 99,
      isActive: false,
    });

    const row = await prisma.brand.findUniqueOrThrow({ where: { id } });
    expect(row.updatedById).toBe(admin.user.id);
  });

  it('rejects empty update body with 400', async () => {
    const created = await api().post('/api/v1/brands').set(admin.auth).send(sampleBrand).expect(201);
    await api().patch(`/api/v1/brands/${created.body.data.id}`).set(admin.auth).send({}).expect(400);
  });

  it('rejects duplicate slug on update with 409', async () => {
    await api().post('/api/v1/brands').set(admin.auth).send(sampleBrand).expect(201);
    const brand2 = await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'Delta Electronics', slug: 'delta' })
      .expect(201);

    const res = await api()
      .patch(`/api/v1/brands/${brand2.body.data.id}`)
      .set(admin.auth)
      .send({ slug: 'schneider-electric' })
      .expect(409);

    expect(res.body.error.code).toBe(BrandsErrorCode.SLUG_TAKEN);
  });

  it('rejects duplicate name on update with 409', async () => {
    await api().post('/api/v1/brands').set(admin.auth).send(sampleBrand).expect(201);
    const brand2 = await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'Delta Electronics', slug: 'delta' })
      .expect(201);

    const res = await api()
      .patch(`/api/v1/brands/${brand2.body.data.id}`)
      .set(admin.auth)
      .send({ name: 'Schneider Electric' })
      .expect(409);

    expect(res.body.error.code).toBe(BrandsErrorCode.NAME_TAKEN);
  });

  it('allows updating a brand without changing its own name/slug', async () => {
    const created = await api().post('/api/v1/brands').set(admin.auth).send(sampleBrand).expect(201);

    const res = await api()
      .patch(`/api/v1/brands/${created.body.data.id}`)
      .set(admin.auth)
      .send({ name: 'Schneider Electric', slug: 'schneider-electric', sortOrder: 50 })
      .expect(200);

    expect(res.body.data.sortOrder).toBe(50);
  });

  it('returns 404 when updating nonexistent brand', async () => {
    await api()
      .patch(`/api/v1/brands/${randomUUID()}`)
      .set(admin.auth)
      .send({ name: 'New Name' })
      .expect(404);
  });
});

describe('DELETE /api/v1/brands/:id', () => {
  it('soft deletes a brand and records updatedById', async () => {
    const created = await api().post('/api/v1/brands').set(admin.auth).send(sampleBrand).expect(201);
    const id = created.body.data.id;

    await api().delete(`/api/v1/brands/${id}`).set(admin.auth).expect(204);

    const row = await prisma.brand.findUniqueOrThrow({ where: { id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.updatedById).toBe(admin.user.id);

    // Subsequent detail request returns 404
    await api().get(`/api/v1/brands/${id}`).set(admin.auth).expect(404);
  });

  it('returns 404 when deleting nonexistent brand', async () => {
    await api().delete(`/api/v1/brands/${randomUUID()}`).set(admin.auth).expect(404);
  });

  it('returns 404 when deleting an already deleted brand', async () => {
    const created = await api().post('/api/v1/brands').set(admin.auth).send(sampleBrand).expect(201);
    const id = created.body.data.id;

    await api().delete(`/api/v1/brands/${id}`).set(admin.auth).expect(204);
    await api().delete(`/api/v1/brands/${id}`).set(admin.auth).expect(404);
  });
});
