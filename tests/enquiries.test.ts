import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './helpers/app';
import { createUser, signInAs, type Session } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

const validEnquiry = {
  name: 'Priya Sharma',
  company: 'Sharma Industries',
  email: 'Priya@Sharma.test',
  mobile: '+91 98765 43210',
  city: 'Hyderabad',
  message: 'Need a quote for pumps',
  lineItems: [
    { productId: 'prod-1', sku: 'PUMP-100', productName: 'Pump 100', quantity: 5 },
    { productId: 'prod-2', sku: 'VALVE-20', quantity: 10 },
  ],
};

const submit = (body: object = validEnquiry) => api().post('/api/v1/public/enquiries').send(body);

async function submitEnquiry(overrides: object = {}): Promise<string> {
  const res = await submit({ ...validEnquiry, ...overrides }).expect(201);
  return res.body.data.id;
}

let admin: Session;
let sales: Session;

beforeEach(async () => {
  await resetDatabase();
  admin = await signInAs('SUPER_ADMIN');
  sales = await signInAs('SALES_MANAGER', { name: 'Sales One' });
});

describe('POST /public/enquiries', () => {
  it('stores the enquiry with its line items and returns a minimal receipt', async () => {
    const res = await submit().expect(201);

    expect(res.body.data).toEqual({ id: expect.any(String), status: 'NEW', createdAt: expect.any(String) });
    const stored = await prisma.enquiry.findUniqueOrThrow({
      where: { id: res.body.data.id },
      include: { lineItems: true, statusChanges: true },
    });
    expect(stored.email).toBe('priya@sharma.test');
    expect(stored.lineItems).toHaveLength(2);
    expect(stored.statusChanges).toEqual([expect.objectContaining({ fromStatus: null, toStatus: 'NEW' })]);
  });

  it('does not require authentication and accepts the website origin', async () => {
    const res = await submit().set('Origin', 'http://website.test').expect(201);

    expect(res.headers['access-control-allow-origin']).toBe('http://website.test');
  });

  it.each([
    ['no line items', { lineItems: [] }],
    ['too many line items', { lineItems: Array.from({ length: 51 }, () => validEnquiry.lineItems[0]) }],
    ['zero quantity', { lineItems: [{ productId: 'p', sku: 's', quantity: 0 }] }],
    ['fractional quantity', { lineItems: [{ productId: 'p', sku: 's', quantity: 1.5 }] }],
    ['quantity overflow', { lineItems: [{ productId: 'p', sku: 's', quantity: 99_999_999_999 }] }],
    ['company as number', { company: 123 }],
    ['invalid email', { email: 'not-an-email' }],
    ['invalid mobile', { mobile: 'call me' }],
    ['too few digits', { mobile: '12-34' }],
    ['message too long', { message: 'x'.repeat(2001) }],
    ['object injection', { name: { contains: 'a' } }],
  ])('rejects %s with 400', async (_case, override) => {
    const res = await submit({ ...validEnquiry, ...override }).expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ignores fields the website must not set', async () => {
    const id = await submitEnquiry({ status: 'CLOSED_WON', assignedToId: admin.user.id, salesNotes: 'x' });

    const stored = await prisma.enquiry.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({ status: 'NEW', assignedToId: null, salesNotes: null });
  });
});

describe('GET /enquiries', () => {
  it('requires authentication and the read permission', async () => {
    await api().get('/api/v1/enquiries').expect(401);
    await api().get('/api/v1/enquiries').set(sales.auth).expect(200);
  });

  it('lists summaries with pagination, newest first', async () => {
    await submitEnquiry({ name: 'First Customer' });
    await submitEnquiry({ name: 'Second Customer' });

    const res = await api().get('/api/v1/enquiries?limit=1').set(sales.auth).expect(200);

    expect(res.body.data).toEqual([
      expect.objectContaining({ name: 'Second Customer', lineItemCount: 2, assignedTo: null, status: 'NEW' }),
    ]);
    expect(res.body.meta.pagination).toMatchObject({ total: 2, totalPages: 2, hasNextPage: true });
  });

  it('searches name, company, email, mobile and SKU', async () => {
    await submitEnquiry({ name: 'Arjun Rao', lineItems: [{ productId: 'p', sku: 'MOTOR-9', quantity: 1 }] });
    await submitEnquiry({ name: 'Meera Iyer', company: 'Iyer Steels' });

    const bySku = await api().get('/api/v1/enquiries?search=motor-9').set(sales.auth).expect(200);
    const byCompany = await api().get('/api/v1/enquiries?search=steels').set(sales.auth).expect(200);

    expect(bySku.body.data.map((e: { name: string }) => e.name)).toEqual(['Arjun Rao']);
    expect(byCompany.body.data.map((e: { name: string }) => e.name)).toEqual(['Meera Iyer']);
  });

  it('filters by status list, assignee and date range', async () => {
    const assigned = await submitEnquiry({ name: 'Assigned One' });
    await submitEnquiry({ name: 'Unassigned One' });
    await api()
      .put(`/api/v1/enquiries/${assigned}/assignee`)
      .set(sales.auth)
      .send({ assignedToId: sales.user.id })
      .expect(200);

    const byStatus = await api()
      .get('/api/v1/enquiries?status=ASSIGNED,CONTACTED')
      .set(sales.auth)
      .expect(200);
    const unassigned = await api().get('/api/v1/enquiries?assignedTo=unassigned').set(sales.auth).expect(200);
    const mine = await api().get(`/api/v1/enquiries?assignedTo=${sales.user.id}`).set(sales.auth).expect(200);
    const today = new Date().toISOString().slice(0, 10);
    const inRange = await api()
      .get(`/api/v1/enquiries?from=${today}&to=${today}`)
      .set(sales.auth)
      .expect(200);
    const past = await api().get('/api/v1/enquiries?to=2020-01-01').set(sales.auth).expect(200);

    expect(byStatus.body.data.map((e: { name: string }) => e.name)).toEqual(['Assigned One']);
    expect(unassigned.body.data.map((e: { name: string }) => e.name)).toEqual(['Unassigned One']);
    expect(mine.body.data.map((e: { name: string }) => e.name)).toEqual(['Assigned One']);
    expect(inRange.body.meta.pagination.total).toBe(2);
    expect(past.body.meta.pagination.total).toBe(0);
  });

  it.each([
    'status=OPEN',
    'from=2026-02-31',
    'from=2026-03-02&to=2026-03-01',
    'assignedTo=someone',
    'limit=500',
    'page=0',
    'search=a&search=b',
    'sortBy=password',
  ])('rejects invalid query %s', async (query) => {
    await api().get(`/api/v1/enquiries?${query}`).set(sales.auth).expect(400);
  });
});

describe('GET /enquiries/:id', () => {
  it('returns the full detail', async () => {
    const id = await submitEnquiry();

    const res = await api().get(`/api/v1/enquiries/${id}`).set(sales.auth).expect(200);

    expect(res.body.data).toMatchObject({
      id,
      status: 'NEW',
      message: 'Need a quote for pumps',
      allowedStatusTransitions: ['CONTACTED', 'CLOSED_LOST'],
      lineItems: [
        expect.objectContaining({ sku: 'PUMP-100', productName: 'Pump 100', quantity: 5 }),
        expect.objectContaining({ sku: 'VALVE-20', productName: null, quantity: 10 }),
      ],
      followUps: [],
      statusHistory: [expect.objectContaining({ toStatus: 'NEW', changedBy: null })],
    });
    expect(res.body.data).not.toHaveProperty('sourceIp');
  });

  it('returns 404 for unknown and deleted enquiries', async () => {
    const id = await submitEnquiry();
    await api().delete(`/api/v1/enquiries/${id}`).set(admin.auth).expect(204);

    await api().get(`/api/v1/enquiries/${id}`).set(sales.auth).expect(404);
    await api().get('/api/v1/enquiries/00000000-0000-4000-8000-000000000000').set(sales.auth).expect(404);
    await api().get('/api/v1/enquiries/abc').set(sales.auth).expect(400);
  });
});

describe('assignment', () => {
  it('assigning moves NEW to ASSIGNED and unassigning moves it back', async () => {
    const id = await submitEnquiry();

    const assigned = await api()
      .put(`/api/v1/enquiries/${id}/assignee`)
      .set(sales.auth)
      .send({ assignedToId: sales.user.id })
      .expect(200);
    expect(assigned.body.data).toMatchObject({
      status: 'ASSIGNED',
      assignedTo: { id: sales.user.id, name: 'Sales One' },
    });

    const unassigned = await api()
      .put(`/api/v1/enquiries/${id}/assignee`)
      .set(sales.auth)
      .send({ assignedToId: null })
      .expect(200);
    expect(unassigned.body.data).toMatchObject({ status: 'NEW', assignedTo: null });
    expect(unassigned.body.data.statusHistory.map((h: { toStatus: string }) => h.toStatus)).toEqual([
      'NEW',
      'ASSIGNED',
      'NEW',
    ]);
  });

  it('rejects inactive, deleted or unknown assignees', async () => {
    const id = await submitEnquiry();
    const inactive = await createUser({ isActive: false });
    const deleted = await createUser({ deletedAt: new Date() });

    for (const assignedToId of [inactive.id, deleted.id, '00000000-0000-4000-8000-000000000000']) {
      const res = await api()
        .put(`/api/v1/enquiries/${id}/assignee`)
        .set(sales.auth)
        .send({ assignedToId })
        .expect(400);
      expect(res.body.error.code).toBe('ENQUIRY_ASSIGNEE_UNAVAILABLE');
    }
  });

  it('refuses to reassign closed enquiries', async () => {
    const id = await submitEnquiry();
    await api()
      .post(`/api/v1/enquiries/${id}/status`)
      .set(sales.auth)
      .send({ status: 'CLOSED_LOST' })
      .expect(200);

    const res = await api()
      .put(`/api/v1/enquiries/${id}/assignee`)
      .set(sales.auth)
      .send({ assignedToId: sales.user.id })
      .expect(409);
    expect(res.body.error.code).toBe('ENQUIRY_CLOSED');
  });
});

describe('status changes', () => {
  const changeStatus = (id: string, status: string, note?: string) =>
    api().post(`/api/v1/enquiries/${id}/status`).set(sales.auth).send({ status, note });

  it('follows the pipeline and records who changed what', async () => {
    const id = await submitEnquiry();

    await changeStatus(id, 'CONTACTED', 'Called the customer').expect(200);
    await changeStatus(id, 'QUOTATION_SENT').expect(200);
    const won = await changeStatus(id, 'CLOSED_WON').expect(200);

    expect(won.body.data).toMatchObject({ status: 'CLOSED_WON', allowedStatusTransitions: [] });
    expect(won.body.data.closedAt).not.toBeNull();
    expect(won.body.data.statusHistory[1]).toMatchObject({
      fromStatus: 'NEW',
      toStatus: 'CONTACTED',
      note: 'Called the customer',
      changedBy: { id: sales.user.id, name: 'Sales One' },
    });
  });

  it('rejects transitions outside the pipeline', async () => {
    const id = await submitEnquiry();

    const skip = await changeStatus(id, 'CLOSED_WON').expect(409);
    expect(skip.body.error).toMatchObject({
      code: 'ENQUIRY_INVALID_STATUS_TRANSITION',
      details: { from: 'NEW', to: 'CLOSED_WON', allowed: ['CONTACTED', 'CLOSED_LOST'] },
    });
    await changeStatus(id, 'ASSIGNED').expect(409);
  });

  it('allows reopening a lost enquiry but not a won one', async () => {
    const lost = await submitEnquiry();
    await changeStatus(lost, 'CLOSED_LOST').expect(200);
    const reopened = await changeStatus(lost, 'CONTACTED').expect(200);
    expect(reopened.body.data.closedAt).toBeNull();

    const won = await submitEnquiry();
    await changeStatus(won, 'CONTACTED').expect(200);
    await changeStatus(won, 'CLOSED_WON').expect(200);
    await changeStatus(won, 'CONTACTED').expect(409);
  });

  it('rejects unknown statuses', async () => {
    const id = await submitEnquiry();

    await changeStatus(id, 'DONE').expect(400);
  });
});

describe('notes and follow-ups', () => {
  it('updates sales notes', async () => {
    const id = await submitEnquiry();

    const res = await api()
      .patch(`/api/v1/enquiries/${id}`)
      .set(sales.auth)
      .send({ salesNotes: 'Prefers email' })
      .expect(200);

    expect(res.body.data.salesNotes).toBe('Prefers email');
    const row = await prisma.enquiry.findUniqueOrThrow({ where: { id } });
    expect(row.updatedById).toBe(sales.user.id);
  });

  it('adds follow-ups attributed to the caller', async () => {
    const id = await submitEnquiry();

    const res = await api()
      .post(`/api/v1/enquiries/${id}/follow-ups`)
      .set(sales.auth)
      .send({ note: '  Sent brochure  ' })
      .expect(201);

    expect(res.body.data).toMatchObject({ note: 'Sent brochure', author: { id: sales.user.id } });
    const detail = await api().get(`/api/v1/enquiries/${id}`).set(sales.auth).expect(200);
    expect(detail.body.data.followUps).toHaveLength(1);
  });

  it('rejects empty notes and unknown enquiries', async () => {
    const id = await submitEnquiry();

    await api().post(`/api/v1/enquiries/${id}/follow-ups`).set(sales.auth).send({ note: '   ' }).expect(400);
    await api()
      .post('/api/v1/enquiries/00000000-0000-4000-8000-000000000000/follow-ups')
      .set(sales.auth)
      .send({ note: 'hello' })
      .expect(404);
  });
});

describe('DELETE /enquiries/:id', () => {
  it('is reserved for Super Admins and soft deletes', async () => {
    const id = await submitEnquiry();

    await api().delete(`/api/v1/enquiries/${id}`).set(sales.auth).expect(403);
    await api().delete(`/api/v1/enquiries/${id}`).set(admin.auth).expect(204);

    const row = await prisma.enquiry.findUniqueOrThrow({ where: { id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.updatedById).toBe(admin.user.id);
    const list = await api().get('/api/v1/enquiries').set(admin.auth).expect(200);
    expect(list.body.meta.pagination.total).toBe(0);
  });
});

describe('public endpoint protection', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function freshApp(env: Record<string, string>) {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.resetModules();
    const { createApp } = await import('../src/app');
    return supertest(createApp());
  }

  it('requires a valid captcha token when a provider is configured', async () => {
    const agent = await freshApp({ CAPTCHA_PROVIDER: 'turnstile', CAPTCHA_SECRET_KEY: 'secret' });

    const missing = await agent.post('/api/v1/public/enquiries').send(validEnquiry).expect(400);
    expect(missing.body.error.code).toBe('CAPTCHA_REQUIRED');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, action: 'enquiry_submit' }))
    );
    await agent
      .post('/api/v1/public/enquiries')
      .set('X-Captcha-Token', 'token')
      .send(validEnquiry)
      .expect(201);
  });

  it('rate limits submissions per client', async () => {
    const agent = await freshApp({ RATE_LIMIT_PUBLIC_MAX: '2' });

    await agent.post('/api/v1/public/enquiries').send(validEnquiry).expect(201);
    await agent.post('/api/v1/public/enquiries').send(validEnquiry).expect(201);
    const limited = await agent.post('/api/v1/public/enquiries').send(validEnquiry).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
});
