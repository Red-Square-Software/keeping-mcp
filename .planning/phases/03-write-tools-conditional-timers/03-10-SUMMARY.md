---
phase: 03-write-tools-conditional-timers
plan: 10
subsystem: tools/(add-entry|update-entry|start-timer)
tags:
  - keeping-mcp
  - phase-3
  - gap-closure
  - cr-02
  - d-3-28
  - hh-mm-validation
  - zod-regex
dependency_graph:
  requires:
    - z.string().regex() (Zod 3.25+)
    - nowInAmsterdamHHMM (src/keeping/date.ts) emits zero-padded HH:mm
  provides:
    - Strict HH:mm wire-contract enforcement at the Zod schema layer for add-entry / update-entry / start-timer
    - Exported AddEntryInput / UpdateEntryInput / StartTimerInput Zod schemas (test-affordance only, no runtime change)
  affects:
    - WRITE-01 (add-entry) input validation
    - WRITE-02 (update-entry) input validation
    - TIMER-01 (start-timer) input validation
    - D-3-28 contract (strict 24-hour zero-padded HH:mm on the wire)
tech_stack:
  added: []
  patterns:
    - "Strict regex /^([01]\\d|2[0-3]):[0-5]\\d$/ — hour 00-19 OR 20-23, colon, minute [0-5]\\d, full string anchored"
    - "Zod .regex(pattern, message) — actionable error message ('must be HH:mm (24-hour, zero-padded)') instead of generic 'invalid_string'"
    - "Schema export for test-affordance only — exports widen test surface but introduce zero new runtime behavior"
key_files:
  created:
    - .planning/phases/03-write-tools-conditional-timers/03-10-SUMMARY.md
  modified:
    - src/tools/add-entry.ts
    - src/tools/update-entry.ts
    - src/tools/start-timer.ts
    - test/tools/add-entry.test.ts
    - test/tools/update-entry.test.ts
    - test/tools/start-timer.test.ts
decisions:
  - "Closed CR-02 / 03-VERIFICATION.md Gap #2 by replacing the loose regex /^\\d{1,2}:\\d{2}(:\\d{2})?(am|pm)?$/i with /^([01]\\d|2[0-3]):[0-5]\\d$/ at all five callsites (add-entry start+end, update-entry start+end, start-timer start). Single canonical regex literal across files — no per-tool variation."
  - "Exported the three Zod input schemas (AddEntryInput, UpdateEntryInput, StartTimerInput) so negative tests can call safeParse directly at the schema layer. Minimal test-surface widening; runtime tool registration unchanged."
  - "Error message wording: 'must be HH:mm (24-hour, zero-padded)' — chosen to name both the format (HH:mm) and the constraint (24-hour, zero-padded) so a confused LLM caller gets actionable guidance instead of a generic Zod 'invalid_string' surface."
metrics:
  duration: "~6 minutes"
  completed_date: "2026-06-12"
  tasks_completed: 1
  files_created: 0
  files_modified: 6
requirements:
  - WRITE-01
  - WRITE-02
  - TIMER-01
---

# Phase 3 Plan 10: Strict HH:mm Regex Gap Closure (CR-02) Summary

**One-liner:** Replace the loose `/^\d{1,2}:\d{2}(:\d{2})?(am|pm)?$/i` regex with strict `/^([01]\d|2[0-3]):[0-5]\d$/` at all five write-tool callsites (add-entry start+end, update-entry start+end, start-timer start) so Zod enforces the D-3-28 24-hour zero-padded HH:mm wire contract BEFORE the request reaches Keeping — instead of letting `"1:30pm"`, `"25:00"`, and `"00:00:00"` through to a wasted 422 round-trip or, worse, silent reinterpretation.

## What Was Built

### Source changes — five callsites, one canonical regex

The exact regex literal now appears at all five callsites:

```typescript
.regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:mm (24-hour, zero-padded)")
```

| File | Field(s) | Lines (approx) |
|------|----------|----------------|
| `src/tools/add-entry.ts` | `start`, `end` | 90, 95 |
| `src/tools/update-entry.ts` | `start`, `end` | 74, 79 |
| `src/tools/start-timer.ts` | `start` | 89 |

Regex breakdown:
- `^([01]\d|2[0-3])` — hour: `00`-`19` (`[01]` followed by any digit) OR `20`-`23` (literal `2` followed by `[0-3]`)
- `:` — literal colon (single)
- `[0-5]\d$` — minute: `00`-`59` (`[0-5]` followed by any digit)
- The `^...$` anchors guarantee full-string match — no leading or trailing slop.

Rejects:
- `"1:30pm"` — `pm` suffix has no match in the new pattern.
- `"25:00"` — hour `25` is not in `[01]\d|2[0-3]`.
- `"9:5"` — unpadded; `9` is one char but the alternation demands two; minute `5` is one char but `[0-5]\d` demands two.
- `"00:00:00"` — seconds segment has no match (regex ends at `$` after minute).

Accepts (positive surface, including the default-path output from `nowInAmsterdamHHMM()`):
- `"00:00"`, `"09:05"`, `"13:45"`, `"23:59"`.

### Schema exports (test-affordance)

Three Zod schemas are now exported so negative tests can call `safeParse` directly at the schema boundary:

- `export const AddEntryInput = z.object({ ... })` in `src/tools/add-entry.ts`
- `export const UpdateEntryInput = z.object({ ... })` in `src/tools/update-entry.ts`
- `export const StartTimerInput = z.object({ ... })` in `src/tools/start-timer.ts`

No runtime behavior change — the same Zod schema instance was already passed to `server.registerTool()`. Exporting it only widens the test-import surface.

### Test additions — one `describe` block per test file

Each of the three test files appends a new bottom-of-file block:

```typescript
describe("HH:mm regex (CR-02 / D-3-28 gap closure)", () => { ... });
```

Each block runs a loop over `REJECT_CASES = ["1:30pm", "25:00", "9:5", "00:00:00"]` asserting `safeParse(...).success === false`, a parallel loop over `ACCEPT_CASES = ["00:00", "09:05", "13:45", "23:59"]` asserting `safeParse(...).success === true`, and one explicit `it("error message names HH:mm and 24-hour", ...)` test that pulls `error.flatten().fieldErrors.start[0]` and asserts it `toContain("HH:mm")` AND `toContain("24-hour")`.

Per-file test counts added by this plan:
- `test/tools/add-entry.test.ts`: 17 new tests (4 reject × 2 fields = 8, 4 accept × 2 fields = 8, 1 error-message = 17 total)
- `test/tools/update-entry.test.ts`: 17 new tests (same shape; `entry_id: 1` passed in every payload because it's required)
- `test/tools/start-timer.test.ts`: 9 new tests (4 reject × 1 field = 4, 4 accept × 1 field = 4, 1 error-message = 9 total — start-timer has no `end` field)

Plan-total: 43 new tests, all green.

## Verification

### Vitest — targeted suite

```
$ npx vitest run test/tools/add-entry.test.ts test/tools/update-entry.test.ts test/tools/start-timer.test.ts

 Test Files  3 passed (3)
      Tests  75 passed (75)
```

### Vitest — full suite

```
$ npx vitest run

 Test Files  19 passed (19)
      Tests  206 passed (206)
```

Baseline before this plan: 163 tests. After: 206 tests. Delta: 43 new (matches per-file accounting above).

### TypeScript

```
$ npx tsc --noEmit
(exit 0, no output)
```

### Biome

```
$ npx biome check src/tools/add-entry.ts src/tools/update-entry.ts src/tools/start-timer.ts \
                  test/tools/add-entry.test.ts test/tools/update-entry.test.ts test/tools/start-timer.test.ts

Checked 6 files in 20ms. No fixes applied.
(exit 0)
```

Note: Biome flagged two import-order issues on first pass (Biome sorts case-insensitively and prefers `register*` before `*Input`/`StartTimerInput`/`UpdateEntryInput`). Fixed inline by reordering the imports in `test/tools/update-entry.test.ts` and `test/tools/start-timer.test.ts`. No source-file imports needed reordering.

### Done-criteria grep verification

```
$ grep -c 'must be HH:mm' src/tools/add-entry.ts src/tools/update-entry.ts src/tools/start-timer.ts
src/tools/add-entry.ts:2
src/tools/update-entry.ts:2
src/tools/start-timer.ts:1
(5 total — matches the five callsites)

$ grep 'am|pm' src/tools/add-entry.ts src/tools/update-entry.ts src/tools/start-timer.ts
(no matches — loose regex completely gone)

$ grep -E '^export const (AddEntryInput|UpdateEntryInput|StartTimerInput)' src/tools/*.ts
src/tools/add-entry.ts:48:export const AddEntryInput = z.object({
src/tools/start-timer.ts:64:export const StartTimerInput = z.object({
src/tools/update-entry.ts:51:export const UpdateEntryInput = z.object({
```

### Default-path unbroken

`nowInAmsterdamHHMM()` is the default for `start` on both add-entry and start-timer. It uses `Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit", hour12: false })` which always emits zero-padded 24-hour `HH:mm`. The new strict regex accepts that output verbatim. The DST-default tests (add-entry Test 11, start-timer Test 4) — which assert `body.date === "2026-06-13"` and `body.start === "00:30"` at fake-system-time `2026-06-12T22:30:00Z` — continue to pass, confirming no regression on the default path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Biome import-order: case-insensitive sort prefers `register*` before `*Input`**

- **Found during:** Task 1 verification (biome check after applying the strict regex)
- **Issue:** The natural reading order `import { UpdateEntryInput, registerUpdateEntry }` and `import { StartTimerInput, registerStartTimer }` failed Biome's `assist/source/organizeImports` rule. Biome sorts member names case-insensitively, so `registerUpdateEntry` (`r`) sorts before `UpdateEntryInput` (`u`) and `registerStartTimer` (`r`) sorts before `StartTimerInput` (`s`).
- **Fix:** Reordered to `import { registerUpdateEntry, UpdateEntryInput }` and `import { registerStartTimer, StartTimerInput }`. The `add-entry.test.ts` import `import { AddEntryInput, registerAddEntry }` was already correct — `A` (`a`) sorts before `r`.
- **Files modified:** `test/tools/update-entry.test.ts`, `test/tools/start-timer.test.ts`
- **No commit boundary** — folded into the single Task-1 commit `89313ae`.

No other deviations — the plan's Edits 1-6 and the TDD RED/GREEN gate sequence were followed exactly.

## Threat Surface

No new threat surface introduced. The plan's `<threat_model>` (T-03-10-01, T-03-10-02, T-03-10-03) is fully mitigated by the strict regex:

- **T-03-10-01 (Tampering — start/end bypassing HH:mm contract):** Mitigated — the new regex rejects all four known runtime-confirmed regressions (`"1:30pm"`, `"25:00"`, `"9:5"`, `"00:00:00"`) at the schema boundary.
- **T-03-10-02 (Info Disclosure — `"1:30pm"` silent reinterpretation):** Mitigated — there is no longer a path for a 12-hour-clock string to reach the wire, so it cannot be silently reinterpreted as `01:30` vs `13:30`.
- **T-03-10-03 (Repudiation — wasted 422 round-trip):** Mitigated — schema-layer rejection eliminates the round-trip for these four input shapes; the operator-facing log shows a Zod error with the field name and the actionable message, not a Keeping API 422.

## Phase 3 Gap-Closure Status

| Blocker | Plan | Status |
|---------|------|--------|
| CR-01 (TimeoutError arm in classifyAmbiguous) | 03-09 | Closed (commit `205945f`, this session's prior agent) |
| CR-02 (strict HH:mm regex) | 03-10 (this plan) | Closed (commit `89313ae`) |

Both Wave-1 gap-closure plans are now complete. The next workflow step is `/gsd:verify-phase 03` to transition Phase 3 VERIFICATION.md Truth #2 and Truth #6 to VERIFIED, after which Phase 4 (distribution & release) can begin.

## Self-Check: PASSED

- src/tools/add-entry.ts: FOUND (modified, 2× strict regex on start+end)
- src/tools/update-entry.ts: FOUND (modified, 2× strict regex on start+end)
- src/tools/start-timer.ts: FOUND (modified, 1× strict regex on start)
- test/tools/add-entry.test.ts: FOUND (modified, +17 tests)
- test/tools/update-entry.test.ts: FOUND (modified, +17 tests)
- test/tools/start-timer.test.ts: FOUND (modified, +9 tests)
- Commit 89313ae: FOUND in git log
