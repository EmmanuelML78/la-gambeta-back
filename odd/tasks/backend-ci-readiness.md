# Backend CI readiness

## Objective

Add reproducible pull-request checks to the backend baseline before integrating the admin PR chain.

## Scope and constraints

- Source: local `origin/master` at `c8a087e`; work only on `feat/backend-ci-readiness` in this isolated worktree.
- Local preparation only. Do not push, open a PR, merge, deploy, install dependencies, use Corepack, or modify other worktrees.
- Use Node 24, pnpm 10, the committed lockfile, and synthetic PostgreSQL credentials in CI. Do not expose repository secrets to pull requests.
- Keep the stale `test:e2e` target out of CI until its fixture is repaired.
- TDD: off (existing project context); runner: Jest (`jest --runInBand`). Applicable checks are still required.
- Delivery strategy: `ask-on-risk`. Forecast: under 400 authored changed lines per work unit (advisory, not code-golf).

## Tasks

- [x] **CI-1 — Baseline quality job.** Added a GitHub Actions workflow for pull requests and baseline pushes, using frozen pnpm install, check-only lint, Jest, TypeScript, and build. Route: delegated writer because the workflow and documentation are coordinated non-trivial edits. Acceptance: no mutating lint/format command, no secrets, no `pull_request_target`; workflow parsed and local equivalents passed. Commit: `942d07dc650f19d0499a2b1791df0e52db145ddc`.
- [x] **CI-2 — Isolated database job.** Added PostgreSQL 17 migration and auth integration checks with synthetic loopback-only credentials; documented how CI checks run and why stale e2e remains excluded. Route: delegated writer, same worktree. Acceptance: database name and host satisfy the test's guard; the workflow lists migrations before auth integration; the local database run is explicitly unrun because no local PostgreSQL listener is available. Commit: `28e165924ff3ec0eeedc5dbceb39dbd8afe15f34`.

## Verification and progress

- Baseline local: check-only ESLint passed; `tsc --noEmit --incremental false` passed; Jest 7 suites/25 tests passed; Nest build passed, using an ignored junction to existing `back/node_modules` (no install).
- CI service and hosted runner: not run yet. No local PostgreSQL listener was available on port 5432, so migration and auth integration execution remain unrun.
- CI-1 evidence: YAML parsed with the existing shared `js-yaml` package; `git diff --cached --check` passed. Runtime harness: not applicable to this workflow configuration until GitHub runs it.
- CI-2 evidence: workflow YAML, test script, loopback database guard values, and migration-before-test ordering parsed; auth TypeScript preloads and `AppModule` import passed; check-only ESLint, Jest (7 suites/25 tests), TypeScript, and Nest build passed; `git diff --cached --check` passed. Runtime database harness: unrun, not a PASS.
- Running authored change count from CI-1 and CI-2 commits: 105 additions + 3 deletions (108 total); no chain strategy required under `ask-on-risk`.
- Next: run hosted CI on a future PR and inspect both jobs. Existing admin PR branches do not automatically inherit this new workflow; coordinate integration before treating their check counts as sufficient.
