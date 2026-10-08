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

  it('disables API docs in production even if API_DOCS_ENABLED=true', () => {
    const config = loadConfig({
      ...base,
      APP_ENV: 'production',
      CORS_ORIGINS: 'https://crm.example.com',
      PUBLIC_CORS_ORIGINS: 'https://www.example.com',
      CAPTCHA_ALLOWED_HOSTNAMES: 'www.example.com',
      CAPTCHA_PROVIDER: 'turnstile',
      CAPTCHA_SECRET_KEY: 'secret',
      API_DOCS_ENABLED: 'true',
    });

    expect(config.apiDocsEnabled).toBe(false);
  });

  it('rejects weak placeholder JWT secrets outside local', () => {
    expect(() =>
      loadConfig({
        ...base,
        APP_ENV: 'staging',
        CORS_ORIGINS: 'https://crm.example.com',
        JWT_ACCESS_SECRET: 'change-me-change-me-change-me-12345',
      })
    ).toThrow(/weak or default placeholder/);
  });

  describe('STORAGE_DRIVER=s3 validation', () => {
    const validS3Config = {
      ...base,
      STORAGE_DRIVER: 's3' as const,
      S3_BUCKET: 'metropolitan-media',
      S3_REGION: 'auto',
      S3_ENDPOINT: 'https://test-account.r2.cloudflarestorage.com',
      S3_PUBLIC_BASE_URL: 'https://pub-test.r2.dev',
      S3_ACCESS_KEY_ID: 'test-key-id',
      S3_SECRET_ACCESS_KEY: 'test-secret-key',
    };

    it('loads successfully when all S3 configuration fields are present', () => {
      const config = loadConfig(validS3Config);
      expect(config.STORAGE_DRIVER).toBe('s3');
      expect(config.S3_BUCKET).toBe('metropolitan-media');
      expect(config.S3_REGION).toBe('auto');
      expect(config.S3_ENDPOINT).toBe('https://test-account.r2.cloudflarestorage.com');
      expect(config.S3_PUBLIC_BASE_URL).toBe('https://pub-test.r2.dev');
      expect(config.S3_ACCESS_KEY_ID).toBe('test-key-id');
      expect(config.S3_SECRET_ACCESS_KEY).toBe('test-secret-key');
    });

    const s3RequiredFields = [
      'S3_BUCKET',
      'S3_REGION',
      'S3_ENDPOINT',
      'S3_PUBLIC_BASE_URL',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ] as const;

    for (const field of s3RequiredFields) {
      it(`fails fast if ${field} is missing when STORAGE_DRIVER=s3`, () => {
        const invalidConfig = { ...validS3Config };
        delete (invalidConfig as Record<string, unknown>)[field];

        expect(() => loadConfig(invalidConfig)).toThrow(
          new RegExp(`${field} is required when STORAGE_DRIVER is s3`)
        );
      });

      it(`fails fast if ${field} is empty whitespace when STORAGE_DRIVER=s3`, () => {
        const invalidConfig = { ...validS3Config, [field]: '   ' };

        expect(() => loadConfig(invalidConfig)).toThrow(
          new RegExp(`${field} is required when STORAGE_DRIVER is s3`)
        );
      });
    }
  });
});
