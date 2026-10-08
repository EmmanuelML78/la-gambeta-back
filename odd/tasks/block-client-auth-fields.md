# Block client-controlled auth authority fields

## Objective
Prevent public Better Auth registration and self-service profile updates from supplying server-owned `role` and `isActive` values.

## Problem and why
The current user schema exposes both fields as additional input. Better Auth accepts configured input fields, while authorization trusts the persisted role. This is a privilege-escalation risk present in the clean backend HEAD.

## Scope and constraints
- Work only in the clean backend worktree on `fix/auth-protect-server-fields`.
- Preserve the original dirty `back/` worktree and all unrelated changes.
- No dependency installation, deployment, push, PR, or remote operation.
- Tests-after mode (explicit user preference); Jest is the existing test runner.
- Conventional commits without AI attribution.
- Delivery strategy: `feature-branch-chain` for the frontend UI slices; this security fix is a separate local branch.
- Engram mirror `odd/block-client-auth-fields/tasks` is pending because the root workspace resolves ambiguously to `front` and `back`.

## Acceptance criteria
1. Neither signup nor authenticated self-update can persist client-supplied `role` or `isActive`.
2. Server defaults and legitimate server-side role management remain functional.
3. Focused regression tests and applicable type/lint checks pass.

## Tasks
- [x] AUTH-1: Add regression coverage at the Better Auth boundary, block client input for both authority fields, and verify the behavior. Route: delegated writer because this touches config plus a non-trivial test file; the four-file mapping was separately delegated.
- [ ] AUTH-2: Independently review the fix, run applicable full checks, and commit the isolated work unit. Route: delegated verification because test/build execution is delegated; parent handles Git state and commit.

## Verification and progress
- Base: backend `db4c9a3e73fcccd739d23de276e105bf7f88c067`.
- Existing vulnerability verified by source mapping in clean HEAD and installed Better Auth 1.6.27; exploit not run.
- Forecast: approximately 150 authored changed lines, one coherent security work unit.
- Focused Jest: 1/1 passed. Full Jest: 7/7 suites, 25/25 tests passed. Check-only targeted ESLint, TypeScript `--noEmit`, and `git diff --check`: passed. Parent re-ran focused Jest: 1/1 passed.
- Runtime harness: independent verifier used the actual Better Auth 1.6.27 in-process HTTP handler with a memory adapter. Signup with client `ADMIN`/`false` stored `USER`/`true`; authenticated role update returned 400 `FIELD_NOT_ALLOWED`; `isActive`-only update returned 400 `No fields to update`; valid name update succeeded without changing either protected field. This did not exercise Nest or PostgreSQL.
- Independent read-only security review found no concrete P0/P1 bypass. The committed Jest regression test mocks Better Auth and checks the configuration contract, not the HTTP route. A persisted HTTP/database integration test remains a follow-up.
- Rollback boundary: auth user-field input policy and its regression tests only.
- Commit identity: pending.
- Next step: commit the isolated work unit, record the commit identity, and close AUTH-2.
