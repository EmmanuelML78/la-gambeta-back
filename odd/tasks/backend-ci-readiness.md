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

- [ ] **CI-1 — Baseline quality job.** Add a GitHub Actions workflow for pull requests and baseline pushes, using frozen pnpm install, check-only lint, Jest, TypeScript, and build. Route: delegated writer because the workflow and documentation are coordinated non-trivial edits. Acceptance: no mutating lint/format command, no secrets, no `pull_request_target`; workflow parses and local equivalents pass. Commit: pending.
- [ ] **CI-2 — Isolated database job.** Add PostgreSQL 17 migration and auth integration checks with synthetic loopback-only credentials; document how CI checks run and why stale e2e remains excluded. Route: delegated writer, same worktree. Acceptance: database name and host satisfy the test's guard; migrations run before auth integration; local DB run is recorded as passed or explicitly unrun. Commit: pending.

## Verification and progress

- Baseline local: check-only ESLint passed; `tsc --noEmit --incremental false` passed; Jest 7 suites/25 tests passed; Nest build passed, using an ignored junction to existing `back/node_modules` (no install).
- CI service and hosted runner: not run yet. Local isolated PostgreSQL availability: not yet established.
- Next: implement CI-1, verify and commit, then CI-2.
