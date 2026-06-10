---
phase: 02-read-tools-schema-discovery
plan: 01
subsystem: infra
tags: [mcp-sdk, p-throttle, p-retry, tsx, error-classes, token-redaction, gitignore]

# Dependency graph
requires:
  - phase: 01-foundation-scaffolding
    provides: src/logger.ts (replaceAll(token, '***') primitive), src/config.ts (Zod 4 env loader), vitest/biome/tsup pipeline
provides:
  - "@modelcontextprotocol/sdk@1.29.0, p-throttle@8.1.0, p-retry@8.0.0 runtime deps"
  - "tsx@4.22.4 devDep (for Plan 02-05 probe-live)"
  - "src/keeping/types.ts: KeepingUser + KeepingOrg loose interfaces (D-34)"
  - "src/keeping/errors.ts: KeepingAuthError, KeepingRateLimitError, KeepingApiError, MultiOrgError, sanitiseBody(), toIsErrorContent()"
  - ".gitignore covers raw probe captures so Plan 02-05 cannot leak them"
affects: [02-02 (KeepingClient consumes errors), 02-03 (tool handlers wrap with toIsErrorContent), 02-04 (entries-list error path), 02-05 (probe-live imports KeepingClient → errors)]

# Tech tracking
tech-stack:
  added: ["@modelcontextprotocol/sdk@1.29.0", "p-throttle@8.1.0", "p-retry@8.0.0", "tsx@4.22.4 (dev)"]
  patterns:
    - "Construction-time token redaction at the error boundary mirrors emit-time redaction in src/logger.ts:20 (defence-in-depth, Pitfall G)"
    - "RED-then-GREEN TDD discipline carried forward from Phase 1 (D-16) — separate atomic commits"
    - "Byte-identical exact-string error messages locked by test fixtures (D-25, D-27)"

key-files:
  created:
    - "src/keeping/types.ts"
    - "src/keeping/errors.ts"
    - "test/keeping/errors.test.ts"
  modified:
    - "package.json (dependencies + devDependencies)"
    - "package-lock.json (auto-regenerated)"
    - ".gitignore (D-37 raw-capture paths)"

key-decisions:
  - "D-22 / D-23 / D-24: leaf contracts target a class-private cache shape; this plan does not yet build the cache — only the error contracts"
  - "D-25 byte-identical wording locked: 'Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.'"
  - "D-27 byte-identical template locked: 'Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: <id> (<name>), <id> (<name>).'"
  - "D-34: KeepingUser + KeepingOrg are bare interfaces (no Zod), tolerating unknown fields — live probe will reveal exact shape"
  - "D-37: .gitignore augmented BEFORE Plan 02-05 writes any raw capture — defence-by-construction"

patterns-established:
  - "Pattern A: Error classes own their own wording — exact-string assertions in tests are the regression gate"
  - "Pattern B: sanitiseBody(text, token) at construction-time is the LAST line of defence before src/logger.ts redaction at emit-time (Pitfall G)"
  - "Pattern C: toIsErrorContent(err) is the canonical SAFE-04 envelope for every tool handler's catch block"

requirements-completed: [SAFE-04]

# Metrics
duration: 3min
completed: 2026-06-10
---

# Phase 2 Plan 01: install-gitignore-leaf-contracts Summary

**Phase 2 dependencies installed at pinned versions, raw-probe capture paths gitignored, and KeepingClient leaf contracts (loose types + four error classes + sanitiseBody + isError envelope helper) shipped with byte-identical D-25 / D-27 wording locked by tests.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-10T10:54:48Z
- **Completed:** 2026-06-10T10:57:46Z
- **Tasks:** 3 (Task 1 = checkpoint, approved before resume; Tasks 2–3 executed in this run)
- **Files modified/created:** 6 source/test/config + 1 lockfile

## Accomplishments

- Three runtime deps + one devDep installed and locked to the exact RESEARCH-pinned versions (`@modelcontextprotocol/sdk@1.29.0`, `p-throttle@8.1.0`, `p-retry@8.0.0`, `tsx@4.22.4`); `npm audit` clean (0 vulnerabilities).
- `.gitignore` augmented with `.planning/research/.live-capture-raw.json` and `.planning/research/.probe-raw-*.json` per D-37 — landed before any code in Plan 02-05 can write the raw file, eliminating the "forgot to gitignore" race.
- `src/keeping/errors.ts` ships the four error classes plus `sanitiseBody()` and `toIsErrorContent()`. D-25 and D-27 strings are byte-identical to the CONTEXT-quoted wording; tests assert with `.toBe()` (not `.toContain()`), so any future drift fails CI immediately.
- `src/keeping/types.ts` ships loose interfaces per D-34 — the live probe in Plan 02-05 will extend these without breaking downstream consumers.
- TDD discipline preserved: RED commit (`ff3675c`) precedes GREEN commit (`8da34f1`); biome auto-format ran on test fixtures (whitespace only, no semantic change).

## Task Commits

Each task was committed atomically:

1. **Task 1: Slopcheck-fallback human-verify gate** — checkpoint task, no source change. User approved all four packages by name + GitHub repo + maintainer before Task 2 resumed (commit `1ba0192` recorded the partial-summary pause).
2. **Task 2: Install Phase 2 deps + augment `.gitignore`** — `e177036` (chore)
3. **Task 3 (RED): Add failing tests for KeepingClient errors + sanitiser** — `ff3675c` (test)
4. **Task 3 (GREEN): Add KeepingClient types + error classes** — `8da34f1` (feat)

_TDD: Task 3 was split into RED → GREEN atomic commits per D-16 carry-forward. No REFACTOR commit needed — biome auto-format was applied before the GREEN commit and is therefore captured in the same commit, not a separate one._

## Files Created/Modified

- `package.json` — added `@modelcontextprotocol/sdk`, `p-retry`, `p-throttle` to `dependencies`; `tsx` to `devDependencies`. Alphabetised. `mcpName`, `bin`, `files` whitelist untouched.
- `package-lock.json` — auto-regenerated; locks the four packages at their pinned versions.
- `.gitignore` — appended `.planning/research/.live-capture-raw.json` and `.planning/research/.probe-raw-*.json`. Existing entries preserved in original order.
- `src/keeping/types.ts` (NEW) — loose `KeepingUser` and `KeepingOrg` interfaces (D-34). No runtime validation, no Zod schema, no extra fields rejected.
- `src/keeping/errors.ts` (NEW) — `KeepingAuthError` (D-25), `KeepingRateLimitError(retryAfter)`, `KeepingApiError(status, sanitisedBody)`, `MultiOrgError(orgs)` (D-27), `sanitiseBody(text, token)`, `toIsErrorContent(err)`.
- `test/keeping/errors.test.ts` (NEW) — six vitest cases. Tests 1–2 assert byte-identical D-25 / D-27 wording with `.toBe()`. Test 3 asserts the redaction primitive. Test 4 asserts the construction-time scrub. Test 5 asserts the SAFE-04 envelope. Test 6 asserts `retryAfter` plumbing.

## Decisions Made

- **No REFACTOR commit.** Biome reformatted two single-line `super(...)` calls and one inlined `sanitiseBody(...)` invocation during the GREEN step. Because the format change happened between writing GREEN code and committing GREEN code (whitespace only, no semantic change), it was folded into the GREEN commit rather than a separate refactor commit — keeping the cycle to two atomic commits as the plan specified.
- **Lockfile insertion volume.** `package-lock.json` grew by ~1700 lines (91 new transitive dependencies — mainly MCP SDK's transitive tree). Verified `npm audit` clean post-install; no postinstall scripts triggered (confirmed by `added 91 packages` line with no `running ...` install-script log lines).

## Deviations from Plan

None - plan executed exactly as written.

The only "departure" worth flagging: biome auto-format ran on the test file and on the implementation file inline during the GREEN step. The exact-string D-25 / D-27 fixtures remained byte-identical (verified by passing `.toBe()` assertions). This is the expected behaviour of `biome check --write` and is part of the project's standard verification gate — not a deviation from the plan.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification Gate (Plan-Level)

All three required checks pass simultaneously:

1. `npx vitest run` → **9 tests passed across 2 files** (3 Phase 1 logger tests + 6 new error tests)
2. `npx tsc --noEmit` → **0 errors**
3. `npx biome check .` → **0 errors**

Spot-checked acceptance criteria:

- `new KeepingAuthError().message === "Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server."` ✅
- `new MultiOrgError([{id:'org_abc',name:'Acme Studio'},{id:'org_xyz',name:'Beta BV'}]).message === "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: org_abc (Acme Studio), org_xyz (Beta BV)."` ✅
- `sanitiseBody("response with kp_test_FAKE inline", "kp_test_FAKE") === "response with *** inline"` ✅
- `.gitignore` contains both D-37 paths verbatim ✅
- `package.json` `dependencies` contains all three runtime deps; `devDependencies` contains tsx ✅

## Package Legitimacy Verdict (slopcheck fallback)

User visually verified each npm page + GitHub repo + maintainer. No package flagged suspicious. Approved: `@modelcontextprotocol/sdk` (modelcontextprotocol org), `p-throttle` (sindresorhus), `p-retry` (sindresorhus), `tsx` (privatenumber). All four had zero postinstall scripts as expected per RESEARCH §Package Legitimacy Audit.

## TDD Gate Compliance

Plan voluntarily applied TDD to Task 3 per the plan's explicit `tdd="true"` attribute (D-16 carry-forward). Git log confirms:

- RED gate: `ff3675c test(02-01): add failing tests for KeepingClient errors + sanitiser` ✅
- GREEN gate: `8da34f1 feat(02-01): add KeepingClient types + error classes` (follows RED) ✅
- REFACTOR gate: not needed — biome auto-format folded into GREEN per Decisions Made above

## Next Phase Readiness

Wave 2 (Plan 02-02) is unblocked. The `KeepingClient` class in `src/keeping/client.ts` can now import from `./errors.js` and `./types.js` without inventing the contracts itself. Plan 02-05 (probe-live script) is also unblocked from a gitignore standpoint — raw captures cannot reach git even if the script is run today.

No blockers, no carry-forward issues.

## Self-Check: PASSED

- `src/keeping/types.ts` exists ✅
- `src/keeping/errors.ts` exists ✅
- `test/keeping/errors.test.ts` exists ✅
- Commit `e177036` exists in `git log --all` ✅
- Commit `ff3675c` exists in `git log --all` ✅
- Commit `8da34f1` exists in `git log --all` ✅

---
*Phase: 02-read-tools-schema-discovery*
*Plan: 01-install-gitignore-leaf-contracts*
*Completed: 2026-06-10*
