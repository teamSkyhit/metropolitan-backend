import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { config } from '../src/config/env';
import { modules } from '../src/routes';
import { createRegistry, generateDocument } from '../src/shared/docs/openapi';
import { LocalStorageService } from '../src/shared/storage/local-storage.service';
import { api } from './helpers/app';
import { signInAs } from './helpers/auth';
import { resetDatabase } from './helpers/db';

describe('BE-3.5 Security Polish & Hardening', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('HTTP Security Headers & CORP Scoping', () => {
    it('sets core Helmet security headers with same-origin CORP on standard API routes', async () => {
      const res = await api().get('/api/v1/health').expect(200);

      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    });

    it('scopes Cross-Origin-Resource-Policy: cross-origin to static uploads route', async () => {
      const uploadDir = path.resolve(config.STORAGE_LOCAL_DIR);
      await fs.mkdir(uploadDir, { recursive: true });
      const testFilePath = path.join(uploadDir, 'test-corp-probe.png');
      await fs.writeFile(testFilePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      try {
        const res = await api().get(`${config.STORAGE_BASE_URL}/test-corp-probe.png`).expect(200);

        expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
      } finally {
        await fs.unlink(testFilePath).catch(() => {});
      }
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
      const res = await api()
        .post('/api/v1/auth/login')
        .type('form')
        .send({ email: 'nobody@metro.test', password: 'testpassword' })
        .expect(401);

      expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('rejects oversized URL-encoded bodies with 413 Payload Too Large', async () => {
      const largePayload = 'key=' + 'x'.repeat(150 * 1024);
      const res = await api().post('/api/v1/auth/login').type('form').send(largePayload).expect(413);

      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('OpenAPI Documentation Integrity', () => {
    function getGeneratedDocument() {
      const registry = createRegistry();
      for (const module of modules) {
        module.registerDocs?.(registry);
      }
      return { registry, document: generateDocument(registry) };
    }

    it('ensures zero duplicate route+method registrations in OpenAPI registry', () => {
      const { registry } = getGeneratedDocument();
      const routes = registry.definitions.filter(
        (d): d is typeof d & { route: { method: string; path: string } } => d.type === 'route'
      );
      const routeKeys = routes.map((r) => `${r.route.method.toUpperCase()} ${r.route.path}`);
      const uniqueRouteKeys = new Set(routeKeys);

      expect(uniqueRouteKeys.size).toBe(routeKeys.length);
    });

    it('ensures zero duplicate operationId values across operations', () => {
      const { document } = getGeneratedDocument();
      const operationIds: string[] = [];

      for (const pathItem of Object.values(document.paths ?? {})) {
        for (const operation of Object.values(pathItem as Record<string, { operationId?: string }>)) {
          if (operation?.operationId) {
            operationIds.push(operation.operationId);
          }
        }
      }

      if (operationIds.length > 0) {
        const uniqueOperationIds = new Set(operationIds);
        expect(uniqueOperationIds.size).toBe(operationIds.length);
      }
    });

    it('validates that all referenced $ref component schemas exist in components.schemas', () => {
      const { document } = getGeneratedDocument();
      const declaredSchemas = new Set(Object.keys(document.components?.schemas ?? {}));

      expect(declaredSchemas.size).toBeGreaterThan(30);

      const referencedSchemas = new Set<string>();

      function extractRefs(node: unknown) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          for (const item of node) extractRefs(item);
          return;
        }
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          if (key === '$ref' && typeof value === 'string') {
            const match = value.match(/^#\/components\/schemas\/(.+)$/);
            if (match && match[1]) referencedSchemas.add(match[1]);
          } else {
            extractRefs(value);
          }
        }
      }

      extractRefs(document.paths);
      extractRefs(document.components);

      for (const schemaRef of referencedSchemas) {
        expect(declaredSchemas.has(schemaRef)).toBe(true);
      }
    });

    it('verifies that CRM routes require bearer authentication while public endpoints do not', () => {
      const { document } = getGeneratedDocument();

      for (const [routePath, pathItem] of Object.entries(document.paths ?? {})) {
        for (const [method, operation] of Object.entries(
          pathItem as Record<string, { security?: Array<Record<string, unknown[]>> }>
        )) {
          if (['parameters', 'summary', 'description'].includes(method)) continue;

          const isPublic =
            routePath.startsWith('/public/') ||
            routePath.startsWith('/health') ||
            ['/auth/login', '/auth/refresh', '/auth/logout'].includes(routePath);

          const hasBearer = operation.security?.some((sec) => 'bearerAuth' in sec);

          if (isPublic) {
            expect(hasBearer).toBeFalsy();
          } else {
            expect(hasBearer).toBe(true);
          }
        }
      }
    });

    it('verifies no unintended public exposure of CRM administration routes', () => {
      const { document } = getGeneratedDocument();
      const publicPaths = Object.keys(document.paths ?? {}).filter((p) => p.startsWith('/public/'));

      expect(publicPaths.length).toBeGreaterThan(0);

      const allowedPublicPrefixes = [
        '/public/products',
        '/public/brands',
        '/public/categories',
        '/public/enquiries',
        '/public/contacts',
        '/public/contact',
        '/public/homepage',
      ];

      for (const pubPath of publicPaths) {
        const matchesAllowed = allowedPublicPrefixes.some((prefix) => pubPath.startsWith(prefix));
        expect(matchesAllowed).toBe(true);
      }
    });
  });

  describe('Storage Boundary & Directory Traversal Security', () => {
    it('safely refuses deletion and preserves files outside managed root, including prefix collisions', async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'metro-storage-test-'));
      const managedDir = path.join(tempRoot, 'uploads');
      const outsideDir = path.join(tempRoot, 'outside');
      const prefixCollisionDir = path.join(tempRoot, 'uploads-evil');

      await fs.mkdir(managedDir, { recursive: true });
      await fs.mkdir(outsideDir, { recursive: true });
      await fs.mkdir(prefixCollisionDir, { recursive: true });

      const outsideFile = path.join(outsideDir, 'outside.txt');
      const collisionFile = path.join(prefixCollisionDir, 'file.txt');
      const managedFile = path.join(managedDir, 'managed.txt');

      await fs.writeFile(outsideFile, 'sensitive-outside-content');
      await fs.writeFile(collisionFile, 'sensitive-collision-content');
      await fs.writeFile(managedFile, 'safe-managed-content');

      const storage = new LocalStorageService(managedDir, '/uploads');

      try {
        // Attempt traversal escapes
        await expect(storage.delete('../outside/outside.txt')).resolves.toBeUndefined();
        await expect(storage.delete('../../outside/outside.txt')).resolves.toBeUndefined();
        await expect(storage.delete('nested/../../../outside/outside.txt')).resolves.toBeUndefined();

        // Attempt prefix-collision traversal
        await expect(storage.delete('../uploads-evil/file.txt')).resolves.toBeUndefined();

        // Files outside managed directory must remain untouched
        await expect(fs.readFile(outsideFile, 'utf8')).resolves.toBe('sensitive-outside-content');
        await expect(fs.readFile(collisionFile, 'utf8')).resolves.toBe('sensitive-collision-content');

        // Valid deletion of managed file must succeed
        await expect(storage.delete('managed.txt')).resolves.toBeUndefined();
        await expect(fs.access(managedFile)).rejects.toThrow();
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
      }
    });
  });
});
