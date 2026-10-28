import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './helpers/app';
import { signInAs, type Session } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

let admin: Session;
let sales: Session;
let crmUser: Session;

beforeEach(async () => {
  await resetDatabase();
  admin = await signInAs('SUPER_ADMIN');
  sales = await signInAs('SALES_MANAGER', { email: 'sales@metro.test' });
  crmUser = await signInAs('CRM_USER', { email: 'crmuser@metro.test', name: 'Regular CRM User' });
});

describe('Regular CRM User (`CRM_USER`) Enquiries-Only RBAC Enforcement', () => {
  it('allows CRM_USER to access enquiries list and detail', async () => {
    // Create an enquiry directly in DB or via public endpoint
    const enquiry = await prisma.enquiry.create({
      data: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        mobile: '+91 99999 88888',
        message: 'Need a price quote',
        status: 'NEW',
        lineItems: {
          create: [{ productId: 'p1', sku: 'SKU-1', productName: 'Item 1', quantity: 2 }],
        },
      },
    });

    // List enquiries -> 200
    const listRes = await api().get('/api/v1/enquiries').set(crmUser.auth).expect(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

    // Detail enquiry -> 200
    const detailRes = await api().get(`/api/v1/enquiries/${enquiry.id}`).set(crmUser.auth).expect(200);
    expect(detailRes.body.success).toBe(true);
    expect(detailRes.body.data.id).toBe(enquiry.id);
  });

  it('allows CRM_USER to update enquiry status and record follow-ups', async () => {
    const enquiry = await prisma.enquiry.create({
      data: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        mobile: '+91 99999 88888',
        message: 'Need a price quote',
        status: 'NEW',
      },
    });

    // Update status -> 200
    const statusRes = await api()
      .post(`/api/v1/enquiries/${enquiry.id}/status`)
      .set(crmUser.auth)
      .send({ status: 'CONTACTED', note: 'Spoke with customer' })
      .expect(200);
    expect(statusRes.body.success).toBe(true);
    expect(statusRes.body.data.status).toBe('CONTACTED');

    // Add follow up -> 201
    const followUpRes = await api()
      .post(`/api/v1/enquiries/${enquiry.id}/follow-ups`)
      .set(crmUser.auth)
      .send({ note: 'Called client back with stock details' })
      .expect(201);
    expect(followUpRes.body.success).toBe(true);
  });

  it.each([
    ['Products CRM list', 'get', '/api/v1/products'],
    ['Products CRM create', 'post', '/api/v1/products'],
    ['Categories CRM list', 'get', '/api/v1/categories'],
    ['Categories CRM create', 'post', '/api/v1/categories'],
    ['Brands CRM list', 'get', '/api/v1/brands'],
    ['Brands CRM create', 'post', '/api/v1/brands'],
    ['Users CRM list', 'get', '/api/v1/users'],
    ['Users CRM create', 'post', '/api/v1/users'],
    ['Homepage sections CRM list', 'get', '/api/v1/homepage/sections'],
    ['Media list', 'get', '/api/v1/media'],
    ['Industrial Capabilities CRM list', 'get', '/api/v1/industrial-capabilities'],
    ['Industrial Capabilities CRM create', 'post', '/api/v1/industrial-capabilities'],
    ['Industrial Capabilities Settings', 'get', '/api/v1/industrial-capabilities/settings'],
    ['Dashboard Summary', 'get', '/api/v1/dashboard/summary'],
    ['Dashboard Trends', 'get', '/api/v1/dashboard/trends'],
    ['Enquiries Dashboard', 'get', '/api/v1/enquiries/dashboard'],
  ])('forbids CRM_USER from accessing %s with 403', async (_label, method, path) => {
    const req = method === 'post' ? api().post(path).send({}) : api().get(path);
    const res = await req.set(crmUser.auth).expect(403);
    expect(res.body.success).toBe(false);
  });

  it('preserves full access for SUPER_ADMIN and standard management for SALES_MANAGER', async () => {
    // Both can access products
    await api().get('/api/v1/products').set(admin.auth).expect(200);
    await api().get('/api/v1/products').set(sales.auth).expect(200);

    // Both can access categories
    await api().get('/api/v1/categories').set(admin.auth).expect(200);
    await api().get('/api/v1/categories').set(sales.auth).expect(200);

    // Both can access industrial capabilities
    await api().get('/api/v1/industrial-capabilities').set(admin.auth).expect(200);
    await api().get('/api/v1/industrial-capabilities').set(sales.auth).expect(200);

    // Both can access enquiries
    await api().get('/api/v1/enquiries').set(admin.auth).expect(200);
    await api().get('/api/v1/enquiries').set(sales.auth).expect(200);

    // Both can access dashboard
    await api().get('/api/v1/dashboard/summary').set(admin.auth).expect(200);
    await api().get('/api/v1/dashboard/summary').set(sales.auth).expect(200);
  });
});
