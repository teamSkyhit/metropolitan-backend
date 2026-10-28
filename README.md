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

| Module                  | CRM endpoints (`/api/v1`)                                                        | Public endpoints (`/api/v1/public`)                                                                           | Restore Supported                                 |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| health                  | `GET /health`, `GET /health/ready`                                               | n/a                                                                                                           | n/a                                               |
| auth                    | login, refresh, logout, logout-all, me, change-password                          | n/a                                                                                                           | n/a                                               |
| users                   | CRUD for Sales Managers, lookup, status, reset, restore                          | n/a                                                                                                           | Yes (`POST /users/:id/restore`)                   |
| enquiries               | list, detail, notes, status, assignee, follow-ups, delete                        | `POST /enquiries`                                                                                             | No                                                |
| brands                  | list, create, detail, update, delete, restore, logo/banner                       | `GET /brands`, `GET /brands/:slug`                                                                            | Yes (`POST /brands/:id/restore`)                  |
| categories              | list, create, detail, update, delete, restore, image, banner                     | `GET /categories`, `GET /categories/:slug`                                                                    | Yes (`POST /categories/:id/restore`)              |
| products                | list, create, detail, update, delete, restore, gallery, videos, documents, specs | `GET /products`, `GET /products/:slug`                                                                        | Yes (`POST /products/:id/restore`)                |
| media                   | list, detail, upload, delete (with in-use reference guard)                       | n/a                                                                                                           | No                                                |
| dashboard               | summary, trends, recent-enquiries                                                | n/a                                                                                                           | n/a                                               |
| contacts                | list, detail, status, delete                                                     | `POST /contacts` (alias: `/contact`)                                                                          | No                                                |
| notifications           | list, unread-count, read-all, mark-read                                          | n/a                                                                                                           | No                                                |
| homepage                | list, detail, create, update, delete, reorder                                    | `GET /homepage`                                                                                               | No                                                |
| industrial-capabilities | list, create, detail, update, delete, restore, reorder, image, settings          | `GET /industrial-capabilities`, `GET /industrial-capabilities/:slug`, `GET /industrial-capabilities/settings` | Yes (`POST /industrial-capabilities/:id/restore`) |

Full request/response contracts: Swagger UI at `/api/docs`. Swagger is available in local and staging environments, and disabled in production.

- **Product Media Architecture**:
  - **Storage Architecture**:
    - Binary file contents are **never** stored in PostgreSQL.
    - Files are streamed and stored in S3/Cloudflare R2 object storage; PostgreSQL only stores relational metadata and references (`Media`, `ProductGalleryImage`, `ProductVideo`, `ProductDocument`).
    - Strict magic-byte inspection prevents MIME spoofing, script embedding, and renamed non-media payloads.
  - **Batch Atomicity & Zero-Orphan Guarantee**:
    - Multi-file batch uploads (Gallery images, Videos, Documents) execute within an atomic database transaction wrapped with product-level concurrency locks (`SELECT ... FOR UPDATE`).
    - If any file fails validation, storage upload, Media creation, or join creation, all newly uploaded storage objects in that batch are pruned immediately and the DB transaction rolls back completely.
    - Zero orphan `Media` rows or dangling relation rows are left in the database.
  - **Concurrency & Invariant Protection**:
    - Row-level locking on the parent Product prevents race conditions where concurrent requests could exceed capacity limits (max 5 gallery, max 2 videos, max 3 documents) or designate conflicting primary images.
  - **Media Deletion Lifecycle**:
    - Deleting a Product Gallery image, Video, or Document soft-deletes the join row.
    - If the associated `Media` asset is unreferenced anywhere else across the catalog/CMS, the media record is soft-deleted and its file in storage is permanently deleted.
    - If the `Media` asset is shared (referenced elsewhere), the storage object and Media record are preserved.
  - **Soft-Delete Reference Isolation**:
    - Media reference checks only count relations where both the join row and parent entity are active (`deletedAt IS NULL`). Soft-deleted products never block deletion of their unused media assets.
  - **Product Gallery (Images)**:
    - **Limit**: Maximum 5 active gallery images per Product.
    - **Size Limit**: Maximum 5 MB per image.
    - **Allowed Formats**: JPG, JPEG, PNG, WebP (magic-byte validated).
    - **Multipart Field**: `images`.
    - **Primary Image & imageUrl Synchronization**: Exactly zero or one primary image (`isPrimary`). When gallery images exist, the primary image is canonical and mirrors `Product.imageUrl`. Setting a primary image syncs `Product.imageUrl`. Deleting the primary image automatically promotes the next active image and syncs `Product.imageUrl`. Deleting the last gallery image clears `Product.imageUrl`.
    - **Endpoints**:
      - `POST /api/v1/products/:id/gallery` (upload up to remaining allowance, canonical field `images`)
      - `PATCH /api/v1/products/:id/gallery/reorder` (reorder gallery items by UUID array)
      - `PATCH /api/v1/products/:id/gallery/:galleryImageId/primary` (designate primary image)
      - `DELETE /api/v1/products/:id/gallery/:galleryImageId` (remove gallery image and clean unreferenced media)
  - **Product Videos (Memory-Safe Streaming)**:
    - **Limit**: Maximum 2 active videos per Product.
    - **Size Limit**: Maximum 100 MB per video.
    - **Allowed Formats**: MP4 (`video/mp4`, strictly validated for safe compatible brands: `isom`, `iso2`, `mp41`, `mp42`, `avc1`, `mp71`; rejects QuickTime MOV, HEIF, 3GP), WebM (`video/webm`, EBML header validated with `webm` DocType).
    - **Memory Safety**: Video uploads stream to disk temp files without buffering 100 MB payloads into Node memory. Content validation inspects only the first 512 bytes of the file, then streams directly to S3/R2 storage, and cleans up temporary files in `finally` handlers.
    - **Multipart Field**: Canonical field `videos` (alias `video`).
    - **Endpoints**:
      - `POST /api/v1/products/:id/videos` (upload up to remaining allowance, canonical field `videos`)
      - `PATCH /api/v1/products/:id/videos/reorder` (reorder videos by UUID array)
      - `PATCH /api/v1/products/:id/videos/:videoId` (update optional title)
      - `DELETE /api/v1/products/:id/videos/:videoId` (remove video and clean unreferenced media)
  - **Product Documents (PDFs)**:
    - **Limit**: Maximum 3 active PDF documents per Product.
    - **Size Limit**: Maximum 10 MB per PDF.
    - **Allowed Formats**: `application/pdf` only (strictly validated with `%PDF-` binary magic header).
    - **Multipart Field**: Canonical field `documents` (backward-compatible alias `file`).
    - **Metadata**: Each document supports a title, original filename, and deterministic sort order.
    - **Endpoints**:
      - `POST /api/v1/products/:id/documents` (upload up to remaining allowance, canonical field `documents`)
      - `PATCH /api/v1/products/:id/documents/:documentId` (update title)
      - `PATCH /api/v1/products/:id/documents/reorder` (reorder documents by UUID array)
      - `DELETE /api/v1/products/:id/documents/:documentId` (remove document and clean unreferenced media)

### Single Product Detail Page Model

- **Product Scalar & Overview Fields**:
  - `shortDescription` (String, max 500 chars): Hero summary beside product name and SKU.
  - `description` / `overview` (String): Dedicated Product Overview content.
  - `series` (String, max 100 chars): Product series code/identifier (e.g. `HDO / HDP`).
  - `price` & `priceVisibility`: Preserves optional pricing and visibility settings (`HIDDEN`, `VISIBLE`, `CALL_FOR_PRICE`).
- **Product Features (ProductFeature)**:
  - Dynamic ordered features with `icon` (controlled key/URL), `title`, `description`, `sortOrder`.
  - Endpoints: `POST /api/v1/products/:id/features`, `PATCH /api/v1/products/:id/features/:featureId`, `PATCH /api/v1/products/:id/features/reorder`, `DELETE /api/v1/products/:id/features/:featureId`.
- **Key Benefits (ProductKeyBenefit)**:
  - Dynamic ordered key benefits with `icon`, `title`, `description`, `sortOrder`.
  - Endpoints: `POST /api/v1/products/:id/key-benefits`, `PATCH /api/v1/products/:id/key-benefits/:benefitId`, `PATCH /api/v1/products/:id/key-benefits/reorder`, `DELETE /api/v1/products/:id/key-benefits/:benefitId`.
- **Related Products (ProductRelatedProduct)**:
  - Explicit ordered product relations. Validates self-relation prevention and duplicate prevention.
  - Endpoints: `PUT /api/v1/products/:id/related-products`.
- **SEO Meta**:
  - `metaTitle`, `metaDescription`, `metaKeywords`, `canonicalUrl`, `ogImageUrl` with automated fallbacks.
- **Public Product Detail Contract (`GET /api/v1/public/products/:slug`)**:
  - Returns complete dynamic shape with gallery, videos, documents, specifications, features, key benefits, brand (with `logoUrl`), category (with `imageUrl` and `bannerUrl`), related products, and SEO metadata.
- **Public Product Listing (`GET /api/v1/public/products`)**:
  - Lightweight card payload omitting heavy relations (`features`, `keyBenefits`, `relatedProducts`, `gallery`, `videos`, `documents`) for optimal performance.

### Category Media Architecture

- **Category Image**:
  - **Purpose**: Category cards, thumbnails, and listing display.
  - **Limit**: Exactly 1 active image.
  - **Size Limit**: Maximum 5 MB (JPG, JPEG, PNG, WebP).
  - **Multipart Field**: `image`.
  - **Canonical Method**: `PUT /api/v1/categories/:id/image` (create or replace). Backward-compatible alias `POST` mounted.
  - **Delete**: `DELETE /api/v1/categories/:id/image`.
- **Category Banner**:
  - **Purpose**: Category detail page hero/banner.
  - **Limit**: Exactly 1 active banner.
  - **Size Limit**: Maximum 5 MB (JPG, JPEG, PNG, WebP).
  - **Multipart Field**: `banner`.
  - **Canonical Method**: `PUT /api/v1/categories/:id/banner` (create or replace). Backward-compatible alias `POST` mounted.
  - **Delete**: `DELETE /api/v1/categories/:id/banner`.
- **Independence & Atomic Replacement**:
  - Category Image and Category Banner have independent lifecycles. Modifying or deleting the Image never impacts the Banner, and vice-versa.
  - Safe replacement sequence: upload new asset → atomic database transaction (create `Media` record + update `Category` with `imageUrl`/`imageMediaId` or `bannerUrl`/`bannerMediaId`) → clean up previous asset.
  - If `Media` creation or `Category` update fails, the database rolls back, no partial URL is persisted, and the newly uploaded storage object is immediately cleaned up.
- **Media Reference Protection**:
  - `DELETE /api/v1/media/:id` is blocked with HTTP 409 Conflict (`MEDIA_IN_USE`) if referenced by active `Product.imageUrl`, `ProductGalleryImage`, `ProductVideo`, `ProductDocument`, `Category.imageMediaId/imageUrl`, `Category.bannerMediaId/bannerUrl`, Brand asset, or Homepage section slide.

### Categories: Dynamic Icons & Reordering

- **Dynamic Icon Management**:
  - Categories support a dynamic `icon` field manageable via CRM create (`POST /api/v1/categories`) and update (`PATCH /api/v1/categories/:id`).
  - **Allowed Formats & Rules**:
    - Lucide icon identifier (e.g. `gear`, `droplet`, `power-transmission` matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`).
    - Secure HTTPS icon URL (e.g. `https://assets.example.com/icons/gear.svg`).
    - Root-relative SVG path (e.g. `/icons/categories/gear.svg`).
    - Unsafe schemes (`javascript:`, `data:`, `file:`, `//`), insecure HTTP URLs, raw `<svg>` markup, `<script>` tags, and spaces/disallowed characters are strictly rejected with HTTP 400.
  - Setting `icon: null` or omitting during creation leaves the category without an icon (`null`).
- **Category Reordering**:
  - `PATCH /api/v1/categories/reorder` atomically updates display sort orders (`sortOrder`) across all categories.
  - Requires `categories:update` permission.
  - Executes inside a database transaction (`prisma.$transaction`), validating that every provided ID exists and is non-deleted, rejecting duplicates, and tracking `updatedById`.
- **Public Icon Exposure**:
  - Public category listing (`GET /api/v1/public/categories`) and detail (`GET /api/v1/public/categories/:slug`) return `icon` alongside `imageUrl` and `bannerUrl`.

### Restore Policy Summary

Soft-delete restore endpoints (`POST /api/v1/<module>/:id/restore`) are supported for:

- **Users**: Restores soft-deleted account (`users:delete` permission).
- **Brands**: Restores soft-deleted brand (`brands:delete` permission).
- **Categories**: Restores soft-deleted category (`categories:delete` permission).
- **Products**: Restores soft-deleted product (`products:delete` permission).
- **Industrial Capabilities**: Restores soft-deleted capability (`industrial-capabilities:update` permission).

Restore is intentionally **not supported** (absent) for transactional, audit, or content records:

- **Enquiries**: Terminal records / append-only audit trail.
- **Contacts**: External inbound submissions.
- **Media**: Deletions perform physical asset cleanup; re-upload is required.
- **Homepage Sections**: Content containers are created or replaced directly.

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

### Industrial Capabilities Module

- **Dynamic Module Architecture**:
  - Fully dynamic management of Industrial Capability cards and core segments.
- **Dedicated Settings Ownership**:
  - `GET /api/v1/industrial-capabilities/settings`: Retrieves the section eyebrow, title, and description (`industrial-capabilities:read`).
  - `PATCH /api/v1/industrial-capabilities/settings`: Updates the section eyebrow, title, and description (`industrial-capabilities:update`).
  - **Ownership Isolation**: Section settings are stored in a dedicated singleton table `industrial_capability_settings` owned exclusively by the `industrial-capabilities` module. They are completely decoupled from `homepage_sections` and immune to homepage mutation, deletion, or reordering. `HOMEPAGE_*` permissions cannot read, mutate, or delete these settings.
  - **Validation**: Settings description is constrained to a maximum of 1,000 characters.
- **CRM Management Endpoints (`/api/v1/industrial-capabilities`)**:
  - `GET /api/v1/industrial-capabilities`: List capability cards with search, pagination, and active filters (`industrial-capabilities:read`).
  - `GET /api/v1/industrial-capabilities/:id`: Retrieve single capability card detail (`industrial-capabilities:read`).
  - `POST /api/v1/industrial-capabilities`: Create capability card with unique slug, number, title, icon, typical products array, and description (`industrial-capabilities:create`). Enforces max 5,000 characters on `description`.
  - `PATCH /api/v1/industrial-capabilities/:id`: Partial update of capability card fields (`industrial-capabilities:update`). Enforces max 5,000 characters on `description`.
  - `PATCH /api/v1/industrial-capabilities/reorder`: Atomic reordering of capabilities by UUID array (`industrial-capabilities:update`).
  - `DELETE /api/v1/industrial-capabilities/:id`: Soft-deletes capability card, excludes from active lists, and records `deletedAt` and audit metadata (`industrial-capabilities:delete`).
  - `POST /api/v1/industrial-capabilities/:id/restore`: Restores soft-deleted capability card (`industrial-capabilities:update`). Validates that the record is deleted, checks for active duplicate slug conflicts, clears `deletedAt`, and updates audit metadata.
  - `PUT /api/v1/industrial-capabilities/:id/image`: Upload or replace capability card image (`industrial-capabilities:update`).
  - `DELETE /api/v1/industrial-capabilities/:id/image`: Remove capability card image (`industrial-capabilities:update`).
- **Media Lifecycle & Reference Isolation**:
  - Capability card images are integrated with the Media Library.
  - Uploading a replacement image or deleting an image automatically prunes the previous Media Library asset via `mediaService.deleteIfUnreferenced()`, preventing orphan storage objects and stale database rows.
- **Public Website Endpoint**:
  - `GET /api/v1/public/industrial-capabilities`: Public, unauthenticated, rate-limited endpoint returning section settings and active segments ordered by `sortOrder ASC, id ASC`.
  - Internal audit metadata (`createdById`, `updatedById`, `deletedAt`) and media references (`imageMediaId`) are excluded from public responses.
- **Permissions**:
  - Access is governed strictly by `industrial-capabilities:read`, `industrial-capabilities:create`, `industrial-capabilities:update`, and `industrial-capabilities:delete`.
  - Both `SUPER_ADMIN` and `SALES_MANAGER` are granted full access. `CRM_USER` is denied all access (403 Forbidden).

### Storage & Media Library

- **Drivers**:
  - `STORAGE_DRIVER=local` (default): Saves uploads to local filesystem under `STORAGE_LOCAL_DIR` (`uploads/`) and serves statically from `STORAGE_BASE_URL` (`/uploads`).
  - `STORAGE_DRIVER=s3`: S3-compatible object storage provider, configured for Cloudflare R2 and AWS S3.
- **Cloudflare R2 Deployment Setup**:
  - `STORAGE_DRIVER=s3`
  - `S3_BUCKET`: The R2 bucket name (e.g. `metropolitan-staging` or `metropolitan-media`).
  - `S3_REGION=auto`: Cloudflare R2 accepts `auto` as the region string.
  - **S3 API Endpoint vs. Public Media URL**:
    - `S3_ENDPOINT`: Private S3-compatible API endpoint used by the backend SDK for read/write/delete operations (e.g. `https://<account_id>.r2.cloudflarestorage.com`). The S3 client is configured with virtual-hosted style (`forcePathStyle: false`) as our chosen compatible configuration. This endpoint is strictly internal to the backend and **never** used to construct public URLs.
    - `S3_PUBLIC_BASE_URL`: Public base URL for serving uploaded assets to clients and browsers (e.g. `https://pub-<hash>.r2.dev` or a custom domain like `https://media.metropolitan.com`). `getUrl()` always constructs `<S3_PUBLIC_BASE_URL>/<key>` safely without duplicate slashes. Must be a valid HTTP or HTTPS URL.
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
- **Media Delete Guard**: `DELETE /api/v1/media/:id` returns 409 Conflict if an active product, brand logo/banner, category banner, or active homepage section references the asset.
- **Media thumbnailUrl Contract**: `thumbnailUrl` in `MediaDto` is currently an alias to `publicUrl` provided for frontend grid compatibility. Server-side image transformation/CDN variants are deferred.

### Notifications module

- In-app CRM notifications (`GET /api/v1/notifications`, `GET /api/v1/notifications/unread-count`, `PATCH /api/v1/notifications/read-all`, `PATCH /api/v1/notifications/:id/read`).
- Notification inbox access requires explicit `notifications:read` permission (granted to `SALES_MANAGER` and `SUPER_ADMIN`).
- Personal inbox access is strictly scoped to the authenticated user (`requireAuth(req).userId`) at the database query level; ownership is always enforced per authenticated user and IDOR attempts return 404.
- Creation of notifications is strictly internal via `notificationsService`; all DB-bound create fields are normalized and validated before persistence (title <= 200, message <= 2000, type <= 50, entityType <= 50, idempotencyKey <= 128, valid UUIDs); no generic send endpoint is exposed publicly or to CRM.
- Pluggable email provider abstraction (`NotificationEmailProvider`): default `NoopEmailProvider`, testable via `TestEmailProvider`. Currently Noop/Test email providers only. Real external email provider and durable cross-process email delivery idempotency are future infrastructure; in-app notification idempotency is durable in PostgreSQL via unique `idempotency_key`, while email deduplication is handled in-memory within the dispatch path.
- Security: Header injection protection at both service boundary and provider levels rejects CR, LF, CRLF, and Unicode separators (U+2028, U+2029). Dynamic email content is HTML-escaped.
- Contact form integration: Uses failure-isolated post-persistence notification dispatch via `handleContactSubmitted()`. Contact submission persistence completes before notification handling; the call is awaited in the request flow (not background/queue delivery) and any notification failure is isolated so it never crashes or rolls back the contact submission.
- Recipient routing is an unconfirmed business rule: resolver defaults to no automatic recipients unless explicitly configured; no hardcoded roles (`SALES_MANAGER`, `SUPER_ADMIN`) are assumed. Contact submission succeeds and notification plumbing exists, but the default recipient resolver is empty. No CRM in-app or email notifications will be created upon contact submission until `configureContactNotifications` receives an approved recipient policy.
- Rate limiting operates with an in-memory store: safe for single backend instance deployment (single-instance staging capable). A shared store (e.g. Redis) is required before deploying multiple backend instances or auto-scaling.

### Website integration (public contact form)

1. Render the captcha widget using action name `contact_submit` (reCAPTCHA v3 or Cloudflare Turnstile).
2. `POST /api/v1/public/contacts` (or alias `POST /api/v1/public/contact`) with the token in the `X-Captcha-Token` header.
3. Protected by `rateLimiters.publicForm` (default 10 req / 15 min per IP; configurable via `RATE_LIMIT_PUBLIC_MAX`) and CORS origins in `PUBLIC_CORS_ORIGINS`.
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

### Regular CRM User (`CRM_USER`) Role & Permission Matrix

The `CRM_USER` role provides focused access strictly scoped to handling enquiries, without administrative or catalog management privileges.

- **Allowed Operations**:
  - `enquiries:read`: List enquiries (`GET /api/v1/enquiries`) and view enquiry detail (`GET /api/v1/enquiries/:id`).
  - `enquiries:update`: Update enquiry status (`POST /api/v1/enquiries/:id/status`) and edit sales notes (`PATCH /api/v1/enquiries/:id`).
  - `enquiries:follow-up`: Add customer follow-up entries (`POST /api/v1/enquiries/:id/follow-ups`).
- **Denied Operations (HTTP 403 Forbidden)**:
  - **Enquiry Assignment**: `PUT /api/v1/enquiries/:id/assignee` requires `enquiries:assign`. `CRM_USER` cannot assign, reassign, or alter enquiry ownership.
  - **Products**: All endpoints under `/api/v1/products` (read, create, update, delete, media, specifications).
  - **Categories**: All endpoints under `/api/v1/categories` (read, create, update, delete, reorder, media).
  - **Brands**: All endpoints under `/api/v1/brands` (read, create, update, delete, media).
  - **Users**: All endpoints under `/api/v1/users` (read, create, status, password reset, restore).
  - **Homepage**: All endpoints under `/api/v1/homepage/sections` (read, create, update, delete, reorder).
  - **Media Library**: All endpoints under `/api/v1/media` (list, upload, delete).
  - **Industrial Capabilities**: All endpoints under `/api/v1/industrial-capabilities` (list, detail, create, update, delete, restore, reorder, image, settings).
  - **Dashboard**: All endpoints under `/api/v1/dashboard/*` and `/api/v1/enquiries/dashboard`.

### Add to Quote (Multi-Product Enquiries)

- **Submission Endpoint**: `POST /api/v1/public/enquiries`
  - Protected with `rateLimiters.publicForm` and captcha verification (`enquiry_submit`).
- **Modern `items[]` Quote Structure**:
  - Accepts an array of quote items: `items: [{ productId, quantity }]`.
  - **Product ID Validation**: `productId` must be a valid UUID format (`z.uuid()`). Malformed, blank, or non-UUID strings are rejected at the schema level with HTTP 400 (`VALIDATION_ERROR`).
  - **Quantity Rules**: `quantity` must be a positive integer between 1 and 1,000,000 (`MAX_QUANTITY`). Non-integers, zeros, and negative numbers are rejected with HTTP 400.
  - **Duplicate Product Rejection**: Submitting duplicate products within `items[]` is rejected with HTTP 400 (`DUPLICATE_QUOTE_PRODUCT`).
  - **Catalog Validation**: Product IDs are validated via `productsService.validateForQuote()`. Products must exist, be in `PUBLISHED` status, and not soft-deleted. Non-existent products return 400 (`QUOTE_PRODUCT_NOT_FOUND`), while draft or inactive products return 400 (`QUOTE_PRODUCT_UNAVAILABLE`).
  - **Frozen Snapshotting**: Each line item records a frozen snapshot of the product's canonical `productName` and `sku`, along with relational reference `productIdRef`.
  - **Atomic Transaction**: The entire enquiry and its line items are created inside a database transaction (`prisma.$transaction`). If any product fails validation, no records or line items are persisted.
- **Legacy `lineItems` Backwards Compatibility**:
  - Legacy payloads providing `lineItems: [{ productId, sku, productName, quantity }]` continue to be supported.
  - Legacy submissions preserve custom/external string `productId` values and explicitly assign `productIdRef: null`. They do not create direct foreign key references without product validation, preventing database FK constraint errors (500) on legacy data.

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

Staging uses **Railway’s GitHub integration** (no project token / GitHub Actions deploy required).

### One-time Railway setup

1. Open service **`thorough-victory`** (ID `f7a3da41-0e99-47fc-a312-303df610ba1e`).
2. **Settings → Source**
   - Connect the GitHub repo `teamSkyhit/metropolitan-backend` (authorize Railway if prompted).
   - **Branch:** `develop`
   - Enable **Wait for CI** only if you want green CI before deploy (optional).
   - Ensure auto-deploy on push is enabled for that branch.
3. **Settings → Deploy / Build**
   - Builder: Dockerfile (repo root `Dockerfile`), or Railway’s detected Node build if you already use that.
   - Start command should remain the image default: `npm run start:migrate`  
     (`prisma migrate deploy` → `npm run db:seed` → `node dist/server.js`).
4. **Variables** (service or shared env), set at least:
   - Staging app config from `.env.example` (`APP_ENV=staging`, `DATABASE_URL`, JWT, CORS, captcha, etc.)
   - `SEED_SUPER_ADMIN_NAME=Super Admin`
   - `SEED_SUPER_ADMIN_EMAIL=<your admin email>`
   - `SEED_SUPER_ADMIN_PASSWORD=<10+ chars, letter + digit>`  
     (`Test@1234` is too short — use e.g. `Test@12345`.)
5. Trigger a deploy (push to `develop`, or **Deploy** in the Railway UI).
6. Check deploy logs for `Super Admin created: …` (or “already exists”).
7. After the first successful seed, **remove `SEED_SUPER_ADMIN_PASSWORD`** from Railway variables.

Do not commit seed passwords to git. Account API tokens are not needed for this path.
