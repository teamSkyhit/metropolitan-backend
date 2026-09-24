# Contributing

## Branches

| Branch        | Purpose                                | Created from | Merges into              |
| ------------- | -------------------------------------- | ------------ | ------------------------ |
| `main`        | Production. Every commit is a release. | n/a          | n/a                      |
| `develop`     | Staging / integration.                 | `main`       | `main` (release PR)      |
| `feature/<x>` | New module or capability               | `develop`    | `develop`                |
| `fix/<x>`     | Bug fix                                | `develop`    | `develop`                |
| `chore/<x>`   | Tooling, dependencies, docs            | `develop`    | `develop`                |
| `hotfix/<x>`  | Urgent production fix                  | `main`       | `main` **and** `develop` |

Names are lowercase kebab-case: `feature/customers`, `fix/enquiry-search-crash`.

Never push directly to `develop` or `main`. Everything goes through a pull request.

## Commits

[Conventional Commits](https://www.conventionalcommits.org), enforced by a git hook and CI:

```
feat(customers): add customer list endpoint
fix(auth): reject reused refresh tokens
chore(deps): bump prisma to 6.19.3
docs: document the release process
```

Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `ci`, `build`, `revert`.
Use the module name as the scope.

## Pull requests

1. Keep PRs focused: one module or one concern.
2. Fill in the PR template checklist.
3. `npm run check` must pass locally. CI runs the same checks plus a migration drift check and an audit.
4. At least one approving review. Changes to `src/shared`, `src/middleware`, `src/config` or `prisma/`
   need a review from a backend lead.
5. Squash-merge into `develop` with a conventional commit title.

## Releases

1. Open a PR `develop → main` titled `release: vX.Y.Z`, listing the changes and any deployment notes
   (migrations, new env vars).
2. After merge, tag `main` with `vX.Y.Z` and deploy.
3. Hotfixes: branch from `main`, PR into `main`, then merge `main` back into `develop`.

## Local setup

See the README. In short:

```bash
cp .env.example .env        # then set JWT_ACCESS_SECRET
npm ci
npm run db:migrate
npm run dev
```

## Adding a module

```bash
npm run gen:module -- customers
```

Then follow the printed steps and [docs/MODULE_STANDARD.md](docs/MODULE_STANDARD.md).
