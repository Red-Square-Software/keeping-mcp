---
phase: 03-write-tools-conditional-timers
plan: 03
subsystem: tools/update-entry
type: tdd
wave: 2
status: complete
requirements:
  - WRITE-02
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
  - update-entry
dependencies:
  requires:
    - 03-01 foundation (previewOrCall, classifyAmbiguous, AMBIGUOUS_TEXT)
    - 03-02 add-entry sibling skeleton (buildClient helper + defaultConfig + mockOrgTimes pattern reused inline)
    - Phase 2 KeepingClient (resolveOrgId, patch)
    - Phase 2 errors (KeepingApiError, KeepingAuthError, MultiOrgError, toIsErrorContent)
    - src/config.ts KeepingConfig (KEEPING_REQUIRE_CONFIRM)
  provides:
    - src/tools/update-entry.ts → registerUpdateEntry(server, client, config)
    - keeping_update_entry MCP tool (registered by Plan 03-08 wiring)
  affects:
    - Plan 03-08 (server.ts wiring will import and register this tool)
tech-stack:
  added: []
  patterns:
    - PATCH partial-body construction — only supplied fields enter the wire body (undefined-skip pattern, no defaulting on update)
    - Immutable-field enforcement via Zod schema OMISSION + default .strip() behavior (date/purpose/user_id never declared, silently stripped at validation)
    - Same registerXxx(server, client, config) signature as add-entry
    - Same previewOrCall + classifyAmbiguous + toIsErrorContent envelope pattern
    - NO organisations() call — update does not need org-mode detection (mutable fields reflect existing entry's mode; API rejects mismatches with 422)
key-files:
  created:
    - src/tools/update-entry.ts
    - test/tools/update-entry.test.ts
  modified: []
decisions:
  - "10 tests shipped (9 plan-mandated + 1 split test 8 to keep 401 and 404 as separate cases). All pass on first GREEN run — no test-iteration churn."
  - "Test 6 (immutable fields) — Zod schema simply OMITS date/purpose/user_id; default .strip() behavior drops them silently at the validation boundary. patches[0].body has no date/purpose keys (strip branch). This is the cleaner of the two acceptable behaviors per plan §<behavior> Test 6 — no .strict() needed because the schema declarations themselves are the enforcement mechanism."
  - "NO organisations() call in handler — PATCH does not need org-mode detection. The mutable fields (start/end/hours) reflect whatever mode the existing entry already has; if the caller sends start/end on an hours-mode entry's edit, the API rejects with 422 (definite-fail → toIsErrorContent). This is the recommended path per plan §<action> notes."
  - "NO defaulting on update. Empty body is technically valid per OpenAPI (returns entry unchanged). The optional empty-body-rejection UX improvement was NOT shipped — plan §<action> notes flag this as 'NOT REQUIRED for tests to pass'. Test 4 (single-field PATCH) exercises the partial-body invariant without needing any empty-body branch."
  - "Annotations identical to add-entry (D-3-11): readOnlyHint:false, destructiveHint:true, idempotentHint:false, openWorldHint:true. Test 10 asserts all four byte-exact via listTools."
  - "Biome auto-formatted the entry_id Zod chain after GREEN — collapsed multi-line .number().int().positive().describe() onto a single line. No semantic changes. Applied via `npx biome check --write`."
metrics:
  duration: "~3 minutes (RED commit cb7b24d → GREEN commit 7f6ed1c)"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
  tests_added: 10
  tests_total: 123
  tests_previous: 113
  test_files: 14
  commits: 2
  date: 2026-06-12
---

# Phase 3 Plan 03: keeping_update_entry Vertical Slice Summary

Ships `keeping_update_entry` as a complete vertical slice — Zod input schema
that REJECTS-BY-OMISSION the immutable fields (`date`, `purpose`, `user_id`)
per OpenAPI `entry_edit_request`, PATCH partial-body construction
(undefined-skip pattern; no defaulting on update), AND-gate dry-run preview
via `previewOrCall`, ambiguous-failure envelope via `classifyAmbiguous`, and
10 tests. WRITE-02 addressed directly; WRITE-04, WRITE-05, WRITE-07, WRITE-08
reaffirmed by following the add-entry vertical-slice template. Server
registration deferred to Plan 03-08 per the wave-3 wiring decision; this slice
ships zero changes to `src/server.ts`, `src/keeping/*`, and every other
`src/tools/*` file.

## What Was Built

### `src/tools/update-entry.ts` (NEW, 162 lines)

`registerUpdateEntry(server: McpServer, client: KeepingClient, config: KeepingConfig): void`
— same three-argument signature as `registerAddEntry`.

**Zod input schema** (`UpdateEntryInput`) — exactly the D-3-09 surface (add
fields minus immutable date/purpose/user_id):

- `organisation_id?: string` — verbatim describe string reused from Phase 2/2.5
- `entry_id: number().int().positive()` — **REQUIRED** (no `.optional()`); blocks
  path-traversal vectors in the `${entry_id}` template literal at the schema
  layer (T-03-03-01 mitigation)
- `project_id?: positive int`, `task_id?: positive int`
- `note?: string ≤ 10000 chars`
- `tag_ids?: positive int[]`
- `external_references?: array(≤10)` of `{ id (10-40 hex), type: "generic_work_reference", name (≤191), url? }`
- `start?: HH:mm regex` — only relevant in `times` mode (D-3-08, D-3-28)
- `end?: HH:mm regex` — only relevant in `times` mode
- `hours?: 0..1000` — only relevant in `hours` mode
- `confirm?: boolean` — D-3-12 verbatim description. Optional, NOT `.default(true)`.
  Handler coerces `input.confirm === true` before passing to `previewOrCall`.

**Immutable-field enforcement (D-3-09 / T-03-03-02):** The Zod schema simply
does NOT declare `date`, `purpose`, or `user_id`. Zod's default object behavior
is `.strip()`, so any client that sneaks them into the input gets them silently
dropped at validation before the handler runs — they never enter the body
builder, never reach the wire. No `.strict()` and no custom refine needed; the
omission IS the enforcement.

**Annotations** (D-3-11, identical to add-entry):
```typescript
readOnlyHint: false,
destructiveHint: true,
idempotentHint: false,
openWorldHint: true,
```

**Handler flow:**
1. `resolveOrgId(input.organisation_id)` → numeric-string `orgId`
2. Build `path = \`/${orgId}/time-entries/${input.entry_id}\``
3. **PATCH partial body** (D-3-09, T-03-03-03): start with `const body: Record<string, unknown> = {}`
   (empty object — NO date default, NO purpose default, NO start default).
   For each of `project_id`, `task_id`, `note`, `tag_ids`, `external_references`,
   `start`, `end`, `hours`: `if (input.X !== undefined) body.X = input.X`.
   Undefined fields are skipped — never null'd, never zero'd — so the API
   leaves them unchanged per PATCH partial semantics.
4. `previewOrCall<{time_entry, meta?}>(client, { requireConfirm, confirm }, { method: "PATCH", path, body })`
5. Return `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }`

**Catch arm** (D-3-16, SAFE-04):
- `classifyAmbiguous(err)` → `{ isError: true, content: [{ type: "text", text: \`${AMBIGUOUS_TEXT} (${msg})\` }] }`
- otherwise → `toIsErrorContent(err)` — includes 404 not-found (definite-fail per Test 8)

**Notable absence:** NO `client.organisations()` call. PATCH does not need
org-mode detection — the API will reject mode-mismatched edits with 422
(definite-fail → `toIsErrorContent`). Avoids an unnecessary cache read and
keeps the handler ~30 lines shorter than add-entry's.

### `test/tools/update-entry.test.ts` (NEW, 312 lines, 10 tests)

Mirrors `test/tools/add-entry.test.ts` skeleton:
`buildClient(mockClient, config = defaultConfig)` helper +
`InMemoryTransport.createLinkedPair()` + `Partial<KeepingClient>` mocks.

Shared constants:
- `defaultConfig: KeepingConfig` — `KEEPING_REQUIRE_CONFIRM: true`, `KEEPING_LOG_LEVEL: "error"`
- No `mockOrgTimes` / `mockOrgHours` — update tests don't mock `organisations()`
  because the handler doesn't call it.

| # | Test | Asserts |
|---|------|---------|
| 1 | Dry-run preview, patch NOT called | `would_post.method = "PATCH"`, `would_post.url = https://api.keeping.nl/v1/47666/time-entries/12345`, body EXACTLY `{ note, start }` (two keys, deep-equal) |
| 2 | Confirm path → PATCH exactly once | Path = `/47666/time-entries/12345` (bare, no `?`, no `/organisations/`); body EXACTLY `{ note, start }` (deep-equal) |
| 3 | Env-false escape hatch | `KEEPING_REQUIRE_CONFIRM:false` + no confirm → patch called; body EXACTLY `{ note }` |
| 4 | Single-field partial PATCH | Input `{ entry_id, note, confirm:true }` → body deep-equals `{ note }`; `Object.keys(body).sort() === ["note"]`; explicit `.toBeUndefined()` on start/end/hours/project_id/task_id/tag_ids/external_references |
| 5 | MultiOrgError → toIsErrorContent | Byte-exact D-27 wording |
| 6 | Immutable fields (date, purpose) → Zod strip OR reject | Test asserts `(stripBranch || rejectBranch)`. **Actual behavior: strip branch** — `patches.length === 1` and `body.date === undefined && body.purpose === undefined`. Plan §<behavior> Test 6 acceptable behavior (a). |
| 7 | 5xx KeepingApiError (503) → AMBIGUOUS_TEXT envelope | Text starts with `"outcome unknown — verify with keeping_list_entries before retrying."`; original `Keeping API error 503` in parenthetical |
| 8 | 4xx KeepingApiError (404 not found) → toIsErrorContent | Text contains `"Keeping API error 404"`, does NOT contain `"outcome unknown"` (404 is definite-fail, NOT ambiguous) |
| 9 | 401 KeepingAuthError → toIsErrorContent | Byte-exact D-25 wording |
| 10 | listTools annotations | All four D-3-11 booleans byte-exact |

**Why 10 tests instead of the planned 9:** The plan's Test 8 spec ("404 KeepingApiError surfaces as definite-fail") and the implicit D-3-22 "401 KeepingAuthError" item were kept as separate cases for cleaner failure attribution if either regresses. Total test count grew by 1; coverage of the 9 mandated invariants is unchanged.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run test/tools/update-entry.test.ts` | **10/10 pass** |
| `npx vitest run` (full project) | **123/123 pass** (14 test files; 113 pre-existing + 10 new) |
| `npx tsc --noEmit` | exit 0 |
| `npx biome check src/tools/update-entry.ts test/tools/update-entry.test.ts` | exit 0 (after format pass) |
| `grep -nE "\\b(date\|purpose\|user_id):\\s*z\\." src/tools/update-entry.ts` | 0 (no Zod schema declarations for immutable fields) |
| `git diff HEAD~2 --stat -- src/keeping/ src/server.ts src/tools/add-entry.ts` etc | empty (scope guardrails respected) |

## Byte-Exact Lock Confirmations

| Lock | Asserted In | Method |
|------|-------------|--------|
| D-25 KeepingAuthError wording | Test 9 | `.toBe(...)` |
| D-27 MultiOrgError template | Test 5 | `.toBe(...)` |
| AMBIGUOUS_TEXT (`"outcome unknown — verify with keeping_list_entries before retrying."`) | Test 7 | `text.startsWith(...)` `.toBe(true)` |
| D-3-12 confirm description verbatim | src/tools/update-entry.ts:91 | Source verbatim per planner-supplied string |
| D-3-11 four annotation booleans | Test 10 | `.toBe(false/true/false/true)` |
| Preview URL format `https://api.keeping.nl/v1/47666/time-entries/12345` | Test 1 | `.toBe(...)` |
| Path bare `/47666/time-entries/12345` (no `/v1/`, no `?`, no `/organisations/`) | Test 2 | `.toBe(...)` + two `.not.toContain(...)` |
| PATCH partial: body has EXACTLY the supplied two keys | Test 1, Test 2 | `.toEqual({ note, start })` + `Object.keys(body).sort()` |
| PATCH partial: single-field body has EXACTLY one key | Test 4 | `.toEqual({ note })` + `Object.keys(body).sort() === ["note"]` |
| `entry_id` Zod schema is `z.number().int().positive()` and REQUIRED | src/tools/update-entry.ts:56 | Source declaration |
| Immutable fields stripped at Zod validation | Test 6 | `body.date === undefined && body.purpose === undefined` |

## Decisions Made

- **Immutable-field branch: STRIP (Test 6 path a).** Zod schema simply does
  not declare `date`, `purpose`, or `user_id`. Zod's default object behavior
  is `.strip()`, so any client that sends them gets them dropped at the
  validation boundary before the handler runs. This is the cleaner of the
  two acceptable behaviors per plan §<behavior> Test 6 — no `.strict()`
  needed because the schema declarations themselves are the enforcement
  mechanism. Test 6 actual asserts `body.date === undefined && body.purpose === undefined`
  (strip branch); the `rejectBranch` disjunct is kept in the test for
  future-proofing in case a later Zod major version changes the default to
  `.strict()`.

- **NO `organisations()` call in handler.** Update does not need org-mode
  detection. The mutable fields (`start`/`end`/`hours`) reflect whatever
  mode the existing entry already has; if the caller sends `start`/`end`
  on an hours-mode entry's edit, the API rejects with 422 (definite-fail
  → `toIsErrorContent`). This is the recommended path per plan §<action>
  notes and keeps the handler ~30 lines shorter than add-entry's.

- **NO defaulting on update.** Empty body is technically valid per OpenAPI
  (returns entry unchanged). The optional empty-body-rejection UX
  improvement was NOT shipped — plan §<action> notes flag this as "NOT
  REQUIRED for tests to pass". Test 4 (single-field PATCH) exercises the
  partial-body invariant without needing any empty-body branch.

- **Test count: 10** (split planned Test 8 into Test 8 + Test 9 so 404 and
  401 failure paths fail independently if either regresses).

- **Biome auto-format applied after GREEN.** One formatter finding:
  collapsed multi-line `.number().int().positive().describe()` chain onto a
  single line for `entry_id`. No semantic change. Applied via
  `npx biome check --write` before the GREEN commit.

## Deviations from Plan

None. The plan executed exactly as written. One observation:

1. The Zod `.strip()` default handles immutable-field elimination cleanly —
   no `.strict()` is needed. Test 6 passed via the strip branch on first
   run, matching the planner's expectation in §<behavior> Test 6 path (a).

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `cb7b24d` | `test(03-03): add keeping_update_entry tests — dry-run, partial PATCH, immutable-field handling, error paths (WRITE-02, D-3-09)` |
| 2 | `7f6ed1c` | `feat(03-03): keeping_update_entry — PATCH partial-body with dry-run gate (WRITE-02, D-3-05, D-3-09)` |

## Known Stubs

None. The tool is functionally complete — it just is not yet registered on the
server. Registration is deferred to Plan 03-08 per the wave-3 wiring decision;
this is documented in the source-file header comment and is NOT a stub in the
"hardcoded empty value flowing to UI" sense.

## Hand-off to Wave 3

Plan 03-08 (server wiring) will add the import + register call in `src/server.ts`:

```typescript
import { registerUpdateEntry } from "./tools/update-entry.js";
// ... inside server bootstrap ...
registerUpdateEntry(server, client, config);
```

`KeepingConfig` is already loaded via `loadConfig()` in the bootstrap; no
config plumbing changes are needed.

## Self-Check: PASSED

Verified existence on disk:
- src/tools/update-entry.ts — FOUND
- test/tools/update-entry.test.ts — FOUND

Verified commits in git log:
- `cb7b24d` (RED) — FOUND
- `7f6ed1c` (GREEN) — FOUND

Verified gate compliance:
- 10 `it(` declarations in test file
- D-25, D-27, AMBIGUOUS_TEXT, `"keeping_update_entry"`, `"would_post"`,
  `"https://api.keeping.nl/v1/47666/time-entries/12345"`, `"PATCH"` all
  present in test file
- D-3-12 confirm description verbatim in source file (line 91)
- No `date:`, `purpose:`, or `user_id:` Zod field declarations in source file
- `entry_id` declared as `z.number().int().positive()` and REQUIRED
- All four D-3-11 annotation booleans present in source file

TDD gate sequence verified:
1. `test(03-03): ...` RED commit `cb7b24d` exists
2. `feat(03-03): ...` GREEN commit `7f6ed1c` exists after RED
