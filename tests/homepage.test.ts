import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageErrorCode, HomepageSectionType } from '../src/modules/homepage';
import { homepageRepository } from '../src/modules/homepage/homepage.repository';
import { Prisma } from '@prisma/client';
import { api } from './helpers/app';
import { signInAs, type Session } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

let admin: Session;
let sales: Session;

const validPngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

beforeEach(async () => {
  await resetDatabase();
  admin = await signInAs('SUPER_ADMIN');
  sales = await signInAs('SALES_MANAGER');
});

async function uploadTestMedia(session: Session = admin) {
  const uid = randomUUID().slice(0, 8);
  const res = await api()
    .post('/api/v1/media/upload')
    .set(session.auth)
    .attach('file', validPngBuffer, `test-${uid}.png`)
    .expect(201);
  return res.body.data;
}

async function createTestBrand(overrides: Record<string, unknown> = {}) {
  const uid = randomUUID().slice(0, 8);
  const res = await api()
    .post('/api/v1/brands')
    .set(admin.auth)
    .send({
      name: `Brand ${uid}`,
      slug: `brand-${uid}`,
      description: `Description for brand ${uid}`,
      isActive: true,
      sortOrder: 0,
      ...overrides,
    })
    .expect(201);
  return res.body.data;
}

async function createTestCategory(overrides: Record<string, unknown> = {}) {
  const uid = randomUUID().slice(0, 8);
  const res = await api()
    .post('/api/v1/categories')
    .set(admin.auth)
    .send({
      name: `Category ${uid}`,
      slug: `category-${uid}`,
      description: `Description for category ${uid}`,
      isActive: true,
      sortOrder: 0,
      ...overrides,
    })
    .expect(201);
  return res.body.data;
}

async function createTestProduct(overrides: Record<string, unknown> = {}) {
  const uid = randomUUID().slice(0, 8);
  const brand = overrides.brandId ? null : await createTestBrand();
  const category = overrides.categoryId ? null : await createTestCategory();

  const res = await api()
    .post('/api/v1/products')
    .set(admin.auth)
    .send({
      name: `Product ${uid}`,
      sku: `SKU-${uid.toUpperCase()}`,
      brandId: overrides.brandId ?? brand!.id,
      categoryId: overrides.categoryId ?? category!.id,
      description: `Description for product ${uid}`,
      price: 150.0,
      priceVisibility: true,
      status: 'PUBLISHED',
      hotDeal: false,
      ...overrides,
    })
    .expect(201);
  return res.body.data;
}

describe('Homepage CMS Module (BE-3.6)', () => {
  describe('Public Homepage API (GET /api/v1/public/homepage)', () => {
    it('returns empty sections list on a blank database without requiring authentication', async () => {
      const res = await api().get('/api/v1/public/homepage').expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({ sections: [] });
    });

    it('returns only active, non-deleted sections ordered deterministically by sortOrder ASC', async () => {
      const media = await uploadTestMedia();

      // 1. Hero section at sortOrder 1
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.HERO,
          title: 'Hero Title',
          sortOrder: 1,
          isActive: true,
          content: {
            slides: [
              {
                heading: 'Main Industrial Equipment',
                subheading: 'Top Grade',
                mediaId: media.id,
                ctaLabel: 'Explore Catalog',
                ctaUrl: '/products',
                sortOrder: 0,
                isActive: true,
              },
            ],
          },
        })
        .expect(201);

      // 2. Promo Banner at sortOrder 3
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          title: 'Special Promo',
          sortOrder: 3,
          isActive: true,
          content: {
            heading: 'Mega Sale',
            description: 'Save 20% on industrial pumps',
            mediaId: media.id,
            ctaLabel: 'Shop Now',
            ctaUrl: 'https://example.com/promo',
          },
        })
        .expect(201);

      // 3. Inactive promo banner at sortOrder 2 (should be excluded publicly)
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          title: 'Draft Promo',
          sortOrder: 2,
          isActive: false,
          content: {
            heading: 'Draft heading',
            mediaId: media.id,
          },
        })
        .expect(201);

      // 4. Soft-deleted banner (should be excluded publicly)
      const toDelete = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          title: 'Deleted Promo',
          sortOrder: 0,
          isActive: true,
          content: {
            heading: 'Will be deleted',
            mediaId: media.id,
          },
        })
        .expect(201);

      await api().delete(`/api/v1/homepage/sections/${toDelete.body.data.id}`).set(admin.auth).expect(204);

      const res = await api().get('/api/v1/public/homepage').expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.sections).toHaveLength(2);

      // Verify sortOrder ASC
      expect(res.body.data.sections[0].type).toBe(HomepageSectionType.HERO);
      expect(res.body.data.sections[0].sortOrder).toBe(1);
      expect(res.body.data.sections[1].type).toBe(HomepageSectionType.PROMO_BANNER);
      expect(res.body.data.sections[1].sortOrder).toBe(3);

      // Verify data minimization: no deletedAt, createdById, updatedById
      for (const section of res.body.data.sections) {
        expect(section).not.toHaveProperty('deletedAt');
        expect(section).not.toHaveProperty('createdById');
        expect(section).not.toHaveProperty('updatedById');
        expect(section).not.toHaveProperty('createdAt');
        expect(section).not.toHaveProperty('updatedAt');
      }
    });

    it('resolves referenced products, brands, categories, and media into public-safe shapes', async () => {
      const media = await uploadTestMedia();
      const brand = await createTestBrand({ name: 'Acme Motors' });
      const category = await createTestCategory({ name: 'Air Compressors' });
      const product = await createTestProduct({
        name: 'Compressor 500HP',
        brandId: brand.id,
        categoryId: category.id,
      });

      // Create Featured Products
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_PRODUCTS,
          title: 'Top Products',
          sortOrder: 1,
          isActive: true,
          content: { productIds: [product.id] },
        })
        .expect(201);

      // Create Featured Categories
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_CATEGORIES,
          title: 'Explore Categories',
          sortOrder: 2,
          isActive: true,
          content: { categoryIds: [category.id] },
        })
        .expect(201);

      // Create Featured Brands
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_BRANDS,
          title: 'Trusted Brands',
          sortOrder: 3,
          isActive: true,
          content: { brandIds: [brand.id] },
        })
        .expect(201);

      // Create Promo Banner
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          title: 'Banner',
          sortOrder: 4,
          isActive: true,
          content: {
            heading: 'Banner heading',
            mediaId: media.id,
          },
        })
        .expect(201);

      const res = await api().get('/api/v1/public/homepage').expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.sections).toHaveLength(4);

      // Check featured products content
      const prodSection = res.body.data.sections[0];
      expect(prodSection.content.items).toHaveLength(1);
      expect(prodSection.content.items[0].id).toBe(product.id);
      expect(prodSection.content.items[0].name).toBe('Compressor 500HP');
      expect(prodSection.content.items[0].brand.name).toBe('Acme Motors');
      expect(prodSection.content.items[0]).not.toHaveProperty('createdById');

      // Check featured categories content
      const catSection = res.body.data.sections[1];
      expect(catSection.content.items).toHaveLength(1);
      expect(catSection.content.items[0].id).toBe(category.id);
      expect(catSection.content.items[0].name).toBe('Air Compressors');
      expect(catSection.content.items[0]).not.toHaveProperty('createdById');

      // Check featured brands content
      const brandSection = res.body.data.sections[2];
      expect(brandSection.content.items).toHaveLength(1);
      expect(brandSection.content.items[0].id).toBe(brand.id);
      expect(brandSection.content.items[0].name).toBe('Acme Motors');
      expect(brandSection.content.items[0]).not.toHaveProperty('createdById');

      // Check promo banner content: media has publicUrl, fileName, no storageKey
      const promoSection = res.body.data.sections[3];
      expect(promoSection.content.media.id).toBe(media.id);
      expect(promoSection.content.media.publicUrl).toBe(media.publicUrl);
      expect(promoSection.content.media).not.toHaveProperty('storageKey');
    });

    it('implements resilient stale reference handling: filters deleted/draft entities without crashing', async () => {
      const product1 = await createTestProduct({ name: 'Live Product' });
      const product2 = await createTestProduct({ name: 'To Be Deleted' });

      // Create Featured Products with 2 products
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_PRODUCTS,
          title: 'Featured',
          sortOrder: 1,
          isActive: true,
          content: { productIds: [product1.id, product2.id] },
        })
        .expect(201);

      // Now soft-delete product2
      await api().delete(`/api/v1/products/${product2.id}`).set(admin.auth).expect(204);

      const res = await api().get('/api/v1/public/homepage').expect(200);

      // Section is still rendered, but only with live product1
      expect(res.body.data.sections).toHaveLength(1);
      expect(res.body.data.sections[0].content.items).toHaveLength(1);
      expect(res.body.data.sections[0].content.items[0].id).toBe(product1.id);

      // If product1 is also deleted, the empty section is safely omitted rather than crashing
      await api().delete(`/api/v1/products/${product1.id}`).set(admin.auth).expect(204);

      const emptyRes = await api().get('/api/v1/public/homepage').expect(200);
      expect(emptyRes.body.data.sections).toHaveLength(0);
    });
  });

  describe('CRM Management Authentication & RBAC', () => {
    it('returns 401 Unauthenticated for all CRM endpoints when token is missing', async () => {
      const id = randomUUID();
      await api().get('/api/v1/homepage/sections').expect(401);
      await api().get(`/api/v1/homepage/sections/${id}`).expect(401);
      await api().post('/api/v1/homepage/sections').expect(401);
      await api().patch(`/api/v1/homepage/sections/${id}`).expect(401);
      await api().patch('/api/v1/homepage/sections/reorder').expect(401);
      await api().delete(`/api/v1/homepage/sections/${id}`).expect(401);
    });

    it('enforces RBAC: allows Sales Manager read-only access and rejects write operations with 403', async () => {
      const id = randomUUID();

      // Read access allowed for Sales Manager
      await api().get('/api/v1/homepage/sections').set(sales.auth).expect(200);
      await api().get(`/api/v1/homepage/sections/${id}`).set(sales.auth).expect(404);

      // Write operations forbidden for Sales Manager (homepage:create, update, delete reserved for Super Admin)
      await api()
        .post('/api/v1/homepage/sections')
        .set(sales.auth)
        .send({
          type: HomepageSectionType.HERO,
          content: { slides: [] },
        })
        .expect(403);

      await api().patch(`/api/v1/homepage/sections/${id}`).set(sales.auth).send({ title: 'New' }).expect(403);

      await api().patch('/api/v1/homepage/sections/reorder').set(sales.auth).send({ items: [] }).expect(403);

      await api().delete(`/api/v1/homepage/sections/${id}`).set(sales.auth).expect(403);
    });

    it('allows Super Admin full CRUD and reorder access', async () => {
      const media = await uploadTestMedia();

      // Create
      const created = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.HERO,
          title: 'Hero Admin',
          sortOrder: 1,
          isActive: true,
          content: {
            slides: [
              {
                heading: 'Slide 1',
                mediaId: media.id,
                sortOrder: 0,
                isActive: true,
              },
            ],
          },
        })
        .expect(201);

      expect(created.body.data.id).toBeDefined();

      // List
      const list = await api().get('/api/v1/homepage/sections').set(admin.auth).expect(200);
      expect(list.body.data).toHaveLength(1);

      // Detail
      const detail = await api()
        .get(`/api/v1/homepage/sections/${created.body.data.id}`)
        .set(admin.auth)
        .expect(200);
      expect(detail.body.data.title).toBe('Hero Admin');

      // Update
      const updated = await api()
        .patch(`/api/v1/homepage/sections/${created.body.data.id}`)
        .set(admin.auth)
        .send({ title: 'Updated Hero Admin' })
        .expect(200);
      expect(updated.body.data.title).toBe('Updated Hero Admin');

      // Delete
      await api().delete(`/api/v1/homepage/sections/${created.body.data.id}`).set(admin.auth).expect(204);

      // Confirm soft deleted
      await api().get(`/api/v1/homepage/sections/${created.body.data.id}`).set(admin.auth).expect(404);
    });
  });

  describe('Validation & Business Rules', () => {
    it('rejects unsupported section types and payload/type mismatches', async () => {
      const media = await uploadTestMedia();

      // Unsupported type
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: 'UNKNOWN_TYPE',
          content: {},
        })
        .expect(400);

      // Type/content mismatch: HERO requires { slides: [...] }, not { productIds: [...] }
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.HERO,
          content: { productIds: [randomUUID()] },
        })
        .expect(400);

      // Promo banner missing heading
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          content: { mediaId: media.id },
        })
        .expect(400);
    });

    it('validates CTA URLs: allows safe relative paths and HTTPS, rejects unsafe schemes', async () => {
      const media = await uploadTestMedia();

      // Unsafe javascript: scheme
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.HERO,
          content: {
            slides: [
              {
                heading: 'Dangerous',
                mediaId: media.id,
                ctaUrl: 'javascript:alert(1)',
                sortOrder: 0,
                isActive: true,
              },
            ],
          },
        })
        .expect(400);

      // Unsafe data: scheme
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          content: {
            heading: 'Dangerous',
            mediaId: media.id,
            ctaUrl: 'data:text/html,<script>alert(1)</script>',
          },
        })
        .expect(400);

      // Protocol-relative //evil.com
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          content: {
            heading: 'Dangerous',
            mediaId: media.id,
            ctaUrl: '//evil.com/phish',
          },
        })
        .expect(400);

      // Valid internal relative path succeeds
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          content: {
            heading: 'Safe Banner',
            mediaId: media.id,
            ctaUrl: '/products/air-compressor-500',
          },
        })
        .expect(201);
    });

    it('enforces single-instance constraint for HERO, FEATURED_PRODUCTS, CATEGORIES, and BRANDS', async () => {
      const media = await uploadTestMedia();

      // Create first active HERO
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.HERO,
          isActive: true,
          content: {
            slides: [{ heading: 'Slide 1', mediaId: media.id, sortOrder: 0, isActive: true }],
          },
        })
        .expect(201);

      // Attempting to create a second active HERO returns 409 Conflict
      const conflictRes = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.HERO,
          isActive: true,
          content: {
            slides: [{ heading: 'Slide 2', mediaId: media.id, sortOrder: 0, isActive: true }],
          },
        })
        .expect(409);

      expect(conflictRes.body.error.code).toBe(HomepageErrorCode.SECTION_DUPLICATE);

      // But PROMO_BANNER allows multiples
      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          isActive: true,
          content: { heading: 'Banner 1', mediaId: media.id },
        })
        .expect(201);

      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          isActive: true,
          content: { heading: 'Banner 2', mediaId: media.id },
        })
        .expect(201);
    });

    it('prevents mutation of section type via PATCH (type immutability)', async () => {
      const media = await uploadTestMedia();

      const created = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          content: { heading: 'Promo', mediaId: media.id },
        })
        .expect(201);

      // Attempting to change type is rejected with 400
      await api()
        .patch(`/api/v1/homepage/sections/${created.body.data.id}`)
        .set(admin.auth)
        .send({ type: HomepageSectionType.HERO })
        .expect(400);
    });

    it('validates entity references and rejects nonexistent or deleted media/products', async () => {
      const nonExistentMediaId = randomUUID();

      // Nonexistent media in hero
      const heroRes = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.HERO,
          content: {
            slides: [
              {
                heading: 'Bad Media',
                mediaId: nonExistentMediaId,
                sortOrder: 0,
                isActive: true,
              },
            ],
          },
        })
        .expect(400);

      expect(heroRes.body.error.code).toBe(HomepageErrorCode.REFERENCE_INVALID);

      // Nonexistent product in featured products
      const prodRes = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_PRODUCTS,
          content: { productIds: [randomUUID()] },
        })
        .expect(400);

      expect(prodRes.body.error.code).toBe(HomepageErrorCode.REFERENCE_INVALID);
    });
  });

  describe('Reorder Sections (PATCH /api/v1/homepage/sections/reorder)', () => {
    it('atomically updates sortOrder across sections and captures updatedById', async () => {
      const media = await uploadTestMedia();

      const banner1 = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          title: 'Banner 1',
          sortOrder: 10,
          content: { heading: 'Banner 1', mediaId: media.id },
        })
        .expect(201);

      const banner2 = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          title: 'Banner 2',
          sortOrder: 20,
          content: { heading: 'Banner 2', mediaId: media.id },
        })
        .expect(201);

      // Reorder banner2 to 5 and banner1 to 15
      const reordered = await api()
        .patch('/api/v1/homepage/sections/reorder')
        .set(admin.auth)
        .send({
          items: [
            { id: banner2.body.data.id, sortOrder: 5 },
            { id: banner1.body.data.id, sortOrder: 15 },
          ],
        })
        .expect(200);

      expect(reordered.body.success).toBe(true);
      expect(reordered.body.data[0].id).toBe(banner2.body.data.id);
      expect(reordered.body.data[0].sortOrder).toBe(5);
      expect(reordered.body.data[1].id).toBe(banner1.body.data.id);
      expect(reordered.body.data[1].sortOrder).toBe(15);
    });

    it('rejects duplicate IDs or nonexistent section IDs in reorder request', async () => {
      const media = await uploadTestMedia();
      const banner = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          content: { heading: 'Banner', mediaId: media.id },
        })
        .expect(201);

      // Duplicate ID in array -> 400
      await api()
        .patch('/api/v1/homepage/sections/reorder')
        .set(admin.auth)
        .send({
          items: [
            { id: banner.body.data.id, sortOrder: 1 },
            { id: banner.body.data.id, sortOrder: 2 },
          ],
        })
        .expect(400);

      // Nonexistent ID -> 404
      await api()
        .patch('/api/v1/homepage/sections/reorder')
        .set(admin.auth)
        .send({
          items: [{ id: randomUUID(), sortOrder: 1 }],
        })
        .expect(404);
    });
  });

  describe('Media Delete Guard Integration', () => {
    it('blocks deletion of a media asset actively referenced by a homepage hero slide or banner', async () => {
      const media = await uploadTestMedia();

      // Create an active hero referencing this media
      const section = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.HERO,
          content: {
            slides: [{ heading: 'Slide', mediaId: media.id, sortOrder: 0, isActive: true }],
          },
        })
        .expect(201);

      // Attempting to delete media returns 409 Conflict
      const delRes = await api().delete(`/api/v1/media/${media.id}`).set(admin.auth).expect(409);
      expect(delRes.body.error.code).toBe('MEDIA_IN_USE');

      // Now soft-delete the homepage section
      await api().delete(`/api/v1/homepage/sections/${section.body.data.id}`).set(admin.auth).expect(204);

      // Media deletion now succeeds
      await api().delete(`/api/v1/media/${media.id}`).set(admin.auth).expect(204);
    });
  });

  describe('Concurrency & Race-Condition Safety (Senior Review Risk 1)', () => {
    it('atomically prevents concurrent creation of duplicate single-instance active sections', async () => {
      const media = await uploadTestMedia();

      const createPayload = {
        type: HomepageSectionType.HERO,
        isActive: true,
        content: {
          slides: [{ heading: 'Concurrent Slide', mediaId: media.id, sortOrder: 0, isActive: true }],
        },
      };

      // Dispatch 2 concurrent requests
      const [res1, res2] = await Promise.all([
        api().post('/api/v1/homepage/sections').set(admin.auth).send(createPayload),
        api().post('/api/v1/homepage/sections').set(admin.auth).send(createPayload),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const errorRes = res1.status === 409 ? res1 : res2;
      expect(errorRes.body.error.code).toBe(HomepageErrorCode.SECTION_DUPLICATE);

      // Verify DB contains exactly 1 active non-deleted HERO section
      const activeCount = await prisma.homepageSection.count({
        where: {
          type: HomepageSectionType.HERO,
          isActive: true,
          deletedAt: null,
        },
      });
      expect(activeCount).toBe(1);
    });

    it('atomically prevents concurrent activation of two existing single-instance sections', async () => {
      const media = await uploadTestMedia();

      // Create two inactive HERO sections
      const s1 = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.HERO,
          isActive: false,
          content: {
            slides: [{ heading: 'Slide A', mediaId: media.id, sortOrder: 0, isActive: true }],
          },
        })
        .expect(201);

      const s2 = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.HERO,
          isActive: false,
          content: {
            slides: [{ heading: 'Slide B', mediaId: media.id, sortOrder: 0, isActive: true }],
          },
        })
        .expect(201);

      // Concurrently activate both
      const [res1, res2] = await Promise.all([
        api().patch(`/api/v1/homepage/sections/${s1.body.data.id}`).set(admin.auth).send({ isActive: true }),
        api().patch(`/api/v1/homepage/sections/${s2.body.data.id}`).set(admin.auth).send({ isActive: true }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const errorRes = res1.status === 409 ? res1 : res2;
      expect(errorRes.body.error.code).toBe(HomepageErrorCode.SECTION_DUPLICATE);

      // Exactly 1 active HERO section in DB
      const activeCount = await prisma.homepageSection.count({
        where: {
          type: HomepageSectionType.HERO,
          isActive: true,
          deletedAt: null,
        },
      });
      expect(activeCount).toBe(1);
    });

    it('verifies all partial unique index database states: active duplicate P2002 rejection, inactive coexistence, soft-deleted coexistence, and PROMO_BANNER coexistence', async () => {
      const dummyContent = { slides: [] };

      // 1. First active HERO -> succeeds
      const hero1 = await prisma.homepageSection.create({
        data: {
          type: HomepageSectionType.HERO,
          isActive: true,
          content: dummyContent,
        },
      });
      expect(hero1.id).toBeDefined();

      // 2. Second active HERO at database level -> throws Prisma P2002 unique constraint error
      let p2002Error: Prisma.PrismaClientKnownRequestError | null = null;
      try {
        await prisma.homepageSection.create({
          data: {
            type: HomepageSectionType.HERO,
            isActive: true,
            content: dummyContent,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          p2002Error = err;
        }
      }
      expect(p2002Error).not.toBeNull();
      expect(p2002Error?.code).toBe('P2002');

      // 3. Inactive HERO + active HERO -> allowed
      const inactiveHero1 = await prisma.homepageSection.create({
        data: {
          type: HomepageSectionType.HERO,
          isActive: false,
          content: dummyContent,
        },
      });
      expect(inactiveHero1.id).toBeDefined();

      // 4. Two inactive HERO rows -> allowed
      const inactiveHero2 = await prisma.homepageSection.create({
        data: {
          type: HomepageSectionType.HERO,
          isActive: false,
          content: dummyContent,
        },
      });
      expect(inactiveHero2.id).toBeDefined();

      // 5. Soft-deleted HERO + active HERO -> allowed
      // Soft-delete hero1
      await prisma.homepageSection.update({
        where: { id: hero1.id },
        data: { deletedAt: new Date() },
      });

      // Now create a new active HERO -> allowed because hero1 is soft-deleted
      const newActiveHero = await prisma.homepageSection.create({
        data: {
          type: HomepageSectionType.HERO,
          isActive: true,
          content: dummyContent,
        },
      });
      expect(newActiveHero.id).toBeDefined();

      // 6. Multiple active PROMO_BANNER rows -> allowed
      const banner1 = await prisma.homepageSection.create({
        data: {
          type: HomepageSectionType.PROMO_BANNER,
          isActive: true,
          content: { heading: 'Banner 1', mediaId: randomUUID() },
        },
      });
      const banner2 = await prisma.homepageSection.create({
        data: {
          type: HomepageSectionType.PROMO_BANNER,
          isActive: true,
          content: { heading: 'Banner 2', mediaId: randomUUID() },
        },
      });
      const banner3 = await prisma.homepageSection.create({
        data: {
          type: HomepageSectionType.PROMO_BANNER,
          isActive: true,
          content: { heading: 'Banner 3', mediaId: randomUUID() },
        },
      });
      expect(banner1.id).toBeDefined();
      expect(banner2.id).toBeDefined();
      expect(banner3.id).toBeDefined();

      // Confirm total active PROMO_BANNER count is 3
      const bannerCount = await prisma.homepageSection.count({
        where: {
          type: HomepageSectionType.PROMO_BANNER,
          isActive: true,
          deletedAt: null,
        },
      });
      expect(bannerCount).toBe(3);
    });
  });

  describe('Featured Reference Eligibility & Integrity (Senior Review Risk 2)', () => {
    it('rejects FEATURED_PRODUCTS referencing a DRAFT product on create and update', async () => {
      const draftProduct = await createTestProduct({ status: 'DRAFT' });
      const publishedProduct = await createTestProduct({ status: 'PUBLISHED' });

      // Create with DRAFT product is rejected with 400
      const createRes = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_PRODUCTS,
          content: { productIds: [draftProduct.id] },
        })
        .expect(400);

      expect(createRes.body.error.code).toBe(HomepageErrorCode.REFERENCE_INVALID);

      // Create with valid published product succeeds
      const created = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_PRODUCTS,
          content: { productIds: [publishedProduct.id] },
        })
        .expect(201);

      // Update to reference DRAFT product is rejected with 400
      const updateRes = await api()
        .patch(`/api/v1/homepage/sections/${created.body.data.id}`)
        .set(admin.auth)
        .send({
          content: { productIds: [draftProduct.id] },
        })
        .expect(400);

      expect(updateRes.body.error.code).toBe(HomepageErrorCode.REFERENCE_INVALID);
    });

    it('rejects FEATURED_PRODUCTS referencing a deleted product on create and update', async () => {
      const product = await createTestProduct({ status: 'PUBLISHED' });
      await api().delete(`/api/v1/products/${product.id}`).set(admin.auth).expect(204);

      const res = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_PRODUCTS,
          content: { productIds: [product.id] },
        })
        .expect(400);

      expect(res.body.error.code).toBe(HomepageErrorCode.REFERENCE_INVALID);
    });

    it('rejects FEATURED_PRODUCTS referencing a product whose Brand is inactive or deleted', async () => {
      const brand = await createTestBrand({ isActive: true });
      const category = await createTestCategory({ isActive: true });
      const product = await createTestProduct({
        brandId: brand.id,
        categoryId: category.id,
        status: 'PUBLISHED',
      });

      // Deactivate the brand
      await api().patch(`/api/v1/brands/${brand.id}`).set(admin.auth).send({ isActive: false }).expect(200);

      // Attempt create section referencing this product
      const resInactive = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_PRODUCTS,
          content: { productIds: [product.id] },
        })
        .expect(400);

      expect(resInactive.body.error.code).toBe(HomepageErrorCode.REFERENCE_INVALID);

      // Reactivate brand, then soft-delete brand in DB
      await api().patch(`/api/v1/brands/${brand.id}`).set(admin.auth).send({ isActive: true }).expect(200);
      await prisma.brand.update({ where: { id: brand.id }, data: { deletedAt: new Date() } });

      const resDeleted = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_PRODUCTS,
          content: { productIds: [product.id] },
        })
        .expect(400);

      expect(resDeleted.body.error.code).toBe(HomepageErrorCode.REFERENCE_INVALID);
    });

    it('rejects FEATURED_PRODUCTS referencing a product whose Category is inactive or deleted', async () => {
      const brand = await createTestBrand({ isActive: true });
      const category = await createTestCategory({ isActive: true });
      const product = await createTestProduct({
        brandId: brand.id,
        categoryId: category.id,
        status: 'PUBLISHED',
      });

      // Deactivate category
      await api()
        .patch(`/api/v1/categories/${category.id}`)
        .set(admin.auth)
        .send({ isActive: false })
        .expect(200);

      const resInactive = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_PRODUCTS,
          content: { productIds: [product.id] },
        })
        .expect(400);

      expect(resInactive.body.error.code).toBe(HomepageErrorCode.REFERENCE_INVALID);

      // Reactivate category, then soft-delete category in DB
      await api()
        .patch(`/api/v1/categories/${category.id}`)
        .set(admin.auth)
        .send({ isActive: true })
        .expect(200);
      await prisma.category.update({ where: { id: category.id }, data: { deletedAt: new Date() } });

      const resDeleted = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_PRODUCTS,
          content: { productIds: [product.id] },
        })
        .expect(400);

      expect(resDeleted.body.error.code).toBe(HomepageErrorCode.REFERENCE_INVALID);
    });

    it('rejects FEATURED_CATEGORIES referencing inactive or deleted categories on create and update', async () => {
      const inactiveCategory = await createTestCategory({ isActive: false });
      const activeCategory = await createTestCategory({ isActive: true });

      // Inactive category rejected on create
      const resInactive = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_CATEGORIES,
          content: { categoryIds: [inactiveCategory.id] },
        })
        .expect(400);

      expect(resInactive.body.error.code).toBe(HomepageErrorCode.REFERENCE_INVALID);

      // Valid create
      const created = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_CATEGORIES,
          content: { categoryIds: [activeCategory.id] },
        })
        .expect(201);

      // Update to inactive rejected
      await api()
        .patch(`/api/v1/homepage/sections/${created.body.data.id}`)
        .set(admin.auth)
        .send({ content: { categoryIds: [inactiveCategory.id] } })
        .expect(400);

      // Soft-delete activeCategory, then attempt create new section
      await api().delete(`/api/v1/categories/${activeCategory.id}`).set(admin.auth).expect(204);

      // Delete existing section first to test create
      await api().delete(`/api/v1/homepage/sections/${created.body.data.id}`).set(admin.auth).expect(204);

      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_CATEGORIES,
          content: { categoryIds: [activeCategory.id] },
        })
        .expect(400);
    });

    it('rejects FEATURED_BRANDS referencing inactive or deleted brands on create and update', async () => {
      const inactiveBrand = await createTestBrand({ isActive: false });
      const activeBrand = await createTestBrand({ isActive: true });

      // Inactive brand rejected on create
      const resInactive = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_BRANDS,
          content: { brandIds: [inactiveBrand.id] },
        })
        .expect(400);

      expect(resInactive.body.error.code).toBe(HomepageErrorCode.REFERENCE_INVALID);

      // Valid create
      const created = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_BRANDS,
          content: { brandIds: [activeBrand.id] },
        })
        .expect(201);

      // Update to inactive rejected
      await api()
        .patch(`/api/v1/homepage/sections/${created.body.data.id}`)
        .set(admin.auth)
        .send({ content: { brandIds: [inactiveBrand.id] } })
        .expect(400);

      // Soft-delete activeBrand, then attempt create new section
      await api().delete(`/api/v1/brands/${activeBrand.id}`).set(admin.auth).expect(204);

      // Delete existing section first to test create
      await api().delete(`/api/v1/homepage/sections/${created.body.data.id}`).set(admin.auth).expect(204);

      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_BRANDS,
          content: { brandIds: [activeBrand.id] },
        })
        .expect(400);
    });
  });

  describe('Activation Revalidation & Partial PATCH Semantics', () => {
    it('keeps an inactive section inactive when its referenced media was deleted', async () => {
      const media = await uploadTestMedia();
      const created = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          isActive: false,
          content: { heading: 'Inactive banner', mediaId: media.id },
        })
        .expect(201);

      await api().delete(`/api/v1/media/${media.id}`).set(admin.auth).expect(204);

      const response = await api()
        .patch(`/api/v1/homepage/sections/${created.body.data.id}`)
        .set(admin.auth)
        .send({ isActive: true })
        .expect(400);

      expect(response.body.error.code).toBe(HomepageErrorCode.REFERENCE_INVALID);
      const stored = await prisma.homepageSection.findUnique({ where: { id: created.body.data.id } });
      expect(stored?.isActive).toBe(false);
    });

    it('rejects activation when an inactive featured product is no longer published', async () => {
      const product = await createTestProduct();
      const created = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_PRODUCTS,
          isActive: false,
          content: { productIds: [product.id] },
        })
        .expect(201);

      await api()
        .patch(`/api/v1/products/${product.id}`)
        .set(admin.auth)
        .send({ status: 'DRAFT' })
        .expect(200);

      const response = await api()
        .patch(`/api/v1/homepage/sections/${created.body.data.id}`)
        .set(admin.auth)
        .send({ isActive: true })
        .expect(400);

      expect(response.body.error.code).toBe(HomepageErrorCode.REFERENCE_INVALID);
      const stored = await prisma.homepageSection.findUnique({ where: { id: created.body.data.id } });
      expect(stored?.isActive).toBe(false);
    });

    it('rejects activation of category and brand sections whose references became inactive', async () => {
      const category = await createTestCategory();
      const brand = await createTestBrand();
      const categorySection = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_CATEGORIES,
          isActive: false,
          content: { categoryIds: [category.id] },
        })
        .expect(201);
      const brandSection = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.FEATURED_BRANDS,
          isActive: false,
          content: { brandIds: [brand.id] },
        })
        .expect(201);

      await api()
        .patch(`/api/v1/categories/${category.id}`)
        .set(admin.auth)
        .send({ isActive: false })
        .expect(200);
      await api().patch(`/api/v1/brands/${brand.id}`).set(admin.auth).send({ isActive: false }).expect(200);

      for (const sectionId of [categorySection.body.data.id, brandSection.body.data.id]) {
        const response = await api()
          .patch(`/api/v1/homepage/sections/${sectionId}`)
          .set(admin.auth)
          .send({ isActive: true })
          .expect(400);
        expect(response.body.error.code).toBe(HomepageErrorCode.REFERENCE_INVALID);
      }
    });

    it('activates a valid inactive section successfully', async () => {
      const media = await uploadTestMedia();
      const created = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.HERO,
          isActive: false,
          content: { slides: [{ heading: 'Ready', mediaId: media.id }] },
        })
        .expect(201);

      const response = await api()
        .patch(`/api/v1/homepage/sections/${created.body.data.id}`)
        .set(admin.auth)
        .send({ isActive: true })
        .expect(200);

      expect(response.body.data.isActive).toBe(true);
    });

    it('does not overwrite a concurrent content edit when PATCH supplies title only', async () => {
      const media = await uploadTestMedia();
      const created = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          content: { heading: 'Original', mediaId: media.id },
        })
        .expect(201);
      const concurrentContent = { heading: 'Concurrent edit', mediaId: media.id };
      const originalUpdate = homepageRepository.update;
      const updateSpy = vi
        .spyOn(homepageRepository, 'update')
        .mockImplementationOnce(async (id, data, actorId) => {
          await prisma.homepageSection.update({
            where: { id },
            data: { content: concurrentContent },
          });
          return originalUpdate(id, data, actorId);
        });

      try {
        await api()
          .patch(`/api/v1/homepage/sections/${created.body.data.id}`)
          .set(admin.auth)
          .send({ title: 'Title only' })
          .expect(200);
      } finally {
        updateSpy.mockRestore();
      }

      const stored = await prisma.homepageSection.findUnique({ where: { id: created.body.data.id } });
      expect(stored?.content).toEqual(concurrentContent);
      expect(stored?.title).toBe('Title only');
    });

    it('omits content from the repository update payload for a sortOrder-only PATCH', async () => {
      const media = await uploadTestMedia();
      const created = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          content: { heading: 'Keep me', mediaId: media.id },
        })
        .expect(201);
      const updateSpy = vi.spyOn(homepageRepository, 'update');

      try {
        await api()
          .patch(`/api/v1/homepage/sections/${created.body.data.id}`)
          .set(admin.auth)
          .send({ sortOrder: 42 })
          .expect(200);

        expect(updateSpy).toHaveBeenCalledWith(created.body.data.id, { sortOrder: 42 }, admin.user.id);
      } finally {
        updateSpy.mockRestore();
      }

      const stored = await prisma.homepageSection.findUnique({ where: { id: created.body.data.id } });
      expect(stored?.content).toEqual({ heading: 'Keep me', mediaId: media.id });
    });
  });

  describe('Stable HERO Slide IDs & Text Policy', () => {
    it('persists a generated UUID and returns the same slide ID across public reads', async () => {
      const media = await uploadTestMedia();
      const created = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.HERO,
          content: { slides: [{ heading: 'Stable slide', mediaId: media.id }] },
        })
        .expect(201);
      const slideId = created.body.data.content.slides[0].id;

      expect(slideId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      const stored = await prisma.homepageSection.findUnique({ where: { id: created.body.data.id } });
      expect((stored?.content as { slides: { id: string }[] }).slides[0]?.id).toBe(slideId);

      const first = await api().get('/api/v1/public/homepage').expect(200);
      const second = await api().get('/api/v1/public/homepage').expect(200);
      expect(first.body.data.sections[0].content.slides[0].id).toBe(slideId);
      expect(second.body.data.sections[0].content.slides[0].id).toBe(slideId);
    });

    it('preserves a supplied existing slide ID on content update', async () => {
      const media = await uploadTestMedia();
      const created = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.HERO,
          content: { slides: [{ heading: 'Before', mediaId: media.id }] },
        })
        .expect(201);
      const slideId = created.body.data.content.slides[0].id;

      const updated = await api()
        .patch(`/api/v1/homepage/sections/${created.body.data.id}`)
        .set(admin.auth)
        .send({
          content: { slides: [{ id: slideId, heading: 'After', mediaId: media.id }] },
        })
        .expect(200);

      expect(updated.body.data.content.slides[0].id).toBe(slideId);
      expect(updated.body.data.content.slides[0].heading).toBe('After');
    });

    it('rejects duplicate and invalid HERO slide IDs', async () => {
      const media = await uploadTestMedia();
      const duplicateId = randomUUID();

      for (const slides of [
        [
          { id: duplicateId, heading: 'One', mediaId: media.id },
          { id: duplicateId, heading: 'Two', mediaId: media.id },
        ],
        [{ id: 'not-a-uuid', heading: 'Invalid', mediaId: media.id }],
      ]) {
        const response = await api()
          .post('/api/v1/homepage/sections')
          .set(admin.auth)
          .send({ type: HomepageSectionType.HERO, content: { slides } })
          .expect(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('returns a deterministic compatibility UUID for a legacy HERO slide without an ID', async () => {
      const media = await uploadTestMedia();
      await prisma.homepageSection.create({
        data: {
          type: HomepageSectionType.HERO,
          isActive: true,
          content: {
            slides: [{ heading: 'Legacy', mediaId: media.id, sortOrder: 0, isActive: true }],
          },
        },
      });

      const first = await api().get('/api/v1/public/homepage').expect(200);
      const second = await api().get('/api/v1/public/homepage').expect(200);
      const firstId = first.body.data.sections[0].content.slides[0].id;
      expect(firstId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(second.body.data.sections[0].content.slides[0].id).toBe(firstId);
    });

    it('stores and returns HTML-like characters as plain string data', async () => {
      const media = await uploadTestMedia();
      const text = '<b>text</b>';
      const created = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          title: text,
          content: { heading: text, description: text, mediaId: media.id },
        })
        .expect(201);

      expect(created.body.data.title).toBe(text);
      expect(created.body.data.content.heading).toBe(text);
      const publicResponse = await api().get('/api/v1/public/homepage').expect(200);
      expect(publicResponse.body.data.sections[0].title).toBe(text);
      expect(publicResponse.body.data.sections[0].content.description).toBe(text);
    });
  });

  describe('Strict Mass-Assignment & Injection Protection (Senior Review Risk 3)', () => {
    it('rejects injection of id, createdById, updatedById, deletedAt, or storageKey on create with HTTP 400', async () => {
      const media = await uploadTestMedia();
      const validContent = {
        slides: [{ heading: 'Slide', mediaId: media.id, sortOrder: 0, isActive: true }],
      };

      const injectionAttempts = [
        { id: randomUUID() },
        { createdById: randomUUID() },
        { updatedById: randomUUID() },
        { deletedAt: new Date().toISOString() },
        { storageKey: 'uploads/malicious/file.png' },
      ];

      for (const injection of injectionAttempts) {
        const payload = {
          type: HomepageSectionType.HERO,
          ...injection,
          content: validContent,
        };

        const res = await api().post('/api/v1/homepage/sections').set(admin.auth).send(payload).expect(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects injection of internal and unknown fields on update (PATCH) with HTTP 400', async () => {
      const media = await uploadTestMedia();
      const created = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          content: { heading: 'Banner', mediaId: media.id },
        })
        .expect(201);

      const injectionAttempts = [
        { id: randomUUID() },
        { createdById: randomUUID() },
        { updatedById: randomUUID() },
        { deletedAt: new Date().toISOString() },
        { storageKey: 'uploads/malicious/file.png' },
        { unknownField: 'attacker-value' },
      ];

      for (const injection of injectionAttempts) {
        const res = await api()
          .patch(`/api/v1/homepage/sections/${created.body.data.id}`)
          .set(admin.auth)
          .send(injection)
          .expect(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects injection of unknown fields inside section content payloads with HTTP 400', async () => {
      const media = await uploadTestMedia();

      // Create banner with injected storageKey in content
      const resCreate = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          content: {
            heading: 'Banner',
            mediaId: media.id,
            storageKey: 'injected/key',
          },
        })
        .expect(400);

      expect(resCreate.body.error.code).toBe('VALIDATION_ERROR');

      // Valid banner creation
      const created = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.PROMO_BANNER,
          content: { heading: 'Banner', mediaId: media.id },
        })
        .expect(201);

      // Attempt to PATCH banner with injected storageKey inside content
      const resPatch = await api()
        .patch(`/api/v1/homepage/sections/${created.body.data.id}`)
        .set(admin.auth)
        .send({
          content: {
            heading: 'Banner Updated',
            mediaId: media.id,
            storageKey: 'injected/key',
          },
        })
        .expect(400);

      expect(resPatch.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('confirms client cannot manipulate audit or primary key fields into database', async () => {
      const media = await uploadTestMedia();

      // Verify that after normal creation, createdById is the authenticated admin's ID
      const created = await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: HomepageSectionType.HERO,
          content: {
            slides: [{ heading: 'Slide', mediaId: media.id, sortOrder: 0, isActive: true }],
          },
        })
        .expect(201);

      const recordInDb = await prisma.homepageSection.findUnique({
        where: { id: created.body.data.id },
      });

      expect(recordInDb).not.toBeNull();
      expect(recordInDb?.createdById).toBe(admin.user.id);
      expect(recordInDb?.deletedAt).toBeNull();
    });
  });
});
