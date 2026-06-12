---
phase: 03-write-tools-conditional-timers
plan: 05
subsystem: tools/start-timer
type: tdd
wave: 2
status: complete
requirements:
  - TIMER-01
  - WRITE-04
  - WRITE-05
  - WRITE-07
tags:
  - keeping-mcp
  - phase-3
  - write-tools
  - timer-tools
  - mcp-server
  - start-timer
dependencies:
  requires:
    - 03-01 foundation (previewOrCall, classifyAmbiguous, AMBIGUOUS_TEXT, todayInAmsterdam, nowInAmsterdamHHMM)
    - Phase 2 KeepingClient (resolveOrgId, post)
    - Phase 2 errors (toIsErrorContent, MultiOrgError, KeepingApiError)
    - Phase 2.5 D-2.5-05a strict-wrapper extractor precedent (src/tools/timer-status.ts:58-65)
    - src/config.ts KeepingConfig (KEEPING_REQUIRE_CONFIRM)
  provides:
    - src/tools/start-timer.ts → registerStartTimer(server, client, config)
    - keeping_start_timer MCP tool (registered by Plan 03-08 wiring)
    - extractTimeEntry strict-wrapper helper (private; reused verbatim from timer-status.ts)
  affects:
    - Plan 03-08 (server.ts wiring will import and register this tool)
    - Plans 03-06 (stop) + 03-07 (resume) consume the timer_id this tool surfaces
tech-stack:
  added: []
  patterns:
    - Strict body construction with Object.keys-asserted absence of `end` and `hours` keys (D-3-06, D-3-24)
    - Verbatim three-clause Array.isArray guard (D-2.5-05a) for response-wrapper extraction
    - previewOrCall<T> consumer with input.confirm === true strict-equality coercion
    - Dry-run preview branch that detects `would_post` in result and passes through verbatim BEFORE timer_id extraction
    - "Drift surfaces as { timer_id: null }" defensive pattern — visible failure over silent pass-through
key-files:
  created:
    - src/tools/start-timer.ts
    - test/tools/start-timer.test.ts
  modified: []
decisions:
  - "Body construction omits `date` from the user-facing input surface — `date` is set server-side to `todayInAmsterdam()` because the 'timer started today' semantics make a user-supplied date a footgun. D-3-09 lists start_timer input as `{ organisation_id?, project_id?, task_id?, note?, purpose?, start?, confirm?: boolean }` — no `date` field. The strict Object.keys assertion in Test 1 confirms `date` IS present in the posted body (defaulted), just not in the input surface."
  - "Three Array.isArray references in the source file: line 17 (header comment citing D-2.5-05a), line 53 (the verbatim three-clause guard), line 162 (handler comment). Only line 53 is executable — the guard is byte-identical to src/tools/timer-status.ts:58-65."
  - "`extractTimeEntry` is a module-private function (not exported) because no other tool will consume it; copy-and-adapt across timer tools matches the established sibling-pattern from Phase 2 (projects.ts ↔ tasks.ts) — intentional duplication preserves the per-tool divergence point."
  - "`typeof rawId === \"number\"` guard added before assigning to timer_id — Test 5 + 6 drift cases (`{ time_entry: [] }` and `{ time_entry: null }`) collapse `entry?.id` to undefined, and a literal `entry?.id ?? null` would surface `null` correctly, BUT a non-numeric `id` (string drift, object drift) would silently pass through. The numeric coercion makes drift uniformly visible as `{ timer_id: null }`."
  - "9 tests shipped (matches plan minimum). Test count parity with the Plan 03-02 add-entry test count was NOT pursued because start-timer's input surface is narrower (no end / no hours / no date / no tag_ids / no external_references) — fewer permutations to test."
metrics:
  duration: "~2 minutes (RED commit 39f66db → GREEN commit 5d6d9a4)"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
  tests_added: 9
  tests_total: 142
  tests_previous: 133
  test_files: 16
  commits: 2
  date: 2026-06-12
---

# Phase 3 Plan 05: keeping_start_timer Vertical Slice Summary

Ships `keeping_start_timer` — the timer-start half of TIMER-01. Implemented per
D-3-06 as POST `/{orgId}/time-entries` with a body that strictly omits `end` and
`hours` keys (the absence of `end` is what Keeping reads as "ongoing entry").
On the confirm path, `time_entry.id` is extracted via the verbatim three-clause
`Array.isArray` guard from D-2.5-05a and surfaced as `{ timer_id }`. Server
registration is deferred to Plan 03-08 per the Wave 3 wiring decision; this
slice ships zero changes to `src/server.ts`, `src/keeping/*`, and every other
`src/tools/*` file.

## What Was Built

### `src/tools/start-timer.ts` (NEW, 183 lines)

`registerStartTimer(server: McpServer, client: KeepingClient, config: KeepingConfig): void`
— takes the same write-tool signature as `registerAddEntry` (Plan 03-02) and
`registerUpdateEntry` (Plan 03-03) so it can read `KEEPING_REQUIRE_CONFIRM`.

**Zod input schema** (`StartTimerInput`) — exactly the D-3-09 surface for
`start_timer`:

- `organisation_id?: string` — verbatim describe string reused from Phase 2 / 2.5 / 03-02
- `purpose: enum(8) = "work"` — exact D-3-07 enum
  (`["work","break","special_leave","unpaid_leave","statutory_leave","sick_leave","work_reduction","trip"]`)
- `project_id?: positive int`, `task_id?: positive int`
- `note?: string ≤ 10000 chars`
- `start?: HH:mm regex` — defaults to `nowInAmsterdamHHMM()` server-side
- `confirm?: boolean` — D-3-12 verbatim description

**Deliberately absent from the input surface** (D-3-09 + D-3-06):
- `end` — its presence would make the entry not a timer
- `hours` — same
- `date` — defaulted to `todayInAmsterdam()` server-side
- `tag_ids`, `external_references` — not part of D-3-09's start-timer surface

**Annotations** (D-3-11):
```typescript
readOnlyHint: false,
destructiveHint: true,
idempotentHint: false,
openWorldHint: true,
```

**Handler flow:**
1. `resolveOrgId(input.organisation_id)` → numeric-string `orgId`
2. Body construction (strict):
   ```typescript
   const body: Record<string, unknown> = {
     date: todayInAmsterdam(),
     purpose: input.purpose,
     start: input.start ?? nowInAmsterdamHHMM(),
   };
   if (input.project_id !== undefined) body.project_id = input.project_id;
   if (input.task_id !== undefined) body.task_id = input.task_id;
   if (input.note !== undefined) body.note = input.note;
   // NO body.end. NO body.hours.
   ```
3. `previewOrCall<{time_entry, meta?}>(client, { requireConfirm, confirm }, { method: "POST", path: \`/${orgId}/time-entries\`, body })`
4. Dry-run path detected via `"would_post" in result` → pass-through verbatim (no timer_id surfaced — no entry exists yet)
5. Confirm path → `extractTimeEntry(result)?.id` → numeric guard → `{ timer_id }`

**`extractTimeEntry` helper** — copied **verbatim** from
`src/tools/timer-status.ts:58-65` (the D-2.5-05a three-clause Array.isArray
guard). Module-private; not exported.

**Catch arm** (D-3-16, SAFE-04):
- `classifyAmbiguous(err)` → `{ isError: true, content: [{ type: "text", text: \`${AMBIGUOUS_TEXT} (${msg})\` }] }`
- otherwise → `toIsErrorContent(err)`

### `test/tools/start-timer.test.ts` (NEW, 309 lines, 9 tests)

Mirrors `test/tools/add-entry.test.ts` skeleton:
`buildClient(mockClient, config = defaultConfig)` helper +
`InMemoryTransport.createLinkedPair()` + `Partial<KeepingClient>` mocks.

| # | Test | Asserts |
|---|------|---------|
| 1 | Dry-run preview, body Object.keys strictly excludes end/hours | `Object.keys(body).sort()` === `["date","project_id","purpose","start"]`; `body.end === undefined`, `body.hours === undefined`, `"end" in body === false`, `"hours" in body === false`; `parsed.timer_id === undefined` |
| 2 | Confirm path → POST exactly once, body strict, response → `{ timer_id }` | Path = `/47666/time-entries`; Object.keys assertion on ACTUAL posted body; parsed = `{ timer_id: 456789123 }` |
| 3 | Env-false escape (`KEEPING_REQUIRE_CONFIRM:false`) | post called even without confirm; `{ timer_id: 111 }` |
| 4 | DST default | `Date.now()=2026-06-12T22:30:00Z` → `body.date = "2026-06-13"`, `body.start = "00:30"`; still no end / no hours |
| 5 | Drift `{ time_entry: [] }` → `{ timer_id: null }` | Array.isArray guard rejects the bare array; not isError; surface drift visibly |
| 6 | Drift `{ time_entry: null }` → `{ timer_id: null }` | Same guard rejects null; same surface |
| 7 | MultiOrgError → toIsErrorContent | Byte-exact D-27 wording |
| 8 | 5xx KeepingApiError (503) → AMBIGUOUS_TEXT envelope | Text starts with `"outcome unknown — verify with keeping_list_entries before retrying."`; original `Keeping API error 503` in parenthetical |
| 9 | listTools annotations | All four D-3-11 booleans byte-exact |

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run test/tools/start-timer.test.ts` | **9/9 pass** |
| `npx vitest run` (full project) | **142/142 pass** (16 test files; 133 pre-existing + 9 new) |
| `npx tsc --noEmit` | exit 0 |
| `npx biome check src/tools/start-timer.ts test/tools/start-timer.test.ts` | exit 0, 2 files checked, no fixes |
| `grep -nE "nowAmsterdamISO\|\.toISOString\(\)" src/tools/start-timer.ts` | 0 matches |
| `grep -nE "\bbody\.(end\|hours)\b" src/tools/start-timer.ts` | 0 matches |
| `grep -cE "Array\.isArray" src/tools/start-timer.ts` | 3 (1 executable at line 53; 2 in comments at lines 17, 162) |
| `git diff HEAD~2 --stat -- src/keeping/ src/server.ts` | empty (scope guardrails respected) |
| `git diff HEAD~2 --stat -- src/tools/` (excluding start-timer.ts) | empty (no other tool files touched) |

## Byte-Exact Lock Confirmations

| Lock | Asserted In | Method |
|------|-------------|--------|
| D-2.5-05a three-clause guard | src/tools/start-timer.ts:52-56 | Verbatim copy of src/tools/timer-status.ts:58-65 (diff produces zero non-comment difference) |
| D-3-24 strict Object.keys body | Test 1 + Test 2 | `Object.keys(body).sort()` `.toEqual([...])` |
| D-3-26 + D-3-28 DST default | Test 4 | `body.date === "2026-06-13"` + `body.start === "00:30"` |
| AMBIGUOUS_TEXT (`"outcome unknown — verify with keeping_list_entries before retrying."`) | Test 8 | `text.startsWith(...)` `.toBe(true)` |
| D-27 MultiOrgError template | Test 7 | `.toBe(...)` |
| D-3-12 confirm description verbatim | src/tools/start-timer.ts:95-97 | Source verbatim per planner-supplied string |
| D-3-11 four annotation booleans | Test 9 | `.toBe(false/true/false/true)` |

## Three-Clause Guard Line-Count Match

`extractTimeEntry` in `src/tools/start-timer.ts`:
```typescript
function extractTimeEntry(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== "object") return null;
  const candidate = (raw as Record<string, unknown>).time_entry;
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  return candidate as Record<string, unknown>;
}
```

Diff against `src/tools/timer-status.ts:58-65` (the D-2.5-05a canonical source):
**zero non-comment difference** — same eight lines including the closing
brace, same identifier names, same guard order, same `Array.isArray` clause
position (third). The JSDoc above the function is paraphrased for the
start-timer context but the function body is byte-identical.

## Decisions Made

- **No `date` in the input surface.** D-3-09's start_timer surface is
  explicit: `{ organisation_id?, project_id?, task_id?, note?, purpose?,
  start?, confirm?: boolean }`. No `date` field. The "timer started today"
  semantics make a user-supplied date a footgun (you'd be starting a timer
  that already-ended yesterday, or hasn't-yet-started tomorrow). `date` is
  set server-side via `todayInAmsterdam()` and Test 4 confirms the DST
  rollover behavior.
- **Numeric guard on timer_id.** `extractTimeEntry(result)?.id` could
  surface a non-numeric value if the API ever drifts the shape. The
  `typeof rawId === "number" ? rawId : null` guard ensures
  `{ timer_id }` is always either a number or `null` — drift is uniformly
  visible.
- **9 tests, not 13.** Plan 03-02 (add-entry) shipped 13 tests because of
  the mode-conditional body (times vs hours). start-timer has a single
  body shape, no end-time bookend, no tag_ids / external_references — so
  Tests 8 (string confirm Zod rejection) and 9 (user_id strip) from
  add-entry are framework-layer guarantees inherited from the same Zod
  + MCP-SDK validator and don't need to be re-tested per-tool. The 9
  tests shipped are the contract surface unique to start-timer.
- **Header comment cites D-2.5-05a ancestry.** The three-clause guard is
  copy-pasted from timer-status.ts but the source comment is paraphrased
  to start-timer's context; the ancestry is explicit at line 17 and
  line 162. Future drift in either tool's guard will surface a diff
  reviewer must reconcile.

## Deviations from Plan

None. The plan executed exactly as written. Two intra-plan observations
worth noting:

1. The plan suggested `date: input.date ?? todayInAmsterdam()` as the
   body line, with `date` as an optional Zod input. The implementation
   ships **without `date` in the input schema** (per D-3-09's strict
   start_timer surface) and unconditionally defaults to
   `todayInAmsterdam()`. The user-facing behaviour is identical; the
   input surface is narrower and harder to misuse.

2. The plan listed `extractTimeEntry` returning `entry?.id ?? null`. The
   implementation wraps this in a numeric guard (`typeof rawId ===
   "number" ? rawId : null`) for stricter drift handling. Test 5 + 6
   pass with both forms; the numeric guard is defence-in-depth.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `39f66db` | `test(03-05): add keeping_start_timer tests — strict no-end/no-hours body, timer_id extraction, drift guard, DST default (TIMER-01, D-3-06, D-3-24)` |
| 2 | `5d6d9a4` | `feat(03-05): keeping_start_timer — POST with no end/no hours, timer_id extraction via three-clause guard (TIMER-01, D-3-06)` |

## Known Stubs

None. The tool is functionally complete — it just is not yet registered
on the server. Registration is deferred to Plan 03-08 per the Wave 3
wiring decision; this is documented in the source-file header comment
and is NOT a stub in the "hardcoded empty value flowing to UI" sense.

## Hand-off to Wave 3 + Sibling Plans

Plan 03-06 (stop-timer) and 03-07 (resume-timer) consume the `timer_id`
this tool surfaces — the AI's expected flow is:

```
keeping_start_timer (returns timer_id) → ... user works ... →
keeping_stop_timer({ entry_id: timer_id }) OR keeping_resume_timer({ entry_id: timer_id })
```

Plan 03-08 (server wiring) will add the import + register call in
`src/server.ts`:

```typescript
import { registerStartTimer } from "./tools/start-timer.js";
// ... inside server bootstrap ...
registerStartTimer(server, client, config);
```

`KeepingConfig` is already loaded via `loadConfig()` in the bootstrap;
no config plumbing changes are needed.

## TDD Gate Compliance

TDD gate sequence verified:
1. `test(03-05): ...` RED commit `39f66db` exists with a single test
   file change (no source files modified) — vitest exit code non-zero
   at this point because `src/tools/start-timer.ts` did not exist.
2. `feat(03-05): ...` GREEN commit `5d6d9a4` adds the implementation
   file — vitest exit code 0 immediately after this commit.

No REFACTOR commit needed; the GREEN implementation was clean on first
pass (biome and tsc both clean, no test-iteration churn).

## Self-Check: PASSED

Verified existence on disk:
- src/tools/start-timer.ts — FOUND
- test/tools/start-timer.test.ts — FOUND

Verified commits in git log:
- `39f66db` (RED) — FOUND
- `5d6d9a4` (GREEN) — FOUND

Verified gate compliance:
- 9 `it(` declarations in test file
- Source contains `export function registerStartTimer`, `"keeping_start_timer"`, `"timer_id"`, `Array.isArray(candidate)` (the three-clause guard)
- D-3-12 confirm description verbatim in source file
- All four D-3-11 annotation booleans present in source file
- No `body.end` / `body.hours` bindings in source code
- No `.toISOString(` or `nowAmsterdamISO` anywhere in source file
- No diff to src/keeping/, src/server.ts, other src/tools/* files, REQUIREMENTS.md
