# Architecture

## Stack

| Concern       | Choice                                                                  |
| ------------- | ----------------------------------------------------------------------- |
| Runtime       | Node.js 22 LTS, TypeScript (strict)                                     |
| HTTP          | Express 5 (async errors are forwarded automatically)                    |
| Database      | PostgreSQL 16 via Prisma ORM                                            |
| Validation    | zod 4 (also the source of TypeScript types and OpenAPI docs)            |
| API docs      | OpenAPI 3.1 generated with `@asteasolutions/zod-to-openapi`             |
| Auth          | Short-lived JWT access tokens + rotating opaque refresh tokens          |
| Logging       | pino / pino-http, one line per request with a request id                |
| Security      | helmet, per-surface CORS allow-lists, express-rate-limit, captcha       |
| Tests         | Vitest + supertest against a real PostgreSQL test database              |
| Quality gates | ESLint (incl. architecture rules), Prettier, commitlint, GitHub Actions |

## Layout

```
src/
  server.ts            Process entry: connect DB, listen, graceful shutdown
  app.ts               createApp(): middleware pipeline (used by the server and tests)
  routes/index.ts      Composition root: the list of modules and how they are mounted
  config/
    env.ts             Validated configuration (fails fast on bad env)
    database.ts        Prisma client (repositories only)
    swagger.ts         /api/docs + /api/docs.json
  middleware/          authenticate, authorize, captcha, cors, rate limits, logging, errors
  shared/              Code with no knowledge of features
    errors/            AppError, error codes, error normalisation (zod, Prisma, body parser)
    http/              handle() validation, response helpers, pagination, date ranges
    security/          roles, permissions, token signing/verification
    database/          soft delete + audit helpers
    docs/              OpenAPI helpers
    module.ts          AppModule contract
  modules/<name>/      Feature modules (see MODULE_STANDARD.md)
tests/                 Integration tests per module, unit tests in tests/unit
scripts/               Module generator and templates
prisma/                schema.prisma, migrations/, seed
```

Dependency direction: `modules → shared/middleware/config`, never the other way round. The one place
that knows every module is `src/routes/index.ts`.

## Request pipeline

```
request
  → request logger (assigns X-Request-Id)
  → /api/docs (optional)
  → helmet → CORS (CRM origins, or website origins on /api/v1/public/*)
  → JSON body parser (size limited)
  → global rate limit
  → /api/v1/<module>          authenticate() → authorize(permission) → handle(schemas) → controller
  → /api/v1/public/<module>   rate limit → requireCaptcha() → handle(schemas) → controller
  → 404 handler → error handler (single error format, no internals leaked)
```

## API surfaces

| Surface | Mount                     | Callers         | Protection                                  |
| ------- | ------------------------- | --------------- | ------------------------------------------- |
| CRM     | `/api/v1/<module>`        | CRM frontend    | JWT + permissions, `CORS_ORIGINS`           |
| Public  | `/api/v1/public/<module>` | Public website  | Rate limit + captcha, `PUBLIC_CORS_ORIGINS` |
| Health  | `/api/v1/health[/ready]`  | Uptime monitors | None (no sensitive data)                    |
| Docs    | `/api/docs`               | Developers      | Disabled in production by default           |

## Environments and branches

| Branch      | Environment | Hosting                        | `APP_ENV`    |
| ----------- | ----------- | ------------------------------ | ------------ |
| `feature/*` | local       | developer machine              | `local`      |
| `develop`   | staging     | single instance (free hosting) | `staging`    |
| `main`      | production  | client infrastructure          | `production` |

`APP_ENV` turns on stricter checks: CORS lists are required and wildcards are rejected outside local,
and a captcha provider is mandatory in production.

Rate limits use an in-memory store, which is correct for a single instance. If production runs several
instances behind a load balancer, switch `createRateLimiter` to a shared store (e.g. Redis) before
scaling out.

## Deployment

The Docker image runs `npm run start:migrate` on boot: `prisma migrate deploy`, then idempotent
`npm run db:seed` (first Super Admin when `SEED_SUPER_ADMIN_*` are set), then the API. Health
endpoints serve liveness (`/api/v1/health`) and readiness (`/api/v1/health/ready`) probes.

Staging deploys from `develop` via GitHub Actions → Railway (`deploy-railway.yml`). Requires GitHub
secret `RAILWAY_TOKEN`, variable `RAILWAY_SERVICE`, and Railway service variables including seed
credentials for the first boot only.

## Object Storage & Cloudflare R2 Integration

Media asset storage is decoupled from the application logic via `IStorageService` (`src/shared/storage/`).

### Drivers

- **Local Driver (`LocalStorageService`)**: Used during local development. Saves uploads to the local filesystem (`STORAGE_LOCAL_DIR=uploads`) and serves them statically at `STORAGE_BASE_URL=/uploads`.
- **S3 Driver (`S3StorageService`)**: Production-ready S3-compatible driver wired for Cloudflare R2 (`STORAGE_DRIVER=s3`).

### Architecture & Configuration Principles

1. **Endpoint vs. Public Media URL Separation**:
   - `S3_ENDPOINT`: Private S3-compatible API endpoint used by the AWS SDK client to perform bucket operations (`PutObjectCommand`, `DeleteObjectCommand`). Never exposed to clients.
   - `S3_PUBLIC_BASE_URL`: Public base URL (e.g. Cloudflare R2 dev domain `https://pub-<hash>.r2.dev` or custom domain `https://media.metropolitan.com`) used exclusively for generating public media URLs.
   - `getUrl(key)` guarantees `<S3_PUBLIC_BASE_URL>/<key>` without duplicate slashes.
2. **Region & Virtual-Hosted Addressing**:
   - `S3_REGION=auto`: Cloudflare R2 requires `auto` as its region setting.
   - Virtual-hosted style (`forcePathStyle: false`) is enforced as required by Cloudflare R2.
3. **Deletion Key Derivation**:
   - `delete(filePathOrUrl)` accepts either a raw storage key (`general/abc.png`) or a full public/endpoint URL.
   - The service derives the clean object key by stripping `S3_PUBLIC_BASE_URL`, any endpoint prefix, leading slashes, and bucket name prefixes.
   - The bucket name (e.g. `metropolitan-media`) is never sent as part of the DeleteObject Key.
4. **Directory Traversal & Path Sanitization**:
   - Both `LocalStorageService` and `S3StorageService` enforce strict containment:
     - `upload()` rejects folders containing `..`, absolute paths, or unsafe prefixes.
     - `delete()` checks containment and safely no-ops on directory traversal attempts (`..`, `/../`) without invoking storage APIs.
5. **Security & Permissions**:
   - Cloudflare R2 API tokens must be scoped with `Object Read & Write` permissions on the specified bucket.
   - `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` are sensitive credentials. They must never be checked into version control and must be managed via encrypted platform environment secrets.
