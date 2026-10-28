import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndustrialCapabilitiesErrorCode } from '../src/modules/industrial-capabilities/industrial-capabilities.schema';
import { api } from './helpers/app';
import { signInAs, type Session } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

let admin: Session;
let sales: Session;
let crmUser: Session;

const validPngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

beforeEach(async () => {
  await resetDatabase();
  admin = await signInAs('SUPER_ADMIN');
  sales = await signInAs('SALES_MANAGER', { email: 'sales@metro.test' });
  crmUser = await signInAs('CRM_USER', { email: 'crmuser@metro.test' });
});

describe('Industrial Capabilities Module', () => {
  describe('Section Settings (backed by Homepage Sections)', () => {
    it('returns default section settings when none configured yet', async () => {
      const res = await api().get('/api/v1/industrial-capabilities/settings').set(admin.auth).expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.eyebrow).toBe('OUR INDUSTRIAL CAPABILITIES');
      expect(res.body.data.title).toBe('SIX CORE SEGMENTS');
    });

    it('updates section settings via PATCH', async () => {
      const updatePayload = {
        eyebrow: 'CAPABILITIES & EXPERTISE',
        title: 'ENGINEERING SOLUTIONS',
        description: 'Comprehensive industrial support across sectors',
      };

      const res = await api()
        .patch('/api/v1/industrial-capabilities/settings')
        .set(admin.auth)
        .send(updatePayload)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject(updatePayload);

      // Verify persistence on subsequent GET
      const getRes = await api().get('/api/v1/industrial-capabilities/settings').set(sales.auth).expect(200);

      expect(getRes.body.data).toMatchObject(updatePayload);
    });
  });

  describe('CRM CRUD Operations', () => {
    const validCapability = {
      number: '01',
      title: 'Power Transmission',
      slug: 'power-transmission',
      icon: 'gear',
      shortDescription: 'Industrial drives, belts, pulleys, and couplings',
      description: 'Comprehensive power transmission products for manufacturing.',
      typicalProducts: ['Bearings', 'Housings', 'Seals', 'Belts', 'Pulleys'],
      sortOrder: 0,
      isActive: true,
    };

    it('creates an industrial capability card with typical products and icon', async () => {
      const res = await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send(validCapability)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        number: '01',
        title: 'Power Transmission',
        slug: 'power-transmission',
        icon: 'gear',
        typicalProducts: ['Bearings', 'Housings', 'Seals', 'Belts', 'Pulleys'],
        sortOrder: 0,
        isActive: true,
      });
      expect(res.body.data.id).toBeDefined();
    });

    it('deduplicates and trims typicalProducts during create and update', async () => {
      const res = await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({
          ...validCapability,
          slug: 'dedup-test',
          typicalProducts: ['  Bearings ', 'Seals', 'Bearings', 'Chains'],
        })
        .expect(201);

      expect(res.body.data.typicalProducts).toEqual(['Bearings', 'Seals', 'Chains']);
    });

    it('rejects typicalProducts containing blank or empty items', async () => {
      const res = await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({
          ...validCapability,
          slug: 'blank-item-test',
          typicalProducts: ['Bearings', '  ', 'Seals'],
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('rejects slug conflict with 409', async () => {
      await api().post('/api/v1/industrial-capabilities').set(admin.auth).send(validCapability).expect(201);

      const res = await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({ ...validCapability, title: 'Duplicate Slug' })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(IndustrialCapabilitiesErrorCode.SLUG_CONFLICT);
    });

    it.each([
      ['raw SVG markup', '<svg><path d="..."/></svg>'],
      ['script markup', '<script>alert(1)</script>'],
      ['javascript URI', 'javascript:alert(1)'],
      ['insecure http URL', 'http://insecure.test/icon.png'],
    ])('rejects invalid or unsafe icon: %s', async (_label, invalidIcon) => {
      const res = await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({
          ...validCapability,
          slug: `icon-test-${randomUUID().slice(0, 6)}`,
          icon: invalidIcon,
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('gets capability by ID, updates fields, and soft deletes', async () => {
      const createRes = await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send(validCapability)
        .expect(201);

      const id = createRes.body.data.id;

      // GET by ID
      const getRes = await api().get(`/api/v1/industrial-capabilities/${id}`).set(admin.auth).expect(200);
      expect(getRes.body.data.id).toBe(id);

      // PATCH update
      const updateRes = await api()
        .patch(`/api/v1/industrial-capabilities/${id}`)
        .set(admin.auth)
        .send({
          number: '01A',
          title: 'Advanced Power Transmission',
          icon: 'anchor',
        })
        .expect(200);

      expect(updateRes.body.data.number).toBe('01A');
      expect(updateRes.body.data.title).toBe('Advanced Power Transmission');
      expect(updateRes.body.data.icon).toBe('anchor');

      // DELETE soft-delete
      await api().delete(`/api/v1/industrial-capabilities/${id}`).set(admin.auth).expect(204);

      // Verify excluded from list
      const listRes = await api().get('/api/v1/industrial-capabilities').set(admin.auth).expect(200);
      expect(listRes.body.data.find((c: { id: string }) => c.id === id)).toBeUndefined();
    });

    it('atomically reorders capabilities via PATCH /reorder', async () => {
      const c1 = await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({ ...validCapability, slug: 'seg-1', sortOrder: 0 })
        .expect(201);
      const c2 = await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({ ...validCapability, title: 'Two', slug: 'seg-2', sortOrder: 1 })
        .expect(201);
      const c3 = await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({ ...validCapability, title: 'Three', slug: 'seg-3', sortOrder: 2 })
        .expect(201);

      const reorderRes = await api()
        .patch('/api/v1/industrial-capabilities/reorder')
        .set(admin.auth)
        .send({ capabilityIds: [c3.body.data.id, c1.body.data.id, c2.body.data.id] })
        .expect(200);

      expect(reorderRes.body.success).toBe(true);
      expect(reorderRes.body.data).toHaveLength(3);
      expect(reorderRes.body.data[0].slug).toBe('seg-3');
      expect(reorderRes.body.data[0].sortOrder).toBe(0);
      expect(reorderRes.body.data[1].slug).toBe('seg-1');
      expect(reorderRes.body.data[1].sortOrder).toBe(1);
      expect(reorderRes.body.data[2].slug).toBe('seg-2');
      expect(reorderRes.body.data[2].sortOrder).toBe(2);
    });
  });

  describe('Media Lifecycle & Uploads', () => {
    it('uploads, replaces, and removes capability image with media lifecycle tracking', async () => {
      const created = await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({
          title: 'Material Handling',
          slug: 'material-handling',
          typicalProducts: ['Conveyors', 'Rollers'],
        })
        .expect(201);

      const id = created.body.data.id;

      // Upload image
      const uploadRes = await api()
        .put(`/api/v1/industrial-capabilities/${id}/image`)
        .set(admin.auth)
        .attach('image', validPngBuffer, 'capability.png')
        .expect(200);

      expect(uploadRes.body.data.imageUrl).toBeDefined();
      expect(uploadRes.body.data.imageMediaId).toBeDefined();
      const firstMediaId = uploadRes.body.data.imageMediaId;

      // Replace image
      const replaceRes = await api()
        .put(`/api/v1/industrial-capabilities/${id}/image`)
        .set(admin.auth)
        .attach('image', validPngBuffer, 'capability-replacement.png')
        .expect(200);

      expect(replaceRes.body.data.imageMediaId).not.toBe(firstMediaId);

      // Verify old media was cleaned up (soft-deleted) because it was unreferenced
      const oldMedia = await prisma.media.findUnique({ where: { id: firstMediaId } });
      expect(oldMedia?.deletedAt).not.toBeNull();

      // Remove image
      const removeRes = await api()
        .delete(`/api/v1/industrial-capabilities/${id}/image`)
        .set(admin.auth)
        .expect(200);

      expect(removeRes.body.data.imageUrl).toBeNull();
      expect(removeRes.body.data.imageMediaId).toBeNull();
    });
  });

  describe('Public API (GET /api/v1/public/industrial-capabilities)', () => {
    it('returns section settings and active segments ordered by sortOrder without sensitive fields', async () => {
      // Set section settings
      await api()
        .patch('/api/v1/industrial-capabilities/settings')
        .set(admin.auth)
        .send({
          eyebrow: 'OUR CAPABILITIES',
          title: 'SIX CORE SEGMENTS',
          description: 'Industry leading power transmission and fluid systems',
        })
        .expect(200);

      // Create active capability 1
      await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({
          number: '01',
          title: 'Power Transmission',
          slug: 'power-transmission',
          icon: 'gear',
          shortDescription: 'Belts and gears',
          typicalProducts: ['Bearings'],
          sortOrder: 1,
          isActive: true,
        })
        .expect(201);

      // Create active capability 2 (sortOrder 0 - should be first)
      await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({
          number: '00',
          title: 'Fluid Power',
          slug: 'fluid-power',
          icon: 'droplet',
          shortDescription: 'Hydraulics and pneumatics',
          typicalProducts: ['Pumps', 'Valves'],
          sortOrder: 0,
          isActive: true,
        })
        .expect(201);

      // Create inactive capability (should be excluded)
      await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({
          number: '99',
          title: 'Inactive Segment',
          slug: 'inactive-segment',
          sortOrder: 5,
          isActive: false,
        })
        .expect(201);

      // Public call without authentication
      const res = await api().get('/api/v1/public/industrial-capabilities').expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.section).toEqual({
        eyebrow: 'OUR CAPABILITIES',
        title: 'SIX CORE SEGMENTS',
        description: 'Industry leading power transmission and fluid systems',
      });

      expect(res.body.data.segments).toHaveLength(2);
      expect(res.body.data.segments[0].title).toBe('Fluid Power');
      expect(res.body.data.segments[0].sortOrder).toBe(0);
      expect(res.body.data.segments[1].title).toBe('Power Transmission');
      expect(res.body.data.segments[1].sortOrder).toBe(1);

      // Verify no sensitive internal audit or media ID fields exposed
      for (const segment of res.body.data.segments) {
        expect(segment).not.toHaveProperty('imageMediaId');
        expect(segment).not.toHaveProperty('createdById');
        expect(segment).not.toHaveProperty('updatedById');
        expect(segment).not.toHaveProperty('deletedAt');
      }
    });
  });

  describe('RBAC Authorization', () => {
    it('rejects unauthenticated requests to CRM endpoints with 401', async () => {
      await api().get('/api/v1/industrial-capabilities').expect(401);
      await api().post('/api/v1/industrial-capabilities').send({}).expect(401);
      await api().get(`/api/v1/industrial-capabilities/${randomUUID()}`).expect(401);
      await api().patch('/api/v1/industrial-capabilities/reorder').send({}).expect(401);
      await api().get('/api/v1/industrial-capabilities/settings').expect(401);
      await api().patch('/api/v1/industrial-capabilities/settings').send({}).expect(401);
    });

    it('rejects CRM_USER from accessing any industrial capability management endpoints with 403', async () => {
      await api().get('/api/v1/industrial-capabilities').set(crmUser.auth).expect(403);
      await api().post('/api/v1/industrial-capabilities').set(crmUser.auth).send({}).expect(403);
      await api().get(`/api/v1/industrial-capabilities/${randomUUID()}`).set(crmUser.auth).expect(403);
      await api().patch('/api/v1/industrial-capabilities/reorder').set(crmUser.auth).send({}).expect(403);
      await api().get('/api/v1/industrial-capabilities/settings').set(crmUser.auth).expect(403);
      await api().patch('/api/v1/industrial-capabilities/settings').set(crmUser.auth).send({}).expect(403);
    });

    it('allows SALES_MANAGER and SUPER_ADMIN full access', async () => {
      await api().get('/api/v1/industrial-capabilities').set(sales.auth).expect(200);
      await api().get('/api/v1/industrial-capabilities').set(admin.auth).expect(200);
    });
  });
});
