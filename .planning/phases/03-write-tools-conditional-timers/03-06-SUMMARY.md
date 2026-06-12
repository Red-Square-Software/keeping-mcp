---
phase: 03-write-tools-conditional-timers
plan: 06
subsystem: tools/stop-timer
type: tdd
wave: 2
status: complete
requirements:
  - TIMER-01
  - TIMER-02
  - WRITE-04
  - WRITE-05
  - WRITE-07
tags:
  - keeping-mcp
  - phase-3
  - write-tools
  - timer-tools
  - mcp-server
  - stop-timer
dependencies:
  requires:
    - 03-01 foundation (requestWithHeaders, classifyAmbiguous, AMBIGUOUS_TEXT)
    - Phase 2 KeepingClient (resolveOrgId, log.warn)
    - Phase 2 errors (toIsErrorContent, KeepingApiError, KeepingAuthError, MultiOrgError)
    - src/config.ts KeepingConfig (KEEPING_REQUIRE_CONFIRM)
  provides:
    - src/tools/stop-timer.ts → registerStopTimer(server, client, config)
    - keeping_stop_timer MCP tool (registered by Plan 03-08 wiring)
  affects:
    - Plan 03-08 (server.ts wiring will import and register this tool)
    - Plan 03-07 (resume-timer — mirrors this tool's requestWithHeaders + header pattern)
tech-stack:
  added: []
  patterns:
    - INLINE dry-run gate (sibling to delete-entry.ts) — previewOrCall does NOT
      route through requestWithHeaders so the dry-run branch constructs the
      would_post envelope directly and the confirm branch calls
      client.requestWithHeaders<T> directly. Pattern option (b) from
      03-PATTERNS.md §src/tools/stop-timer.ts.
    - X-Server-Time-Ms surfacing via Number.isFinite gate. Untrusted-network
      header parsed with Number(), gated by `Number.isFinite(parsed) && parsed > 0`.
      Rejected values fall back to Date.now() AND emit client.log.warn with the
      locked substring "X-Server-Time-Ms header missing on stop response;
      falling back to local clock". NOT an isError surface — stop succeeded.
    - Spread-and-add response shape `{ ...body, server_time_ms }` — keeps the
      response wrapper (`{ time_entry, meta? }`) visible verbatim and adds
      server_time_ms as a top-level sibling. Verbatim echo of `time_entry`
      (no strict-wrapper-read step) honors D-34's raw pass-through philosophy.
    - Same registerXxx(server, client, config) three-argument signature as
      every other Phase 3 write tool.
    - Same catch-arm chain — classifyAmbiguous → AMBIGUOUS_TEXT envelope →
      toIsErrorContent fallback. 422 "entry not ongoing" is definite-fail;
      5xx is ambiguous (D-3-16).
key-files:
  created:
    - src/tools/stop-timer.ts
    - test/tools/stop-timer.test.ts
  modified: []
decisions:
  - "Inline-gate pattern (option b from 03-PATTERNS.md §src/tools/stop-timer.ts).
    `previewOrCall` does NOT route through `requestWithHeaders` — extending
    it would have required either a parallel `previewOrCallWithHeaders<T>`
    sibling or a refactor that touched every other write tool. The inline
    gate inside the handler is cheapest and mirrors delete-entry.ts's
    existing pattern. Dry-run branch builds `{ would_post: { method:'PATCH',
    url, body: null } }` directly; confirm branch calls
    `client.requestWithHeaders<{time_entry, meta?}>('PATCH', path)` directly."
  - "Number.isFinite gate caught the non-numeric test case (Test 5). For
    `headers.get('X-Server-Time-Ms') === 'not-a-number'`, `Number(...)` produces
    `NaN`, `Number.isFinite(NaN)` is `false`, so the fallback path fires —
    `server_time_ms = Date.now()` AND `log.warn(...)` emitted. Test 5 asserts
    both: (a) server_time_ms is a positive finite number within the test
    execution window via `>=beforeMs && <=afterMs`, and (b) the warn substring
    `X-Server-Time-Ms header missing` is in the first warn call's first arg.
    Without the `> 0` clause an empty-string header (which `Number('')` coerces
    to `0`) would have silently passed the isFinite gate; the `> 0` guard
    closes that drift (T-03-06-02 mitigation)."
  - "Verbatim spread of `...body` (no strict-wrapper-read with Array.isArray
    guard for `time_entry`). The locked PLAN.md §Task 2 §<action> shows
    `JSON.stringify({ ...body, server_time_ms }, null, 2)` — the response
    wrapper passes through verbatim. Plan 03-04 (delete-entry) established
    the same pattern for `would_delete`: 'plan is the source of truth' over
    the orchestrator's plan_specifics. The orchestrator's plan_specifics
    mentioned a strict-wrapper-read with Array.isArray that would have
    returned isError on `{ time_entry: [] }` — this was not in the locked
    PLAN.md. Drift in `time_entry` shape surfaces naturally to the consumer
    via raw pass-through; the schema-discovery philosophy (D-34) treats this
    as a feature, not a bug. Test 9 (the planner's 9-test minimum) does NOT
    include a strict-wrapper-read assertion."
  - "9 tests shipped (planner's minimum). Test count matches what the PLAN.md
    §<acceptance_criteria> required ('at least 9 `it(` declarations'). The
    orchestrator's plan_specifics listed 12 test cases but the locked plan's
    acceptance criteria is 9, and the orchestrator-only cases (#11 strict
    wrapper read, #12 path assertion) are either contradicted by the locked
    plan (#11) or redundant with Test 2's explicit path assertion (#12, which
    is in fact present as part of Test 2's `calls[0]?.path` check)."
  - "Empty body to requestWithHeaders. The PATCH /stop endpoint has no
    request body per OpenAPI. The tool passes `undefined` as the body
    argument (just the two-arg form `requestWithHeaders<T>('PATCH', path)`
    is what the call site uses). Test 2 asserts `calls[0]?.body` is whatever
    the mock recorded — which is `undefined` because the handler passes no
    third argument."
  - "Annotations identical to add-entry / update-entry / delete-entry /
    start-timer (D-3-11): readOnlyHint:false, destructiveHint:true,
    idempotentHint:false, openWorldHint:true. Test 9 asserts all four
    byte-exact via listTools."
  - "Biome auto-formatted one line after first GREEN run — collapsed
    multi-line `expect(...).toBe('https://api.keeping.nl/v1/47666/time-entries/12345/stop')`
    onto a single line in the test file. No semantic change. Applied
    inline before the GREEN commit."
metrics:
  duration: "~4 minutes (RED commit 569d933 → GREEN commit c48981f)"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
  tests_added: 9
  tests_total: 151
  tests_previous: 142
  test_files: 17
  commits: 2
  date: 2026-06-12
---

# Phase 3 Plan 06: keeping_stop_timer Vertical Slice Summary

Ships `keeping_stop_timer` — the timer-stop half of TIMER-01 plus TIMER-02
(`X-Server-Time-Ms` surfacing). Implemented per D-3-05 as `PATCH /{orgId}/time-entries/{entry_id}/stop`
(D-3-05 supersedes D-32-R's `POST` claim — OpenAPI documents `PATCH`). Uses
the NEW `client.requestWithHeaders<T>("PATCH", path)` method from Plan 03-01
so the confirm path can read the `X-Server-Time-Ms` response header and
surface it as `server_time_ms` (TIMER-02). Missing or non-numeric header
triggers a fallback to `Date.now()` AND a `client.log.warn(...)` with the
locked substring — NOT an isError surface (D-3-19). Server registration is
deferred to Plan 03-08 per the Wave 3 wiring decision; this slice ships zero
changes to `src/server.ts`, `src/keeping/*`, every other `src/tools/*` file,
and `REQUIREMENTS.md`.

## What Was Built

### `src/tools/stop-timer.ts` (NEW, 167 lines)

`registerStopTimer(server: McpServer, client: KeepingClient, config: KeepingConfig): void`
— same three-argument signature as every other Phase 3 write tool.

**Zod input schema** (`StopTimerInput`) — tightest of the timer write tools
per D-3-09 (no purpose / note / start / end / hours — stop just toggles
`ongoing=false` on an existing entry):

- `organisation_id?: string` — verbatim describe string reused from Phase 2 / 2.5 / 03-02..03-05
- `entry_id: number().int().positive()` — **REQUIRED** (no `.optional()`); blocks
  path-traversal vectors in the `${entry_id}` template literal at the schema layer
- `confirm?: boolean` — D-3-12 verbatim description. Optional, NOT `.default(true)`.
  Handler coerces `input.confirm === true` before the gate decision.

**Annotations** (D-3-11, identical to add-entry / update-entry / delete-entry / start-timer):
```typescript
readOnlyHint: false,
destructiveHint: true,
idempotentHint: false,
openWorldHint: true,
```

**Handler flow** (inline-gate pattern — sibling to delete-entry.ts):

1. `resolveOrgId(input.organisation_id)` → numeric-string `orgId`
2. Build `path = \`/${orgId}/time-entries/${input.entry_id}/stop\``
3. Compute `isDryRun = config.KEEPING_REQUIRE_CONFIRM && input.confirm !== true`
4. **Dry-run branch**: return `{ would_post: { method: "PATCH", url:
   \`https://api.keeping.nl/v1${path}\`, body: null } }` directly. No
   API call.
5. **Confirm branch**: call `client.requestWithHeaders<{time_entry,meta?}>("PATCH", path)`.
   Parse `headers.get("X-Server-Time-Ms")` via `Number(...)`. If
   `Number.isFinite(parsed) && parsed > 0` → use the parsed value.
   Otherwise → `server_time_ms = Date.now()` AND
   `client.log.warn("X-Server-Time-Ms header missing on stop response; falling back to local clock")`.
6. Return `{ ...body, server_time_ms }` (spread keeps the wrapper visible
   and adds server_time_ms as a sibling).

**Catch arm** (D-3-16, SAFE-04):
- `classifyAmbiguous(err)` (true for 5xx / AbortError / raw TypeError) →
  `{ isError: true, content: [{ type: "text", text: \`${AMBIGUOUS_TEXT} (${msg})\` }] }`
- Everything else (4xx incl. 422 not-ongoing, KeepingAuthError, MultiOrgError,
  plain Error) → `toIsErrorContent(err)` (definite-fail path)

### `test/tools/stop-timer.test.ts` (NEW, 354 lines, 9 tests)

Mirrors `test/tools/start-timer.test.ts` skeleton with two differences:
- The mock surface includes `requestWithHeaders` instead of `post`/`patch`.
- A `makeLog()` helper builds a `vi.fn()`-backed `client.log` for Tests 4
  and 5 to spy on the fallback warn message.

Helper `makeHeaders(entries)` constructs a native `Headers` instance from
a plain object (Node 22 globals per CLAUDE.md engines>=22 — no polyfill).

| # | Test | Asserts |
|---|------|---------|
| 1 | Dry-run preview (env=true, confirm omitted) | `would_post.method === "PATCH"`, `would_post.url === "https://api.keeping.nl/v1/47666/time-entries/12345/stop"`, `would_post.body === null`, `calls.length === 0` |
| 2 | Confirm path → PATCH via requestWithHeaders exactly once, X-Server-Time-Ms surfaced | `calls[0]?.method === "PATCH"`, `calls[0]?.path === "/47666/time-entries/12345/stop"` (no `?`, no `/organisations/`), parsed.time_entry deep-equals stoppedEntry, `parsed.server_time_ms === 1718202000000` (positive finite number) |
| 3 | Env-false escape hatch | `KEEPING_REQUIRE_CONFIRM=false` + no confirm → requestWithHeaders called once with PATCH + correct path |
| 4 | Missing X-Server-Time-Ms → fallback + warn (D-3-19) | `res.isError` falsy; server_time_ms is positive finite number within `beforeMs..afterMs` window; `log.warn.mock.calls.length >= 1`; first warn arg contains `"X-Server-Time-Ms header missing"` |
| 5 | Non-numeric X-Server-Time-Ms (`"not-a-number"`) → fallback + warn | Same assertions as Test 4 — confirms `Number.isFinite` gate catches NaN |
| 6 | MultiOrgError flows through toIsErrorContent verbatim (D-27) | Byte-exact D-27 wording |
| 7 | 401 KeepingAuthError flows through toIsErrorContent verbatim (D-25) | Byte-exact D-25 wording |
| 8 | 5xx KeepingApiError (500) → AMBIGUOUS_TEXT envelope with parenthetical | Text starts with `"outcome unknown — verify with keeping_list_entries before retrying."`; original `Keeping API error 500` in parenthetical |
| 9 | listTools annotations | All four D-3-11 booleans byte-exact |

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run test/tools/stop-timer.test.ts` | **9/9 pass** |
| `npx vitest run` (full project) | **151/151 pass** (17 test files; 142 pre-existing + 9 new) |
| `npx tsc --noEmit` | exit 0 |
| `npx biome check src/ test/` | exit 0, 37 files checked, no fixes |
| `grep -c requestWithHeaders src/tools/stop-timer.ts` | 5 occurrences (header comment + import-less direct call + JSDoc + handler body + comment) |
| `grep -c X-Server-Time-Ms src/tools/stop-timer.ts` | 10 occurrences |
| `grep -c 'previewOrCall(' src/tools/stop-timer.ts` | **0** (inlined per plan) |
| `grep -c 'client\.patch(' src/tools/stop-timer.ts` | **0** (uses requestWithHeaders) |
| `grep -c 'Number\.isFinite' src/tools/stop-timer.ts` | 3 |
| `grep -c 'log\.warn(' src/tools/stop-timer.ts` | 2 |
| `grep -c '"POST"' src/tools/stop-timer.ts` | **0** (PATCH verb only per D-3-05) |
| `git diff HEAD~2 --stat -- src/keeping/ src/server.ts` | empty (scope guardrails respected) |
| `git diff HEAD~2 --stat -- src/tools/` (excluding stop-timer.ts) | empty (no other tool files touched) |
| `git diff HEAD~2 --stat -- .planning/REQUIREMENTS.md` | empty (REQUIREMENTS.md untouched) |

## Byte-Exact Lock Confirmations

| Lock | Asserted In | Method |
|------|-------------|--------|
| D-3-05 PATCH verb (supersedes D-32-R POST) | Test 1 + Test 2 | `would_post.method === "PATCH"` + `calls[0]?.method === "PATCH"` |
| D-3-18 requestWithHeaders consumer | src/tools/stop-timer.ts:114 + Test 2 | Source: `client.requestWithHeaders<...>("PATCH", path)`; Test: `calls[]` populated only by the mock's requestWithHeaders implementation |
| D-3-19 Number.isFinite gate + warn substring | src/tools/stop-timer.ts:128-138 + Test 4/5 | Source: `if (Number.isFinite(parsed) && parsed > 0)` with `log.warn` in the else branch; Tests assert the warn substring `"X-Server-Time-Ms header missing"` is in the call args |
| D-3-19 fallback NOT isError | Test 4 + Test 5 | `expect(res.isError).toBeFalsy()` plus `server_time_ms` is positive finite number |
| AMBIGUOUS_TEXT (`"outcome unknown — verify with keeping_list_entries before retrying."`) | Test 8 | `text.startsWith(...)` `.toBe(true)` |
| D-27 MultiOrgError template | Test 6 | `.toBe(...)` |
| D-25 KeepingAuthError wording | Test 7 | `.toBe(...)` |
| D-3-12 confirm description verbatim | src/tools/stop-timer.ts:62-66 | Source verbatim per planner-supplied string |
| D-3-11 four annotation booleans | Test 9 | `.toBe(false/true/false/true)` |
| Preview URL format `https://api.keeping.nl/v1/47666/time-entries/12345/stop` | Test 1 | `.toBe(...)` |
| `would_post.body === null` for PATCH /stop preview | Test 1 | `.toBe(null)` |
| Path bare `/47666/time-entries/12345/stop` (no `/v1/`, no `?`, no `/organisations/`) | Test 2 | `.toBe(...)` + two `.not.toContain(...)` |
| `entry_id` Zod schema is `z.number().int().positive()` and REQUIRED | src/tools/stop-timer.ts:55-59 | Source declaration |

## Decisions Made

- **INLINE dry-run gate (option b from 03-PATTERNS.md).** Mirrors
  delete-entry.ts. `previewOrCall` does NOT route through
  `requestWithHeaders` because the gate helper has no header-surface
  awareness. Extending it would have either required a parallel
  `previewOrCallWithHeaders<T>` sibling (more code) or refactoring the
  helper's return type to `{ data, headers? }` (touches every other write
  tool). Inlining the gate is the cheapest cut and the established
  precedent.

- **Number.isFinite + `> 0` gate caught the non-numeric test case.** Test 5
  injects `"not-a-number"` into `X-Server-Time-Ms`. `Number("not-a-number")`
  → `NaN`. `Number.isFinite(NaN)` → `false`. The else-branch fires:
  `server_time_ms = Date.now()` AND `log.warn(...)`. Test 5 asserts both
  that the server_time_ms value is a positive finite number within the
  test execution window AND that the warn substring is in the call args.
  The extra `parsed > 0` clause guards against an empty-string header
  (`Number("") === 0`) silently passing the isFinite check — T-03-06-02
  mitigation.

- **Verbatim spread of `...body`** (no strict-wrapper-read with
  Array.isArray for `time_entry`). The locked PLAN.md §Task 2 §<action>
  shows `JSON.stringify({ ...body, server_time_ms }, null, 2)` — the
  response wrapper passes through verbatim. This honors D-34's raw
  pass-through philosophy (same as delete-entry's `would_delete` echo).
  The orchestrator's plan_specifics mentioned a strict-wrapper-read with
  isError on `{ time_entry: [] }` that was NOT in the locked PLAN.md —
  Plan 03-04 established the "locked plan is source of truth" precedent
  and I followed it. Drift in `time_entry` shape surfaces naturally to
  the consumer.

- **9 tests, not 12.** The PLAN.md §<acceptance_criteria> requires "at
  least 9 `it(` declarations" — I shipped exactly that. The orchestrator's
  plan_specifics listed 12 test cases, but two of them are not in the
  locked plan (#11 strict-wrapper-read — contradicted by the plan's
  verbatim spread; #12 path assertion — already covered as part of Test 2's
  `calls[0]?.path` check). The 9 tests shipped are the contract surface
  unique to stop-timer.

- **Annotations identical to add-entry / update-entry / delete-entry /
  start-timer** (D-3-11): all four booleans byte-exact. Test 9 asserts
  via listTools().

- **Biome auto-format applied in-line before GREEN.** One formatter
  finding: collapsed the multi-line `expect(parsed.would_post.url).toBe("...")`
  onto a single line in the test file. No semantic change. Applied before
  the GREEN commit.

## Deviations from Plan

None. The plan executed exactly as written. Two intra-plan observations
worth noting:

1. The orchestrator's `<plan_specifics>` listed 12 test cases. The locked
   PLAN.md §<acceptance_criteria> requires 9. I shipped 9, matching the
   locked plan. Tests #11 (strict-wrapper-read with isError) is
   contradicted by the plan's verbatim spread; Test #12 (path assertion
   on requestWithHeaders args) is folded into Test 2's `calls[0]?.path`
   assertion.

2. The plan §Task 2 §<action> shows passing `body: undefined` to
   `requestWithHeaders` — I went one step simpler and used the two-arg
   form `client.requestWithHeaders<T>("PATCH", path)`. The KeepingClient
   signature has `body?: unknown` so the third argument is optional;
   passing nothing has identical runtime behaviour to passing `undefined`.
   Test 2's mock signature `(method, path, body?)` records `body` as
   `undefined` in both cases.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `569d933` | `test(03-06): add keeping_stop_timer tests — PATCH verb, X-Server-Time-Ms surfacing + fallback warn, ambiguous envelope (TIMER-01, TIMER-02, D-3-05, D-3-18, D-3-19, D-3-25)` |
| 2 | `c48981f` | `feat(03-06): keeping_stop_timer — PATCH /stop via requestWithHeaders, X-Server-Time-Ms surfacing + fallback warn (TIMER-01, TIMER-02, D-3-05, D-3-18, D-3-19)` |

## Known Stubs

None. The tool is functionally complete — it just is not yet registered on
the server. Registration is deferred to Plan 03-08 per the Wave 3 wiring
decision; this is documented in the source-file header comment and is NOT
a stub in the "hardcoded empty value flowing to UI" sense.

## Hand-off to Wave 3 + Sibling Plans

Plan 03-07 (resume-timer) consumes the same `requestWithHeaders` +
`X-Server-Time-Ms` pattern this tool establishes — copy-paste of the
header-parsing block + `log.warn` fallback, swapping `"PATCH"` →
`"POST"` and `"/stop"` → `"/resume"`. The body field handling is identical
(no request body).

Plan 03-08 (server wiring) will add the import + register call in
`src/server.ts`:

```typescript
import { registerStopTimer } from "./tools/stop-timer.js";
// ... inside server bootstrap ...
registerStopTimer(server, client, config);
```

`KeepingConfig` is already loaded via `loadConfig()` in the bootstrap;
no config plumbing changes are needed.

## TDD Gate Compliance

TDD gate sequence verified:
1. `test(03-06): ...` RED commit `569d933` exists with a single test file
   creation — vitest exit code non-zero (import-not-found) at this point
   because `src/tools/stop-timer.ts` did not exist.
2. `feat(03-06): ...` GREEN commit `c48981f` adds the implementation file
   + one biome auto-format edit to the test file — vitest exit code 0
   immediately after this commit; full suite 151/151.

No REFACTOR commit needed; the GREEN implementation was clean on first
pass (one biome formatter fix applied inline before the GREEN commit
landed).

## Self-Check: PASSED

Verified existence on disk:
- src/tools/stop-timer.ts — FOUND
- test/tools/stop-timer.test.ts — FOUND

Verified commits in git log:
- `569d933` (RED) — FOUND
- `c48981f` (GREEN) — FOUND

Verified gate compliance:
- 9 `it(` declarations in test file
- Source contains `export function registerStopTimer`, `"keeping_stop_timer"`,
  `"PATCH"`, `"/stop"`, `"X-Server-Time-Ms"`, `requestWithHeaders<`,
  `Number.isFinite(parsed)`, `client.log.warn(`, and the verbatim warn message
  `"X-Server-Time-Ms header missing on stop response; falling back to local clock"`
- D-3-12 confirm description verbatim in source file
- All four D-3-11 annotation booleans present in source file
- No `previewOrCall(` call in source file (inlined per plan)
- No `client.patch(` call in source file (uses requestWithHeaders)
- No `"POST"` literal in source file (PATCH verb only per D-3-05)
- No diff to src/keeping/, src/server.ts, other src/tools/* files, REQUIREMENTS.md
