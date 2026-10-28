import { randomUUID } from 'node:crypto';
import type { IndustrialCapability } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { industrialCapabilitiesRepository } from '../src/modules/industrial-capabilities/industrial-capabilities.repository';
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
  describe('Section Settings (Dedicated Table Isolation)', () => {
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

    it('enforces maximum length on settings description (1000 accepted, 1001 rejected)', async () => {
      const maxDesc = 'A'.repeat(1000);
      const overMaxDesc = 'A'.repeat(1001);

      // 1000 chars -> 200 OK
      const okRes = await api()
        .patch('/api/v1/industrial-capabilities/settings')
        .set(admin.auth)
        .send({ description: maxDesc })
        .expect(200);
      expect(okRes.body.data.description).toBe(maxDesc);

      // 1001 chars -> 400 Bad Request
      const badRes = await api()
        .patch('/api/v1/industrial-capabilities/settings')
        .set(admin.auth)
        .send({ description: overMaxDesc })
        .expect(400);
      expect(badRes.body.success).toBe(false);
      expect(badRes.body.error.code).toBe('VALIDATION_ERROR');
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

    it('enforces maximum length on capability description (5000 accepted, 5001 rejected on create and update)', async () => {
      const maxDesc = 'B'.repeat(5000);
      const overMaxDesc = 'B'.repeat(5001);

      // Create with 5000 chars -> 201 OK
      const createOk = await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({ ...validCapability, slug: 'desc-5000-ok', description: maxDesc })
        .expect(201);
      expect(createOk.body.data.description).toBe(maxDesc);

      // Create with 5001 chars -> 400 Bad Request
      const createBad = await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({ ...validCapability, slug: 'desc-5001-bad', description: overMaxDesc })
        .expect(400);
      expect(createBad.body.success).toBe(false);
      expect(createBad.body.error.code).toBe('VALIDATION_ERROR');

      // Update with 5001 chars -> 400 Bad Request
      const updateBad = await api()
        .patch(`/api/v1/industrial-capabilities/${createOk.body.data.id}`)
        .set(admin.auth)
        .send({ description: overMaxDesc })
        .expect(400);
      expect(updateBad.body.success).toBe(false);
      expect(updateBad.body.error.code).toBe('VALIDATION_ERROR');
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

  describe('Soft-Delete & Restore Workflow', () => {
    it('successfully restores a soft-deleted industrial capability with audit metadata and cleared deletedAt', async () => {
      const createRes = await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({
          title: 'Robotics & Automation',
          slug: 'robotics-automation',
          typicalProducts: ['Cobots', 'Grippers'],
        })
        .expect(201);

      const id = createRes.body.data.id;

      // Soft delete
      await api().delete(`/api/v1/industrial-capabilities/${id}`).set(admin.auth).expect(204);

      // Verify soft-deleted
      const deletedRecord = await prisma.industrialCapability.findUniqueOrThrow({ where: { id } });
      expect(deletedRecord.deletedAt).not.toBeNull();

      // Restore via POST /api/v1/industrial-capabilities/:id/restore
      const restoreRes = await api()
        .post(`/api/v1/industrial-capabilities/${id}/restore`)
        .set(admin.auth)
        .expect(200);

      expect(restoreRes.body.success).toBe(true);
      expect(restoreRes.body.data.id).toBe(id);
      expect(restoreRes.body.data.deletedAt).toBeUndefined();

      // Verify DB record is active again and updatedById is tracked
      const restoredInDb = await prisma.industrialCapability.findUniqueOrThrow({ where: { id } });
      expect(restoredInDb.deletedAt).toBeNull();
      expect(restoredInDb.updatedById).toBe(admin.user.id);

      // Verify appears in active list again
      const listRes = await api().get('/api/v1/industrial-capabilities').set(admin.auth).expect(200);
      expect(listRes.body.data.find((c: { id: string }) => c.id === id)).toBeDefined();
    });

    it('rejects restore request for an active (non-deleted) capability with 400', async () => {
      const createRes = await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({
          title: 'Active Segment',
          slug: 'active-segment-restore-test',
        })
        .expect(201);

      const id = createRes.body.data.id;

      const restoreRes = await api()
        .post(`/api/v1/industrial-capabilities/${id}/restore`)
        .set(admin.auth)
        .expect(400);

      expect(restoreRes.body.success).toBe(false);
      expect(restoreRes.body.error.code).toBe(IndustrialCapabilitiesErrorCode.NOT_DELETED);
    });

    it('rejects restore with 409 conflict when another active capability already holds the same slug', async () => {
      const first = await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({
          title: 'Pneumatics',
          slug: 'pneumatics',
        })
        .expect(201);

      // Soft delete the capability
      await api().delete(`/api/v1/industrial-capabilities/${first.body.data.id}`).set(admin.auth).expect(204);

      // Simulate an active capability having the same slug
      const spy = vi.spyOn(industrialCapabilitiesRepository, 'findBySlug').mockResolvedValueOnce({
        id: randomUUID(),
        slug: 'pneumatics',
      } as unknown as IndustrialCapability);

      // Attempt to restore the first capability -> 409 SLUG_CONFLICT
      const restoreRes = await api()
        .post(`/api/v1/industrial-capabilities/${first.body.data.id}/restore`)
        .set(admin.auth)
        .expect(409);

      expect(restoreRes.body.success).toBe(false);
      expect(restoreRes.body.error.code).toBe(IndustrialCapabilitiesErrorCode.SLUG_CONFLICT);

      spy.mockRestore();
    });

    it('forbids CRM_USER from restoring industrial capabilities with 403', async () => {
      const created = await api()
        .post('/api/v1/industrial-capabilities')
        .set(admin.auth)
        .send({
          title: 'Restricted Restore',
          slug: 'restricted-restore',
        })
        .expect(201);

      await api()
        .delete(`/api/v1/industrial-capabilities/${created.body.data.id}`)
        .set(admin.auth)
        .expect(204);

      await api()
        .post(`/api/v1/industrial-capabilities/${created.body.data.id}/restore`)
        .set(crmUser.auth)
        .expect(403);
    });
  });

  describe('Homepage CMS Isolation (No Ownership Leak)', () => {
    it('proves IC settings and homepage_sections are strictly isolated', async () => {
      // 1. Configure IC settings via IC API
      const patchRes = await api()
        .patch('/api/v1/industrial-capabilities/settings')
        .set(admin.auth)
        .send({
          eyebrow: 'ISOLATED EYEBROW',
          title: 'ISOLATED TITLE',
          description: 'Isolated description text',
        })
        .expect(200);

      expect(patchRes.body.success).toBe(true);

      // 2. Fetch IC settings via IC API -> works
      const icGetRes = await api()
        .get('/api/v1/industrial-capabilities/settings')
        .set(sales.auth)
        .expect(200);
      expect(icGetRes.body.data.eyebrow).toBe('ISOLATED EYEBROW');

      // 3. CRM_USER cannot access IC settings -> 403
      await api().get('/api/v1/industrial-capabilities/settings').set(crmUser.auth).expect(403);
      await api().patch('/api/v1/industrial-capabilities/settings').set(crmUser.auth).send({}).expect(403);

      // 4. Create an active homepage section (e.g. PROMO_BANNER)
      const bannerMedia = await prisma.media.create({
        data: {
          fileName: 'banner.jpg',
          storageKey: 'banner.jpg',
          publicUrl: 'https://cdn.example.com/banner.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1024,
        },
      });

      await api()
        .post('/api/v1/homepage/sections')
        .set(admin.auth)
        .send({
          type: 'PROMO_BANNER',
          sortOrder: 0,
          isActive: true,
          content: {
            heading: 'Homepage Promo',
            mediaId: bannerMedia.id,
            ctaLabel: 'Learn More',
            ctaUrl: '/promo',
          },
        })
        .expect(201);

      // 5. GET /api/v1/homepage/sections never returns IC settings
      const homepageSectionsRes = await api().get('/api/v1/homepage/sections').set(admin.auth).expect(200);
      expect(homepageSectionsRes.body.success).toBe(true);
      const sections = homepageSectionsRes.body.data;
      expect(sections.every((s: { type: string }) => s.type !== 'INDUSTRIAL_CAPABILITIES')).toBe(true);
      expect(sections.find((s: { title?: string }) => s.title === 'ISOLATED TITLE')).toBeUndefined();

      // Retrieve the dedicated IC settings DB record
      const icSettingsDb = await prisma.industrialCapabilitySettings.findFirstOrThrow();

      // 6. Homepage reorder cannot touch or reorder IC settings
      await api()
        .patch('/api/v1/homepage/sections/reorder')
        .set(admin.auth)
        .send({ sectionIds: [icSettingsDb.id] })
        .expect(400);

      // 7. Homepage update cannot mutate IC settings
      await api()
        .patch(`/api/v1/homepage/sections/${icSettingsDb.id}`)
        .set(admin.auth)
        .send({ isActive: false })
        .expect(404);

      // 8. Homepage delete cannot delete IC settings
      await api().delete(`/api/v1/homepage/sections/${icSettingsDb.id}`).set(admin.auth).expect(404);

      // Verify IC settings remains intact in DB
      const icSettingsAfter = await prisma.industrialCapabilitySettings.findFirstOrThrow();
      expect(icSettingsAfter.eyebrow).toBe('ISOLATED EYEBROW');
      expect(icSettingsAfter.title).toBe('ISOLATED TITLE');
    });

    it('verifies user without industrial-capabilities permissions cannot manage IC settings', async () => {
      // CRM_USER has no INDUSTRIAL_CAPABILITIES permissions
      await api().get('/api/v1/industrial-capabilities/settings').set(crmUser.auth).expect(403);
      await api()
        .patch('/api/v1/industrial-capabilities/settings')
        .set(crmUser.auth)
        .send({ title: 'Hacked' })
        .expect(403);
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
