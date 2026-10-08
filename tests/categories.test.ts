import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoriesErrorCode } from '../src/modules/categories/categories.schema';
import * as permissionsModule from '../src/shared/security/permissions';
import { storageService } from '../src/shared/storage';
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
  slug: 'industrial-automation',
  description: 'PLCs, HMIs, drives, and industrial automation equipment',
  bannerUrl: 'https://example.com/banners/automation.png',
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
    // 1. Active category A (sortOrder 2)
    const switchgear = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: 'Switchgear',
        slug: 'switchgear',
        description: 'Electrical switchgear and protection',
        bannerUrl: 'https://example.com/switchgear.png',
        sortOrder: 2,
        isActive: true,
      })
      .expect(201);

    // 2. Active category B (sortOrder 1)
    await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: 'Automation & Control',
        slug: 'automation-and-control',
        description: 'Sensors and controllers',
        sortOrder: 1,
        isActive: true,
      })
      .expect(201);

    // 3. Child category (sortOrder 2, tie-breaker against Switchgear: 'I' before 'S')
    await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: 'Industrial Pumps',
        slug: 'industrial-pumps',
        parentId: switchgear.body.data.id,
        sortOrder: 2,
        isActive: true,
      })
      .expect(201);

    // 4. Inactive category
    await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: 'Drives & Inverters',
        slug: 'drives-and-inverters',
        isActive: false,
      })
      .expect(201);

    // 5. Soft-deleted category
    const deleted = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: 'Legacy Motors',
        slug: 'legacy-motors',
      })
      .expect(201);
    await api().delete(`/api/v1/categories/${deleted.body.data.id}`).set(admin.auth).expect(204);
  });

  it('GET /api/v1/public/categories returns only active, non-deleted categories sorted by sortOrder ASC, then name ASC without auth', async () => {
    const res = await api().get('/api/v1/public/categories').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(3);

    // Order check: sortOrder 1 first, then sortOrder 2 (name ASC: Industrial Pumps before Switchgear)
    expect(res.body.data[0].name).toBe('Automation & Control');
    expect(res.body.data[1].name).toBe('Industrial Pumps');
    expect(res.body.data[2].name).toBe('Switchgear');

    // Public DTO verification: excludes internal timestamps and audit fields
    for (const item of res.body.data) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('slug');
      expect(item).toHaveProperty('bannerUrl');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('parentId');

      expect(item).not.toHaveProperty('isActive');
      expect(item).not.toHaveProperty('sortOrder');
      expect(item).not.toHaveProperty('nameKey');
      expect(item).not.toHaveProperty('createdAt');
      expect(item).not.toHaveProperty('updatedAt');
      expect(item).not.toHaveProperty('deletedAt');
      expect(item).not.toHaveProperty('createdById');
      expect(item).not.toHaveProperty('updatedById');
    }
  });

  it('GET /api/v1/public/categories/:slug returns category details for valid slug', async () => {
    const res = await api().get('/api/v1/public/categories/switchgear').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Switchgear');
    expect(res.body.data.slug).toBe('switchgear');
    expect(res.body.data.bannerUrl).toBe('https://example.com/switchgear.png');
    expect(res.body.data.parentId).toBeNull();
  });

  it('GET /api/v1/public/categories/:slug returns 404 for inactive category', async () => {
    await api().get('/api/v1/public/categories/drives-and-inverters').expect(404);
  });

  it('GET /api/v1/public/categories/:slug returns 404 for deleted category', async () => {
    await api().get('/api/v1/public/categories/legacy-motors').expect(404);
  });

  it('GET /api/v1/public/categories/:slug returns 404 for nonexistent slug', async () => {
    await api().get('/api/v1/public/categories/non-existent-category').expect(404);
  });

  it('GET /api/v1/public/categories/:slug rejects invalid slug formats with 400', async () => {
    await api().get('/api/v1/public/categories/INVALID_SLUG!').expect(400);
  });
});

describe('POST /api/v1/categories (Create Category)', () => {
  it('creates category successfully with all fields', async () => {
    const res = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      id: expect.any(String),
      name: sampleCategory.name,
      slug: sampleCategory.slug,
      description: sampleCategory.description,
      bannerUrl: sampleCategory.bannerUrl,
      isActive: true,
      sortOrder: 0,
      parentId: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    // Check database
    const inDb = await prisma.category.findUnique({ where: { id: res.body.data.id } });
    expect(inDb).not.toBeNull();
    expect(inDb?.nameKey).toBe('industrial automation');
    expect(inDb?.isActive).toBe(true);
    expect(inDb?.sortOrder).toBe(0);
    expect(inDb?.parentId).toBeNull();
    expect(inDb?.createdById).toBe(admin.user.id);
  });

  it('creates category successfully with required fields only and verifies defaults', async () => {
    const res = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Robotics', slug: 'robotics' })
      .expect(201);

    expect(res.body.data.bannerUrl).toBeNull();
    expect(res.body.data.description).toBeNull();
    expect(res.body.data.isActive).toBe(true);
    expect(res.body.data.sortOrder).toBe(0);
    expect(res.body.data.parentId).toBeNull();

    const inDb = await prisma.category.findUnique({ where: { id: res.body.data.id } });
    expect(inDb?.nameKey).toBe('robotics');
    expect(inDb?.isActive).toBe(true);
    expect(inDb?.sortOrder).toBe(0);
    expect(inDb?.parentId).toBeNull();
  });

  it('creates category with custom isActive, sortOrder, and valid parentId', async () => {
    const parent = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);

    const child = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: 'Sensors & Transmitters',
        slug: 'sensors-and-transmitters',
        parentId: parent.body.data.id,
        isActive: false,
        sortOrder: 15,
      })
      .expect(201);

    expect(child.body.data.parentId).toBe(parent.body.data.id);
    expect(child.body.data.isActive).toBe(false);
    expect(child.body.data.sortOrder).toBe(15);

    const inDb = await prisma.category.findUnique({ where: { id: child.body.data.id } });
    expect(inDb?.parentId).toBe(parent.body.data.id);
    expect(inDb?.isActive).toBe(false);
    expect(inDb?.sortOrder).toBe(15);
  });

  it('rejects create category with non-existent parentId (400)', async () => {
    const res = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: 'Orphan Category',
        slug: 'orphan-category',
        parentId: randomUUID(),
      })
      .expect(400);

    expect(res.body.error.code).toBe(CategoriesErrorCode.INVALID_PARENT);
  });

  it('rejects create category with deleted parentId (400)', async () => {
    const parent = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    await api().delete(`/api/v1/categories/${parent.body.data.id}`).set(admin.auth).expect(204);

    const res = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: 'Child Of Deleted Category',
        slug: 'child-of-deleted-category',
        parentId: parent.body.data.id,
      })
      .expect(400);

    expect(res.body.error.code).toBe(CategoriesErrorCode.INVALID_PARENT);
  });

  it('rejects create category with missing name (400)', async () => {
    const res = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ slug: 'only-slug' })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects create category with empty name string (400)', async () => {
    await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: '   ', slug: 'valid-slug' })
      .expect(400);
  });

  it('rejects create category with missing slug (400)', async () => {
    const res = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Missing Slug' })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects create category with invalid slug format (400)', async () => {
    await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Valid Name', slug: 'Invalid Slug With Spaces' })
      .expect(400);

    await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Valid Name', slug: 'UPPERCASE' })
      .expect(400);
  });

  it('rejects duplicate category name with 409', async () => {
    await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);

    const res = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: sampleCategory.name,
        slug: 'different-slug',
      })
      .expect(409);

    expect(res.body.error.code).toBe(CategoriesErrorCode.NAME_TAKEN);
  });

  it('rejects duplicate normalized names (case and whitespace insensitive) with 409', async () => {
    await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);

    const res = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: '  ' + sampleCategory.name.toUpperCase() + '  ',
        slug: 'variant-slug',
      })
      .expect(409);

    expect(res.body.error.code).toBe(CategoriesErrorCode.NAME_TAKEN);
  });

  it('maps Prisma P2002 unique constraint violations on name_key to HTTP 409', async () => {
    const spy = vi.spyOn(prisma.category, 'create').mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['name_key'] },
      })
    );

    const res = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Unique Category Name', slug: 'unique-slug-test' })
      .expect(409);

    expect(res.body.error.code).toBe(CategoriesErrorCode.NAME_TAKEN);
    spy.mockRestore();
  });

  it('rejects duplicate slug on active category with 409', async () => {
    await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);

    const res = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: 'Another Automation Category',
        slug: sampleCategory.slug,
      })
      .expect(409);

    expect(res.body.error.code).toBe(CategoriesErrorCode.SLUG_TAKEN);
  });

  it('rejects duplicate slug on soft-deleted category with 409 suggesting restore', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    await api().delete(`/api/v1/categories/${created.body.data.id}`).set(admin.auth).expect(204);

    const res = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: 'Recreating Same Automation',
        slug: sampleCategory.slug,
      })
      .expect(409);

    expect(res.body.error.code).toBe(CategoriesErrorCode.SLUG_BELONGS_TO_DELETED_CATEGORY);
    expect(res.body.error.details.categoryId).toBe(created.body.data.id);
  });

  it('rejects reuse of name belonging to a soft-deleted category with 409', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    await api().delete(`/api/v1/categories/${created.body.data.id}`).set(admin.auth).expect(204);

    const res = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({
        name: sampleCategory.name,
        slug: 'brand-new-slug',
      })
      .expect(409);

    expect(res.body.error.code).toBe(CategoriesErrorCode.NAME_BELONGS_TO_DELETED_CATEGORY);
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
          slug: `category-${String(i).padStart(2, '0')}`,
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

  it('searches categories by slug', async () => {
    const res = await api().get('/api/v1/categories?search=category-12').set(admin.auth).expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].slug).toBe('category-12');
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
    expect(res.body.data.slug).toBe(sampleCategory.slug);
    expect(res.body.data.bannerUrl).toBe(sampleCategory.bannerUrl);
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

describe('PATCH /api/v1/categories/:id (Update Category)', () => {
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
    expect(res.body.data.slug).toBe(sampleCategory.slug); // Unchanged field preserved
  });

  it('confirms normal PUT /api/v1/categories/:id has been removed', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    // Normal PUT is no longer routed; returns 404 (Not Found)
    await api()
      .put(`/api/v1/categories/${id}`)
      .set(admin.auth)
      .send({ name: 'PUT Not Supported' })
      .expect(404);
  });

  it('allows updating category with its own slug without conflict', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    const res = await api()
      .patch(`/api/v1/categories/${id}`)
      .set(admin.auth)
      .send({
        name: 'New Name Same Slug',
        slug: sampleCategory.slug,
      })
      .expect(200);

    expect(res.body.data.name).toBe('New Name Same Slug');
  });

  it('allows updating category without changing its own name/slug', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);

    const res = await api()
      .patch(`/api/v1/categories/${created.body.data.id}`)
      .set(admin.auth)
      .send({
        name: sampleCategory.name,
        slug: sampleCategory.slug,
        description: 'Updated without changing name or slug',
      })
      .expect(200);

    expect(res.body.data.description).toBe('Updated without changing name or slug');
  });

  it('allows updating category to a new unique name and updates nameKey', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);

    const res = await api()
      .patch(`/api/v1/categories/${created.body.data.id}`)
      .set(admin.auth)
      .send({ name: 'Pneumatics & Hydraulics' })
      .expect(200);

    expect(res.body.data.name).toBe('Pneumatics & Hydraulics');
    const inDb = await prisma.category.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(inDb.nameKey).toBe('pneumatics & hydraulics');
  });

  it('rejects update with duplicate slug belonging to another category with 409', async () => {
    await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);

    const category2 = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Robotics', slug: 'robotics' })
      .expect(201);

    const res = await api()
      .patch(`/api/v1/categories/${category2.body.data.id}`)
      .set(admin.auth)
      .send({ slug: sampleCategory.slug })
      .expect(409);

    expect(res.body.error.code).toBe(CategoriesErrorCode.SLUG_TAKEN);
  });

  it('rejects update with duplicate name belonging to another category with 409', async () => {
    await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);

    const category2 = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Robotics', slug: 'robotics' })
      .expect(201);

    const res = await api()
      .patch(`/api/v1/categories/${category2.body.data.id}`)
      .set(admin.auth)
      .send({ name: '  ' + sampleCategory.name.toUpperCase() + '  ' })
      .expect(409);

    expect(res.body.error.code).toBe(CategoriesErrorCode.NAME_TAKEN);
  });

  it('updates category isActive and sortOrder, dynamically affecting public availability', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    // Update to inactive and custom sortOrder
    const res = await api()
      .patch(`/api/v1/categories/${id}`)
      .set(admin.auth)
      .send({ isActive: false, sortOrder: 99 })
      .expect(200);

    expect(res.body.data.isActive).toBe(false);
    expect(res.body.data.sortOrder).toBe(99);

    // Verify it is excluded from public endpoint by slug while inactive
    await api().get(`/api/v1/public/categories/${created.body.data.slug}`).expect(404);

    // Re-activate
    const resActive = await api()
      .patch(`/api/v1/categories/${id}`)
      .set(admin.auth)
      .send({ isActive: true })
      .expect(200);

    expect(resActive.body.data.isActive).toBe(true);

    // Appears publicly again
    await api().get(`/api/v1/public/categories/${created.body.data.slug}`).expect(200);
  });

  it('assigns, changes, and removes parentId (using null)', async () => {
    const catA = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const catB = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Category B', slug: 'category-b' })
      .expect(201);
    const catC = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Category C', slug: 'category-c' })
      .expect(201);

    // Assign parent catA to catB
    const resAssign = await api()
      .patch(`/api/v1/categories/${catB.body.data.id}`)
      .set(admin.auth)
      .send({ parentId: catA.body.data.id })
      .expect(200);
    expect(resAssign.body.data.parentId).toBe(catA.body.data.id);

    // Change parent to catC
    const resChange = await api()
      .patch(`/api/v1/categories/${catB.body.data.id}`)
      .set(admin.auth)
      .send({ parentId: catC.body.data.id })
      .expect(200);
    expect(resChange.body.data.parentId).toBe(catC.body.data.id);

    // Remove parent using null
    const resRemove = await api()
      .patch(`/api/v1/categories/${catB.body.data.id}`)
      .set(admin.auth)
      .send({ parentId: null })
      .expect(200);
    expect(resRemove.body.data.parentId).toBeNull();
  });

  it('rejects setting category as its own parent (400)', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    const res = await api()
      .patch(`/api/v1/categories/${id}`)
      .set(admin.auth)
      .send({ parentId: id })
      .expect(400);

    expect(res.body.error.code).toBe(CategoriesErrorCode.INVALID_PARENT);
  });

  it('rejects non-existent parent on update (400)', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);

    const res = await api()
      .patch(`/api/v1/categories/${created.body.data.id}`)
      .set(admin.auth)
      .send({ parentId: randomUUID() })
      .expect(400);

    expect(res.body.error.code).toBe(CategoriesErrorCode.INVALID_PARENT);
  });

  it('rejects deleted parent on update (400)', async () => {
    const catA = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const catB = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Category B', slug: 'category-b' })
      .expect(201);
    await api().delete(`/api/v1/categories/${catA.body.data.id}`).set(admin.auth).expect(204);

    const res = await api()
      .patch(`/api/v1/categories/${catB.body.data.id}`)
      .set(admin.auth)
      .send({ parentId: catA.body.data.id })
      .expect(400);

    expect(res.body.error.code).toBe(CategoriesErrorCode.INVALID_PARENT);
  });

  it('rejects circular parent relationships (400)', async () => {
    // A -> B -> C: trying to set A's parent to C
    const catA = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Cat A', slug: 'cat-a' })
      .expect(201);
    const catB = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Cat B', slug: 'cat-b', parentId: catA.body.data.id })
      .expect(201);
    const catC = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Cat C', slug: 'cat-c', parentId: catB.body.data.id })
      .expect(201);

    // Attempt multi-level cycle: set catA.parentId = catC.id
    const resDirect = await api()
      .patch(`/api/v1/categories/${catA.body.data.id}`)
      .set(admin.auth)
      .send({ parentId: catC.body.data.id })
      .expect(400);
    expect(resDirect.body.error.code).toBe(CategoriesErrorCode.CIRCULAR_PARENT);

    // Attempt direct 2-node cycle: set catA.parentId = catB.id
    const res2Node = await api()
      .patch(`/api/v1/categories/${catA.body.data.id}`)
      .set(admin.auth)
      .send({ parentId: catB.body.data.id })
      .expect(400);
    expect(res2Node.body.error.code).toBe(CategoriesErrorCode.CIRCULAR_PARENT);
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

  it('rejects deleting a category that has live products with 409 CATEGORIES_HAS_PRODUCTS', async () => {
    const category = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const brand = await api()
      .post('/api/v1/brands')
      .set(admin.auth)
      .send({ name: 'ABB', slug: 'abb' })
      .expect(201);

    const product = await api()
      .post('/api/v1/products')
      .set(admin.auth)
      .send({
        name: 'Inverter Drive',
        sku: 'INV-DRV-01',
        brandId: brand.body.data.id,
        categoryId: category.body.data.id,
      })
      .expect(201);

    const res = await api().delete(`/api/v1/categories/${category.body.data.id}`).set(admin.auth).expect(409);
    expect(res.body.error.code).toBe(CategoriesErrorCode.HAS_PRODUCTS);

    // Verify category is not deleted
    const catRow = await prisma.category.findUniqueOrThrow({ where: { id: category.body.data.id } });
    expect(catRow.deletedAt).toBeNull();

    // Soft-delete the product
    await api().delete(`/api/v1/products/${product.body.data.id}`).set(admin.auth).expect(204);

    // Now category deletion succeeds because products are soft-deleted
    await api().delete(`/api/v1/categories/${category.body.data.id}`).set(admin.auth).expect(204);
  });

  it('rejects deleting a category with a live child category with 409 CATEGORIES_HAS_CHILDREN', async () => {
    const parent = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const child = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Child Category', slug: 'child-category', parentId: parent.body.data.id })
      .expect(201);

    const res = await api().delete(`/api/v1/categories/${parent.body.data.id}`).set(admin.auth).expect(409);
    expect(res.body.error.code).toBe(CategoriesErrorCode.HAS_CHILDREN);
    expect(res.body.error.message).toBe('Category cannot be deleted while it has active child categories.');

    // Verify parent is not deleted
    const parentRow = await prisma.category.findUniqueOrThrow({ where: { id: parent.body.data.id } });
    expect(parentRow.deletedAt).toBeNull();

    // Verify child's parentId relationship remains completely unchanged
    const childRow = await prisma.category.findUniqueOrThrow({ where: { id: child.body.data.id } });
    expect(childRow.parentId).toBe(parent.body.data.id);
    expect(childRow.deletedAt).toBeNull();
  });

  it('rejects deleting a category with multiple live child categories with 409', async () => {
    const parent = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Child One', slug: 'child-one', parentId: parent.body.data.id })
      .expect(201);
    await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Child Two', slug: 'child-two', parentId: parent.body.data.id })
      .expect(201);

    const res = await api().delete(`/api/v1/categories/${parent.body.data.id}`).set(admin.auth).expect(409);
    expect(res.body.error.code).toBe(CategoriesErrorCode.HAS_CHILDREN);
  });

  it('allows deletion of category when all child categories are soft-deleted', async () => {
    const parent = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const child = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Child Category', slug: 'child-category', parentId: parent.body.data.id })
      .expect(201);

    // Soft delete the child category
    await api().delete(`/api/v1/categories/${child.body.data.id}`).set(admin.auth).expect(204);

    // Parent category deletion now succeeds
    await api().delete(`/api/v1/categories/${parent.body.data.id}`).set(admin.auth).expect(204);

    const parentInDb = await prisma.category.findUniqueOrThrow({ where: { id: parent.body.data.id } });
    expect(parentInDb.deletedAt).not.toBeNull();
  });

  it('atomically blocks delete with 409 CATEGORIES_HAS_CHILDREN if child category is added before soft-delete (TOCTOU safe)', async () => {
    const parent = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const parentId = parent.body.data.id;

    // Simulate concurrent child category creation
    await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Race Child', slug: 'race-child', parentId })
      .expect(201);

    const res = await api().delete(`/api/v1/categories/${parentId}`).set(admin.auth).expect(409);
    expect(res.body.error.code).toBe(CategoriesErrorCode.HAS_CHILDREN);

    const parentInDb = await prisma.category.findUniqueOrThrow({ where: { id: parentId } });
    expect(parentInDb.deletedAt).toBeNull();
  });

  it('allows deletion of category with no children and no products', async () => {
    const leafCategory = await api()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name: 'Solo Category', slug: 'solo-category' })
      .expect(201);

    await api().delete(`/api/v1/categories/${leafCategory.body.data.id}`).set(admin.auth).expect(204);

    const inDb = await prisma.category.findUniqueOrThrow({ where: { id: leafCategory.body.data.id } });
    expect(inDb.deletedAt).not.toBeNull();
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

describe('Banner Upload & Handling (PUT /api/v1/categories/:id/banner)', () => {
  it('uploads valid banner image (PNG) via PUT /api/v1/categories/:id/banner', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    const res = await api()
      .put(`/api/v1/categories/${id}/banner`)
      .set(admin.auth)
      .attach('banner', validPngBuffer, 'banner.png')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.bannerUrl).toMatch(/\/categories\/banners\/.*\.png$/);

    // Verify in DB
    const inDb = await prisma.category.findUniqueOrThrow({ where: { id } });
    expect(inDb.bannerUrl).toBe(res.body.data.bannerUrl);
  });

  it('uploads valid banner image (JPEG) via PUT /api/v1/categories/:id/banner', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    const res = await api()
      .put(`/api/v1/categories/${id}/banner`)
      .set(admin.auth)
      .attach('banner', validJpgBuffer, 'banner.jpg')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.bannerUrl).toMatch(/\/categories\/banners\/.*\.jpg$/);
  });

  it('rejects banner upload with wrong field name with 400', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    await api()
      .put(`/api/v1/categories/${id}/banner`)
      .set(admin.auth)
      .attach('file', validJpgBuffer, 'banner.jpg')
      .expect(400);

    await api()
      .put(`/api/v1/categories/${id}/banner`)
      .set(admin.auth)
      .attach('image', validJpgBuffer, 'banner.jpg')
      .expect(400);
  });

  it('rejects banner upload with two files with 400', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    await api()
      .put(`/api/v1/categories/${id}/banner`)
      .set(admin.auth)
      .attach('banner', validPngBuffer, 'banner1.png')
      .attach('banner', validJpgBuffer, 'banner2.jpg')
      .expect(400);
  });

  it('safely replaces existing banner, updates URL and deletes old stored file', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    const first = await api()
      .put(`/api/v1/categories/${id}/banner`)
      .set(admin.auth)
      .attach('banner', validPngBuffer, 'first.png')
      .expect(200);
    const firstUrl = first.body.data.bannerUrl;
    expect(firstUrl).toBeDefined();

    const second = await api()
      .put(`/api/v1/categories/${id}/banner`)
      .set(admin.auth)
      .attach('banner', validJpgBuffer, 'second.jpg')
      .expect(200);
    const secondUrl = second.body.data.bannerUrl;
    expect(secondUrl).toBeDefined();
    expect(secondUrl).not.toBe(firstUrl);

    const inDb = await prisma.category.findUniqueOrThrow({ where: { id } });
    expect(inDb.bannerUrl).toBe(secondUrl);
  });

  it('failed replacement keeps old banner image and unchanged DB URL', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    const first = await api()
      .put(`/api/v1/categories/${id}/banner`)
      .set(admin.auth)
      .attach('banner', validPngBuffer, 'initial.png')
      .expect(200);
    const initialUrl = first.body.data.bannerUrl;

    // Fail due to invalid content (SVG)
    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await api()
      .put(`/api/v1/categories/${id}/banner`)
      .set(admin.auth)
      .attach('banner', svgBuffer, 'vector.svg')
      .expect(400);

    const inDbAfterInvalid = await prisma.category.findUniqueOrThrow({ where: { id } });
    expect(inDbAfterInvalid.bannerUrl).toBe(initialUrl);

    // Fail due to storage upload failure
    const uploadSpy = vi.spyOn(storageService, 'upload').mockRejectedValueOnce(new Error('Disk error'));
    try {
      await api()
        .put(`/api/v1/categories/${id}/banner`)
        .set(admin.auth)
        .attach('banner', validPngBuffer, 'next.png')
        .expect(500);

      const inDbAfterUploadFail = await prisma.category.findUniqueOrThrow({ where: { id } });
      expect(inDbAfterUploadFail.bannerUrl).toBe(initialUrl);
    } finally {
      uploadSpy.mockRestore();
    }
  });

  it('cleanup failure of old banner does not break successful update', async () => {
    const created = await api().post('/api/v1/categories').set(admin.auth).send(sampleCategory).expect(201);
    const id = created.body.data.id;

    const first = await api()
      .put(`/api/v1/categories/${id}/banner`)
      .set(admin.auth)
      .attach('banner', validPngBuffer, 'first.png')
      .expect(200);
    const firstUrl = first.body.data.bannerUrl;

    const deleteSpy = vi
      .spyOn(storageService, 'delete')
      .mockRejectedValueOnce(new Error('Delete disk error'));
    try {
      const res = await api()
        .put(`/api/v1/categories/${id}/banner`)
        .set(admin.auth)
        .attach('banner', validJpgBuffer, 'second.jpg')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.bannerUrl).not.toBe(firstUrl);

      const inDb = await prisma.category.findUniqueOrThrow({ where: { id } });
      expect(inDb.bannerUrl).toBe(res.body.data.bannerUrl);
    } finally {
      deleteSpy.mockRestore();
    }
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
    expect(res.body.data.bannerUrl).toBeNull();

    const inDb = await prisma.category.findUniqueOrThrow({ where: { id } });
    expect(inDb.bannerUrl).toBeNull();
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
    expect(res.body.paths['/categories/{id}']).not.toHaveProperty('put'); // PUT /categories/{id} removed
    expect(res.body.paths['/categories/{id}']).toHaveProperty('patch'); // PATCH preserved
    expect(res.body.paths).toHaveProperty('/categories/{id}/banner');
    expect(res.body.paths['/categories/{id}/banner']).toHaveProperty('put'); // PUT /banner preserved
    expect(res.body.paths).toHaveProperty('/categories/{id}/restore');
    expect(res.body.paths).toHaveProperty('/public/categories');
    expect(res.body.paths).toHaveProperty('/public/categories/{slug}'); // slug path parameter
  });

  it('serves Swagger UI at /api/docs', async () => {
    await api().get('/api/docs/').expect(200);
  });

  it('enforces database level unique constraint on slug', async () => {
    await prisma.category.create({
      data: {
        name: 'Database Direct 1',
        nameKey: 'database direct 1',
        slug: 'unique-slug-db',
      },
    });

    await expect(
      prisma.category.create({
        data: {
          name: 'Database Direct 2',
          nameKey: 'database direct 2',
          slug: 'unique-slug-db',
        },
      })
    ).rejects.toThrow();
  });

  it('enforces database level unique constraint on nameKey', async () => {
    await prisma.category.create({
      data: {
        name: 'Database Direct Name 1',
        nameKey: 'database direct name 1',
        slug: 'unique-slug-db-1',
      },
    });

    await expect(
      prisma.category.create({
        data: {
          name: 'Database Direct Name 1',
          nameKey: 'database direct name 1',
          slug: 'unique-slug-db-2',
        },
      })
    ).rejects.toThrow();
  });
});
