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

The Docker image runs `prisma migrate deploy` before starting (`npm run start:migrate`), so deploying a
build also applies its migrations. The health endpoints serve liveness (`/api/v1/health`) and
readiness (`/api/v1/health/ready`) probes.
