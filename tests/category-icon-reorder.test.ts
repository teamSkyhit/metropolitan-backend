import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './helpers/app';
import { signInAs, type Session } from './helpers/auth';
import { resetDatabase } from './helpers/db';

let admin: Session;

beforeEach(async () => {
  await resetDatabase();
  admin = await signInAs('SUPER_ADMIN');
});

describe('Category Dynamic Icon & Reordering', () => {
  describe('Category Icon', () => {
    it('creates a category with an approved icon key', async () => {
      const res = await api()
        .post('/api/v1/categories')
        .set(admin.auth)
        .send({
          name: 'Power Transmission',
          slug: 'power-transmission',
          description: 'Belts and pulleys',
          icon: 'gear',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.icon).toBe('gear');
    });

    it('creates a category with a safe HTTPS icon URL', async () => {
      const iconUrl = 'https://assets.example.com/icons/gear.svg';
      const res = await api()
        .post('/api/v1/categories')
        .set(admin.auth)
        .send({
          name: 'Hydraulics',
          slug: 'hydraulics',
          icon: iconUrl,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.icon).toBe(iconUrl);
    });

    it.each([
      ['raw SVG markup', '<svg><circle cx="10" cy="10" r="5"/></svg>'],
      ['script tag', '<script>alert("xss")</script>'],
      ['javascript: URI', 'javascript:alert(1)'],
      ['insecure http URL', 'http://assets.example.com/icon.svg'],
      ['disallowed special characters', 'gear<script>'],
      ['spaces in icon key', 'gear icon'],
    ])('rejects invalid or unsafe icon: %s', async (_label, invalidIcon) => {
      const res = await api()
        .post('/api/v1/categories')
        .set(admin.auth)
        .send({
          name: 'Unsafe Category',
          slug: 'unsafe-category',
          icon: invalidIcon,
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('updates and clears category icon', async () => {
      const created = await api()
        .post('/api/v1/categories')
        .set(admin.auth)
        .send({
          name: 'Bearings',
          slug: 'bearings',
          icon: 'gear',
        })
        .expect(201);

      const id = created.body.data.id;

      // Update to new icon key
      const updated = await api()
        .patch(`/api/v1/categories/${id}`)
        .set(admin.auth)
        .send({ icon: 'droplet' })
        .expect(200);

      expect(updated.body.data.icon).toBe('droplet');

      // Clear icon with null
      const cleared = await api()
        .patch(`/api/v1/categories/${id}`)
        .set(admin.auth)
        .send({ icon: null })
        .expect(200);

      expect(cleared.body.data.icon).toBeNull();
    });

    it('exposes icon in public categories list and public category detail', async () => {
      await api()
        .post('/api/v1/categories')
        .set(admin.auth)
        .send({
          name: 'Linear Motion',
          slug: 'linear-motion',
          icon: 'tools',
        })
        .expect(201);

      // Public list
      const listRes = await api().get('/api/v1/public/categories').expect(200);
      expect(listRes.body.success).toBe(true);
      const cat = listRes.body.data.find((c: { slug: string }) => c.slug === 'linear-motion');
      expect(cat).toBeDefined();
      expect(cat.icon).toBe('tools');

      // Public detail by slug
      const detailRes = await api().get('/api/v1/public/categories/linear-motion').expect(200);
      expect(detailRes.body.success).toBe(true);
      expect(detailRes.body.data.icon).toBe('tools');
    });

    it('keeps existing category without icon valid and returns null icon', async () => {
      await api()
        .post('/api/v1/categories')
        .set(admin.auth)
        .send({
          name: 'Seals & O-rings',
          slug: 'seals-and-o-rings',
        })
        .expect(201);

      const res = await api().get('/api/v1/public/categories/seals-and-o-rings').expect(200);
      expect(res.body.data.icon).toBeNull();
    });
  });

  describe('Category Reordering', () => {
    it('atomically reorders categories via PATCH /api/v1/categories/reorder', async () => {
      const cat1 = await api()
        .post('/api/v1/categories')
        .set(admin.auth)
        .send({ name: 'Alpha', slug: 'alpha', sortOrder: 0 })
        .expect(201);
      const cat2 = await api()
        .post('/api/v1/categories')
        .set(admin.auth)
        .send({ name: 'Beta', slug: 'beta', sortOrder: 1 })
        .expect(201);
      const cat3 = await api()
        .post('/api/v1/categories')
        .set(admin.auth)
        .send({ name: 'Gamma', slug: 'gamma', sortOrder: 2 })
        .expect(201);

      // Reorder to: Gamma (0), Alpha (1), Beta (2)
      const reorderRes = await api()
        .patch('/api/v1/categories/reorder')
        .set(admin.auth)
        .send({ categoryIds: [cat3.body.data.id, cat1.body.data.id, cat2.body.data.id] })
        .expect(200);

      expect(reorderRes.body.success).toBe(true);
      expect(reorderRes.body.data).toHaveLength(3);
      expect(reorderRes.body.data[0].sortOrder).toBe(0);
      expect(reorderRes.body.data[1].sortOrder).toBe(1);
      expect(reorderRes.body.data[2].sortOrder).toBe(2);

      // Verify in CRM list (ordered by sortOrder)
      const crmList = await api()
        .get('/api/v1/categories?sortBy=sortOrder&sortOrder=asc')
        .set(admin.auth)
        .expect(200);
      const names = crmList.body.data.map((c: { name: string }) => c.name);
      expect(names).toEqual(['Gamma', 'Alpha', 'Beta']);

      // Verify public list respects sortOrder
      const publicList = await api().get('/api/v1/public/categories').expect(200);
      const publicNames = publicList.body.data.map((c: { name: string }) => c.name);
      expect(publicNames).toEqual(['Gamma', 'Alpha', 'Beta']);
    });

    it('rejects reorder with duplicate category IDs', async () => {
      const cat1 = await api()
        .post('/api/v1/categories')
        .set(admin.auth)
        .send({ name: 'Alpha', slug: 'alpha' })
        .expect(201);

      const res = await api()
        .patch('/api/v1/categories/reorder')
        .set(admin.auth)
        .send({ categoryIds: [cat1.body.data.id, cat1.body.data.id] })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('rejects reorder with empty category IDs list', async () => {
      const res = await api()
        .patch('/api/v1/categories/reorder')
        .set(admin.auth)
        .send({ categoryIds: [] })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('rejects reorder containing a non-existent category ID', async () => {
      const cat1 = await api()
        .post('/api/v1/categories')
        .set(admin.auth)
        .send({ name: 'Alpha', slug: 'alpha' })
        .expect(201);

      const fakeId = randomUUID();
      const res = await api()
        .patch('/api/v1/categories/reorder')
        .set(admin.auth)
        .send({ categoryIds: [cat1.body.data.id, fakeId] })
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });
});
