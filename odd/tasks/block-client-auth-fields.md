# Block client-controlled auth authority fields

## Objective
Prevent public Better Auth registration and self-service profile updates from supplying server-owned `role` and `isActive` values.

## Problem and why
The current user schema exposes both fields as additional input. Better Auth accepts configured input fields, while authorization trusts the persisted role. This is a privilege-escalation risk present in the clean backend HEAD.

## Scope and constraints
- Work only in the clean backend worktree on `fix/auth-protect-server-fields`.
- Preserve the original dirty `back/` worktree and all unrelated changes.
- No dependency installation, deployment, push, PR, or remote operation.
- Tests-after mode (explicit user preference); Jest runs the unit suite and Node 24's native runner runs the persisted integration test.
- Conventional commits without AI attribution.
- Delivery strategy: `feature-branch-chain` for the frontend UI slices; this security fix is a separate local branch.
- Engram mirror `odd/block-client-auth-fields/tasks` is pending because the root workspace resolves ambiguously to `front` and `back`.

## Acceptance criteria
1. Neither signup nor authenticated self-update can persist client-supplied `role` or `isActive`.
2. Server defaults and legitimate server-side role management remain functional.
3. Focused regression tests and applicable type/lint checks pass.

## Tasks
- [x] AUTH-1: Add regression coverage at the Better Auth boundary, block client input for both authority fields, and verify the behavior. Route: delegated writer because this touches config plus a non-trivial test file; the four-file mapping was separately delegated.
- [x] AUTH-2: Independently review the fix, run applicable full checks, and commit the isolated work unit. Route: delegated verification because test/build execution is delegated; parent handles Git state and commit.
- [x] AUTH-3: Add and run an isolated Nest HTTP + PostgreSQL regression test for persisted signup defaults and self-update protection. Route: delegated writer and independent verifier using a disposable loopback-only database.

## Verification and progress
- Base: backend `db4c9a3e73fcccd739d23de276e105bf7f88c067`.
- Existing vulnerability verified by source mapping in clean HEAD and installed Better Auth 1.6.27; exploit not run.
- Forecast at AUTH-1: approximately 150 authored changed lines. AUTH-3 added a separate integration-test work unit after the first security fix was committed.
- Focused Jest: 1/1 passed. Full Jest: 7/7 suites, 25/25 tests passed. Check-only targeted ESLint, TypeScript `--noEmit`, and `git diff --check`: passed. Parent re-ran focused Jest: 1/1 passed.
- Runtime harness: independent verifier used the actual Better Auth 1.6.27 in-process HTTP handler with a memory adapter. Signup with client `ADMIN`/`false` stored `USER`/`true`; authenticated role update returned 400 `FIELD_NOT_ALLOWED`; `isActive`-only update returned 400 `No fields to update`; valid name update succeeded without changing either protected field. This did not exercise Nest or PostgreSQL.
- Independent read-only security review found no concrete P0/P1 bypass. The first committed Jest regression test mocks Better Auth and checks the configuration contract; AUTH-3 adds the persisted HTTP/database proof.
- AUTH-3 status: `test/auth-server-fields.integration.cjs` uses `node:test`, real `AppModule`/Better Auth, Supertest, and the signup session cookie. It exercises signup with `ADMIN`/`false`, persisted `/users/me` defaults, a valid cookie+Origin name update (200) to prove the Better Auth route is reachable, POST `/api/v1/auth/update-user` attacks for both authority fields (400) with persisted reads after each, and Nest PATCH defense-in-depth. It requires explicit DATABASE_* values, loopback host text, the dedicated `la_gambeta_auth_e2e` name, and `DATABASE_SSL=false`, plus a test-only auth secret; it mocks mail, overrides only `PAYMENT_PROVIDER` to avoid external payment calls, suppresses parameter logging only on its Drizzle session logger and restores it during cleanup, and deletes its UUID-addressed user. These guards do NOT prove database isolation; the verifier separately created and migrated an ephemeral local container with no port forwarding.
- AUTH-3 runner: Node 24's native test runner with installed `ts-node/register` and `tsconfig-paths/register` preloads, setting `TS_NODE_COMPILER_OPTIONS={"module":"commonjs","moduleResolution":"node"}`: `node -r ts-node/register -r tsconfig-paths/register --test test/auth-server-fields.integration.cjs`. Jest's CJS VM could not load Better Auth's ESM entry point; no dependencies were installed.
- AUTH-3 check-only verification on Node `v24.21.0`: `node --check test/auth-server-fields.integration.cjs`, Prettier `--check`, `tsc --noEmit -p tsconfig.json`, `git diff --check`, and targeted ESLint core JS rules passed. The repository's configured typed ESLint cannot lint this `.cjs` file outside its TS project service; that invocation was not counted as a pass. An invalid-host guard test exited 1 before loading AppModule or connecting to a database. These static checks alone do not establish HTTP/database behavior.
- AUTH-3 prior attempts: ephemeral Postgres containers were created from a cached image on loopback with tmpfs and removed after each run. Initial Jest execution failed on a runtime Express type import; `auth.controller.ts` now uses `import type`. Jest then failed to load Better Auth's ESM entry point, so the test moved to Node's native runner. The first native run required a test-only `PAYMENT_PROVIDER` override; the next reached signup but lacked a trusted `Origin` on cookie-bearing updates. These harness issues were corrected before the successful run. One attempt revealed `DrizzleService` logs bound SQL parameters via `logger: true`; this test silences only its own session logger and restores it. Broader SQL parameter logging is an unapproved separate follow-up and was not changed.
- AUTH-3 final runtime proof: a new disposable container from cached `postgres:17-alpine` was bound only to `127.0.0.1:55432`, used tmpfs storage and the dedicated `la_gambeta_auth_e2e` database, and was migrated successfully. The native integration test passed 1/1 against the real Nest/Better Auth/PostgreSQL path; full Jest passed 7/7 suites and 25/25 tests. Captured output contained no raw SQL bound parameters. The verifier stopped only its created container and confirmed it was gone. Independent final review found no concrete P0/P1 blocker; the parent repeated `node --check` and `git diff --check` successfully.
- Rollback boundary for AUTH-3: the integration test, its task evidence, and the type-only Express import; the earlier `input: false` security fix remains independent.
- Work-unit commit: `49c362574b76dfd7700d1e63104d2556c1e5f530` (`fix(auth): reject client-controlled authority fields`).
- Next step: commit AUTH-3 as one isolated work unit. Do not integrate branches or deploy under this authorization. Decide separately whether to address application-wide SQL parameter logging.
