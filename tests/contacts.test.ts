import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Permission, permissionsFor } from '../src/shared/security/permissions';
import { api } from './helpers/app';
import { signInAs, type Session } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

const validContact = {
  name: 'Vikram Malhotra',
  email: 'vikram.malhotra@industry.test',
  mobile: '+91 98765 43210',
  company: 'Malhotra Heavy Industries',
  subject: 'Inquiry regarding industrial valves and parts',
  message: 'Hello, we would like to schedule a call regarding technical specifications and partnership.',
  pageUrl: 'https://example.com/contact-us',
};

const submit = (body: object = validContact) => api().post('/api/v1/public/contacts').send(body);

let admin: Session;
let sales: Session;

beforeEach(async () => {
  await resetDatabase();
  admin = await signInAs('SUPER_ADMIN');
  sales = await signInAs('SALES_MANAGER', { name: 'Sales Manager One' });
});

describe('POST /public/contacts', () => {
  it('stores the contact submission and returns minimal acknowledgment', async () => {
    const res = await submit().expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      message: 'Your message has been received.',
    });

    const stored = await prisma.contactSubmission.findUniqueOrThrow({
      where: { id: res.body.data.id },
    });

    expect(stored.name).toBe('Vikram Malhotra');
    expect(stored.email).toBe('vikram.malhotra@industry.test');
    expect(stored.mobile).toBe('+91 98765 43210');
    expect(stored.company).toBe('Malhotra Heavy Industries');
    expect(stored.subject).toBe('Inquiry regarding industrial valves and parts');
    expect(stored.message).toBe(validContact.message);
    expect(stored.pageUrl).toBe('https://example.com/contact-us');
    expect(stored.status).toBe('NEW');
    expect(stored.deletedAt).toBeNull();
  });

  it('also supports the singular endpoint alias POST /public/contact', async () => {
    const res = await api().post('/api/v1/public/contact').send(validContact).expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
  });

  it('does not require authentication and accepts the website origin', async () => {
    const res = await submit().set('Origin', 'http://website.test').expect(201);
    expect(res.headers['access-control-allow-origin']).toBe('http://website.test');
  });

  it('allows minimal submission with only required fields (name, email, message)', async () => {
    const minimal = {
      name: 'John Doe',
      email: 'john.doe@example.com',
      message: 'Just wanted to say hello and ask a quick question.',
    };

    const res = await submit(minimal).expect(201);
    const stored = await prisma.contactSubmission.findUniqueOrThrow({
      where: { id: res.body.data.id },
    });

    expect(stored.mobile).toBeNull();
    expect(stored.company).toBeNull();
    expect(stored.subject).toBeNull();
    expect(stored.pageUrl).toBeNull();
  });

  it('allows legitimate repeated submissions from the same user', async () => {
    await submit().expect(201);
    await submit().expect(201);

    const count = await prisma.contactSubmission.count({
      where: { email: validContact.email },
    });
    expect(count).toBe(2);
  });

  it('stores HTML and script-like text safely as plain text without execution', async () => {
    const xssPayload = {
      name: '<script>alert("XSS")</script>',
      email: 'hacker@safe.test',
      subject: '<b onmouseover="alert(1)">Bold Subject</b>',
      message: '<img src=x onerror=alert(1)> Urgent enquiry with tags',
    };

    const res = await submit(xssPayload).expect(201);
    const stored = await prisma.contactSubmission.findUniqueOrThrow({
      where: { id: res.body.data.id },
    });

    expect(stored.name).toBe('<script>alert("XSS")</script>');
    expect(stored.message).toBe('<img src=x onerror=alert(1)> Urgent enquiry with tags');
  });

  it('strictly avoids leaking sourceIp, status, audit metadata, or auth tokens in response', async () => {
    const res = await submit().expect(201);
    const data = res.body.data;

    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('message');
    expect(data).not.toHaveProperty('sourceIp');
    expect(data).not.toHaveProperty('status');
    expect(data).not.toHaveProperty('createdAt');
    expect(data).not.toHaveProperty('updatedAt');
    expect(data).not.toHaveProperty('deletedAt');
    expect(data).not.toHaveProperty('token');
  });

  describe('validation failures', () => {
    it('rejects missing or empty name', async () => {
      await submit({ ...validContact, name: '' }).expect(400);
      await submit({ ...validContact, name: '   ' }).expect(400);
      await submit({ ...validContact, name: 'A' }).expect(400);
    });

    it('rejects name exceeding 100 characters', async () => {
      await submit({ ...validContact, name: 'A'.repeat(101) }).expect(400);
    });

    it('rejects invalid email formats', async () => {
      await submit({ ...validContact, email: 'not-an-email' }).expect(400);
      await submit({ ...validContact, email: 'missing@domain' }).expect(400);
      await submit({ ...validContact, email: '' }).expect(400);
    });

    it('rejects invalid mobile numbers if provided', async () => {
      await submit({ ...validContact, mobile: '123' }).expect(400);
      await submit({ ...validContact, mobile: 'abcdefghij' }).expect(400);
      await submit({ ...validContact, mobile: '123456789012345678901' }).expect(400);
    });

    it('rejects missing or too short message', async () => {
      await submit({ ...validContact, message: '' }).expect(400);
      await submit({ ...validContact, message: '   ' }).expect(400);
      await submit({ ...validContact, message: 'Hi' }).expect(400);
    });

    it('rejects message exceeding 2000 characters', async () => {
      await submit({ ...validContact, message: 'X'.repeat(2001) }).expect(400);
    });

    it('rejects invalid pageUrl format', async () => {
      await submit({ ...validContact, pageUrl: 'javascript:alert(1)' }).expect(400);
      await submit({ ...validContact, pageUrl: 'ftp://notallowed.test' }).expect(400);
    });
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

    const missing = await agent.post('/api/v1/public/contacts').send(validContact).expect(400);
    expect(missing.body.error.code).toBe('CAPTCHA_REQUIRED');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, action: 'contact_submit' }))
    );
    await agent
      .post('/api/v1/public/contacts')
      .set('X-Captcha-Token', 'token')
      .send(validContact)
      .expect(201);
  });

  it('rate limits submissions per client', async () => {
    const agent = await freshApp({ RATE_LIMIT_PUBLIC_MAX: '2' });

    await agent.post('/api/v1/public/contacts').send(validContact).expect(201);
    await agent.post('/api/v1/public/contacts').send(validContact).expect(201);
    const limited = await agent.post('/api/v1/public/contacts').send(validContact).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('CRM Contacts Management (Authenticated)', () => {
  it('requires authentication for all CRM contacts endpoints', async () => {
    await api().get('/api/v1/contacts').expect(401);
    await api().get('/api/v1/contacts/00000000-0000-4000-8000-000000000000').expect(401);
    await api()
      .patch('/api/v1/contacts/00000000-0000-4000-8000-000000000000/status')
      .send({ status: 'READ' })
      .expect(401);
    await api().delete('/api/v1/contacts/00000000-0000-4000-8000-000000000000').expect(401);
  });

  it('returns 403 when an authenticated user lacks contacts:read', async () => {
    const salesPermissions = permissionsFor('SALES_MANAGER') as Set<Permission>;
    salesPermissions.delete(Permission.CONTACTS_READ);
    try {
      const res = await api().get('/api/v1/contacts').set(sales.auth).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    } finally {
      salesPermissions.add(Permission.CONTACTS_READ);
    }
  });

  it('lists contact submissions with pagination metadata and newest first', async () => {
    await submit({ ...validContact, name: 'First Contact' });
    await submit({ ...validContact, name: 'Second Contact' });

    const res = await api().get('/api/v1/contacts').set(sales.auth).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].name).toBe('Second Contact');
    expect(res.body.data[1].name).toBe('First Contact');
    expect(res.body.meta.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it('searches contacts by name, email, mobile, and company', async () => {
    await submit({ ...validContact, name: 'Aarav Patel', company: 'Patel Solar' });
    await submit({ ...validContact, name: 'Deepa Rao', company: 'Rao Automation' });

    const searchRes = await api().get('/api/v1/contacts?search=solar').set(sales.auth).expect(200);
    expect(searchRes.body.data).toHaveLength(1);
    expect(searchRes.body.data[0].name).toBe('Aarav Patel');

    const searchEmail = await api().get('/api/v1/contacts?search=industry.test').set(sales.auth).expect(200);
    expect(searchEmail.body.data).toHaveLength(2);
  });

  it('filters contacts by status and date range', async () => {
    const s1 = await prisma.contactSubmission.create({
      data: {
        name: 'Contact 1',
        email: 'c1@test.com',
        message: 'Message content 1',
        status: 'NEW',
        createdAt: new Date('2026-09-10T10:00:00Z'),
      },
    });

    await prisma.contactSubmission.create({
      data: {
        name: 'Contact 2',
        email: 'c2@test.com',
        message: 'Message content 2',
        status: 'READ',
        createdAt: new Date('2026-09-20T10:00:00Z'),
      },
    });

    const statusRes = await api().get('/api/v1/contacts?status=READ').set(sales.auth).expect(200);
    expect(statusRes.body.data).toHaveLength(1);
    expect(statusRes.body.data[0].name).toBe('Contact 2');

    const dateRes = await api()
      .get('/api/v1/contacts?from=2026-09-01&to=2026-09-15')
      .set(sales.auth)
      .expect(200);
    expect(dateRes.body.data).toHaveLength(1);
    expect(dateRes.body.data[0].id).toBe(s1.id);
  });

  it('returns full contact details via GET /contacts/:id', async () => {
    const created = await submit().expect(201);
    const id = created.body.data.id;

    const res = await api().get(`/api/v1/contacts/${id}`).set(sales.auth).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      id,
      name: validContact.name,
      email: validContact.email,
      mobile: validContact.mobile,
      company: validContact.company,
      subject: validContact.subject,
      message: validContact.message,
      pageUrl: validContact.pageUrl,
      status: 'NEW',
    });
  });

  it('returns 404 for unknown contact ID', async () => {
    await api().get('/api/v1/contacts/00000000-0000-4000-8000-000000000000').set(sales.auth).expect(404);
  });

  it('updates contact submission status via PATCH /contacts/:id/status', async () => {
    const created = await submit().expect(201);
    const id = created.body.data.id;

    const updateRes = await api()
      .patch(`/api/v1/contacts/${id}/status`)
      .set(sales.auth)
      .send({ status: 'READ' })
      .expect(200);

    expect(updateRes.body.data.status).toBe('READ');

    const archiveRes = await api()
      .patch(`/api/v1/contacts/${id}/status`)
      .set(sales.auth)
      .send({ status: 'ARCHIVED' })
      .expect(200);

    expect(archiveRes.body.data.status).toBe('ARCHIVED');
  });

  it('soft deletes contact submission (Super Admin only)', async () => {
    const created = await submit().expect(201);
    const id = created.body.data.id;

    // Sales Manager cannot delete
    await api().delete(`/api/v1/contacts/${id}`).set(sales.auth).expect(403);

    // Super Admin deletes successfully
    await api().delete(`/api/v1/contacts/${id}`).set(admin.auth).expect(204);

    // Excluded from list and detail
    await api().get(`/api/v1/contacts/${id}`).set(sales.auth).expect(404);
    const listRes = await api().get('/api/v1/contacts').set(sales.auth).expect(200);
    expect(listRes.body.data).toHaveLength(0);

    const inDb = await prisma.contactSubmission.findUniqueOrThrow({ where: { id } });
    expect(inDb.deletedAt).not.toBeNull();
  });
});

describe('OpenAPI Documentation for Contacts', () => {
  it('registers all contact routes and schemas in /api/docs.json', async () => {
    const res = await api().get('/api/docs.json').expect(200);

    expect(res.body.paths).toHaveProperty('/public/contacts');
    expect(res.body.paths).toHaveProperty('/contacts');
    expect(res.body.paths).toHaveProperty('/contacts/{id}');
    expect(res.body.components.schemas).toHaveProperty('SubmitContactBody');
    expect(res.body.components.schemas).toHaveProperty('SubmitContactResponse');
    expect(res.body.components.schemas).toHaveProperty('ContactSummary');
    expect(res.body.components.schemas).toHaveProperty('ContactDetail');
  });
});
