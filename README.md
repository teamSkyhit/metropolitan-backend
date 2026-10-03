# Metro Industrial CRM: Backend API

REST API for the Metro Industrial CRM and the public Metro website.
Node.js 22 · Express 5 · TypeScript · PostgreSQL · Prisma · zod

| Document                                           | What it covers                                      |
| -------------------------------------------------- | --------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)       | Stack, layout, request pipeline, environments       |
| [docs/MODULE_STANDARD.md](docs/MODULE_STANDARD.md) | How every module must be built (read before coding) |
| [CONTRIBUTING.md](CONTRIBUTING.md)                 | Branches, commits, pull requests, releases          |

## Prerequisites

- Node.js 22.12 or newer
- PostgreSQL 16 (local install or `docker compose up postgres`)

## Getting started

```bash
cp .env.example .env
# set JWT_ACCESS_SECRET (the command to generate one is in .env.example)
npm ci                  # also installs git hooks and generates the Prisma client
npm run db:migrate      # create / update the local database
npm run db:seed         # create the first Super Admin (set SEED_SUPER_ADMIN_* in .env first)
npm run dev             # http://localhost:5000
```

## Users and sign-in

- There is no public registration. The first **Super Admin** is created once with `npm run db:seed`
  (idempotent; reads `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD`).
- The Super Admin creates **Sales Managers** via `POST /api/v1/users` with a temporary password.
  They must change it at first sign-in (`POST /api/v1/auth/change-password`).
- Sign in with `POST /api/v1/auth/login` and send `Authorization: Bearer <accessToken>`.
  Access tokens last 15 minutes. Renew with `POST /api/v1/auth/refresh`: each refresh token works
  **once**, so the frontend must not send refresh requests in parallel.
- Deactivating, deleting or resetting a user signs them out everywhere immediately.

- API base: `http://localhost:5000/api/v1`
- Swagger UI: `http://localhost:5000/api/docs` (raw OpenAPI: `/api/docs.json`)
- Health: `GET /api/v1/health` (liveness), `GET /api/v1/health/ready` (database check)

## Scripts

| Command                        | Description                                               |
| ------------------------------ | --------------------------------------------------------- |
| `npm run dev`                  | Start with reload                                         |
| `npm run build` / `npm start`  | Compile to `dist/` / run the compiled build               |
| `npm run check`                | Lint + format check + typecheck + tests (run before a PR) |
| `npm test`                     | Test suite (needs PostgreSQL, see below)                  |
| `npm run test:coverage`        | Tests with a coverage report                              |
| `npm run lint` / `lint:fix`    | ESLint, including architecture rules                      |
| `npm run format`               | Prettier                                                  |
| `npm run gen:module -- <name>` | Scaffold a new module following the standard              |
| `npm run db:migrate`           | Create/apply migrations in development                    |
| `npm run db:deploy`            | Apply migrations (staging / production)                   |
| `npm run db:seed`              | Create the first Super Admin (idempotent)                 |
| `npm run db:studio`            | Prisma Studio                                             |

## Modules

| Module        | CRM endpoints (`/api/v1`)                                   | Public endpoints (`/api/v1/public`)        |
| ------------- | ----------------------------------------------------------- | ------------------------------------------ |
| health        | `GET /health`, `GET /health/ready`                          | n/a                                        |
| auth          | login, refresh, logout, logout-all, me, change-password     | n/a                                        |
| users         | CRUD for Sales Managers, lookup                             | n/a                                        |
| enquiries     | list, detail, notes, status, assignee, follow-ups, delete   | `POST /enquiries`                          |
| brands        | list, create, detail, update, delete, restore, logo/banner  | `GET /brands`, `GET /brands/:slug`         |
| categories    | list, create, detail, update, delete, restore, banner       | `GET /categories`, `GET /categories/:slug` |
| products      | list, create, detail, update, delete, restore, image, specs | `GET /products`, `GET /products/:slug`     |
| media         | list, detail, upload, delete (with in-use reference guard)  | n/a                                        |
| dashboard     | summary, trends, recent-enquiries                           | n/a                                        |
| contacts      | list, detail, status, delete                                | `POST /contacts` (alias: `/contact`)       |
| notifications | list, unread-count, read-all, mark-read                     | n/a                                        |

Full request/response contracts: Swagger UI at `/api/docs`.

### Storage & Media Library

- Default driver: `STORAGE_DRIVER=local` saves uploads to local filesystem under `uploads/` and serves statically from `/uploads`.
- Directory traversal protection prevents deletion outside the configured storage directory.
- S3 driver is available via `STORAGE_DRIVER=s3` when `S3_BUCKET` and AWS credentials are provided.
- Media delete guard (`DELETE /api/v1/media/:id`) returns 409 Conflict if an active product, brand logo/banner, or category banner references the asset.

### Notifications module

- In-app CRM notifications (`GET /api/v1/notifications`, `GET /api/v1/notifications/unread-count`, `PATCH /api/v1/notifications/read-all`, `PATCH /api/v1/notifications/:id/read`).
- Notification inbox access requires explicit `notifications:read` permission (granted to `SALES_MANAGER` and `SUPER_ADMIN`).
- Personal inbox access is strictly scoped to the authenticated user (`requireAuth(req).userId`) at the database query level; ownership is always enforced per authenticated user and IDOR attempts return 404.
- Creation of notifications is strictly internal via `notificationsService`; all DB-bound create fields are normalized and validated before persistence (title <= 200, message <= 2000, type <= 50, entityType <= 50, idempotencyKey <= 128, valid UUIDs); no generic send endpoint is exposed publicly or to CRM.
- Pluggable email provider abstraction (`NotificationEmailProvider`): default `NoopEmailProvider`, testable via `TestEmailProvider`. Currently Noop/Test email providers only. Real external email provider and durable cross-process email delivery idempotency are future infrastructure; in-app notification idempotency is durable in PostgreSQL via unique `idempotency_key`, while email deduplication is handled in-memory within the dispatch path.
- Security: Header injection protection at both service boundary and provider levels rejects CR, LF, CRLF, and Unicode separators (U+2028, U+2029). Dynamic email content is HTML-escaped.
- Contact form integration: Uses failure-isolated post-persistence notification dispatch via `handleContactSubmitted()`. Contact submission persistence completes before notification handling; the call is awaited in the request flow (not background/queue delivery) and any notification failure is isolated so it never crashes or rolls back the contact submission.
- Recipient routing is an unconfirmed business rule: resolver defaults to no automatic recipients unless explicitly configured; no hardcoded roles (`SALES_MANAGER`, `SUPER_ADMIN`) are assumed.

### Website integration (public contact form)

1. Render the captcha widget using action name `contact_submit` (reCAPTCHA v3 or Cloudflare Turnstile).
2. `POST /api/v1/public/contacts` (or alias `POST /api/v1/public/contact`) with the token in the `X-Captcha-Token` header.
3. Protected by `rateLimiters.publicForm` (30 req / 15 min per IP) and CORS origins in `PUBLIC_CORS_ORIGINS`.
4. Stored as `ContactSubmission` with audit actor tracking and soft-delete support. Contact persistence completes before notification handling, followed by failure-isolated post-persistence notification dispatch via `notificationsService` (synchronously awaited in the request flow; external message queue deferred).

### Contact submission workflow & permissions

- Workflow: `NEW → READ → ARCHIVED` (or direct `NEW → ARCHIVED`). `ARCHIVED` is terminal; invalid transitions return HTTP 409 (`CONTACT_INVALID_STATUS_TRANSITION`).
- Permissions:
  - `GET /api/v1/contacts`: requires `contacts:read` (`SALES_MANAGER`, `SUPER_ADMIN`)
  - `GET /api/v1/contacts/:id`: requires `contacts:read` (`SALES_MANAGER`, `SUPER_ADMIN`)
  - `PATCH /api/v1/contacts/:id/status`: requires `contacts:update` (`SALES_MANAGER`, `SUPER_ADMIN`)
  - `DELETE /api/v1/contacts/:id`: requires `contacts:delete` (`SUPER_ADMIN`)

### Website integration (public enquiry form)

1. Render the captcha widget of the configured provider using its **site key**. For reCAPTCHA v3 or
   Turnstile, use the action name `enquiry_submit`.
2. `POST /api/v1/public/enquiries` with the token in the `X-Captcha-Token` header.
3. The website origin must be listed in `PUBLIC_CORS_ORIGINS`.

### Enquiry workflow

`NEW → (assign) → ASSIGNED → CONTACTED → QUOTATION_SENT ⇄ NEGOTIATION → CLOSED_WON | CLOSED_LOST`.
Any open status can move to `CLOSED_LOST`. A lost enquiry can be reopened to `CONTACTED`; a won
one is final. Every change is recorded in the status history with who made it.

## Tests

Tests run against a real PostgreSQL database named in `.env.test`
(`metro_crm_test` on `localhost:5432`, user/password `postgres`). The test run applies the migrations
automatically. The database name must contain `_test`, because tests empty its tables.

## API conventions

```jsonc
// success
{ "success": true, "data": { ... }, "meta": { "pagination": { ... } } }
// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [ ... ], "requestId": "..." } }
```

- CRM endpoints: `/api/v1/<module>`, bearer token required.
- Public website endpoints: `/api/v1/public/<module>`, rate limited, captcha token in `X-Captcha-Token`.
- Every response carries an `X-Request-Id` header. Quote it when reporting a problem.

## Docker

```bash
docker compose up --build
```

The image applies pending migrations on start (`npm run start:migrate`).
