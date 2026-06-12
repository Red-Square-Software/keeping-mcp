---
phase: 03-write-tools-conditional-timers
plan: 02
subsystem: tools/add-entry
type: tdd
wave: 2
status: complete
requirements:
  - WRITE-01
  - WRITE-04
  - WRITE-05
  - WRITE-06
  - WRITE-07
  - WRITE-08
tags:
  - keeping-mcp
  - phase-3
  - write-tools
  - mcp-server
  - add-entry
dependencies:
  requires:
    - 03-01 foundation (previewOrCall, classifyAmbiguous, AMBIGUOUS_TEXT, todayInAmsterdam, nowInAmsterdamHHMM, EntryCreateBody, TimeEntryResponse)
    - Phase 2 KeepingClient (resolveOrgId, organisations cache, post)
    - Phase 2 errors (KeepingApiError, KeepingAuthError, MultiOrgError, toIsErrorContent)
    - src/config.ts KeepingConfig (KEEPING_REQUIRE_CONFIRM)
  provides:
    - src/tools/add-entry.ts → registerAddEntry(server, client, config)
    - keeping_add_entry MCP tool (registered by Plan 03-08 wiring)
  affects:
    - Plan 03-08 (server.ts wiring will import and register this tool)
tech-stack:
  added: []
  patterns:
    - Write-tool registerXxx(server, client, config) signature — adds KeepingConfig third arg vs read tools
    - previewOrCall<T> consumer with input.confirm === true strict-equality coercion (T-03-02-02 mitigation)
    - Catch arm chains classifyAmbiguous → AMBIGUOUS_TEXT envelope → toIsErrorContent fallback
    - Org-mode branching via client.organisations() cache + features.timesheet inspection
    - Mode-conditional body: times → start (default nowInAmsterdamHHMM) + optional end; hours → required hours, no start/end
key-files:
  created:
    - src/tools/add-entry.ts
    - test/tools/add-entry.test.ts
  modified: []
decisions:
  - "13 tests shipped (11 mandated + bonus 12 + 13 for hours-mode coverage). All pass on first GREEN run — no test-iteration churn."
  - "Test 8 (Zod rejects string \"true\" for confirm) verified: MCP-SDK Zod validation rejects the string at the schema boundary BEFORE the handler runs, so post is never called. T-03-02-02 mitigation effective at the framework layer, not just at the handler's `=== true` coercion."
  - "Test 9 (user_id strip) verified: MCP-SDK + Zod strip the unknown `user_id` field at validation; the handler never sees it and body.user_id is undefined as required by D-3-10 / T-03-02-03."
  - "`end` is forwarded only when explicitly supplied — leaving it unset is the timer-style ongoing case which belongs to keeping_start_timer (Plan 03-05). Plan-specifics docstring lock honored."
  - "Annotations are inline literals: `readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true` per D-3-11. Test 10 (listTools) asserts all four byte-exact."
  - "Biome auto-formatted both files after GREEN — reflowed multi-line import + multi-line `new Error(...)` onto single lines. No semantic changes. Auto-fix applied via `npx biome check --write`."
metrics:
  duration: "~5 minutes (RED commit fe24367 → GREEN commit fe19fc6)"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
  tests_added: 13
  tests_total: 113
  tests_previous: 100
  test_files: 13
  commits: 2
  date: 2026-06-12
---

# Phase 3 Plan 02: keeping_add_entry Vertical Slice Summary

Ships `keeping_add_entry` as a complete vertical slice — Zod input schema,
org-mode-aware POST body construction, AND-gate dry-run preview via
`previewOrCall`, ambiguous-failure envelope via `classifyAmbiguous`, and 13
tests. WRITE-01, WRITE-04, WRITE-05, WRITE-06 (per D-3-07 amendment), WRITE-07,
WRITE-08 all addressed in one tool. Server registration deferred to Plan 03-08
per the wave-3 wiring decision; this slice ships zero changes to `src/server.ts`,
`src/keeping/*`, and every other `src/tools/*` file.

## What Was Built

### `src/tools/add-entry.ts` (NEW, 202 lines)

`registerAddEntry(server: McpServer, client: KeepingClient, config: KeepingConfig): void`
adds the `KeepingConfig` third argument vs the read-tool sibling
`registerTimerStatus(server, client)` so it can read `KEEPING_REQUIRE_CONFIRM`.

**Zod input schema** (`AddEntryInput`) — exactly the D-3-09 surface minus
`user_id` (D-3-10):

- `organisation_id?: string` — verbatim describe string reused from Phase 2 / 2.5
- `date?: YYYY-MM-DD` — defaults to `todayInAmsterdam()` when omitted (WRITE-08)
- `purpose: enum(8) = "work"` — exact D-3-07 enum:
  `["work","break","special_leave","unpaid_leave","statutory_leave","sick_leave","work_reduction","trip"]`.
  NOT `billable`/`non_billable` (D-3-07 supersedes WRITE-06).
- `project_id?: positive int`, `task_id?: positive int`
- `note?: string ≤ 10000 chars`
- `tag_ids?: positive int[]`
- `external_references?: array(≤10)` of `{ id (10-40 hex), type: "generic_work_reference", name (≤191), url? }`
- `start?: HH:mm regex` — only relevant in `times` mode (D-3-08, D-3-28)
- `end?: HH:mm regex` — only relevant in `times` mode
- `hours?: 0..1000` — required in `hours` mode
- `confirm?: boolean` — D-3-12 verbatim description.
  Optional, NOT `.default(true)`. The handler coerces `input.confirm === true`
  before passing to `previewOrCall` so `undefined`/`false`/non-strict-true
  collapse to dry-run (T-03-02-01 / T-03-02-02 mitigation).

**Annotations** (D-3-11):
```typescript
readOnlyHint: false,
destructiveHint: true,
idempotentHint: false,
openWorldHint: true,
```

**Handler flow:**
1. `resolveOrgId(input.organisation_id)` → numeric-string `orgId`
2. `organisations()` (cached) → find org by `String(o.id) === orgId`
3. Construct base body `{ date, purpose }` + optional fields (`project_id`,
   `task_id`, `note`, `tag_ids`, `external_references`)
4. **Mode branch** (D-3-08):
   - `features.timesheet === "times"`: `body.start = input.start ?? nowInAmsterdamHHMM()`,
     forward `input.end` only if defined
   - `features.timesheet === "hours"`: require `input.hours` (return isError
     envelope if missing), `body.hours = input.hours`, no start/end keys
5. `previewOrCall<{time_entry, meta?}>(client, { requireConfirm, confirm }, { method: "POST", path: \`/${orgId}/time-entries\`, body })`
6. Return `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }`

**Catch arm** (D-3-16, SAFE-04):
- `classifyAmbiguous(err)` → `{ isError: true, content: [{ type: "text", text: \`${AMBIGUOUS_TEXT} (${msg})\` }] }`
- otherwise → `toIsErrorContent(err)`

### `test/tools/add-entry.test.ts` (NEW, 407 lines, 13 tests)

Mirrors `test/tools/timer-status.test.ts` skeleton:
`buildClient(mockClient, config = defaultConfig)` helper +
`InMemoryTransport.createLinkedPair()` + `Partial<KeepingClient>` mocks.

Shared constants:
- `defaultConfig: KeepingConfig` — `KEEPING_REQUIRE_CONFIRM: true`, `KEEPING_LOG_LEVEL: "error"`
- `mockOrgTimes` (47666, features.timesheet: "times", time_zone: "Europe/Amsterdam")
- `mockOrgHours` — same shape, features.timesheet: "hours"

| # | Test | Asserts |
|---|------|---------|
| 1 | Dry-run preview, post NOT called | `would_post.url = https://api.keeping.nl/v1/47666/time-entries`, body shape, post mock throws if reached |
| 2 | Confirm path → POST exactly once | Path = `/47666/time-entries` (bare, no `?`, no `/organisations/`); body has date/purpose/start/end |
| 3 | Env-false escape hatch | `KEEPING_REQUIRE_CONFIRM:false` + no confirm → post called |
| 4 | MultiOrgError → toIsErrorContent | Byte-exact D-27 wording (`Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: 100 (Acme), 200 (Beta).`) |
| 5 | 401 KeepingAuthError → toIsErrorContent | Byte-exact D-25 wording (`Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.`) |
| 6 | 4xx KeepingApiError (422) → toIsErrorContent | Text contains `"Keeping API error 422"`, does NOT contain `"outcome unknown"` |
| 7 | 5xx KeepingApiError (503) → AMBIGUOUS_TEXT | Text starts with `"outcome unknown — verify with keeping_list_entries before retrying."`; original `Keeping API error 503` in parenthetical |
| 8 | `confirm: "true"` (string) → Zod rejects | isError, text matches `/expected boolean|invalid/i`, post NOT called |
| 9 | `user_id` input stripped | `body.user_id === undefined` after MCP-SDK + Zod strip |
| 10 | listTools annotations | All four D-3-11 booleans byte-exact |
| 11 | DST-correct default date | `Date.now()=2026-06-12T22:30:00Z` → body.date = `"2026-06-13"`, body.start = `"00:30"` |
| 12 | Hours-mode org, missing hours → isError | Text contains `"hours"` |
| 13 | Hours-mode org, hours: 1.5 | body.hours = 1.5, body.start/end undefined, body.date = YYYY-MM-DD |

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run test/tools/add-entry.test.ts` | **13/13 pass** |
| `npx vitest run` (full project) | **113/113 pass** (13 test files; 100 pre-existing + 13 new) |
| `npx tsc --noEmit` | exit 0 |
| `npx biome check src/tools/add-entry.ts test/tools/add-entry.test.ts` | exit 0 |
| `grep -v '^//' src/tools/add-entry.ts \| grep -c '\.toISOString('` | 0 (comment-only mentions of the prohibition) |
| `grep -v '^//' src/tools/add-entry.ts \| grep -c 'billable\|non_billable'` | 0 in code (1 in tool description text per D-3-07 spec: "billable status is determined at the project level") |
| `git diff HEAD~2 --stat -- src/keeping/ src/server.ts` | empty (scope guardrails respected) |

## Byte-Exact Lock Confirmations

| Lock | Asserted In | Method |
|------|-------------|--------|
| D-25 KeepingAuthError wording | Test 5 | `.toBe(...)` |
| D-27 MultiOrgError template | Test 4 | `.toBe(...)` |
| AMBIGUOUS_TEXT (`"outcome unknown — verify with keeping_list_entries before retrying."`) | Test 7 | `text.startsWith(...)` `.toBe(true)` |
| D-3-12 confirm description verbatim | src/tools/add-entry.ts:107-109 | Source verbatim per planner-supplied string |
| D-3-07 purpose enum (8 values) | src/tools/add-entry.ts:59-68 | Zod `z.enum([...8...])` |
| D-3-11 four annotation booleans | Test 10 | `.toBe(false/true/false/true)` |
| Preview URL format `https://api.keeping.nl/v1/47666/time-entries` | Test 1 | `.toBe(...)` |
| DST-correct date `"2026-06-13"` for `2026-06-12T22:30:00Z` | Test 11 | `.toBe("2026-06-13")` + `.toBe("00:30")` |

## Decisions Made

- **`end` is forwarded only when explicitly supplied.** Plan-specifics
  guidance: "leaving `end` unset is the timer-style 'ongoing' case (start_timer's
  plan). For add_entry the user should explicitly supply `end` (or `hours` in
  hours-mode)." Implementation respects this — the handler only writes
  `body.end` when `input.end !== undefined`. No default for `end` in either mode.

- **MCP-SDK schema enforcement is stronger than expected** for both
  `confirm: "true"` (string) and `user_id: "evil"` (unknown field). Test 8 and
  Test 9 confirm the SDK + Zod validator strip / reject these at the schema
  boundary before the handler runs — the handler never observes them. T-03-02-02
  and T-03-02-03 mitigations are effective at the framework layer in addition
  to the handler's `=== true` coercion and the schema's absence of `user_id`.

- **Biome auto-format applied after GREEN.** Three formatter findings:
  1. Sort imports (placed `date.js` above `errors.js`)
  2. Collapse multi-line `new Error("...")` onto a single line
  3. Collapse multi-line `expect(text.startsWith(...))` test assertion onto a single line

  All three are formatting-only — no semantic change. Applied via
  `npx biome check --write` before the GREEN commit.

- **Test count: 13** (11 D-3-22 mandated + Test 12 hours-mode-missing-input +
  Test 13 hours-mode-success). The plan listed Test 12 and 13 as "Bonus optional"
  but they covered D-3-08 hours-mode behavior cleanly and added zero churn —
  shipped.

## Deviations from Plan

None. The plan executed exactly as written. Two implementation observations:

1. The Zod `confirm` parser rejects strings before the handler — Test 8 was
   designed against this expectation and passed on first run.
2. The Zod schema's implicit `strip` mode handles `user_id` — Test 9 passed
   on first run (planner's note "if MCP-SDK's listTools schema enforcement
   strips unknowns before reaching the handler, this is a no-op success" is
   the path that triggered).

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `fe24367` | `test(03-02): add keeping_add_entry tests — dry-run, confirm, env-false, error paths, annotations, DST default (D-3-22, D-3-26)` |
| 2 | `fe19fc6` | `feat(03-02): keeping_add_entry — dry-run gate, org-mode-aware body, Amsterdam date default (WRITE-01, D-3-07, D-3-08)` |

## Known Stubs

None. The tool is functionally complete — it just is not yet registered on the
server. Registration is deferred to Plan 03-08 per the wave-3 wiring decision;
this is documented in the source-file header comment and is NOT a stub in the
"hardcoded empty value flowing to UI" sense.

## Hand-off to Wave 3

Plan 03-08 (server wiring) will add the import + register call in `src/server.ts`:

```typescript
import { registerAddEntry } from "./tools/add-entry.js";
// ... inside server bootstrap ...
registerAddEntry(server, client, config);
```

`KeepingConfig` is already loaded via `loadConfig()` in the bootstrap; no
config plumbing changes are needed.

## Self-Check: PASSED

Verified existence on disk:
- src/tools/add-entry.ts — FOUND
- test/tools/add-entry.test.ts — FOUND

Verified commits in git log:
- `fe24367` (RED) — FOUND
- `fe19fc6` (GREEN) — FOUND

Verified gate compliance:
- 13 `it(` declarations in test file
- D-25, D-27, AMBIGUOUS_TEXT, `"2026-06-13"`, `"keeping_add_entry"`,
  `"would_post"`, `"https://api.keeping.nl/v1/47666/time-entries"` all
  present in test file
- D-3-12 confirm description verbatim in source file
- D-3-07 eight-value purpose enum present in source file
- No `user_id` Zod field in source file
- No `.toISOString(` in non-comment source lines
- All four D-3-11 annotation booleans present in source file

TDD gate sequence verified:
1. `test(03-02): ...` RED commit `fe24367` exists
2. `feat(03-02): ...` GREEN commit `fe19fc6` exists after RED
