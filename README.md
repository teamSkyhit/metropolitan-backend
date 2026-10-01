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

| Module    | CRM endpoints (`/api/v1`)                                 | Public endpoints (`/api/v1/public`)  |
| --------- | --------------------------------------------------------- | ------------------------------------ |
| health    | `GET /health`, `GET /health/ready`                        | n/a                                  |
| auth      | login, refresh, logout, logout-all, me, change-password   | n/a                                  |
| users     | CRUD for Sales Managers, lookup                           | n/a                                  |
| enquiries | list, detail, notes, status, assignee, follow-ups, delete | `POST /enquiries`                    |
| contacts  | list, detail, status, delete                              | `POST /contacts` (alias: `/contact`) |

Full request/response contracts: Swagger UI at `/api/docs`.

### Website integration (public contact form)

1. Render the captcha widget using action name `contact_submit` (reCAPTCHA v3 or Cloudflare Turnstile).
2. `POST /api/v1/public/contacts` (or alias `POST /api/v1/public/contact`) with the token in the `X-Captcha-Token` header.
3. Protected by `rateLimiters.publicForm` (30 req / 15 min per IP) and CORS origins in `PUBLIC_CORS_ORIGINS`.
4. Stored as `ContactSubmission` with audit actor tracking and soft-delete support. Email / webhook notification dispatch is deferred to BE-3.4 (Notification Module).

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
