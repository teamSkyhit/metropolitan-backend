# Module Standard

Every feature of the API is a **module** in `src/modules/<name>/`. All modules look the same, so anyone
can open any module and know where things are. CI and lint enforce most of these rules; reviewers
enforce the rest using the PR checklist.

> Start every new module with the generator:
>
> ```bash
> npm run gen:module -- <plural-kebab-name>     # e.g. customers, price-lists
> ```

## 1. Files and responsibilities

```
src/modules/<name>/
  index.ts              Public API of the module: exports the AppModule (and anything other modules may use)
  <name>.routes.ts      Route table: path → authenticate() → authorize(Permission.X) → controller action
  <name>.controller.ts  HTTP only: validated input in, sendSuccess/sendCreated/sendPaginated out
  <name>.service.ts     Business rules, status transitions, transactions, cross-module calls; throws AppError
  <name>.repository.ts  The ONLY place that touches Prisma for this module's tables
  <name>.schema.ts      zod schemas for params/query/body and response DTOs (+ inferred types)
  <name>.docs.ts        OpenAPI registration using the same schemas
tests/<name>.test.ts    Integration tests (supertest against a real test database)
```

| Layer      | May import                                                | Must not                                  |
| ---------- | --------------------------------------------------------- | ----------------------------------------- |
| routes     | controller, `middleware`, `Permission`                    | contain logic                             |
| controller | service, schemas, `shared/http`                           | touch Prisma, contain business rules      |
| service    | own repository, **other modules' `index.ts`**, `shared/*` | touch Prisma, read `req`/`res`            |
| repository | `config/database` (Prisma), `shared/database`             | contain business rules, throw HTTP errors |

Enforced by ESLint:

- Only `*.repository.ts` files may import `src/config/database` (the Prisma client).
- A module may import another module **only through its `index.ts`** (`../users`, never `../users/users.service`).
- `src/shared` and `src/middleware` must never import from `src/modules`.

## 2. Validation: `handle()`

Controllers declare their input schemas with `handle()`. The route cannot run without validation, and
`req.params` / `req.query` / `req.body` are typed from the schemas.

```ts
export const enquiriesController = {
  list: handle({ query: listEnquiriesQuerySchema }, async (req, res) => {
    const { items, pagination } = await enquiriesService.list(req.query);
    sendPaginated(res, items, pagination);
  }),
};
```

Rules:

- Every string field has a `.max()` length. Trim free text with `.trim()`.
- Emails: `z.email()` lowercased with `.toLowerCase()`. Ids: `z.uuid()` (use `idParamsSchema`).
- Numbers from the query string: `z.coerce.number().int()` with min/max.
- Dates in query strings: `z.iso.date()` (use `dateRangeQuerySchema`); timestamps in bodies: `z.iso.datetime()`.
- Unknown body keys are stripped by zod. Never pass `req.body` straight to Prisma.

## 3. Responses

Use only the helpers in `src/shared/http`:

| Helper                            | Result                                                     |
| --------------------------------- | ---------------------------------------------------------- |
| `sendSuccess(res, data)`          | `200 { success: true, data }`                              |
| `sendCreated(res, data)`          | `201 { success: true, data }`                              |
| `sendPaginated(res, items, meta)` | `200 { success: true, data: [...], meta: { pagination } }` |
| `sendNoContent(res)`              | `204`                                                      |

Services return **DTOs** (plain objects matching the response schema), never raw Prisma rows. That keeps
secrets like `passwordHash` out of responses by construction.

## 4. Errors

- Throw `AppError` from services: `AppError.notFound('Enquiry')`, `AppError.conflict(...)`, `AppError.forbidden()`…
- Domain specific codes are `UPPER_SNAKE_CASE`, prefixed with the module, e.g.
  `ENQUIRY_INVALID_STATUS_TRANSITION`. Declare them in the module's `*.schema.ts` or service.
- Never `try/catch` just to send a response. Express 5 forwards thrown and rejected errors to the error middleware.
- Prisma errors (unique violation, record not found, …) are mapped centrally. Unknown errors become a
  generic `500 INTERNAL_ERROR` and are logged with the request id. Their messages never reach clients.

Error body:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...], "requestId": "..." } }
```

## 5. Authentication and authorization

- Every non-public router starts with `router.use(authenticate())`.
- Every route declares the permission it needs: `authorize(Permission.ENQUIRIES_UPDATE)`.
  **Never check role names in code.**
- Permissions live in `src/shared/security/permissions.ts` as `'<module>:<action>'`. `SUPER_ADMIN` holds
  every permission automatically; other roles are granted explicitly in `ROLE_PERMISSIONS`.
- The acting user is available as `requireAuth(req).userId`. Pass it to the service for audit fields.

## 6. Public (website) endpoints

Endpoints called by the public website go on the module's `publicRouter`, mounted at
`/api/v1/public/<module>`. They get the website CORS allow-list and must use:

```ts
publicRouter.post(
  '/',
  rateLimiters.publicForm,
  requireCaptcha({ action: 'enquiry_submit' }),
  controller.submit
);
```

Public input schemas must be strict about length and size (max array lengths, max string lengths).

## 7. Database

- Models are PascalCase singular. Tables and columns are `snake_case` via `@@map` / `@map`.
- Ids: `String @id @default(uuid()) @db.Uuid`.
- Business tables have `createdAt`, `updatedAt`, `deletedAt`, `createdById`, `updatedById`.
- **Soft delete only.** Repositories spread `notDeleted` into every read and use `softDeleteData(actorId)`
  instead of `delete`. History and child records use `onDelete: Restrict`.
- Unique columns stay reserved after a soft delete. Restore the record instead of recreating it.
- Index every foreign key and every column you filter or sort on (`@@index`).
- Status fields change only through an explicit transition map in the service.
- Multi-step writes use `prisma.$transaction` inside the repository.
- One migration per change, with a meaningful name: `npm run db:migrate -- --name add_enquiry_indexes`.
  Never edit a migration that has been merged to `develop`.

## 8. Tests

Each module ships `tests/<name>.test.ts` covering, for every endpoint:

1. the happy path (response shape included),
2. validation errors (400),
3. missing token (401) and missing permission (403),
4. not found (404) and business rule violations (409 / 400 with the module's error code).

Use `resetDatabase()` in `beforeEach` and the helpers in `tests/helpers`. Tests run against a real
PostgreSQL database named in `.env.test`.

## 9. API documentation

Register every endpoint in `<name>.docs.ts` with the same zod schemas the controller uses. Swagger UI is
at `/api/docs` and the raw document at `/api/docs.json`.

## 10. Definition of done

A module is done when `npm run check` passes, the PR checklist is complete, and the endpoints are
visible and correct in Swagger UI.
