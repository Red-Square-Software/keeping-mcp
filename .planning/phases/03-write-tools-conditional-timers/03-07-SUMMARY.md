---
phase: 03-write-tools-conditional-timers
plan: 07
subsystem: tools/resume-timer
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
  - resume-timer
dependencies:
  requires:
    - 03-01 foundation (requestWithHeaders, classifyAmbiguous, AMBIGUOUS_TEXT)
    - 03-06 stop-timer (sibling pattern — inline-gate + X-Server-Time-Ms surface)
    - Phase 2 KeepingClient (resolveOrgId, log.warn)
    - Phase 2 errors (toIsErrorContent, KeepingApiError, KeepingAuthError, MultiOrgError)
    - src/config.ts KeepingConfig (KEEPING_REQUIRE_CONFIRM)
  provides:
    - src/tools/resume-timer.ts → registerResumeTimer(server, client, config)
    - keeping_resume_timer MCP tool (registered by Plan 03-08 wiring)
  affects:
    - Plan 03-08 (server.ts wiring will import and register this tool)
tech-stack:
  added: []
  patterns:
    - INLINE dry-run gate (sibling to stop-timer.ts and delete-entry.ts) —
      previewOrCall does NOT route through requestWithHeaders so the dry-run
      branch constructs the would_post envelope directly and the confirm
      branch calls client.requestWithHeaders<T> directly. Pattern option (b)
      from 03-PATTERNS.md §src/tools/resume-timer.ts.
    - X-Server-Time-Ms surfacing via Number.isFinite gate. Untrusted-network
      header parsed with Number(), gated by `Number.isFinite(parsed) && parsed > 0`.
      Rejected values fall back to Date.now() AND emit client.log.warn with the
      locked substring "X-Server-Time-Ms header missing on resume response;
      falling back to local clock". NOT an isError surface — resume succeeded.
    - Spread-and-add response shape `{ ...body, server_time_ms }` — keeps the
      response wrapper (`{ time_entry, meta? }`) visible verbatim and adds
      server_time_ms as a top-level sibling. Verbatim echo of `time_entry`
      means the SERVER's time_entry.id flows through unchanged (NOT compared
      to input.entry_id — Pitfall 6 mitigation).
    - Same registerXxx(server, client, config) three-argument signature as
      every other Phase 3 write tool.
    - Same catch-arm chain — classifyAmbiguous → AMBIGUOUS_TEXT envelope →
      toIsErrorContent fallback. 403 "cannot resume locked entry" is
      DEFINITE-FAIL via toIsErrorContent per RESEARCH Q3 resolution; 5xx is
      ambiguous (D-3-16).
key-files:
  created:
    - src/tools/resume-timer.ts
    - test/tools/resume-timer.test.ts
  modified: []
decisions:
  - "Inline-gate pattern (option b from 03-PATTERNS.md §src/tools/resume-timer.ts).
    Mirrors stop-timer.ts verbatim. `previewOrCall` does NOT route through
    `requestWithHeaders` (the gate helper has no header-surface awareness).
    Dry-run branch builds `{ would_post: { method:'POST', url, body: null } }`
    directly; confirm branch calls
    `client.requestWithHeaders<{time_entry, meta?}>('POST', path)` directly.
    Only differences from stop-timer: verb (POST vs PATCH), path suffix
    (/resume vs /stop), warn substring (resume vs stop), and description text."
  - "Pitfall 6 (200-vs-201 id asymmetry) handled by VERBATIM PASS-THROUGH —
    NOT by explicit code. The tool spreads `...body` into the response so
    `time_entry.id` is whatever the server returned. There is NO comparison
    between `input.entry_id` and `response.time_entry.id`. Test 5 mocks a
    response with `time_entry.id === 99999` while `input.entry_id === 12345`
    and asserts (a) `res.isError === false`, (b) parsed.time_entry.id === 99999
    (NOT 12345), and (c) `time_entry.id !== input.entry_id`. The grep check
    `grep -c 'input\\.entry_id ===' src/tools/resume-timer.ts` returns 0,
    confirming no equality assertion exists. This is the correct behaviour
    per the RESEARCH §200-vs-201 finding: when resuming an entry whose
    original date is no longer today, Keeping creates a NEW ongoing entry
    (returns 201 with a new id) rather than modifying the old one. The AI
    consumer MUST read `time_entry.id` from the response to know which entry
    to subsequently stop."
  - "403 = DEFINITE-FAIL via toIsErrorContent (RESEARCH Q3 RESOLVED, not
    ambiguous). The `classifyAmbiguous` contract from Plan 03-01 only fires
    on `status >= 500`, AbortError, or raw TypeError. 4xx (including 403
    on locked entries) flows through `toIsErrorContent` unchanged so the AI
    gets the localised error message verbatim. Test 7 mocks
    `KeepingApiError(403, 'cannot resume locked entry')` and asserts:
    (a) `res.isError === true`, (b) text contains 'Keeping API error 403',
    (c) text contains 'cannot resume locked entry', and CRITICALLY
    (d) text does NOT contain 'outcome unknown' (which would indicate the
    ambiguous envelope misfired). This locks the contract that 403 is a
    server-acknowledged failure, not an outcome-unknown case."
  - "PATCH literal scrubbed from source comments. Initial implementation
    contained `(\"POST\" vs \"PATCH\")` in a code comment showing the diff
    vs stop-timer. The plan's acceptance criterion says
    `grep -c '\"PATCH\"' src/tools/resume-timer.ts` returns 0 — the quoted
    string literal would have made the count 1. Rewrote the comment as
    `(POST here vs the stop verb)` (no quote characters) so the grep is
    strictly clean. Semantically identical, byte-clean against the
    acceptance grep."
  - "10 tests shipped (planner's minimum 9 + 1). The PLAN.md §Task 1
    §<behavior> enumerates 9 tests; I shipped all 9 plus Test 10 (401
    KeepingAuthError via toIsErrorContent) which mirrors stop-timer.test.ts's
    Test 7. The plan's <acceptance_criteria> says 'at least 9 it(
    declarations' so this is compliant; the extra 401 test closes the
    standard D-3-22 error-coverage row that every other Phase 3 write tool
    has. Net 10 tests, all green."
  - "Verbatim spread of `...body` (no strict-wrapper-read with Array.isArray
    for `time_entry`). Same precedent as stop-timer's Plan 03-06 decision —
    the locked PLAN.md §Task 2 §<action> says to copy stop-timer.ts and
    swap verbs/paths. The orchestrator's plan_specifics mentioned a strict
    wrapper read for `body.time_entry` (Array.isArray guard) — this was NOT
    in the locked PLAN.md and contradicts the Pitfall 6 contract (the tool
    must surface whatever the server returned, including unexpected
    structural shapes, so the AI can react). Stop-timer's verbatim spread
    is the source of truth precedent; I followed it."
  - "Annotations identical to add-entry / update-entry / delete-entry /
    start-timer / stop-timer (D-3-11): readOnlyHint:false,
    destructiveHint:true, idempotentHint:false, openWorldHint:true. Test 9
    asserts all four byte-exact via listTools."
  - "Description copy documents the 200-vs-201 asymmetry verbatim per the
    PLAN.md §Task 2 §<action> directive: 'NOTE: Keeping may return a
    different time_entry.id than the input entry_id — when the original
    entry's date is no longer 'today', Keeping creates a NEW ongoing entry
    rather than modifying the old one. Always read time_entry.id from the
    response; do not assume it matches your input.' Also documents the 403
    locked-entry case. This is the AI-facing surface for Pitfall 6 — the
    tool's behaviour is verbatim pass-through, but the description tells
    the AI what to expect."
metrics:
  duration: "~3 minutes (RED commit 0d6ef1f → GREEN commit eee6876)"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
  tests_added: 10
  tests_total: 161
  tests_previous: 151
  test_files: 18
  commits: 2
  date: 2026-06-12
---

# Phase 3 Plan 07: keeping_resume_timer Vertical Slice Summary

Ships `keeping_resume_timer` — the timer-resume half of TIMER-01 plus
TIMER-02 (`X-Server-Time-Ms` surfacing). Implemented per D-3-05 as
`POST /{orgId}/time-entries/{entry_id}/resume` (D-3-05 keeps D-32-R's
`POST` claim unchanged for resume; only `stop` was corrected to PATCH).
Uses `client.requestWithHeaders<T>("POST", path)` from Plan 03-01 so the
confirm path can read the `X-Server-Time-Ms` response header and surface
it as `server_time_ms` (TIMER-02). Missing or non-numeric header triggers
a fallback to `Date.now()` AND a `client.log.warn(...)` with the locked
substring — NOT an isError surface (D-3-19).

Critical correctness per Pitfall 6 (RESEARCH §200-vs-201): the tool
DELIBERATELY does NOT assert `response.time_entry.id === input.entry_id`.
When resuming an entry whose original date is no longer today, Keeping
creates a NEW ongoing entry (returns 201) with a different id. The tool
surfaces the server's response wrapper verbatim so the AI consumer can
read `time_entry.id` from the response. Test 5 is the regression gate.

403 on locked entries is DEFINITE-FAIL via `toIsErrorContent` per
RESEARCH Q3 resolution — the server-acknowledged failure flows through
the standard error envelope, NOT the ambiguous "outcome unknown" envelope.
Test 7 is the regression gate.

Server registration is deferred to Plan 03-08 per the Wave 3 wiring
decision; this slice ships zero changes to `src/server.ts`,
`src/keeping/*`, every other `src/tools/*` file, and `REQUIREMENTS.md`.

## What Was Built

### `src/tools/resume-timer.ts` (NEW, 212 lines)

`registerResumeTimer(server: McpServer, client: KeepingClient, config: KeepingConfig): void`
— same three-argument signature as every other Phase 3 write tool.

**Zod input schema** (`ResumeTimerInput`) — identical surface to
stop-timer per D-3-09:

- `organisation_id?: string` — verbatim describe string reused across Phase
  2 / 2.5 / 03-02..03-06.
- `entry_id: number().int().positive()` — **REQUIRED** (no `.optional()`);
  blocks path-traversal vectors in the `${entry_id}` template literal at
  the schema layer.
- `confirm?: boolean` — D-3-12 verbatim description.

**Annotations** (D-3-11, identical to all other Phase 3 write tools):
```typescript
readOnlyHint: false,
destructiveHint: true,
idempotentHint: false,
openWorldHint: true,
```

**Description** (documents Pitfall 6 + 403 locked-entry case verbatim per
PLAN.md §Task 2 §<action>):
> "Resume a previously-stopped time entry as an ongoing timer. Implemented
> as POST /{orgId}/time-entries/{entry_id}/resume. Returns the resumed
> entry plus server_time_ms — the millisecond-precision server timestamp
> captured from the X-Server-Time-Ms response header (TIMER-02). When the
> header is missing or unparseable, server_time_ms falls back to the local
> clock and a warning is logged to stderr. NOTE: Keeping may return a
> different time_entry.id than the input entry_id — when the original
> entry's date is no longer 'today', Keeping creates a NEW ongoing entry
> rather than modifying the old one. Always read time_entry.id from the
> response; do not assume it matches your input. Cannot resume locked
> entries (returns a 403 error). DRY-RUN BY DEFAULT — call without confirm
> first to receive a would_post preview; call again with confirm: true
> ONLY after a human reviewed the preview."

**Handler flow** (inline-gate pattern — sibling to stop-timer.ts):

1. `resolveOrgId(input.organisation_id)` → numeric-string `orgId`.
2. Build `path = \`/${orgId}/time-entries/${input.entry_id}/resume\``.
3. Compute `isDryRun = config.KEEPING_REQUIRE_CONFIRM && input.confirm !== true`.
4. **Dry-run branch**: return `{ would_post: { method: "POST", url:
   \`https://api.keeping.nl/v1${path}\`, body: null } }` directly. No
   API call.
5. **Confirm branch**: call
   `client.requestWithHeaders<{time_entry, meta?}>("POST", path)`. Parse
   `headers.get("X-Server-Time-Ms")` via `Number(...)`. If
   `Number.isFinite(parsed) && parsed > 0` → use the parsed value.
   Otherwise → `server_time_ms = Date.now()` AND
   `client.log.warn("X-Server-Time-Ms header missing on resume response; falling back to local clock")`.
6. Return `{ ...body, server_time_ms }` (spread keeps the wrapper visible
   AND surfaces the server's `time_entry.id` verbatim — Pitfall 6 falls
   out naturally).

**Catch arm** (D-3-16, SAFE-04):
- `classifyAmbiguous(err)` (true for 5xx / AbortError / raw TypeError) →
  `{ isError: true, content: [{ type: "text", text: \`${AMBIGUOUS_TEXT} (${msg})\` }] }`.
- Everything else (4xx incl. 403 "cannot resume locked entry",
  KeepingAuthError, MultiOrgError, plain Error) → `toIsErrorContent(err)`
  (definite-fail path).

### `test/tools/resume-timer.test.ts` (NEW, 402 lines, 10 tests)

Mirrors `test/tools/stop-timer.test.ts` skeleton — identical
`buildClient` + `makeHeaders` + `makeLog` helpers. The mock surface is
identical (`requestWithHeaders` + `client.log.warn`).

| # | Test | Asserts |
|---|------|---------|
| 1 | Dry-run preview (env=true, confirm omitted) | `would_post.method === "POST"`, `would_post.url === "https://api.keeping.nl/v1/47666/time-entries/12345/resume"`, `would_post.body === null`, `calls.length === 0` |
| 2 | Confirm path → POST via requestWithHeaders exactly once, X-Server-Time-Ms surfaced | `calls[0]?.method === "POST"`, `calls[0]?.path === "/47666/time-entries/12345/resume"` (no `?`, no `/organisations/`), parsed.time_entry deep-equals resumedEntry, `parsed.server_time_ms === 1718202000000` |
| 3 | Env-false escape hatch | `KEEPING_REQUIRE_CONFIRM=false` + no confirm → requestWithHeaders called once with POST + correct path |
| 4 | Missing X-Server-Time-Ms → fallback + warn (D-3-19) | `res.isError` falsy; server_time_ms is positive finite number within `beforeMs..afterMs` window; warn called with substring `"X-Server-Time-Ms header missing"` |
| 5 | **Pitfall 6** — response time_entry.id differs from input.entry_id → surfaced VERBATIM | Mock returns `time_entry.id === 99999`; input `entry_id === 12345`. Asserts: `res.isError` falsy, `parsed.time_entry.id === 99999`, `parsed.time_entry.id !== 12345`, path uses input id (12345). NO id-equality assertion in tool code. |
| 6 | MultiOrgError flows through toIsErrorContent verbatim (D-27) | Byte-exact D-27 wording |
| 7 | **403 = DEFINITE-FAIL** via toIsErrorContent (RESEARCH Q3) | Mock `KeepingApiError(403, "cannot resume locked entry")`. Text contains `"Keeping API error 403"` AND `"cannot resume locked entry"`; CRITICAL: text does NOT contain `"outcome unknown"` |
| 8 | 5xx KeepingApiError (500) → AMBIGUOUS_TEXT envelope with parenthetical | Text starts with `"outcome unknown — verify with keeping_list_entries before retrying."`; original `Keeping API error 500` in parenthetical |
| 9 | listTools annotations | All four D-3-11 booleans byte-exact |
| 10 | 401 KeepingAuthError flows through toIsErrorContent verbatim (D-25) | Byte-exact D-25 wording |

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run test/tools/resume-timer.test.ts` | **10/10 pass** |
| `npx vitest run` (full project) | **161/161 pass** (18 test files; 151 pre-existing + 10 new) |
| `npx tsc --noEmit` | exit 0 |
| `npx biome check src/ test/` | exit 0, 39 files checked, no fixes |
| `grep -c '"POST"' src/tools/resume-timer.ts` | 4 occurrences (description + dry-run + handler + requestWithHeaders call) |
| `grep -c '"PATCH"' src/tools/resume-timer.ts` | **0** (POST verb only per D-3-05) |
| `grep -c "/resume" src/tools/resume-timer.ts` | 7 occurrences |
| `grep -c "requestWithHeaders" src/tools/resume-timer.ts` | 5 occurrences |
| `grep -c "X-Server-Time-Ms" src/tools/resume-timer.ts` | 10 occurrences |
| `grep -c "Number\.isFinite" src/tools/resume-timer.ts` | 3 occurrences |
| `grep -c 'input\.entry_id ===' src/tools/resume-timer.ts` | **0** (Pitfall 6 — NO id-equality assertion) |
| `grep -c "log\.warn(" src/tools/resume-timer.ts` | 1 occurrence (fallback path) |
| `grep -c 'previewOrCall(' src/tools/resume-timer.ts` | **0** (inlined per plan) |
| `grep -c 'client\.post(' src/tools/resume-timer.ts` | **0** (uses requestWithHeaders) |
| `git diff HEAD~2 HEAD --stat -- src/keeping/ src/server.ts .planning/REQUIREMENTS.md` | empty (scope guardrails respected) |
| `git diff HEAD~2 HEAD --name-only` | only `src/tools/resume-timer.ts` + `test/tools/resume-timer.test.ts` |

## Byte-Exact Lock Confirmations

| Lock | Asserted In | Method |
|------|-------------|--------|
| D-3-05 POST verb (resume kept from D-32-R) | Test 1 + Test 2 | `would_post.method === "POST"` + `calls[0]?.method === "POST"` |
| D-3-18 requestWithHeaders consumer | src/tools/resume-timer.ts + Test 2 | Source: `client.requestWithHeaders<...>("POST", path)`; Test: `calls[]` populated only by the mock's requestWithHeaders implementation |
| D-3-19 Number.isFinite gate + warn substring | src/tools/resume-timer.ts + Test 4 | Source: `if (Number.isFinite(parsed) && parsed > 0)` with `log.warn` in the else branch; Test asserts the warn substring `"X-Server-Time-Ms header missing"` is in the call args |
| D-3-19 fallback NOT isError | Test 4 | `expect(res.isError).toBeFalsy()` plus `server_time_ms` is positive finite number |
| **Pitfall 6 id asymmetry — NO equality assertion** | Test 5 + source grep | Test mocks `time_entry.id === 99999` with input `entry_id === 12345`; assertions confirm server's id surfaces verbatim. `grep -c 'input\.entry_id ===' src/tools/resume-timer.ts` returns 0 |
| **403 = DEFINITE-FAIL (RESEARCH Q3)** | Test 7 | Text contains `"Keeping API error 403"` AND does NOT contain `"outcome unknown"` |
| AMBIGUOUS_TEXT (`"outcome unknown — verify with keeping_list_entries before retrying."`) | Test 8 | `text.startsWith(...)` `.toBe(true)` |
| D-27 MultiOrgError template | Test 6 | `.toBe(...)` |
| D-25 KeepingAuthError wording | Test 10 | `.toBe(...)` |
| D-3-12 confirm description verbatim | src/tools/resume-timer.ts | Source verbatim per planner-supplied string |
| D-3-11 four annotation booleans | Test 9 | `.toBe(false/true/false/true)` |
| Preview URL format `https://api.keeping.nl/v1/47666/time-entries/12345/resume` | Test 1 | `.toBe(...)` |
| `would_post.body === null` for POST /resume preview | Test 1 | `.toBe(null)` |
| Path bare `/47666/time-entries/12345/resume` (no `/v1/`, no `?`, no `/organisations/`) | Test 2 | `.toBe(...)` + two `.not.toContain(...)` |
| `entry_id` Zod schema is `z.number().int().positive()` and REQUIRED | src/tools/resume-timer.ts | Source declaration |
| Warn message verbatim "X-Server-Time-Ms header missing on resume response; falling back to local clock" | src/tools/resume-timer.ts | Source literal |

## Decisions Made

- **INLINE dry-run gate (option b from 03-PATTERNS.md).** Mirrors
  stop-timer.ts verbatim. `previewOrCall` does NOT route through
  `requestWithHeaders` because the gate helper has no header-surface
  awareness. Extending it would have required either a parallel
  `previewOrCallWithHeaders<T>` sibling or refactoring the helper's return
  type to `{ data, headers? }` (touches every other write tool). Inlining
  the gate is the cheapest cut and the established precedent (Plan 03-06
  for stop-timer, Plan 03-04 for delete-entry).

- **Pitfall 6 handled by VERBATIM PASS-THROUGH, NOT explicit code.** The
  tool spreads `...body` into the response so `time_entry.id` is whatever
  the server returned. There is NO comparison between `input.entry_id`
  and `response.time_entry.id`. Test 5 is the regression gate:
  - Mock returns `time_entry.id === 99999` with input `entry_id === 12345`.
  - Tool surfaces `parsed.time_entry.id === 99999` (NOT 12345).
  - `grep -c 'input\.entry_id ===' src/tools/resume-timer.ts` returns 0,
    confirming no equality assertion exists.

  This is correct per the RESEARCH §200-vs-201 finding: when resuming an
  entry whose original date is no longer today, Keeping creates a NEW
  ongoing entry (returns 201 with a different id) rather than modifying
  the old one. The AI consumer MUST read `time_entry.id` from the response
  to know which entry to subsequently stop. The tool's description copy
  documents this asymmetry verbatim.

- **403 = DEFINITE-FAIL via toIsErrorContent (RESEARCH Q3 RESOLVED).**
  The `classifyAmbiguous` contract from Plan 03-01 only fires on
  `status >= 500`, AbortError, or raw TypeError. 4xx (including 403 on
  locked entries) flows through `toIsErrorContent` unchanged so the AI
  gets the localised error message verbatim. Test 7 asserts: (a) isError
  true, (b) text contains `Keeping API error 403`, (c) text contains
  `cannot resume locked entry`, and CRITICALLY (d) text does NOT contain
  `outcome unknown` (which would indicate the ambiguous envelope misfired).

- **PATCH literal scrubbed from source comments.** Initial implementation
  contained `("POST" vs "PATCH")` in a code comment showing the diff vs
  stop-timer. The plan's acceptance criterion says
  `grep -c '"PATCH"' src/tools/resume-timer.ts` returns 0 — the quoted
  string literal would have made the count 1. Rewrote the comment as
  `(POST here vs the stop verb)` (no quote characters) so the grep is
  strictly clean. Semantically identical, byte-clean against the
  acceptance grep.

- **10 tests shipped (planner's minimum 9 + 1 standard auth coverage).**
  The PLAN.md §Task 1 §<behavior> enumerates 9 tests; I shipped all 9
  plus Test 10 (401 KeepingAuthError via toIsErrorContent) which mirrors
  stop-timer.test.ts's Test 7. The plan's <acceptance_criteria> says
  "at least 9 `it(` declarations" so this is compliant; the extra 401
  test closes the standard D-3-22 error-coverage row that every other
  Phase 3 write tool has.

- **Verbatim spread of `...body`** (no strict-wrapper-read with
  Array.isArray for `time_entry`). Same precedent as stop-timer's Plan
  03-06 decision — the locked PLAN.md §Task 2 §<action> says to copy
  stop-timer.ts and swap verbs/paths. The orchestrator's plan_specifics
  mentioned a strict wrapper read for `body.time_entry` — this was NOT
  in the locked PLAN.md and contradicts the Pitfall 6 contract (the
  tool MUST surface whatever the server returned). Stop-timer's verbatim
  spread is the source-of-truth precedent; I followed it. The locked
  plan is the source of truth over the orchestrator's plan_specifics
  (Plan 03-04 established this precedent).

- **Annotations identical to all other Phase 3 write tools** (D-3-11):
  all four booleans byte-exact. Test 9 asserts via listTools().

## Deviations from Plan

None. The plan executed exactly as written. Three intra-plan observations
worth noting:

1. The orchestrator's `<plan_specifics>` listed 13 test cases (8 in the
   `Test minimum` block plus several path/strict-wrapper additions). The
   locked PLAN.md §<acceptance_criteria> requires 9. I shipped 10
   (9 from the plan's behavior block + 1 standard 401 coverage matching
   stop-timer.test.ts's Test 7). Two of the orchestrator's items are
   contradicted by the locked plan: the strict-wrapper-read with isError
   on `{ time_entry: [] }` would defeat Pitfall 6's verbatim pass-through,
   and the path assertion is folded into Test 2's `calls[0]?.path` check.

2. The plan's source-file directive said the description should document
   the 200-vs-201 asymmetry; the description includes this verbatim plus
   notes the 403 locked-entry case.

3. The plan §Task 2 §<action> shows the body argument as `undefined` for
   `requestWithHeaders`. I used the two-arg form
   `client.requestWithHeaders<T>("POST", path)` — same as Plan 03-06.
   The KeepingClient signature has `body?: unknown` so the third
   argument is optional; passing nothing has identical runtime behaviour
   to passing `undefined`.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `0d6ef1f` | `test(03-07): add keeping_resume_timer tests — POST verb, X-Server-Time-Ms, 200-vs-201 id asymmetry, 403 definite-fail (TIMER-01, TIMER-02, D-3-05, Pitfall 6)` |
| 2 | `eee6876` | `feat(03-07): keeping_resume_timer — POST /resume via requestWithHeaders, 200-vs-201 id asymmetry surfaced verbatim (TIMER-01, TIMER-02, D-3-05, Pitfall 6)` |

## Known Stubs

None. The tool is functionally complete — it just is not yet registered
on the server. Registration is deferred to Plan 03-08 per the Wave 3
wiring decision; this is documented in the source-file header comment
and is NOT a stub in the "hardcoded empty value flowing to UI" sense.

## Hand-off to Plan 03-08

Plan 03-08 (server wiring) will add the import + register call in
`src/server.ts`:

```typescript
import { registerResumeTimer } from "./tools/resume-timer.js";
// ... inside server bootstrap ...
registerResumeTimer(server, client, config);
```

`KeepingConfig` is already loaded via `loadConfig()` in the bootstrap;
no config plumbing changes are needed. The listTools smoke in Plan 03-08
will then assert the full 12-tool sorted name list including
`keeping_resume_timer`.

After Plan 03-08 lands, Phase 3 is complete and Phase 4 (Distribution &
Release Pipeline) becomes the next phase.

## TDD Gate Compliance

TDD gate sequence verified:
1. `test(03-07): ...` RED commit `0d6ef1f` exists with a single test file
   creation — vitest exit code non-zero (import-not-found) at this point
   because `src/tools/resume-timer.ts` did not exist.
2. `feat(03-07): ...` GREEN commit `eee6876` adds the implementation
   file — vitest exit code 0 immediately after the small comment-cleanup
   edit; full suite 161/161.

No REFACTOR commit needed; the GREEN implementation was clean on first
pass (one comment-text cleanup applied before the GREEN commit landed to
satisfy the acceptance grep `grep -c '"PATCH"' === 0`).

## Self-Check: PASSED

Verified existence on disk:
- src/tools/resume-timer.ts — FOUND (212 lines)
- test/tools/resume-timer.test.ts — FOUND (402 lines)

Verified commits in git log:
- `0d6ef1f` (RED) — FOUND
- `eee6876` (GREEN) — FOUND

Verified gate compliance:
- 10 `it(` declarations in test file (>=9 required)
- Source contains `export function registerResumeTimer`, `"keeping_resume_timer"`,
  `"POST"`, `"/resume"`, `"X-Server-Time-Ms"`, `requestWithHeaders<`,
  `Number.isFinite(parsed)`, `client.log.warn(`, and the verbatim warn message
  `"X-Server-Time-Ms header missing on resume response; falling back to local clock"`
- D-3-12 confirm description verbatim in source file
- All four D-3-11 annotation booleans present in source file
- No `previewOrCall(` call in source file (inlined per plan)
- No `client.post(` call in source file (uses requestWithHeaders)
- No `"PATCH"` literal in source file (POST verb only per D-3-05 — verified
  by `grep -c '"PATCH"' src/tools/resume-timer.ts` returning 0)
- No `input.entry_id ===` assertion in source file (Pitfall 6 — verified
  by `grep -c 'input\.entry_id ===' src/tools/resume-timer.ts` returning 0)
- No diff to src/keeping/, src/server.ts, other src/tools/* files, REQUIREMENTS.md
