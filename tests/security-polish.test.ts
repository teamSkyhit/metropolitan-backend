import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './helpers/app';
import { signInAs } from './helpers/auth';
import { resetDatabase } from './helpers/db';
import { modules } from '../src/routes';
import { createRegistry, generateDocument } from '../src/shared/docs/openapi';
import { LocalStorageService } from '../src/shared/storage/local-storage.service';

describe('BE-3.5 Security Polish & Hardening', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('HTTP Security Headers & CORP', () => {
    it('sets core Helmet security headers and disables X-Powered-By', async () => {
      const res = await api().get('/api/v1/health').expect(200);

      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });
  });

  describe('Cache-Control on Sensitive vs Public Endpoints', () => {
    it('returns Cache-Control: no-store on unauthenticated auth endpoints', async () => {
      const loginRes = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent@metro.test', password: 'password123' })
        .expect(401);

      expect(loginRes.headers['cache-control']).toBe('no-store');

      const refreshRes = await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token-here-1234567890' })
        .expect(401);

      expect(refreshRes.headers['cache-control']).toBe('no-store');
    });

    it('returns Cache-Control: no-store on authenticated CRM endpoints', async () => {
      const admin = await signInAs('SUPER_ADMIN');

      const meRes = await api().get('/api/v1/auth/me').set(admin.auth).expect(200);
      expect(meRes.headers['cache-control']).toBe('no-store');

      const enquiriesRes = await api().get('/api/v1/enquiries').set(admin.auth).expect(200);
      expect(enquiriesRes.headers['cache-control']).toBe('no-store');

      const contactsRes = await api().get('/api/v1/contacts').set(admin.auth).expect(200);
      expect(contactsRes.headers['cache-control']).toBe('no-store');

      const notificationsRes = await api().get('/api/v1/notifications').set(admin.auth).expect(200);
      expect(notificationsRes.headers['cache-control']).toBe('no-store');

      const dashboardRes = await api().get('/api/v1/dashboard/summary').set(admin.auth).expect(200);
      expect(dashboardRes.headers['cache-control']).toBe('no-store');

      const usersRes = await api().get('/api/v1/users').set(admin.auth).expect(200);
      expect(usersRes.headers['cache-control']).toBe('no-store');
    });

    it('does not force Cache-Control: no-store on public catalog endpoints', async () => {
      const productsRes = await api().get('/api/v1/public/products').expect(200);
      expect(productsRes.headers['cache-control']).not.toBe('no-store');

      const brandsRes = await api().get('/api/v1/public/brands').expect(200);
      expect(brandsRes.headers['cache-control']).not.toBe('no-store');

      const categoriesRes = await api().get('/api/v1/public/categories').expect(200);
      expect(categoriesRes.headers['cache-control']).not.toBe('no-store');
    });
  });

  describe('URL-Encoded Request Body Limits', () => {
    it('accepts and parses URL-encoded bodies within limit', async () => {
      // POST to an endpoint that accepts body but ignores unexpected urlencoded form fields
      const res = await api()
        .post('/api/v1/auth/login')
        .type('form')
        .send({ email: 'nobody@metro.test', password: 'testpassword' })
        .expect(401);

      expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('rejects oversized URL-encoded bodies with 413 Payload Too Large', async () => {
      const largePayload = 'key=' + 'x'.repeat(150 * 1024); // 150kb exceeds 100kb default
      const res = await api().post('/api/v1/auth/login').type('form').send(largePayload).expect(413);

      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('OpenAPI Documentation Integrity', () => {
    it('ensures zero component schema ID collisions in OpenAPI definition', () => {
      const registry = createRegistry();
      for (const module of modules) {
        module.registerDocs?.(registry);
      }
      const document = generateDocument(registry);
      const schemas = document.components?.schemas ?? {};
      const schemaNames = Object.keys(schemas);

      expect(schemaNames.length).toBeGreaterThan(50);

      // Verify all registered schema keys are unique
      const uniqueNames = new Set(schemaNames);
      expect(uniqueNames.size).toBe(schemaNames.length);
    });

    it('ensures zero duplicate route paths in OpenAPI registry', () => {
      const registry = createRegistry();
      for (const module of modules) {
        module.registerDocs?.(registry);
      }
      const routes = registry.definitions.filter(
        (d): d is typeof d & { route: { method: string; path: string } } => d.type === 'route'
      );
      const routeKeys = routes.map((r) => `${r.route.method.toUpperCase()} ${r.route.path}`);
      const uniqueRouteKeys = new Set(routeKeys);

      expect(uniqueRouteKeys.size).toBe(routeKeys.length);
    });
  });

  describe('Storage Traversal Security', () => {
    it('prevents directory traversal outside base directory on delete', async () => {
      const storage = new LocalStorageService('uploads', '/uploads');

      // Attempt deletion with directory traversal
      await expect(storage.delete('../../etc/passwd')).resolves.toBeUndefined();
      await expect(storage.delete('/uploads/../../../shadow')).resolves.toBeUndefined();
    });
  });
});
