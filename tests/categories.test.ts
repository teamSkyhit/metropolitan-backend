import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoriesErrorCode } from '../src/modules/categories/categories.schema';
import * as permissionsModule from '../src/shared/security/permissions';
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

const sampleCategory = {
  name: 'Industrial Automation',
  seoUrl: 'industrial-automation',
  description: 'PLCs, HMIs, drives, and industrial automation equipment',
  banner: 'https://example.com/banners/automation.png',
};

// Valid binary buffers for upload testing
const validPngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const validJpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

describe('Categories Access Control & Authentication', () => {
  it('rejects unauthenticated requests on all category management endpoints with 401', async () => {
    const id = randomUUID();
    await api().get('/api/v1/categories').expect(401);
    await api().post('/api/v1/categories').send(sampleCategory).expect(401);
    await api().get(`/api/v1/categories/${id}`).expect(401);
    await api().patch(`/api/v1/categories/${id}`).send({ name: 'New' }).expect(401);
    await api().put(`/api/v1/categories/${id}`).send({ name: 'New' }).expect(401);
    await api().delete(`/api/v1/categories/${id}`).expect(401);
    await api().post(`/api/v1/categories/${id}/restore`).expect(401);
    await api().put(`/api/v1/categories/${id}/banner`).expect(401);
    await api().delete(`/api/v1/categories/${id}/banner`).expect(401);
  });

  it('allows authorized CRM user (Sales Manager) to manage categories', async () => {
    const created = await api().post('/api/v1/categories').set(sales.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;
    expect(created.body.data.name).toBe(sampleCategory.name);

    const listRes = await api().get('/api/v1/categories').set(sales.auth).expect(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data).toHaveLength(1);

    const getRes = await api().get(`/api/v1/categories/${id}`).set(sales.auth).expect(200);
    expect(getRes.body.data.id).toBe(id);

    await api()
      .patch(`/api/v1/categories/${id}`)
      .set(sales.auth)
      .send({ name: 'Updated by Sales' })
      .expect(200);

    await api().delete(`/api/v1/categories/${id}`).set(sales.auth).expect(204);

    const restored = await api().post(`/api/v1/categories/${id}/restore`).set(sales.auth).expect(200);
    expect(restored.body.data.id).toBe(id);
  });

  it('allows Super Admin full access to manage categories', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    await api()
      .patch(`/api/v1/categories/${id}`)
      .set(admin.auth)
      .send({ description: 'Updated by Super Admin' })
      .expect(200);

    await api().delete(`/api/v1/categories/${id}`).set(admin.auth).expect(204);
  });

  it('returns 403 Forbidden when an authenticated user lacks required permissions', async () => {
    vi.spyOn(permissionsModule, 'permissionsFor').mockReturnValue(new Set());

    const resCreate = await api().post('/api/v1/categories').set(sales.auth).send(sampleCategory).expect(403);
    expect(resCreate.body.error.code).toBe('FORBIDDEN');

    const resList = await api().get('/api/v1/categories').set(sales.auth).expect(403);
    expect(resList.body.error.code).toBe('FORBIDDEN');

    const id = randomUUID();
    const resUpdate = await api()
      .patch(`/api/v1/categories/${id}`)
      .set(sales.auth)
      .send({ name: 'Test' })
      .expect(403);
    expect(resUpdate.body.error.code).toBe('FORBIDDEN');

    const resDelete = await api().delete(`/api/v1/categories/${id}`).set(sales.auth).expect(403);
    expect(resDelete.body.error.code).toBe('FORBIDDEN');
  });
});

describe('Public Category APIs', () => {
  beforeEach(async () => {
    // 1. Active category A
    await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: 'Switchgear',
        seoUrl: 'switchgear',
        description: 'Electrical switchgear and protection',
        banner: 'https://example.com/switchgear.png',
      })
      .expect(201);

    // 2. Active category B (should sort after Switchgear or before depending on name)
    await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: 'Automation & Control',
        seoUrl: 'automation-and-control',
        description: 'Sensors and controllers',
      })
      .expect(201);

    // 3. Soft-deleted category
    const deleted = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: 'Legacy Motors',
        seoUrl: 'legacy-motors',
      })
      .expect(201);
    await api().delete(`/api/v1/categories/${deleted.body.data.id}`).set(admin.auth).expect(204);
  });

  it('GET /api/v1/public/categories returns non-deleted categories sorted by name ASC without auth', async () => {
    const res = await api().get('/api/v1/public/categories').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);

    // Alphabetical order: "Automation & Control" before "Switchgear"
    expect(res.body.data[0].name).toBe('Automation & Control');
    expect(res.body.data[1].name).toBe('Switchgear');

    // Public DTO verification: excludes internal timestamps and audit fields
    for (const item of res.body.data) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('seoUrl');
      expect(item).toHaveProperty('banner');
      expect(item).toHaveProperty('description');

      expect(item).not.toHaveProperty('createdAt');
      expect(item).not.toHaveProperty('updatedAt');
      expect(item).not.toHaveProperty('deletedAt');
      expect(item).not.toHaveProperty('createdById');
      expect(item).not.toHaveProperty('updatedById');
    }
  });

  it('GET /api/v1/public/categories/:seoUrl returns category details for valid SEO URL', async () => {
    const res = await api().get('/api/v1/public/categories/switchgear').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Switchgear');
    expect(res.body.data.seoUrl).toBe('switchgear');
    expect(res.body.data.banner).toBe('https://example.com/switchgear.png');
  });

  it('GET /api/v1/public/categories/:seoUrl returns 404 for deleted category', async () => {
    await api().get('/api/v1/public/categories/legacy-motors').expect(404);
  });

  it('GET /api/v1/public/categories/:seoUrl returns 404 for nonexistent SEO URL', async () => {
    await api().get('/api/v1/public/categories/non-existent-category').expect(404);
  });

  it('GET /api/v1/public/categories/:seoUrl rejects invalid SEO URL formats with 400', async () => {
    await api().get('/api/v1/public/categories/INVALID_SEO_URL!').expect(400);
  });
});

describe('POST /api/v1/categories (Create Category)', () => {
  it('creates category successfully with all fields', async () => {
    const res = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      id: expect.any(String),
      name: sampleCategory.name,
      seoUrl: sampleCategory.seoUrl,
      description: sampleCategory.description,
      banner: sampleCategory.banner,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    // Check database
    const inDb = await prisma.category.findUnique({ where: { id: res.body.data.id } });
    expect(inDb).not.toBeNull();
    expect(inDb?.createdById).toBe(admin.user.id);
  });

  it('creates category successfully with required fields only', async () => {
    const res = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Robotics', seoUrl: 'robotics' })
      .expect(201);

    expect(res.body.data.banner).toBeNull();
    expect(res.body.data.description).toBeNull();
  });

  it('rejects create category with missing name (400)', async () => {
    const res = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ seoUrl: 'only-seo-url' })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects create category with empty name string (400)', async () => {
    await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: '   ', seoUrl: 'valid-seo-url' })
      .expect(400);
  });

  it('rejects create category with missing SEO URL (400)', async () => {
    const res = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Missing SEO' })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects create category with invalid SEO URL format (400)', async () => {
    await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Valid Name', seoUrl: 'Invalid SEO URL With Spaces' })
      .expect(400);

    await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Valid Name', seoUrl: 'UPPERCASE' })
      .expect(400);
  });

  it('rejects duplicate SEO URL on active category with 409', async () => {
    await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);

    const res = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: 'Another Automation Category',
        seoUrl: sampleCategory.seoUrl,
      })
      .expect(409);

    expect(res.body.error.code).toBe(CategoriesErrorCode.SEO_URL_TAKEN);
  });

  it('rejects duplicate SEO URL on soft-deleted category with 409 suggesting restore', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    await api().delete(`/api/v1/categories/${created.body.data.id}`).set(admin.auth).expect(204);

    const res = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: 'Recreating Same Automation',
        seoUrl: sampleCategory.seoUrl,
      })
      .expect(409);

    expect(res.body.error.code).toBe(CategoriesErrorCode.SEO_URL_BELONGS_TO_DELETED_CATEGORY);
    expect(res.body.error.details.categoryId).toBe(created.body.data.id);
  });
});

describe('GET /api/v1/categories (List Categories)', () => {
  beforeEach(async () => {
    for (let i = 1; i <= 15; i++) {
      await api()
        .post('/api/v1/categories')
        .set(admin.auth)
        .send({
          name: `Category ${String(i).padStart(2, '0')}`,
          seoUrl: `category-${String(i).padStart(2, '0')}`,
          description: `Description for ${i}`,
        })
        .expect(201);
    }
  });

  it('returns paginated categories with pagination metadata', async () => {
    const res = await api().get('/api/v1/categories?page=1&limit=10').set(admin.auth).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(10);
    expect(res.body.meta.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 15,
      totalPages: 2,
      hasNextPage: true,
      hasPrevPage: false,
    });
  });

  it('searches categories by name', async () => {
    const res = await api().get('/api/v1/categories?search=Category 05').set(admin.auth).expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Category 05');
  });

  it('searches categories by SEO URL', async () => {
    const res = await api().get('/api/v1/categories?search=category-12').set(admin.auth).expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].seoUrl).toBe('category-12');
  });

  it('sorts categories by name ASC and DESC', async () => {
    const resAsc = await api()
      .get('/api/v1/categories?sortBy=name&sortOrder=asc&limit=5')
      .set(admin.auth)
      .expect(200);
    expect(resAsc.body.data[0].name).toBe('Category 01');

    const resDesc = await api()
      .get('/api/v1/categories?sortBy=name&sortOrder=desc&limit=5')
      .set(admin.auth)
      .expect(200);
    expect(resDesc.body.data[0].name).toBe('Category 15');
  });

  it('rejects invalid pagination and query params with 400', async () => {
    await api().get('/api/v1/categories?page=0').set(admin.auth).expect(400);
    await api().get('/api/v1/categories?limit=500').set(admin.auth).expect(400);
    await api().get('/api/v1/categories?sortBy=invalidField').set(admin.auth).expect(400);
  });
});

describe('GET /api/v1/categories/:id (Get Category by ID)', () => {
  it('returns category for valid ID', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);

    const res = await api().get(`/api/v1/categories/${created.body.data.id}`).set(admin.auth).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(created.body.data.id);
    expect(res.body.data.name).toBe(sampleCategory.name);
    expect(res.body.data.seoUrl).toBe(sampleCategory.seoUrl);
    expect(res.body.data.banner).toBe(sampleCategory.banner);
    expect(res.body.data.description).toBe(sampleCategory.description);
    expect(res.body.data.createdAt).toBeDefined();
    expect(res.body.data.updatedAt).toBeDefined();
  });

  it('returns 404 for nonexistent UUID', async () => {
    await api().get(`/api/v1/categories/${randomUUID()}`).set(admin.auth).expect(404);
  });

  it('returns 400 for malformed UUID', async () => {
    await api().get('/api/v1/categories/not-a-uuid').set(admin.auth).expect(400);
  });

  it('returns 404 for soft-deleted category', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    await api().delete(`/api/v1/categories/${id}`).set(admin.auth).expect(204);
    await api().get(`/api/v1/categories/${id}`).set(admin.auth).expect(404);
  });
});

describe('PATCH & PUT /api/v1/categories/:id (Update Category)', () => {
  it('updates category successfully via PATCH', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    const res = await api()
      .patch(`/api/v1/categories/${id}`)
      .set(admin.auth)
      .send({
        name: 'Advanced Automation',
        description: 'Updated description',
      })
      .expect(200);

    expect(res.body.data.name).toBe('Advanced Automation');
    expect(res.body.data.description).toBe('Updated description');
    expect(res.body.data.seoUrl).toBe(sampleCategory.seoUrl); // Unchanged field preserved
  });

  it('updates category successfully via PUT', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    const res = await api()
      .put(`/api/v1/categories/${id}`)
      .set(admin.auth)
      .send({
        name: 'PUT Updated Category',
        seoUrl: 'put-updated-category',
      })
      .expect(200);

    expect(res.body.data.name).toBe('PUT Updated Category');
    expect(res.body.data.seoUrl).toBe('put-updated-category');
  });

  it('allows updating category with its own SEO URL without conflict', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    const res = await api()
      .patch(`/api/v1/categories/${id}`)
      .set(admin.auth)
      .send({
        name: 'New Name Same SEO',
        seoUrl: sampleCategory.seoUrl,
      })
      .expect(200);

    expect(res.body.data.name).toBe('New Name Same SEO');
  });

  it('rejects update with duplicate SEO URL belonging to another category with 409', async () => {
    await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);

    const category2 = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Robotics', seoUrl: 'robotics' })
      .expect(201);

    const res = await api()
      .patch(`/api/v1/categories/${category2.body.data.id}`)
      .set(admin.auth)
      .send({ seoUrl: sampleCategory.seoUrl })
      .expect(409);

    expect(res.body.error.code).toBe(CategoriesErrorCode.SEO_URL_TAKEN);
  });

  it('rejects empty update body with 400', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);

    await api().patch(`/api/v1/categories/${created.body.data.id}`).set(admin.auth).send({}).expect(400);
  });

  it('returns 404 when updating nonexistent category', async () => {
    await api()
      .patch(`/api/v1/categories/${randomUUID()}`)
      .set(admin.auth)
      .send({ name: 'Nonexistent' })
      .expect(404);
  });
});

describe('DELETE /api/v1/categories/:id & Restore', () => {
  it('soft deletes category and records updatedById', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    await api().delete(`/api/v1/categories/${id}`).set(admin.auth).expect(204);

    const inDb = await prisma.category.findUniqueOrThrow({ where: { id } });
    expect(inDb.deletedAt).not.toBeNull();
    expect(inDb.updatedById).toBe(admin.user.id);

    // Detail endpoint returns 404
    await api().get(`/api/v1/categories/${id}`).set(admin.auth).expect(404);
  });

  it('returns 404 when deleting nonexistent category', async () => {
    await api().delete(`/api/v1/categories/${randomUUID()}`).set(admin.auth).expect(404);
  });

  it('returns 404 when deleting an already deleted category', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    await api().delete(`/api/v1/categories/${id}`).set(admin.auth).expect(204);
    await api().delete(`/api/v1/categories/${id}`).set(admin.auth).expect(404);
  });

  it('restores soft-deleted category successfully', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    await api().delete(`/api/v1/categories/${id}`).set(admin.auth).expect(204);

    const res = await api().post(`/api/v1/categories/${id}/restore`).set(admin.auth).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(id);

    // Verify in database: deletedAt is null
    const inDb = await prisma.category.findUniqueOrThrow({ where: { id } });
    expect(inDb.deletedAt).toBeNull();

    // Readable again
    await api().get(`/api/v1/categories/${id}`).set(admin.auth).expect(200);
  });

  it('returns 409 when restoring a category that is not deleted', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    const res = await api().post(`/api/v1/categories/${id}/restore`).set(admin.auth).expect(409);
    expect(res.body.error.code).toBe(CategoriesErrorCode.NOT_DELETED);
  });

  it('returns 404 when restoring a nonexistent category', async () => {
    await api().post(`/api/v1/categories/${randomUUID()}/restore`).set(admin.auth).expect(404);
  });
});

describe('Banner Upload & Handling', () => {
  it('uploads valid banner image (PNG) via PUT /api/v1/categories/:id/banner', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    const res = await api()
      .put(`/api/v1/categories/${id}/banner`)
      .set(admin.auth)
      .attach('banner', validPngBuffer, 'banner.png')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.banner).toMatch(/\/categories\/banners\/.*\.png$/);

    // Verify in DB
    const inDb = await prisma.category.findUniqueOrThrow({ where: { id } });
    expect(inDb.banner).toBe(res.body.data.banner);
  });

  it('uploads valid banner image (JPEG) via PUT /api/v1/categories/:id/banner', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    const res = await api()
      .put(`/api/v1/categories/${id}/banner`)
      .set(admin.auth)
      .attach('file', validJpgBuffer, 'banner.jpg')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.banner).toMatch(/\/categories\/banners\/.*\.jpg$/);
  });

  it('rejects empty file upload with 400', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    await api()
      .put(`/api/v1/categories/${id}/banner`)
      .set(admin.auth)
      .attach('banner', Buffer.from([]), 'empty.png')
      .expect(400);
  });

  it('rejects invalid file content (SVG / text) with 400', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await api()
      .put(`/api/v1/categories/${id}/banner`)
      .set(admin.auth)
      .attach('banner', svgBuffer, 'vector.svg')
      .expect(400);
  });

  it('rejects upload exceeding 5 MB limit with 400', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    // 5MB + 1KB buffer
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024);
    await api()
      .put(`/api/v1/categories/${id}/banner`)
      .set(admin.auth)
      .attach('banner', oversizedBuffer, 'large.png')
      .expect(400);
  });

  it('rejects upload when no file is attached with 400', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    await api()
      .put(`/api/v1/categories/${id}/banner`)
      .set(admin.auth)
      .send({ someField: 'value' })
      .expect(400);
  });

  it('removes banner via DELETE /api/v1/categories/:id/banner', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    const res = await api().delete(`/api/v1/categories/${id}/banner`).set(admin.auth).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.banner).toBeNull();

    const inDb = await prisma.category.findUniqueOrThrow({ where: { id } });
    expect(inDb.banner).toBeNull();
  });

  it('returns 404 when uploading banner for nonexistent category', async () => {
    await api()
      .put(`/api/v1/categories/${randomUUID()}/banner`)
      .set(admin.auth)
      .attach('banner', validPngBuffer, 'banner.png')
      .expect(404);
  });
});

describe('Swagger Endpoint & Database Validation', () => {
  it('includes Category routes in Swagger specification (/api/docs.json)', async () => {
    const res = await api().get('/api/docs.json').expect(200);
    expect(res.body.paths).toHaveProperty('/categories');
    expect(res.body.paths).toHaveProperty('/categories/{id}');
    expect(res.body.paths).toHaveProperty('/categories/{id}/banner');
    expect(res.body.paths).toHaveProperty('/categories/{id}/restore');
    expect(res.body.paths).toHaveProperty('/public/categories');
    expect(res.body.paths).toHaveProperty('/public/categories/{seoUrl}');
  });

  it('serves Swagger UI at /api/docs', async () => {
    await api().get('/api/docs/').expect(200);
  });

  it('enforces database level unique constraint on seo_url', async () => {
    await prisma.category.create({
      data: {
        name: 'Database Direct 1',
        seoUrl: 'unique-seo-db',
      },
    });

    await expect(
      prisma.category.create({
        data: {
          name: 'Database Direct 2',
          seoUrl: 'unique-seo-db',
        },
      })
    ).rejects.toThrow();
  });
});
