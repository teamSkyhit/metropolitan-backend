## What & why

<!-- What does this PR change and why? Link the task/issue. -->

## Type

- [ ] feat — new module / endpoint
- [ ] fix — bug fix
- [ ] refactor / chore / docs / test

## Module standard checklist

- [ ] Follows `docs/MODULE_STANDARD.md` (routes → controller → service → repository)
- [ ] All input validated with zod schemas via `handle()`; no manual `req.body` checks
- [ ] Every protected route uses `authenticate()` + `authorize(Permission.X)`; new permissions added to `src/shared/security/permissions.ts`
- [ ] Errors thrown as `AppError` with a specific code; no `res.status().json()` in controllers
- [ ] Soft delete + audit fields on new business tables; reads filter `notDeleted`
- [ ] Indexes for every foreign key and filter/sort column
- [ ] Migration included and named meaningfully (`npm run db:migrate -- --name ...`)
- [ ] OpenAPI docs registered in `<module>.docs.ts`
- [ ] Tests: happy path, validation (400), auth (401/403), not found (404)
- [ ] New env vars added to `src/config/env.ts` **and** `.env.example`
- [ ] `npm run check` passes locally

## How to test

<!-- Steps or requests a reviewer can run. -->

## Deployment notes

<!-- Migrations, new env vars, data backfills, breaking API changes. Write "None" if none. -->
