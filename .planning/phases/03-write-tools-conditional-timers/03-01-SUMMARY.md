---
phase: 03-write-tools-conditional-timers
plan: 01
subsystem: keeping-client + shared write infrastructure
type: tdd
wave: 1
status: complete
requirements:
  - WRITE-04
  - WRITE-05
  - WRITE-08
  - TIMER-02
tags:
  - keeping-mcp
  - phase-3
  - foundation
  - write-gate
  - date-helper
  - http-client
  - mcp-server
dependencies:
  requires:
    - Phase 2 KeepingClient (request<T>, rawFetch, throttle, pRetry)
    - Phase 2 errors (KeepingApiError, KeepingAuthError, MultiOrgError, sanitiseBody, toIsErrorContent)
    - Node 22 full-icu (Intl.DateTimeFormat for Europe/Amsterdam)
  provides:
    - src/keeping/date.ts → todayInAmsterdam, nowInAmsterdamHHMM
    - src/keeping/write-gate.ts → previewOrCall<T>, classifyAmbiguous, AMBIGUOUS_TEXT
    - KeepingClient.requestWithHeaders<T> for X-Server-Time-Ms capture
    - 204-tolerant rawFetch for keeping_delete_entry success path
    - EntryCreateBody, EntryEditBody, TimeEntryResponse typings
  affects:
    - All Wave 2 write tool plans (03-02 add, 03-03 update, 03-04 delete, 03-05 start-timer, 03-06 stop-timer, 03-07 resume-timer)
tech-stack:
  added: []
  patterns:
    - Strict-wrapper write-gate (`previewOrCall<T>` with AND-gate dry-run-by-default)
    - Duck-typed failure classifier (numeric `.status >= 500` guard)
    - Intl.DateTimeFormat over Date.toISOString for date defaulting
    - Parallel `rawFetchWithHeaders` sibling preserving throttle + pRetry
key-files:
  created:
    - src/keeping/date.ts
    - src/keeping/write-gate.ts
    - test/keeping/date.test.ts
    - test/keeping/write-gate.test.ts
  modified:
    - src/keeping/client.ts
    - src/keeping/types.ts
    - test/keeping/client.test.ts
decisions:
  - "BASE URL string `https://api.keeping.nl/v1` is inline-duplicated in `src/keeping/write-gate.ts` rather than imported from `src/keeping/client.ts` — keeps the gate self-contained and the preview-URL assertion trivially testable (D-3-02)."
  - "`requestWithHeaders<T>` is backed by a NEW parallel sibling `rawFetchWithHeaders` rather than refactoring `rawFetch` to return `{ body, headers }`. The sibling shape kept the diff to `request<T>` byte-zero and avoided cascading changes to every existing GET/POST/PATCH/DELETE caller."
  - "204 branch lands at src/keeping/client.ts:268 (rawFetch) and src/keeping/client.ts:305 (rawFetchWithHeaders) — both AFTER the `!res.ok` guard, so error responses can never be silently swallowed (Test C2 regression gate)."
  - "Classifier uses duck-typing on `.status` (numeric typeof check) rather than `instanceof KeepingApiError` — avoids a runtime import that would couple write-gate.ts to errors.ts and prevents string-typed `.status` (e.g. `{ status: \"500\" }`) from spoofing the ambiguous-failure path (Test W10)."
  - "`nowAmsterdamISO` deliberately NOT shipped — D-3-28 supersedes D-3-13's full-ISO helper for request bodies; if a non-body ISO is ever needed it can ship later as a separate function."
metrics:
  duration: "~5 minutes (RED 07:55 → GREEN 07:59:50)"
  tasks_completed: 2
  files_created: 4
  files_modified: 3
  tests_added: 21
  tests_total: 100
  tests_previous: 79
  test_files: 12
  commits: 2
  date: 2026-06-12
---

# Phase 3 Plan 01: Write-Tool Foundation Summary

Ships the entire shared write-tool infrastructure in one atomic vertical slice:
DST-correct Europe/Amsterdam date + time helpers, the dry-run-by-default
write-gate, the byte-locked ambiguous-failure classifier, the
`requestWithHeaders<T>` HTTP surface, and the 204-tolerant `rawFetch` branch
that unblocks `keeping_delete_entry`. Two TDD commits, 21 new tests, zero
regressions, zero new dependencies, and zero changes to `src/tools/*` or
`src/server.ts` — Wave 2 plans (03-02..03-07) consume this foundation via
simple imports.

## What Was Built

### Pure helpers — `src/keeping/date.ts` (NEW, ~50 lines)

Two stateless exports:

- `todayInAmsterdam(now: Date = new Date()): string` — emits `"YYYY-MM-DD"` via
  `Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", ... })`. The
  en-CA tag is the deliberate choice — it natively emits ISO-style
  `YYYY-MM-DD` without manual `formatToParts` reassembly.
- `nowInAmsterdamHHMM(now: Date = new Date()): string` — emits `"HH:mm"` via
  `Intl.DateTimeFormat("sv-SE", { hour12: false, ... })`. NO timezone suffix
  in the output, because the Keeping API derives the zone from
  `organisation.time_zone` (D-3-29).

`Date.toISOString()` is forbidden in this file (D-3-13); grep confirms 0
matches. `nowAmsterdamISO()` deliberately not shipped — D-3-28 removed its
request-body role and there is no caller need yet.

### Shared write infrastructure — `src/keeping/write-gate.ts` (NEW, ~110 lines)

Four exports:

- `previewOrCall<T>(client, cfg, req)` — AND-gate semantics: returns
  `{ would_post: { method, url, body } }` only when
  `cfg.requireConfirm && !cfg.confirm`. All other branches delegate to
  `client.post / patch / delete`. `body` collapses `undefined → null` so the
  preview wire-shape stays consistent across methods (DELETE preview Test W3).
- `AMBIGUOUS_TEXT` — byte-locked WRITE-05 wording:
  `"outcome unknown — verify with keeping_list_entries before retrying."` (em-dash,
  lowercase, single trailing period — Test W11 asserts via `.toBe()`).
- `classifyAmbiguous(err)` — returns `true` for: `AbortError`, raw `TypeError`,
  any object with a numeric `.status >= 500`. Returns `false` for everything
  else (4xx, `KeepingAuthError`, `MultiOrgError`, plain `Error`, duck-typed
  `{ status: "500" }`, `null`).
- `BASE` constant — duplicated from `src/keeping/client.ts:32`. Keeps the
  gate self-contained for testability (Test W1 asserts the FULL preview URL
  `"https://api.keeping.nl/v1/47666/time-entries"`).

Type exports: `WriteMethod`, `WriteRequest`, `WriteGateConfig`, `WouldPost`.

### `KeepingClient` extensions — `src/keeping/client.ts` (MODIFIED)

Two changes, both backwards-compatible:

1. **`rawFetch` 204-tolerance (D-3-27)** — at `src/keeping/client.ts:268`,
   immediately after the existing `!res.ok` guard:
   ```typescript
   if (res.status === 204) return null;
   ```
   Without this fix, `keeping_delete_entry` with `confirm: true` would have
   surfaced a synthetic `SyntaxError: Unexpected end of JSON input` on every
   successful deletion. The 204 branch is placed AFTER the `!res.ok` block
   so it can never swallow error responses (Test C2 regression gate).

2. **`requestWithHeaders<T>` public method (D-3-18)** — at
   `src/keeping/client.ts:175`. Signature:
   ```typescript
   async requestWithHeaders<T>(
     method: "POST" | "PATCH",
     path: string,
     body?: unknown,
   ): Promise<{ body: T; headers: Headers }>
   ```
   Backed by a NEW private sibling `rawFetchWithHeaders` at
   `src/keeping/client.ts:278` that mirrors `rawFetch` verbatim (same 401 /
   429 / 204 / token-sanitise paths) but returns the `Response.headers`
   alongside the parsed body. Both the new public method and `request<T>`
   route through the same `this.throttle` slot allocator — Test C4 asserts
   this by replacing `client["throttle"]` with a counting proxy and verifying
   it increments for both code paths (Pitfall 3).

   Method restricted to `"POST" | "PATCH"` because there is no header-read
   use case for DELETE in Phase 3 (timer endpoints are POST `/resume` and
   PATCH `/stop`).

   Existing `me()`, `organisations()`, `resolveOrgId()`, `get()`, `post()`,
   `patch()`, `delete()`, and the `Object.defineProperty(this, "token", ...)`
   slot are all untouched.

### Body / response typings — `src/keeping/types.ts` (MODIFIED, appended)

Three exports added after the existing `KeepingOrg`:

- `EntryCreateBody` — POST shape with the real OpenAPI 8-purpose enum
  (`work | break | special_leave | unpaid_leave | statutory_leave |
  sick_leave | work_reduction | trip`), HH:mm `start` / `end` per D-3-28,
  optional `hours` for `features.timesheet === "hours"` orgs, optional
  `external_references` array, and optional `tag_ids`.
- `EntryEditBody = Omit<EntryCreateBody, "date" | "purpose">` — PATCH shape
  with date+purpose stripped (immutable per OpenAPI `entry_edit_request`).
- `TimeEntryResponse = { time_entry: Record<string, unknown>; meta?: {...} }`
  — drift-tolerant wrapper for POST / PATCH / `/stop` / `/resume` responses.

JSDoc above each interface cites OpenAPI source + D-3-28 for the HH:mm
asymmetry between read and write shapes.

## Test Coverage Added (21 new, 100/100 total)

| File | Tests | Coverage |
|------|-------|----------|
| `test/keeping/date.test.ts` | 6 | DST summer (D1, D4), DST winter (D2, D5), mid-day same-day regex (D3), ICU presence smoke (D6) |
| `test/keeping/write-gate.test.ts` | 11 | Dry-run POST/PATCH/DELETE preview shape with full URL (W1-W3), confirm-path delegation (W4-W6), env-false escape hatch (W7), classifyAmbiguous true cases (W8-W10), AMBIGUOUS_TEXT byte-exact (W11) |
| `test/keeping/client.test.ts` (appended) | 4 | DELETE 204 → null (C1), DELETE 500 still throws KeepingApiError (C2), requestWithHeaders<T> body+headers shape (C3), shared throttle slot (C4) |

Existing 79 tests continue to pass — zero regressions.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run test/keeping/date.test.ts` | 6 pass |
| `npx vitest run test/keeping/write-gate.test.ts` | 11 pass |
| `npx vitest run test/keeping/client.test.ts` | 20 pass (16 pre-existing + 4 new) |
| `npx vitest run` (full project) | 100/100 (12 test files) |
| `npx tsc --noEmit` | exit 0 |
| `npx biome check src/ test/` | exit 0, 27 files checked |
| `npm run build` | dist\bin\keeping-mcp.js 22.32 KB built successfully |
| `grep '\.toISOString(' src/keeping/date.ts` | 0 matches |
| `grep AMBIGUOUS_TEXT src/keeping/write-gate.ts test/keeping/write-gate.test.ts` | both files match |
| `git diff HEAD~2 --stat -- src/tools/ src/server.ts` | empty (scope guardrails respected) |

## Decisions Made (per output spec)

- **BASE handling:** inline duplication in `src/keeping/write-gate.ts` (NOT
  exported from `src/keeping/client.ts`). Keeps the gate self-contained, makes
  the D-3-02 preview-URL assertion trivially testable with BASE co-located,
  avoids reaching into the client module for a constant.
- **`rawFetchWithHeaders`:** implemented as a NEW parallel sibling of
  `rawFetch`, NOT a refactor of `rawFetch` to return `{ body, headers }`.
  Rationale: a refactor would have touched the signature consumed by every
  existing GET/POST/PATCH/DELETE caller — net diff was larger than the
  sibling. The sibling shares the throttle and pRetry surface via
  `requestWithHeaders<T>`, so Pitfall 3 is satisfied without touching
  `request<T>`.
- **204 branch line numbers in `src/keeping/client.ts`:**
  - line **268** (inside `rawFetch`) — `if (res.status === 204) return null;`
  - line **305** (inside `rawFetchWithHeaders`) — `if (res.status === 204) return { body: null, headers: res.headers };`
  Both placed AFTER the `!res.ok` guard.
- **AMBIGUOUS_TEXT byte-check:** verified via Test W11
  `expect(AMBIGUOUS_TEXT).toBe("outcome unknown — verify with keeping_list_entries before retrying.")`.
  Em-dash (U+2014), lowercase, single trailing period. Confirmed matching.

## Deviations from Plan

None. The plan executed exactly as written. The only intra-task choice was
the documented "Acceptable simpler implementation" in Task 2 step 4
(parallel `rawFetchWithHeaders` sibling rather than refactoring `rawFetch`)
— the plan explicitly permits either approach. Biome auto-formatting after
the green commit reflowed three multi-line constructs onto single lines; no
semantic changes.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `0c16fb3` | `test(03-01): add foundation tests for date helpers, write-gate, requestWithHeaders, and 204 fix (D-3-13, D-3-16, D-3-18, D-3-27, D-3-28)` |
| 2 | `85f766e` | `feat(03-01): foundation — date helpers, write-gate, requestWithHeaders, and 204 fix (D-3-13, D-3-16, D-3-18, D-3-27, D-3-28)` |

## Hand-off to Wave 2

Wave 2 plans (03-02 through 03-07) can now be implemented in parallel because
every cross-cutting concern is locked here:

```typescript
import { previewOrCall, classifyAmbiguous, AMBIGUOUS_TEXT } from "../keeping/write-gate.js";
import { todayInAmsterdam, nowInAmsterdamHHMM } from "../keeping/date.js";
import type { EntryCreateBody, EntryEditBody, TimeEntryResponse } from "../keeping/types.js";
// timer tools also:
const { body, headers } = await client.requestWithHeaders<TimeEntryResponse>("PATCH", `/${orgId}/time-entries/${entry_id}/stop`);
const serverTimeMs = Number(headers.get("X-Server-Time-Ms"));
```

## Self-Check: PASSED

Verified existence on disk:
- src/keeping/date.ts — FOUND
- src/keeping/write-gate.ts — FOUND
- test/keeping/date.test.ts — FOUND
- test/keeping/write-gate.test.ts — FOUND
- src/keeping/client.ts (modified, contains `res.status === 204` x2 and `requestWithHeaders`) — FOUND
- src/keeping/types.ts (modified, contains `EntryCreateBody`, `EntryEditBody`, `TimeEntryResponse`) — FOUND
- test/keeping/client.test.ts (modified, contains `KeepingClient — Phase 3 surface` describe block) — FOUND

Verified commits in git log:
- `0c16fb3` (RED) — FOUND
- `85f766e` (GREEN) — FOUND
