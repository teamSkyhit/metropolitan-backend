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
npm run dev             # http://localhost:5000
```

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
| `npm run db:studio`            | Prisma Studio                                             |

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
