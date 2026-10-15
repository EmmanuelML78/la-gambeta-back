# Backend CI readiness

## Objective

Add reproducible pull-request checks to the backend baseline before integrating the admin PR chain.

## Scope and constraints

- Source: local `origin/master` at `c8a087e`; work only on `feat/backend-ci-readiness` in this isolated worktree.
- CI-1 and CI-2 were prepared locally before publication. This branch now backs draft [PR #21](https://github.com/EmmanuelML78/la-gambeta-back/pull/21). For CI-3, change only this worktree; the parent coordinates the authorized push. Do not merge, deploy, install dependencies, use Corepack, or modify other worktrees.
- Use Node 24, pnpm 10, the committed lockfile, and synthetic PostgreSQL credentials in CI. Do not expose repository secrets to pull requests.
- Keep the stale `test:e2e` target out of CI until its fixture is repaired.
- TDD: off (existing project context); runner: Jest (`jest --runInBand`). Applicable checks are still required.
- Delivery strategy: `ask-on-risk`. Forecast: under 400 authored changed lines per work unit (advisory, not code-golf).

## Tasks

- [x] **CI-1 — Baseline quality job.** Added a GitHub Actions workflow for pull requests and baseline pushes, using frozen pnpm install, check-only lint, Jest, TypeScript, and build. Route: delegated writer because the workflow and documentation are coordinated non-trivial edits. Acceptance: no mutating lint/format command, no secrets, no `pull_request_target`; workflow parsed and local equivalents passed. Commit: `942d07dc650f19d0499a2b1791df0e52db145ddc`.
- [x] **CI-2 — Isolated database job.** Added PostgreSQL 17 migration and auth integration checks with synthetic loopback-only credentials; documented how CI checks run and why stale e2e remains excluded. Route: delegated writer, same worktree. Acceptance: database name and host satisfy the test's guard; the workflow lists migrations before auth integration; the local database run is explicitly unrun because no local PostgreSQL listener is available. Commit: `28e165924ff3ec0eeedc5dbceb39dbd8afe15f34`.
- [x] **CI-3 — Pin workflow actions and update PR evidence.** Replaced all six mutable `uses:` tags with verified 40-character commit SHAs while retaining version comments; distinguished the prior hosted run from the pending run for these changes. Route: delegated writer because workflow and recovery documentation are coordinated edits. Acceptance: workflow parsed, all six references and version comments validated, Jest and `git diff --check` passed. Commit: `7537537427a409dc2aba614a0c7ee874e9ff4750`.

## Verification and progress

- Baseline local: check-only ESLint passed; `tsc --noEmit --incremental false` passed; Jest 7 suites/25 tests passed; Nest build passed, using an ignored junction to existing `back/node_modules` (no install).
- Hosted run [38679227349](https://github.com/EmmanuelML78/la-gambeta-back/actions/runs/38679227349) passed both quality and auth-integration jobs at `e9e75c677591dd4acec6bad002cf96d5730f38ba` on draft [PR #21](https://github.com/EmmanuelML78/la-gambeta-back/pull/21). This is evidence for the pre-pinning commit only, not CI-3. No local PostgreSQL listener was available on port 5432, so local migration and auth integration remain unrun.
- CI-1 evidence: YAML parsed with the existing shared `js-yaml` package; `git diff --cached --check` passed. Runtime harness: not applicable to this workflow configuration until GitHub runs it.
- CI-2 evidence: workflow YAML, test script, loopback database guard values, and migration-before-test ordering parsed; auth TypeScript preloads and `AppModule` import passed; check-only ESLint, Jest (7 suites/25 tests), TypeScript, and Nest build passed; `git diff --cached --check` passed. Runtime database harness: unrun, not a PASS.
- CI-2 documentation correction: independent verification found that the README implied `pnpm audit --prod` ran in CI. The quality block now lists the four actual CI commands, and audit is explicitly independent; this is documentation only. Focused check: README/workflow command comparison and `git diff --check` passed. Runtime harness: not applicable to documentation. Correction commit: `e046e8785b3387a8f4ddec9239e764300a9234ff`; rollback boundary: that commit's `README.md` and task-evidence line only.
- CI-3 local evidence: primary GitHub commit patch refs resolved to checkout `11d5960a326750d5838078e36cf38b85af677262` (v4), pnpm/action-setup `0977fd99725f1db4007ccb2928dbb4e90d06cc86` (v6), and setup-node `949feb2413d6458794dcd2491c4babbbce0c15c1` (v7). Parsed the YAML with existing `js-yaml`; all six `uses:` values matched their verified full SHAs, and version comments remained on both copies. `node .\node_modules\jest\bin\jest.js --runInBand --no-cache` passed (7 suites/25 tests); `git diff --check` passed. Runtime harness: hosted CI for CI-3 remains pending until push. Rollback boundary: CI-3 workflow action refs and this task's CI-3 evidence, without reverting CI-1/CI-2.
- Running authored change count before CI-3: 105 additions + 3 deletions (108 total); CI-3 remains below the 400-line review heuristic, so no chain strategy is required under `ask-on-risk`.
- Next: the parent pushes CI-3, then inspects the new hosted run through [PR #21](https://github.com/EmmanuelML78/la-gambeta-back/pull/21). Existing admin PR branches do not automatically inherit this new workflow; coordinate integration before treating their check counts as sufficient.
