import type { EnquiryStatus } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './helpers/app';
import { signInAs, type Session } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

let admin: Session;
let sales: Session;

beforeEach(async () => {
  await resetDatabase();
  admin = await signInAs('SUPER_ADMIN');
  sales = await signInAs('SALES_MANAGER', { name: 'Sales Manager One' });
});

async function createTestEnquiry(
  overrides: {
    name?: string;
    company?: string | null;
    email?: string;
    mobile?: string;
    status?: EnquiryStatus;
    assignedToId?: string | null;
    createdAt?: Date;
    deletedAt?: Date | null;
    salesNotes?: string | null;
    lineItemsCount?: number;
  } = {}
) {
  const {
    name = 'Test Contact',
    company = 'Acme Corp',
    email = 'contact@acme.test',
    mobile = '+91 98765 43210',
    status = 'NEW',
    assignedToId = null,
    createdAt = new Date(),
    deletedAt = null,
    salesNotes = 'Confidential deal notes',
    lineItemsCount = 2,
  } = overrides;

  return prisma.enquiry.create({
    data: {
      name,
      company,
      email,
      mobile,
      status,
      assignedToId,
      createdAt,
      deletedAt,
      salesNotes,
      lineItems: {
        create: Array.from({ length: lineItemsCount }, (_, i) => ({
          productId: `prod-${i + 1}`,
          sku: `SKU-${i + 1}`,
          productName: `Item ${i + 1}`,
          quantity: (i + 1) * 2,
          position: i,
        })),
      },
    },
    include: { lineItems: true, assignedTo: true },
  });
}

describe('Dashboard Analytics Authentication & RBAC', () => {
  it('returns 401 unauthenticated for all dashboard endpoints', async () => {
    await api().get('/api/v1/dashboard/summary').expect(401);
    await api().get('/api/v1/dashboard/trends').expect(401);
    await api().get('/api/v1/dashboard/recent-enquiries').expect(401);
  });

  it('allows access for SUPER_ADMIN', async () => {
    await api().get('/api/v1/dashboard/summary').set(admin.auth).expect(200);
    await api().get('/api/v1/dashboard/trends').set(admin.auth).expect(200);
    await api().get('/api/v1/dashboard/recent-enquiries').set(admin.auth).expect(200);
  });

  it('allows access for SALES_MANAGER', async () => {
    await api().get('/api/v1/dashboard/summary').set(sales.auth).expect(200);
    await api().get('/api/v1/dashboard/trends').set(sales.auth).expect(200);
    await api().get('/api/v1/dashboard/recent-enquiries').set(sales.auth).expect(200);
  });

  it('rejects deactivated or deleted users', async () => {
    const session = await signInAs('SALES_MANAGER');
    await prisma.user.update({
      where: { id: session.user.id },
      data: { isActive: false },
    });
    await api().get('/api/v1/dashboard/summary').set(session.auth).expect(401);

    const session2 = await signInAs('SALES_MANAGER');
    await prisma.user.update({
      where: { id: session2.user.id },
      data: { deletedAt: new Date() },
    });
    await api().get('/api/v1/dashboard/summary').set(session2.auth).expect(401);
  });
});

describe('GET /api/v1/dashboard/summary', () => {
  it('returns zeroes on an empty database', async () => {
    const res = await api().get('/api/v1/dashboard/summary').set(sales.auth).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      totalEnquiries: 0,
      unassigned: 0,
      new: 0,
      assigned: 0,
      contacted: 0,
      quotationSent: 0,
      negotiation: 0,
      closedWon: 0,
      closedLost: 0,
      pipeline: [
        { status: 'NEW', count: 0 },
        { status: 'ASSIGNED', count: 0 },
        { status: 'CONTACTED', count: 0 },
        { status: 'QUOTATION_SENT', count: 0 },
        { status: 'NEGOTIATION', count: 0 },
        { status: 'CLOSED_WON', count: 0 },
        { status: 'CLOSED_LOST', count: 0 },
      ],
    });
  });

  it('accurately aggregates status counts and unassigned counts', async () => {
    await createTestEnquiry({ status: 'NEW', assignedToId: null });
    await createTestEnquiry({ status: 'NEW', assignedToId: null });
    await createTestEnquiry({ status: 'ASSIGNED', assignedToId: sales.user.id });
    await createTestEnquiry({ status: 'CONTACTED', assignedToId: sales.user.id });
    await createTestEnquiry({ status: 'QUOTATION_SENT', assignedToId: sales.user.id });
    await createTestEnquiry({ status: 'NEGOTIATION', assignedToId: sales.user.id });
    await createTestEnquiry({ status: 'CLOSED_WON', assignedToId: sales.user.id });
    await createTestEnquiry({ status: 'CLOSED_LOST', assignedToId: null });

    const res = await api().get('/api/v1/dashboard/summary').set(sales.auth).expect(200);

    expect(res.body.data).toMatchObject({
      totalEnquiries: 8,
      unassigned: 3, // 2 NEW + 1 CLOSED_LOST with null assignedToId
      new: 2,
      assigned: 1,
      contacted: 1,
      quotationSent: 1,
      negotiation: 1,
      closedWon: 1,
      closedLost: 1,
    });

    expect(res.body.data.pipeline).toEqual([
      { status: 'NEW', count: 2 },
      { status: 'ASSIGNED', count: 1 },
      { status: 'CONTACTED', count: 1 },
      { status: 'QUOTATION_SENT', count: 1 },
      { status: 'NEGOTIATION', count: 1 },
      { status: 'CLOSED_WON', count: 1 },
      { status: 'CLOSED_LOST', count: 1 },
    ]);
  });

  it('excludes soft-deleted enquiries from summary counts', async () => {
    await createTestEnquiry({ status: 'NEW' });
    await createTestEnquiry({ status: 'NEW', deletedAt: new Date() });

    const res = await api().get('/api/v1/dashboard/summary').set(sales.auth).expect(200);

    expect(res.body.data.totalEnquiries).toBe(1);
    expect(res.body.data.new).toBe(1);
  });

  it('filters summary metrics by createdAt date range', async () => {
    await createTestEnquiry({ status: 'NEW', createdAt: new Date('2026-09-01T10:00:00Z') });
    await createTestEnquiry({ status: 'CONTACTED', createdAt: new Date('2026-09-15T12:00:00Z') });
    await createTestEnquiry({ status: 'CLOSED_WON', createdAt: new Date('2026-09-30T18:00:00Z') });
    await createTestEnquiry({ status: 'NEW', createdAt: new Date('2026-10-05T09:00:00Z') });

    // Range September 2026 only
    const sepRes = await api()
      .get('/api/v1/dashboard/summary?from=2026-09-01&to=2026-09-30')
      .set(sales.auth)
      .expect(200);

    expect(sepRes.body.data.totalEnquiries).toBe(3);
    expect(sepRes.body.data.new).toBe(1);
    expect(sepRes.body.data.contacted).toBe(1);
    expect(sepRes.body.data.closedWon).toBe(1);

    // Range October 2026 only
    const octRes = await api()
      .get('/api/v1/dashboard/summary?from=2026-10-01&to=2026-10-31')
      .set(sales.auth)
      .expect(200);

    expect(octRes.body.data.totalEnquiries).toBe(1);
    expect(octRes.body.data.new).toBe(1);
  });

  it('validates date range query parameters strictly', async () => {
    await api().get('/api/v1/dashboard/summary?from=invalid-date').set(sales.auth).expect(400);
    await api().get('/api/v1/dashboard/summary?to=invalid-date').set(sales.auth).expect(400);
    await api().get('/api/v1/dashboard/summary?from=2026-10-10&to=2026-10-01').set(sales.auth).expect(400);
  });
});

describe('GET /api/v1/dashboard/trends', () => {
  it('aggregates trends grouped by day in UTC', async () => {
    await createTestEnquiry({ createdAt: new Date('2026-09-05T02:00:00Z') });
    await createTestEnquiry({ createdAt: new Date('2026-09-05T14:30:00Z') });
    await createTestEnquiry({ createdAt: new Date('2026-09-06T10:00:00Z') });
    await createTestEnquiry({ createdAt: new Date('2026-09-08T08:00:00Z') });

    const res = await api()
      .get('/api/v1/dashboard/trends?from=2026-09-01&to=2026-09-30&groupBy=day')
      .set(sales.auth)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([
      { period: '2026-09-05', count: 2 },
      { period: '2026-09-06', count: 1 },
      { period: '2026-09-08', count: 1 },
    ]);
  });

  it('defaults to day grouping when groupBy is omitted', async () => {
    await createTestEnquiry({ createdAt: new Date('2026-09-10T11:00:00Z') });

    const res = await api()
      .get('/api/v1/dashboard/trends?from=2026-09-01&to=2026-09-30')
      .set(sales.auth)
      .expect(200);

    expect(res.body.data).toEqual([{ period: '2026-09-10', count: 1 }]);
  });

  it('aggregates trends grouped by month', async () => {
    await createTestEnquiry({ createdAt: new Date('2026-07-15T10:00:00Z') });
    await createTestEnquiry({ createdAt: new Date('2026-08-01T10:00:00Z') });
    await createTestEnquiry({ createdAt: new Date('2026-08-20T10:00:00Z') });
    await createTestEnquiry({ createdAt: new Date('2026-09-10T10:00:00Z') });

    const res = await api()
      .get('/api/v1/dashboard/trends?from=2026-07-01&to=2026-09-30&groupBy=month')
      .set(sales.auth)
      .expect(200);

    expect(res.body.data).toEqual([
      { period: '2026-07', count: 1 },
      { period: '2026-08', count: 2 },
      { period: '2026-09', count: 1 },
    ]);
  });

  it('aggregates trends grouped by week', async () => {
    await createTestEnquiry({ createdAt: new Date('2026-09-01T10:00:00Z') });
    await createTestEnquiry({ createdAt: new Date('2026-09-02T10:00:00Z') });

    const res = await api()
      .get('/api/v1/dashboard/trends?from=2026-09-01&to=2026-09-15&groupBy=week')
      .set(sales.auth)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].count).toBe(2);
    expect(res.body.data[0].period).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('excludes soft-deleted enquiries from trends', async () => {
    await createTestEnquiry({
      createdAt: new Date('2026-09-05T10:00:00Z'),
      deletedAt: new Date(),
    });
    await createTestEnquiry({ createdAt: new Date('2026-09-05T12:00:00Z') });

    const res = await api()
      .get('/api/v1/dashboard/trends?from=2026-09-01&to=2026-09-30&groupBy=day')
      .set(sales.auth)
      .expect(200);

    expect(res.body.data).toEqual([{ period: '2026-09-05', count: 1 }]);
  });

  it('rejects invalid groupBy and malformed parameters', async () => {
    await api().get('/api/v1/dashboard/trends?groupBy=year').set(sales.auth).expect(400);

    await api().get('/api/v1/dashboard/trends?groupBy=hourly').set(sales.auth).expect(400);

    await api().get('/api/v1/dashboard/trends?from=2026-09-30&to=2026-09-01').set(sales.auth).expect(400);
  });
});

describe('GET /api/v1/dashboard/recent-enquiries', () => {
  it('returns recent enquiries sorted by newest first with safe fields', async () => {
    const e1 = await createTestEnquiry({
      name: 'Alpha Customer',
      company: 'Alpha LLC',
      status: 'NEW',
      createdAt: new Date('2026-09-20T10:00:00Z'),
      lineItemsCount: 3,
    });

    const e2 = await createTestEnquiry({
      name: 'Beta Customer',
      company: 'Beta Inc',
      status: 'ASSIGNED',
      assignedToId: sales.user.id,
      createdAt: new Date('2026-09-25T14:00:00Z'),
      lineItemsCount: 1,
    });

    const res = await api().get('/api/v1/dashboard/recent-enquiries').set(sales.auth).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);

    // Newest first
    expect(res.body.data[0]).toEqual({
      id: e2.id,
      name: 'Beta Customer',
      company: 'Beta Inc',
      status: 'ASSIGNED',
      assignedTo: { id: sales.user.id, name: 'Sales Manager One' },
      itemCount: 1,
      createdAt: '2026-09-25T14:00:00.000Z',
    });

    expect(res.body.data[1]).toEqual({
      id: e1.id,
      name: 'Alpha Customer',
      company: 'Alpha LLC',
      status: 'NEW',
      assignedTo: null,
      itemCount: 3,
      createdAt: '2026-09-20T10:00:00.000Z',
    });
  });

  it('enforces limit parameter and defaults to 10', async () => {
    for (let i = 1; i <= 15; i++) {
      await createTestEnquiry({ name: `Customer ${i}` });
    }

    const defaultRes = await api().get('/api/v1/dashboard/recent-enquiries').set(sales.auth).expect(200);
    expect(defaultRes.body.data).toHaveLength(10);

    const customRes = await api()
      .get('/api/v1/dashboard/recent-enquiries?limit=5')
      .set(sales.auth)
      .expect(200);
    expect(customRes.body.data).toHaveLength(5);
  });

  it('validates limit constraints (1 to 20)', async () => {
    await api().get('/api/v1/dashboard/recent-enquiries?limit=0').set(sales.auth).expect(400);
    await api().get('/api/v1/dashboard/recent-enquiries?limit=21').set(sales.auth).expect(400);
    await api().get('/api/v1/dashboard/recent-enquiries?limit=-5').set(sales.auth).expect(400);
    await api().get('/api/v1/dashboard/recent-enquiries?limit=abc').set(sales.auth).expect(400);
  });

  it('excludes soft-deleted enquiries from recent list', async () => {
    const live = await createTestEnquiry({ name: 'Live Enquiry' });
    await createTestEnquiry({ name: 'Deleted Enquiry', deletedAt: new Date() });

    const res = await api().get('/api/v1/dashboard/recent-enquiries').set(sales.auth).expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(live.id);
  });

  it('strictly ensures no sensitive internal notes, passwords or auth data leak', async () => {
    await createTestEnquiry({
      name: 'PII Check',
      salesNotes: 'Super secret private negotiation notes',
    });

    const res = await api().get('/api/v1/dashboard/recent-enquiries').set(sales.auth).expect(200);
    const item = res.body.data[0];

    // Assert sensitive fields are undefined/absent
    expect(item).not.toHaveProperty('salesNotes');
    expect(item).not.toHaveProperty('internalNotes');
    expect(item).not.toHaveProperty('email');
    expect(item).not.toHaveProperty('mobile');
    expect(item).not.toHaveProperty('message');
    expect(item).not.toHaveProperty('sourceIp');
    expect(item).not.toHaveProperty('deletedAt');
    expect(item).not.toHaveProperty('createdById');
    expect(item).not.toHaveProperty('updatedById');
    expect(item).not.toHaveProperty('password');
    expect(item).not.toHaveProperty('passwordHash');
    expect(item).not.toHaveProperty('refreshToken');
  });
});
