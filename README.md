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
| homepage      | list, detail, create, update, delete, reorder               | `GET /homepage`                            |

Full request/response contracts: Swagger UI at `/api/docs`.

### Homepage CMS Module

- **Public Homepage Endpoint**: `GET /api/v1/public/homepage`
  - Unauthenticated, read-heavy public endpoint returning active, non-deleted homepage sections ordered by `sortOrder ASC, id ASC`.
  - Protected with `rateLimiters.publicCatalog`.
  - Returns public-safe response shape `{ success: true, data: { sections: [...] } }`. Internal audit metadata (`createdById`, `updatedById`, `deletedAt`) and media `storageKey` are strictly excluded.
- **CRM Management Endpoints**:
  - `GET /api/v1/homepage/sections`: requires `homepage:read` (`SALES_MANAGER`, `SUPER_ADMIN`)
  - `GET /api/v1/homepage/sections/:id`: requires `homepage:read` (`SALES_MANAGER`, `SUPER_ADMIN`)
  - `POST /api/v1/homepage/sections`: requires `homepage:create` (`SUPER_ADMIN`)
  - `PATCH /api/v1/homepage/sections/:id`: requires `homepage:update` (`SUPER_ADMIN`)
  - `PATCH /api/v1/homepage/sections/reorder`: requires `homepage:update` (`SUPER_ADMIN`)
  - `DELETE /api/v1/homepage/sections/:id`: requires `homepage:delete` (`SUPER_ADMIN`)
- **Permissions & Role Access**:
  - `SUPER_ADMIN`: holds all homepage permissions (`homepage:read`, `homepage:create`, `homepage:update`, `homepage:delete`).
  - `SALES_MANAGER`: granted `homepage:read` for viewing homepage content in CRM; write permissions are reserved for `SUPER_ADMIN` (unconfirmed business rule requiring senior confirmation).
- **Supported Section Types**:
  - `HERO`: Carousel/slider container with structured slides referencing Media Library assets (`mediaId`), heading, subheading, safe CTA label and URL, sort order, and active toggle. Single-instance active section.
  - `FEATURED_PRODUCTS`: References active, published products by UUID (`productIds`). Validated via Products service boundary. Single-instance active section.
  - `FEATURED_CATEGORIES`: References active categories by UUID (`categoryIds`). Validated via Categories service boundary. Single-instance active section.
  - `FEATURED_BRANDS`: References active brands by UUID (`brandIds`). Validated via Brands service boundary. Single-instance active section.
  - `PROMO_BANNER`: Promotional banner referencing Media Library image (`mediaId`), heading, description, safe CTA label and URL. Multiple instances allowed across the homepage.
- **Section Type Immutability**:
  - A section's `type` is fixed at creation time and cannot be modified via `PATCH` to ensure strict payload schema consistency.
- **Single-Instance Enforcement**:
  - Attempting to create or activate a second instance of `HERO`, `FEATURED_PRODUCTS`, `FEATURED_CATEGORIES`, or `FEATURED_BRANDS` returns HTTP 409 Conflict (`HOMEPAGE_SECTION_DUPLICATE`).
- **Ordering & Atomic Reordering**:
  - Deterministic sort order: `sortOrder ASC, id ASC`.
  - Reordering (`PATCH /api/v1/homepage/sections/reorder`) executes inside a database transaction (`prisma.$transaction`), validates all section IDs exist and are not deleted, and updates `updatedById` and `updatedAt`.
- **Media Library Integration & Delete Guard**:
  - CMS references approved Media Library records via service boundary (`mediaService`); no duplicate upload system is created.
  - Media delete guard (`DELETE /api/v1/media/:id`) blocks deletion with HTTP 409 Conflict (`MEDIA_IN_USE`) if the asset is actively referenced by an active homepage hero slide or banner.
- **Active / Inactive & Soft-Delete Workflow**:
  - Inactive sections (`isActive: false`) are visible and editable in CRM but omitted from the public endpoint.
  - Transitioning an inactive section to active revalidates its effective media, product, category, or brand references before persistence. Invalid references return HTTP 400 (`HOMEPAGE_REFERENCE_INVALID`) and the section remains inactive; single-instance checks still apply.
  - Soft-deleting a section records `deletedAt` and `updatedById`. Soft-deleted sections are excluded from CRM lists and public responses.
- **Partial PATCH Semantics**:
  - `PATCH /api/v1/homepage/sections/:id` writes only fields explicitly supplied by the client, plus `updatedById` and Prisma-managed `updatedAt`. Omitted `content` is neither reconstructed nor written, reducing lost-update risk during concurrent edits.
- **Text / HTML Policy**:
  - Text fields are stored and returned as plain strings. HTML is not interpreted or sanitized as rich text. Consumers must render these values as text, not via raw HTML.
- **Stable HERO Slide IDs**:
  - HERO slide IDs are UUIDs, unique within their section. Missing IDs are generated once and persisted on create or content update; supplied valid IDs are preserved.
  - Legacy JSON rows without slide IDs receive deterministic compatibility IDs in public responses. Public reads never generate random IDs, so repeated responses remain stable; the IDs are persisted if that HERO content is later written through the CMS.
- **Stale Reference Resilience Policy**:
  - Referenced products that are soft-deleted, in draft status, or belong to an inactive/deleted brand or category are omitted from public response items.
  - Referenced brands, categories, or media assets that are deactivated or soft-deleted are omitted from public response items.
  - If all referenced items within a section are stale or inactive (0 valid items remaining), the empty section is safely omitted from the public response to prevent broken UI layouts and 500 errors.
- **CTA URL Security**:
  - Validates all CTA links against an approved pattern: internal relative paths starting with `/` (e.g. `/products`) or secure HTTP/HTTPS URLs. Unsafe schemes (`javascript:`, `data:`, `file:`, `//`) and whitespace are rejected.

### Storage & Media Library

- **Drivers**:
  - `STORAGE_DRIVER=local` (default): Saves uploads to local filesystem under `STORAGE_LOCAL_DIR` (`uploads/`) and serves statically from `STORAGE_BASE_URL` (`/uploads`).
  - `STORAGE_DRIVER=s3`: S3-compatible object storage provider, optimized for Cloudflare R2 and AWS S3.
- **Cloudflare R2 Deployment Setup**:
  - `STORAGE_DRIVER=s3`
  - `S3_BUCKET`: The R2 bucket name (e.g. `metropolitan-media`).
  - `S3_REGION=auto`: Cloudflare R2 uses `auto` as the region string (unlike AWS regions such as `us-east-1`).
  - **S3 API Endpoint vs. Public Media URL**:
    - `S3_ENDPOINT`: Private S3-compatible API endpoint used by the backend SDK for read/write/delete operations (e.g. `https://<account_id>.r2.cloudflarestorage.com`). The SDK uses virtual-hosted style (`forcePathStyle: false`). This endpoint is strictly internal to the backend and **never** used to construct public URLs.
    - `S3_PUBLIC_BASE_URL`: Public base URL for serving uploaded assets to clients and browsers (e.g. `https://pub-<hash>.r2.dev` or a custom domain like `https://media.metropolitan.com`). `getUrl()` always constructs `<S3_PUBLIC_BASE_URL>/<key>` safely without duplicate slashes.
  - **Required Permissions**:
    - In Cloudflare Dashboard → R2 → Manage R2 API Tokens, create a token with `Object Read & Write` permissions scoped to the target bucket.
    - Map the generated credentials to `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`.
  - **Secret Handling Guidance**:
    - Never commit real R2 access keys or secret keys to version control.
    - Store `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` in environment secrets (e.g. Render, Railway, AWS Secrets Manager, GitHub Secrets).
    - `.env.example` lists all required storage variables with empty placeholders.
  - **Path Sanitization & Key Derivation**:
    - Safe folder/path sanitization rules reject directory traversal (`..`), leading slashes, and absolute escapes on both local and S3 drivers.
    - `delete()` accepts either a raw storage key or a full public/endpoint URL, correctly deriving the object key and stripping any bucket name prefixes so `metropolitan-media/<key>` is never sent as the DeleteObject key.
- **Media Delete Guard**: `DELETE /api/v1/media/:id` returns 409 Conflict if an active product, brand logo/banner, or category banner references the asset.

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

The image runs `npm run start:migrate` on boot: `prisma migrate deploy` → `npm run db:seed` (idempotent Super Admin) → API. Set `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD` (min 10 chars, letter + digit) for the first boot.

## Railway (staging from `develop`)

GitHub Actions workflow [`.github/workflows/deploy-railway.yml`](.github/workflows/deploy-railway.yml) deploys on every push to `develop` (and via **workflow_dispatch**).

### One-time GitHub setup

1. In Railway → Project → **Settings → Tokens** → create a **project token** for the staging environment.
2. In GitHub → repo **Settings → Secrets and variables → Actions**:
   - Secret `RAILWAY_TOKEN` = that project token
   - Variable `RAILWAY_SERVICE` = backend service name or ID
3. In Railway → backend service → **Variables**, set at least:
   - All app env vars from `.env.example` for staging (`APP_ENV=staging`, `DATABASE_URL`, JWT, CORS, captcha, etc.)
   - `SEED_SUPER_ADMIN_NAME=Super Admin`
   - `SEED_SUPER_ADMIN_EMAIL=<your admin email>`
   - `SEED_SUPER_ADMIN_PASSWORD=<10+ chars, letter + digit>`
4. After the first successful deploy creates the Super Admin, **remove `SEED_SUPER_ADMIN_PASSWORD`** from Railway variables (seed will no-op while an admin exists).

Seed runs **inside Railway** on container start (not on the GitHub runner). Do not commit seed passwords to git.
