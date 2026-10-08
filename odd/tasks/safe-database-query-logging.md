# Safe Database Query Logging

## Objective
Prevent sensitive SQL-bound values from reaching the known application-controlled logging paths: Drizzle query logging, Nest's HTTP exception handling, the payments webhook error path, and Better Auth's per-instance logger, while preserving existing error/status handling.

## Problem and why
The previously enabled Drizzle `DefaultLogger` serialized SQL and bound parameters. Disabling it (`logger: false`) is necessary but incomplete: parameterized failures can include a bound value in `DrizzleQueryError.message`, which may be emitted by the default Nest exception handler, a payments webhook catch, or Better Auth's internal logger. The fix covers these authorized paths with static, non-sensitive output and focused synthetic-sentinel tests. Raw Drizzle SQL logging is intentionally lost; Nest logging remains enabled.

## Scope
- `src/database/drizzle.service.ts` and `src/database/drizzle.service.spec.ts`
- New narrowly scoped DrizzleQueryError HTTP filter and test under `src/database/`
- `src/app.module.ts` for `APP_FILTER` registration
- `src/payments/payments.controller.ts` and `src/payments/payments.controller.spec.ts`
- `src/auth/better-auth.config.ts` and `src/auth/better-auth.config.spec.ts`
- `odd/tasks/safe-database-query-logging.md`

No other source files. Do not edit the original dirty `back` worktree. No dependency install, deployment, push, PR, or remote database access. Worker does not commit; parent will make the work-unit commit after independent verification.

## Constraints and execution
- TDD mode: tests-after, per explicit user preference.
- Route: delegated direct; bounded implementation assignment.
- Engram mirror: pending because project resolution is ambiguous between `back` and `back-auth-isolated`; do not guess.
- No package lint `--fix`; targeted ESLint was check-only.
- Used only synthetic sentinel test values; no actual secrets were output.
- Did not proxy Drizzle internals, patch vendor code, disable Nest logging globally, or claim telemetry spans are protected.
- Verified Better Auth 1.6.27 custom logger callback accepts `log(level, message, ...args)` via installed package/type behavior; callback now intentionally consumes only level and emits fixed classifications.

## Checklist
- [x] Keep Drizzle logger disabled and retain its focused regression.
- [x] Add a global `APP_FILTER` DrizzleQueryError filter returning a static safe 500 response and emitting no error/message/stack/query/parameters.
- [x] Ensure payments webhook DrizzleQueryError handling does not log raw message and preserves its 500 response semantics.
- [x] Ensure Better Auth custom logger emits only static classifications without disabling auth/error handling.
- [x] Add synthetic sentinel tests covering filter, webhook, and auth logger behavior and response/error semantics.
- [x] Run focused/full Jest, TypeScript `--noEmit`, check-only targeted ESLint, and diff checks.
- [x] Read back all scoped files; no unsupported telemetry or runtime claim made.
- [x] Correct type-only Express imports and rerun parent-equivalent direct-node Jest commands plus static checks.
- [x] Parent confirmed the reproduced results and committed the work unit.

## Acceptance criteria
- No sentinel bound value from a `DrizzleQueryError` appears in HTTP error response or the authorized error logging paths.
- Existing payment/auth error semantics are preserved except for replacing sensitive diagnostics with static safe classifications.
- Tests prove the filter response is non-sensitive and intended webhook/auth behavior remains intact.
- No runtime or telemetry claim exceeds demonstrated coverage.

## Rollback
Revert only the scoped changes listed above: remove the error filter and its `APP_FILTER` registration, restore the prior webhook/auth logger behavior, and remove only tests and task record introduced for this fix. Retain unrelated database/auth/payment changes.

## Progress
- [x] Confirmed existing partial fix and received independent reviewer evidence that disabling Drizzle's logger alone was incomplete.
- [x] Expanded scope, checklist, and no-commit boundary before source edits.
- [x] Implemented safe filter, webhook, and Better Auth logger behavior with tests.
- [x] Local requested checks passed before the parent commit.
- [x] Parent spot-check revealed the prior local Jest pass was not reproducible because production code imported Express types as runtime values; switched controller/filter/spec imports to `import type`.
- [x] Exact parent-equivalent direct-node focused and full Jest reruns now pass; static checks pass.
- [x] Parent re-review completed with no new P0/P1 issue; work-unit commit recorded below.

## Verification evidence
- Earlier local focused Jest: 4 suites / 5 tests passed through the `.cmd` shim, but the parent-equivalent direct-node run initially failed before tests because `express` was imported at runtime.
- Exact parent-equivalent focused command after using type-only imports: `node ./node_modules/jest/bin/jest.js --runInBand src/database/drizzle-query-error.filter.spec.ts src/database/drizzle.service.spec.ts src/payments/payments.controller.spec.ts src/auth/better-auth.config.spec.ts` — 4 suites / 5 tests passed.
- Exact parent-equivalent full command: `node ./node_modules/jest/bin/jest.js --runInBand` — 10 suites / 29 tests passed.
- TypeScript: `tsc --noEmit` — passed.
- Targeted check-only ESLint across the 9 authorized TypeScript files — passed.
- `git diff --check` — passed.
- Parent-equivalent spot-check initially failed one focused suite before tests with `Cannot find module 'express'`; `require.resolve('express')` also fails. Cause was importing Express-only types as runtime values in the controller/filter (and test). Changed these to `import type`; then the exact direct-node focused command (4 suites / 5 tests) and full command (10 suites / 29 tests) passed.
- TypeScript: `node ./node_modules/typescript/bin/tsc --noEmit` — passed.
- Targeted check-only ESLint across the 9 authorized TypeScript files — passed.
- Targeted Prettier check across the same files — passed.
- `git diff --check` — passed.
- Independent post-correction verification from this worktree: direct-node full Jest passed 10/10 suites and 29/29 tests; TypeScript, targeted ESLint and Prettier, and `git diff --check` passed. A new disposable local PostgreSQL container was migrated and the real Nest/Better Auth integration test passed; its captured output contained no raw SQL/query parameters or test-secret patterns. Only the newly created container was removed. A live failed-query/filter probe remains unrun; synthetic-sentinel filter tests passed.
- Runner gotcha: this worktree's `node_modules/.bin/jest.cmd` injects `NODE_PATH` pointing into the sibling `back` repository's pnpm store, masking root-level module-resolution failures. Use direct-node Jest commands here.
- Independent review found no confirmed P0/P1 issue in the reviewed paths. Conditional P2 caveat: installed Better Auth's Drizzle adapter has a separate global logger that can emit a raw `where` context on an unexpected affected-row result; the per-instance logger does not control this vendor path. Do not claim blanket Better Auth or telemetry privacy from this change.

## Next step
Work-unit commit: `a324c2967ac62cdfdbafc692e88807b9e01df9e2` (`fix(logging): prevent database parameter exposure`). Keep the branch isolated; do not push, open a PR, integrate, or deploy. Track the conditional vendor-adapter diagnostic separately.
