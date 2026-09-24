import express from 'express';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authenticate,
  authorize,
  createRateLimiter,
  errorHandler,
  registerAuthUserResolver,
} from '../../src/middleware';
import type { AuthUserState } from '../../src/shared/security/auth-context';
import { type Permission, permissionsFor } from '../../src/shared/security/permissions';
import { Role } from '../../src/shared/security/roles';
import { signAccessToken } from '../../src/shared/security/tokens';

const user: AuthUserState = {
  id: '6f1c2f3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  role: Role.SALES_MANAGER,
  isActive: true,
  tokenVersion: 1,
  mustChangePassword: false,
};

function protectedApp(...middleware: express.RequestHandler[]) {
  const app = express();
  app.get('/private', ...middleware, (req, res) => {
    res.json({ userId: req.auth?.userId });
  });
  app.use(errorHandler);
  return supertest(app);
}

describe('authenticate()', () => {
  let current: AuthUserState | null;

  beforeEach(() => {
    current = { ...user };
    registerAuthUserResolver(async (id) => (current && current.id === id ? current : null));
  });

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const validToken = () => signAccessToken({ userId: user.id, tokenVersion: 1 }).token;

  it('accepts a valid token and attaches req.auth', async () => {
    const res = await protectedApp(authenticate()).get('/private').set(bearer(validToken())).expect(200);

    expect(res.body.userId).toBe(user.id);
  });

  it('rejects a missing token', async () => {
    const res = await protectedApp(authenticate()).get('/private').expect(401);

    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a token signed with another secret', async () => {
    const forged = jwt.sign({ sub: user.id, ver: 1, typ: 'access' }, 'x'.repeat(40));
    const res = await protectedApp(authenticate()).get('/private').set(bearer(forged)).expect(401);

    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired token with TOKEN_EXPIRED', async () => {
    const expired = jwt.sign(
      { sub: user.id, ver: 1, typ: 'access', exp: Math.floor(Date.now() / 1000) - 10 },
      process.env.JWT_ACCESS_SECRET!,
      { issuer: 'metro-crm-api', audience: 'metro-crm' }
    );
    const res = await protectedApp(authenticate()).get('/private').set(bearer(expired)).expect(401);

    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects tokens of deactivated users immediately', async () => {
    current = { ...user, isActive: false };

    await protectedApp(authenticate()).get('/private').set(bearer(validToken())).expect(401);
  });

  it('rejects tokens issued before a token version bump', async () => {
    current = { ...user, tokenVersion: 2 };

    await protectedApp(authenticate()).get('/private').set(bearer(validToken())).expect(401);
  });

  it('blocks users who must change their password unless allowed', async () => {
    current = { ...user, mustChangePassword: true };

    const blocked = await protectedApp(authenticate()).get('/private').set(bearer(validToken())).expect(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    await protectedApp(authenticate({ allowPasswordChangeRequired: true }))
      .get('/private')
      .set(bearer(validToken()))
      .expect(200);
  });
});

describe('authorize()', () => {
  const grant =
    (permissions: string[]): express.RequestHandler =>
    (req, _res, next) => {
      req.auth = { userId: user.id, role: user.role, permissions: new Set(permissions as Permission[]) };
      next();
    };

  it('allows callers holding every required permission', async () => {
    await protectedApp(
      grant(['a:read', 'a:write']),
      authorize('a:read' as Permission, 'a:write' as Permission)
    )
      .get('/private')
      .expect(200);
  });

  it('forbids callers missing a permission', async () => {
    const res = await protectedApp(
      grant(['a:read']),
      authorize('a:read' as Permission, 'a:write' as Permission)
    )
      .get('/private')
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('requires authentication first', async () => {
    await protectedApp(authorize('a:read' as Permission))
      .get('/private')
      .expect(401);
  });

  it('grants SUPER_ADMIN every registered permission', () => {
    expect(permissionsFor(Role.SUPER_ADMIN).size).toBeGreaterThanOrEqual(
      permissionsFor(Role.SALES_MANAGER).size
    );
  });
});

describe('rate limiting', () => {
  it('returns RATE_LIMITED once the limit is exceeded', async () => {
    const app = express();
    app.get('/limited', createRateLimiter({ name: 'unit-test', limit: 2 }), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    const agent = supertest(app);

    await agent.get('/limited').expect(200);
    await agent.get('/limited').expect(200);
    const res = await agent.get('/limited').expect(429);

    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['ratelimit-policy']).toBeDefined();
  });
});

describe('captcha', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function captchaApp(provider: string) {
    vi.stubEnv('CAPTCHA_PROVIDER', provider);
    vi.stubEnv('CAPTCHA_SECRET_KEY', 'test-secret');
    vi.resetModules();
    const { requireCaptcha, errorHandler: handler } = await import('../../src/middleware');
    const app = express();
    app.post('/form', requireCaptcha({ action: 'enquiry' }), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(handler);
    return supertest(app);
  }

  function mockProvider(body: object, status = 200) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));
  }

  it('skips verification when the provider is none', async () => {
    await (await captchaApp('none')).post('/form').expect(200);
  });

  it('requires the token header', async () => {
    const res = await (await captchaApp('turnstile')).post('/form').expect(400);

    expect(res.body.error.code).toBe('CAPTCHA_REQUIRED');
  });

  it('accepts a token the provider confirms', async () => {
    const fetchMock = mockProvider({ success: true, action: 'enquiry' });

    await (await captchaApp('turnstile')).post('/form').set('X-Captcha-Token', 'tok').expect(200);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(String(init?.body)).toContain('secret=test-secret');
    expect(String(init?.body)).toContain('response=tok');
  });

  it('rejects a token the provider refuses', async () => {
    mockProvider({ success: false, 'error-codes': ['invalid-input-response'] });

    const res = await (await captchaApp('hcaptcha')).post('/form').set('X-Captcha-Token', 'tok').expect(400);
    expect(res.body.error.code).toBe('CAPTCHA_FAILED');
  });

  it('rejects low reCAPTCHA v3 scores', async () => {
    mockProvider({ success: true, score: 0.1, action: 'enquiry' });

    await (await captchaApp('recaptcha')).post('/form').set('X-Captcha-Token', 'tok').expect(400);
  });

  it('rejects a token solved for another action', async () => {
    mockProvider({ success: true, score: 0.9, action: 'login' });

    await (await captchaApp('recaptcha')).post('/form').set('X-Captcha-Token', 'tok').expect(400);
  });

  it('fails closed when the provider is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const res = await (await captchaApp('turnstile')).post('/form').set('X-Captcha-Token', 'tok').expect(503);
    expect(res.body.error.code).toBe('CAPTCHA_UNAVAILABLE');
  });
});
