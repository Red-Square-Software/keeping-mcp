---
phase: "01-foundation-scaffolding"
plan: "02"
subsystem: "config-logger-entrypoint"
tags:
  - typescript
  - zod
  - logger
  - tdd
  - smoke-test
dependency_graph:
  requires:
    - "01-01: package.json ESM shape, zod@4.4.3 installed, tsup banner config, biome noConsole"
  provides:
    - "src/logger.ts: createLogger factory with token redaction via replaceAll"
    - "src/config.ts: Zod 4 ConfigSchema with z.stringbool(), loadConfig() exits 1 on bad token"
    - "bin/keeping-mcp.ts: Phase 1 entrypoint that loads config and logs one info line"
    - "test/logger.test.ts: Vitest token-redaction contract (3 tests, D-16)"
    - "dist/bin/keeping-mcp.js: built binary with shebang, ready for CI smoke test in Plan 03"
  affects:
    - "01-03: CI workflow can assert smoke test invariants against dist/bin/keeping-mcp.js"
    - "Phase 2: src/server.ts imports loadConfig + createLogger from these modules"
tech_stack:
  added: []
  patterns:
    - "TDD red→green cycle: test committed before implementation"
    - "Zod 4 z.stringbool() for KEEPING_REQUIRE_CONFIRM boolean env var (Pitfall 1 avoidance)"
    - "Factory logger pattern: token captured at construction, replaceAll at emit step (D-08)"
    - "tsup banner-only shebang: no source-file shebang to avoid duplication (Pitfall 2 fix)"
    - "Zod 4 z.string({ error: ... }) for undefined-env coverage (deviation from RESEARCH.md)"
key_files:
  created:
    - path: "test/logger.test.ts"
      description: "Vitest token-redaction tests: object args, string args, level gating (D-16, AUTH-03)"
    - path: "src/logger.ts"
      description: "createLogger factory: process.stderr.write, replaceAll token redaction, LEVEL_ORDER gating"
    - path: "src/config.ts"
      description: "Zod 4 env schema + loadConfig(): exits 1 with D-05 message on missing/empty token"
    - path: "bin/keeping-mcp.ts"
      description: "Phase 1 entrypoint: loadConfig + createLogger + log.info + exit(0); no MCP boot"
  modified: []
decisions:
  - "Removed shebang from bin/keeping-mcp.ts source (tsup banner handles it — duplication caused SyntaxError at runtime)"
  - "Used z.string({ error: 'KEEPING_TOKEN must not be empty' }) to cover undefined env var case in Zod 4"
  - "Biome organizeImports requires alphabetical import order — fixed in test/logger.test.ts"
  - "Biome formatter collapses chained method calls to single lines if they fit lineWidth:100"
metrics:
  duration: "~15 minutes"
  completed_date: "2026-06-09"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 0
---

# Phase 1 Plan 02: Config, Logger, and Entrypoint Summary

Zod 4 config loader, token-redacting stderr logger factory, and Phase 1 entrypoint — TDD red→green cycle completed, all D-13 smoke invariants verified locally before CI.

## What Was Built

| File | Description |
|------|-------------|
| `test/logger.test.ts` | 3 Vitest tests: object redaction, string redaction, level gating (D-16, AUTH-03) |
| `src/logger.ts` | `createLogger(token, level)` factory with `replaceAll` token redaction at emit (D-06/07/08) |
| `src/config.ts` | Zod 4 `ConfigSchema` with `z.stringbool()`, `loadConfig()` exits 1 on bad token (D-04/05) |
| `bin/keeping-mcp.ts` | Phase 1 entrypoint: config + logger + exit(0); no MCP server (D-02) |

## TDD Gate Record

| Commit | Type | Hash | Description |
|--------|------|------|-------------|
| RED | `test(01-02)` | 64bbede | Failing token-redaction test (Cannot find module ../src/logger.js) |
| GREEN | `feat(01-02)` | df35c97 | createLogger implementation — all 3 tests pass |

RED commit precedes GREEN commit in git history. TDD discipline satisfied.

## Vitest Results

```
Test Files  1 passed (1)
     Tests  3 passed (3)
  Duration  ~230ms
```

All 3 tests in `test/logger.test.ts` pass:
- "redacts the token from object arguments" — PASS
- "redacts the token from string arguments" — PASS
- "respects log level — debug messages suppressed at info level" — PASS

## Local Smoke Test (D-13)

Command: `unset KEEPING_TOKEN; node dist/bin/keeping-mcp.js`

| Assertion | Expected | Actual | Result |
|-----------|----------|--------|--------|
| Exit code | ≠ 0 | 1 | PASS |
| stdout bytes | 0 | 0 | PASS |
| stderr message | `[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty` | `[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty` | PASS |

Empty-string token (`KEEPING_TOKEN=""`) also produces the exact D-05 message and exit code 1.

**Exact stderr string for Plan 03 CI assertion:**
```
[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty
```

## Build Verification

- `npm run build` exit code: 0
- `dist/bin/keeping-mcp.js` exists: YES
- First line of `dist/bin/keeping-mcp.js`: `#!/usr/bin/env node` (DIST-03 satisfied)

## D-09 Grep Verification

No `console.log`, `console.info`, `console.warn`, `console.debug`, or `process.stdout.write` CALLS appear in `src/`, `bin/`, or `test/`. The RULE comment in `src/logger.ts` line 1 contains the literal string `process.stdout.write` as documentation — this is not a call and is intentional per RESEARCH.md Pitfall 5 guidance.

## Full Sweep Results

| Check | Command | Exit Code |
|-------|---------|-----------|
| Lint + format | `npx biome check .` | 0 |
| Typecheck | `npx tsc --noEmit` | 0 |
| Unit tests | `npx vitest run` | 0 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Pitfall 2 avoidance] Removed shebang from `bin/keeping-mcp.ts` source**
- **Found during:** Task 2 (first smoke test run)
- **Issue:** The `#!/usr/bin/env node` in the source file was preserved by tsup AND the `banner` config also injected it, producing a duplicate shebang on lines 1-2 of `dist/bin/keeping-mcp.js`. Node.js threw `SyntaxError: Invalid or unexpected token` at runtime.
- **Fix:** Removed `#!/usr/bin/env node` from `bin/keeping-mcp.ts` source. The RESEARCH.md states "The source shebang is optional (for IDE clarity)" — tsup's `banner` option is the canonical mechanism. With the source shebang removed, the built binary has exactly one shebang line.
- **Files modified:** `bin/keeping-mcp.ts`
- **Commit:** 4368b02

**2. [Rule 1 - Bug] Zod 4 `z.string().min(1)` does not apply custom message for `undefined` input**
- **Found during:** Task 2 (first D-13 smoke test with `unset KEEPING_TOKEN`)
- **Issue:** When `KEEPING_TOKEN` is completely absent from `process.env` (value is `undefined`), Zod 4's `z.string().min(1, "KEEPING_TOKEN must not be empty")` reports "Invalid input: expected string, received undefined" instead of the custom message. This violated the D-05 exact message contract.
- **Fix:** Added `z.string({ error: "KEEPING_TOKEN must not be empty" })` as the base — the `error` option in Zod 4 covers the type-mismatch error (undefined is not a string), ensuring the custom message appears for both missing and empty `KEEPING_TOKEN`.
- **Files modified:** `src/config.ts`
- **Commit:** 4368b02

**3. [Rule 1 - Bug] Biome `organizeImports` requires alphabetical import order**
- **Found during:** Task 1 (first `npx biome check` run on test file)
- **Issue:** RESEARCH.md's `test/logger.test.ts` spec has imports as `{ describe, it, expect, vi, afterEach }` which is not alphabetically sorted. Biome's `organizeImports` assist rule requires `{ afterEach, describe, expect, it, vi }`.
- **Fix:** Reordered the vitest import destructuring to alphabetical order.
- **Files modified:** `test/logger.test.ts`
- **Commit:** df35c97 (GREEN commit)

**4. [Rule 1 - Bug] Biome formatter collapses multi-line method chains that fit lineWidth:100**
- **Found during:** Task 2 (first `npx biome check` on `src/config.ts`)
- **Issue:** RESEARCH.md shows `KEEPING_LOG_LEVEL` and the `messages` assignment on multiple lines, but Biome's formatter collapses these to single lines since they fit within `lineWidth: 100`.
- **Fix:** Pre-emptively formatted `src/config.ts` with single-line chaining before the first biome check.
- **Files modified:** `src/config.ts`
- **Commit:** 4368b02

## Known Stubs

None — all four files contain real implementation. The `log.info("config loaded, server boot deferred to Phase 2")` message in `bin/keeping-mcp.ts` is a documented intentional placeholder (D-02 — no MCP boot in Phase 1).

## Threat Surface Scan

All threat mitigations from the plan's threat register are implemented:

| Threat | Status |
|--------|--------|
| T-02-01: Token leak via logger | MITIGATED — `replaceAll(token, "***")` in emit, unit test proves it |
| T-02-02: Silent boolean parse of KEEPING_REQUIRE_CONFIRM | MITIGATED — `z.stringbool()` used |
| T-02-03: stdout pollution | MITIGATED — no console.* calls, no process.stdout.write calls |
| T-02-04: Silent startup hang | MITIGATED — `loadConfig()` exits 1 before any server code |
| T-02-05: Shebang corruption | MITIGATED — single banner-injected shebang, source shebang removed |
| T-02-06: Test token leak | ACCEPTED — `kp_test_FAKE_token_value` is documented non-credential sentinel |

No new security-relevant surface beyond plan scope was introduced.

## Note for Plan 03

The exact CI smoke assertion string is:
```
[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty
```

This string is produced for both `KEEPING_TOKEN` unset and `KEEPING_TOKEN=""`. The CI workflow can use either form to trigger the error case.

The `dist/bin/keeping-mcp.js` file is gitignored (per `.gitignore: dist/`) and is NOT committed. Plan 03's CI workflow runs `npm run build` as a step before the smoke test, which regenerates this file on the CI runner.

## Self-Check: PASSED

- `test/logger.test.ts` exists: FOUND at C:\Users\Bart\Source\keeping-mcp\test\logger.test.ts
- `src/logger.ts` exists: FOUND at C:\Users\Bart\Source\keeping-mcp\src\logger.ts
- `src/config.ts` exists: FOUND at C:\Users\Bart\Source\keeping-mcp\src\config.ts
- `bin/keeping-mcp.ts` exists: FOUND at C:\Users\Bart\Source\keeping-mcp\bin\keeping-mcp.ts
- `dist/bin/keeping-mcp.js` exists: FOUND (build artifact, gitignored)
- RED commit 64bbede: FOUND in git log
- GREEN commit df35c97: FOUND in git log
- Task 2 commit 4368b02: FOUND in git log
