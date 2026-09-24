import { describe, expect, it } from 'vitest';
import { api } from './helpers/app';

describe('Health module', () => {
  it('GET /api/v1/health returns liveness in the standard envelope', async () => {
    const res = await api().get('/api/v1/health').expect(200);

    expect(res.body).toEqual({
      success: true,
      data: { status: 'ok', uptimeSeconds: expect.any(Number), version: expect.any(String) },
    });
  });

  it('GET /api/v1/health/ready checks the database', async () => {
    const res = await api().get('/api/v1/health/ready').expect(200);

    expect(res.body.data).toEqual({ status: 'ok', checks: { database: 'up' } });
  });
});

describe('Platform behaviour', () => {
  it('returns ROUTE_NOT_FOUND with a request id for unknown routes', async () => {
    const res = await api().get('/api/v1/does-not-exist').expect(404);

    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Route not found: GET /api/v1/does-not-exist',
        requestId: expect.any(String),
      },
    });
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
  });

  it('reuses a well-formed incoming X-Request-Id', async () => {
    const res = await api().get('/api/v1/health').set('X-Request-Id', 'client-trace-123').expect(200);

    expect(res.headers['x-request-id']).toBe('client-trace-123');
  });

  it('rejects malformed JSON with MALFORMED_JSON', async () => {
    const res = await api()
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);

    expect(res.body.error.code).toBe('MALFORMED_JSON');
  });

  it('rejects oversized bodies with PAYLOAD_TOO_LARGE', async () => {
    const res = await api()
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(200 * 1024) }))
      .expect(413);

    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await api().get('/api/v1/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('serves the generated OpenAPI document', async () => {
    const res = await api().get('/api/docs.json').expect(200);

    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths)).toContain('/health/ready');
  });
});

describe('CORS', () => {
  it('allows the CRM origin on CRM endpoints', async () => {
    const res = await api().get('/api/v1/health').set('Origin', 'http://crm.test');

    expect(res.headers['access-control-allow-origin']).toBe('http://crm.test');
  });

  it('does not allow the website origin on CRM endpoints', async () => {
    const res = await api().get('/api/v1/health').set('Origin', 'http://website.test');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows the website origin on public endpoints', async () => {
    const res = await api()
      .options('/api/v1/public/anything')
      .set('Origin', 'http://website.test')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://website.test');
  });

  it('rejects unknown origins', async () => {
    const res = await api().get('/api/v1/health').set('Origin', 'http://evil.test');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
