import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('loadConfig', () => {
  it('applies defaults for a minimal local configuration', () => {
    const config = loadConfig(base);

    expect(config.PORT).toBe(5000);
    expect(config.APP_ENV).toBe('local');
    expect(config.apiDocsEnabled).toBe(true);
    expect(config.CAPTCHA_PROVIDER).toBe('none');
  });

  it('refuses to start without a JWT secret', () => {
    expect(() => loadConfig({ DATABASE_URL: base.DATABASE_URL })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects short JWT secrets', () => {
    expect(() => loadConfig({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/at least 32/);
  });

  it('parses comma separated origin lists', () => {
    const config = loadConfig({ ...base, CORS_ORIGINS: 'https://a.com, https://b.com,' });

    expect(config.CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
  });

  it('requires CORS origins outside local', () => {
    expect(() => loadConfig({ ...base, APP_ENV: 'staging' })).toThrow(/CORS_ORIGINS is required/);
  });

  it('rejects wildcard origins outside local', () => {
    expect(() => loadConfig({ ...base, APP_ENV: 'staging', CORS_ORIGINS: '*' })).toThrow(/must not contain/);
  });

  it('requires a captcha provider in production', () => {
    expect(() =>
      loadConfig({ ...base, APP_ENV: 'production', CORS_ORIGINS: 'https://crm.example.com' })
    ).toThrow(/captcha provider is required/);
  });

  it('requires a captcha secret when a provider is configured', () => {
    expect(() => loadConfig({ ...base, CAPTCHA_PROVIDER: 'turnstile' })).toThrow(/CAPTCHA_SECRET_KEY/);
  });

  it('disables API docs in production by default', () => {
    const config = loadConfig({
      ...base,
      APP_ENV: 'production',
      CORS_ORIGINS: 'https://crm.example.com',
      CAPTCHA_PROVIDER: 'turnstile',
      CAPTCHA_SECRET_KEY: 'secret',
    });

    expect(config.apiDocsEnabled).toBe(false);
  });
});
