---
phase: 03-write-tools-conditional-timers
plan: 04
subsystem: tools/delete-entry
type: tdd
wave: 2
status: complete
requirements:
  - WRITE-03
  - WRITE-04
  - WRITE-05
  - WRITE-07
tags:
  - keeping-mcp
  - phase-3
  - write-tools
  - mcp-server
  - delete-entry
dependencies:
  requires:
    - 03-01 foundation (previewOrCall, classifyAmbiguous, AMBIGUOUS_TEXT, 204-tolerant rawFetch)
    - 03-02 add-entry sibling skeleton (buildClient helper + defaultConfig pattern reused inline)
    - 03-03 update-entry sibling skeleton (catch arm pattern + Zod entry_id surface)
    - Phase 2 KeepingClient (resolveOrgId, get, delete)
    - Phase 2 errors (KeepingApiError, KeepingAuthError, MultiOrgError, toIsErrorContent)
    - src/config.ts KeepingConfig (KEEPING_REQUIRE_CONFIRM)
  provides:
    - src/tools/delete-entry.ts → registerDeleteEntry(server, client, config)
    - keeping_delete_entry MCP tool (registered by Plan 03-08 wiring)
  affects:
    - Plan 03-08 (server.ts wiring will import and register this tool)
tech-stack:
  added: []
  patterns:
    - INLINE dry-run gate in the handler — first Phase 3 write tool that does NOT delegate the gate decision entirely to previewOrCall. The dry-run branch performs an extra client.get to populate would_delete; only the confirm branch delegates to previewOrCall.
    - Verbatim echo of the GET response into would_delete — no wrapper extraction. Matches the plan §Task 2 §<action> shape (`would_delete: wouldDelete`) and the plan §<must_haves> truth ("client.get NOT called on confirm path; client.delete NOT called on dry-run path").
    - 204-tolerant confirm path proves D-3-27 end-to-end: client.delete returns null on 204 (per 03-01 rawFetch fix); the tool wraps `result ?? { ok: true }` so the user sees a meaningful success surface rather than a bare null.
    - Description carries the verbatim markdown destructive warning `**DESTRUCTIVE: permanently deletes the entry**` per WRITE-07 + D-3-11. Test 10 asserts the literal via listTools().
    - Same registerXxx(server, client, config) three-argument signature as add-entry and update-entry.
    - Same catch-arm chain — classifyAmbiguous → AMBIGUOUS_TEXT envelope → toIsErrorContent fallback. 4xx on the dry-run GET (Test 7 — 404 not found) is definite-fail; 5xx on the confirm DELETE (Test 8) is ambiguous.
key-files:
  created:
    - src/tools/delete-entry.ts
    - test/tools/delete-entry.test.ts
  modified: []
decisions:
  - "10 tests shipped — exact match with the plan §<acceptance_criteria> minimum. All pass on first GREEN run; no test-iteration churn."
  - "INLINE gate check is the unique element of this tool. previewOrCall cannot populate would_delete on its own — it has no business-logic surface for 'fetch the thing the user is about to delete'. The dry-run branch performs client.get + builds the would_post/would_delete shape inline; only the confirm branch delegates to previewOrCall. This is the recommended path per plan §<action> and 03-PATTERNS.md §src/tools/delete-entry.ts."
  - "Verbatim echo of GET response into would_delete. The plan's Test 1 mocks client.get to return the fixture entry directly (not wrapped in `{ time_entry: ... }`) and asserts `would_delete` deep-equals the fixture. No wrapper extraction step — the tool surfaces whatever shape Keeping returns. This honors D-3-03 ('returns the entry that would be deleted') without adding strict-wrapper-read logic that the plan did not require for this tool."
  - "204-tolerant confirm path: `result ?? { ok: true }`. client.delete returns null on 204 thanks to the 03-01 rawFetch fix (D-3-27). The tool nullish-coalesces null to `{ ok: true }` so the user sees a meaningful success surface rather than a bare `null`. Test 2 + Test 4 both verify the response is parseable JSON without throwing — proves D-3-27 closed end-to-end."
  - "4xx on dry-run GET (Test 7 — 404 not found) is definite-fail. The plan §<acceptance_criteria> and §<must_haves> truths require that a failed preview-fetch NOT attempt the delete (T-03-04-05 mitigation). Test 7 asserts `deletes.length === 0` after the GET throws, plus `text` contains 'Keeping API error 404' AND does NOT contain 'outcome unknown' — proves the 4xx flows through toIsErrorContent (definite-fail) rather than the ambiguous envelope."
  - "5xx on confirm DELETE (Test 8) is ambiguous. classifyAmbiguous identifies the 500 KeepingApiError; the tool renders AMBIGUOUS_TEXT envelope with the original message in parenthetical. Same WRITE-05 contract as add-entry Test 7 and update-entry Test 7."
  - "Description marker is the verbatim markdown literal `**DESTRUCTIVE: permanently deletes the entry**` — leading + trailing double-asterisks included. Test 10 asserts the literal via `tool?.description?.includes(...)`. WRITE-07 + D-3-11 spec is closed."
  - "Annotations identical to add-entry / update-entry (D-3-11): readOnlyHint:false, destructiveHint:true, idempotentHint:false, openWorldHint:true. Test 9 asserts all four byte-exact via listTools."
  - "Biome auto-formatted one line after GREEN — collapsed multi-line `content: [{ type: 'text', text: ... }]` array onto a single line. No semantic change. Applied via `npx biome check --write`."
metrics:
  duration: "~3 minutes (RED commit cd001dc → GREEN commit 05b1738)"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
  tests_added: 10
  tests_total: 133
  tests_previous: 123
  test_files: 15
  commits: 2
  date: 2026-06-12
---

# Phase 3 Plan 04: keeping_delete_entry Vertical Slice Summary

Ships `keeping_delete_entry` as a complete vertical slice — Zod input schema
(tightest of the three write-tool surfaces: only `organisation_id?`, `entry_id`,
`confirm?`), INLINE dry-run gate that performs an extra `client.get` to populate
`would_delete` per D-3-03, confirm path that delegates to `previewOrCall` and
tolerates the 204 No Content response (proving D-3-27 closed end-to-end), and
the verbatim markdown destructive warning per WRITE-07 + D-3-11. WRITE-03,
WRITE-04, WRITE-05, WRITE-07 addressed in one tool. Server registration
deferred to Plan 03-08 per the wave-3 wiring decision; this slice ships zero
changes to `src/server.ts`, `src/keeping/*`, every other `src/tools/*` file,
and REQUIREMENTS.md.

## What Was Built

### `src/tools/delete-entry.ts` (NEW, 157 lines)

`registerDeleteEntry(server: McpServer, client: KeepingClient, config: KeepingConfig): void`
— same three-argument signature as `registerAddEntry` and `registerUpdateEntry`.

**Zod input schema** (`DeleteEntryInput`) — tightest of the three write-tool
surfaces per D-3-09:

- `organisation_id?: string` — verbatim describe string reused from Phase 2/2.5
- `entry_id: number().int().positive()` — **REQUIRED** (no `.optional()`); blocks
  path-traversal vectors in the `${entry_id}` template literal at the schema
  layer (T-03-04-01 mitigation)
- `confirm?: boolean` — D-3-12 verbatim description. Optional, NOT `.default(true)`.
  Handler coerces `input.confirm === true` before passing to `previewOrCall`.

No `date`, `purpose`, `note`, `start`, `end`, `hours`, `project_id`, `task_id`,
`tag_ids`, `external_references` — delete has nothing to mutate, only nothing
to identify.

**Description** (locked verbatim — Test 10 asserts the literal):

```
**DESTRUCTIVE: permanently deletes the entry** — cannot be undone. Owns the
dry-run gate: without confirm: true, the tool fetches the entry and returns a
would_delete preview so a human can verify the right entry is targeted. Only
call with confirm: true after a human reviewed the preview.
```

**Annotations** (D-3-11, identical to add-entry / update-entry):
```typescript
readOnlyHint: false,
destructiveHint: true,
idempotentHint: false,
openWorldHint: true,
```

**Handler flow** (the inline-gate pattern is unique to this tool):

1. `resolveOrgId(input.organisation_id)` → numeric-string `orgId`
2. Build `path = \`/${orgId}/time-entries/${input.entry_id}\``
3. Compute `isDryRun = config.KEEPING_REQUIRE_CONFIRM && input.confirm !== true`
4. **Dry-run branch** (D-3-03): extra `client.get<unknown>(path)` to fetch the
   entry-to-be-deleted; return JSON with `would_post` (method DELETE, full URL,
   body null) + `would_delete` (the fetched entry verbatim — no wrapper
   extraction). T-03-04-05 mitigation: this branch is the only code path that
   calls `client.get`.
5. **Confirm branch**: delegate to `previewOrCall<unknown>(client, { requireConfirm, confirm: input.confirm === true }, { method: "DELETE", path })`.
   Since `confirm === true` here, `previewOrCall` routes to `client.delete`
   which returns `null` on 204 (D-3-27 / 03-01 rawFetch fix). Wrap the null
   as `{ ok: true }` via nullish-coalesce so the user sees a meaningful
   success surface.

**Catch arm** (D-3-16, SAFE-04):
- `classifyAmbiguous(err)` (true for 5xx / AbortError / raw TypeError) →
  `{ isError: true, content: [{ type: "text", text: \`${AMBIGUOUS_TEXT} (${msg})\` }] }`
- Everything else (4xx incl. 404 not-found on the dry-run GET, KeepingAuthError,
  MultiOrgError, plain Error) → `toIsErrorContent(err)` (definite-fail path)

**Notable design choices documented in the source comment header:**
- The inline-gate pattern is deliberate — `previewOrCall` has no surface for
  "fetch the thing the user is about to delete", so the dry-run branch owns
  that responsibility while the confirm branch delegates to the shared gate.
- Verbatim echo of the GET response — no wrapper-extraction logic. The plan's
  Test 1 mocks `client.get` to return the entry directly (not wrapped in
  `{ time_entry: ... }`) and asserts `would_delete` deep-equals the fixture.
  This honors D-3-03 ("returns the entry that would be deleted") without
  adding logic the plan did not require.
- 4xx on the dry-run GET flows through `toIsErrorContent` as definite-fail —
  no delete is attempted because the entry can't be located (T-03-04-05).

### `test/tools/delete-entry.test.ts` (NEW, 317 lines, 10 tests)

Mirrors `test/tools/update-entry.test.ts` skeleton:
`buildClient(mockClient, config = defaultConfig)` helper +
`InMemoryTransport.createLinkedPair()` + `Partial<KeepingClient>` mocks.

Shared constants:
- `defaultConfig: KeepingConfig` — `KEEPING_REQUIRE_CONFIRM: true`, `KEEPING_LOG_LEVEL: "error"`
- `fixtureEntry` — `{ id: 12345, user_id: 789, date: "2026-06-10", purpose: "work", note: "Working on Project X", hours: 1.5, ongoing: false }` (echoed verbatim into `would_delete` per D-3-23)

| # | Test | Asserts |
|---|------|---------|
| 1 | Dry-run preview (env=true, confirm omitted) — extra GET + would_delete; client.delete NOT called | `gets === ["/47666/time-entries/12345"]`, `deletes === []`, `would_post.method = "DELETE"`, `would_post.url = "https://api.keeping.nl/v1/47666/time-entries/12345"`, `would_post.body = null`, `would_delete` deep-equals fixtureEntry |
| 2 | Confirm path → DELETE called exactly once; client.get NOT called | `gets === []`, `deletes.length === 1`, `deletes[0] = "/47666/time-entries/12345"`, path has no `?` and no `/organisations/`, response is parseable JSON |
| 3 | Env-false escape hatch — KEEPING_REQUIRE_CONFIRM=false, no confirm → delete called directly | `gets.length === 0`, `deletes.length === 1`, `deletes[0] = "/47666/time-entries/12345"` |
| 4 | 204 No Content path — client.delete returns null → tool surfaces success without throwing (D-3-27) | `res.isError` falsy, response is parseable JSON (proves the tool wrapped the null result rather than crashing) |
| 5 | MultiOrgError flows through toIsErrorContent verbatim (D-27) | Byte-exact D-27 wording (`Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: 100 (Acme), 200 (Beta).`) |
| 6 | 401 KeepingAuthError flows through toIsErrorContent verbatim (D-25) | Byte-exact D-25 wording (`Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.`) |
| 7 | 4xx on dry-run GET (404 not found) → toIsErrorContent, NOT ambiguous; delete NOT attempted | Text contains `"Keeping API error 404"`, does NOT contain `"outcome unknown"`, `deletes.length === 0` (T-03-04-05) |
| 8 | 5xx on confirm DELETE (500) → AMBIGUOUS_TEXT envelope with original message parenthetical | Text starts with `"outcome unknown — verify with keeping_list_entries before retrying."`; original `Keeping API error 500` in parenthetical |
| 9 | listTools annotations | All four D-3-11 booleans byte-exact (`readOnlyHint:false`, `destructiveHint:true`, `idempotentHint:false`, `openWorldHint:true`) |
| 10 | Tool description contains the verbatim destructive warning | `tool?.description?.includes("**DESTRUCTIVE: permanently deletes the entry**")` |

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run test/tools/delete-entry.test.ts` | **10/10 pass** |
| `npx vitest run` (full project) | **133/133 pass** (15 test files; 123 pre-existing + 10 new) |
| `npx tsc --noEmit` | exit 0 |
| `npx biome check src/tools/delete-entry.ts test/tools/delete-entry.test.ts` | exit 0 (after format pass) |
| `grep -c "DESTRUCTIVE" src/tools/delete-entry.ts` | 2 (description marker + header comment) |
| `grep -c '\*\*DESTRUCTIVE: permanently deletes the entry\*\*' src/tools/delete-entry.ts` | 1 (verbatim markdown literal in description) |
| `git diff HEAD~2 --stat -- src/keeping/ src/server.ts src/tools/add-entry.ts src/tools/update-entry.ts` | empty (scope guardrails respected) |
| `git diff HEAD~2 --stat -- .planning/REQUIREMENTS.md` | empty (REQUIREMENTS.md untouched) |

## Byte-Exact Lock Confirmations

| Lock | Asserted In | Method |
|------|-------------|--------|
| D-25 KeepingAuthError wording | Test 6 | `.toBe(...)` |
| D-27 MultiOrgError template | Test 5 | `.toBe(...)` |
| AMBIGUOUS_TEXT (`"outcome unknown — verify with keeping_list_entries before retrying."`) | Test 8 | `text.startsWith(...)` `.toBe(true)` |
| D-3-12 confirm description verbatim | src/tools/delete-entry.ts:68 | Source verbatim per planner-supplied string |
| D-3-11 four annotation booleans | Test 9 | `.toBe(false/true/false/true)` |
| WRITE-07 + D-3-11 destructive marker (`**DESTRUCTIVE: permanently deletes the entry**`) | Test 10 | `tool?.description?.includes(...)` |
| Preview URL format `https://api.keeping.nl/v1/47666/time-entries/12345` | Test 1 | `.toBe(...)` |
| `would_post.body = null` for DELETE preview | Test 1 | `.toBe(null)` |
| `would_delete` echoes GET response verbatim | Test 1 | `.toEqual(fixtureEntry)` |
| GET only on dry-run, DELETE only on confirm (T-03-04-05) | Tests 1, 2, 3 | `gets`/`deletes` arrays + counts |
| 204 path returns parseable JSON (D-3-27) | Test 4 | `JSON.parse(...)` does NOT throw |
| 4xx on dry-run GET → NO delete attempt | Test 7 | `deletes.length === 0` |
| Path bare `/47666/time-entries/12345` (no `/v1/`, no `?`, no `/organisations/`) | Test 2 | `.toBe(...)` + two `.not.toContain(...)` |
| `entry_id` Zod schema is `z.number().int().positive()` and REQUIRED | src/tools/delete-entry.ts:59-63 | Source declaration |

## Decisions Made

- **INLINE dry-run gate is the unique element of this tool.** Unlike add-entry
  and update-entry which delegate the entire gate decision to `previewOrCall`,
  delete-entry's dry-run branch performs an extra `client.get` to populate the
  `would_delete` field BEFORE returning the preview. Only the confirm branch
  delegates to `previewOrCall`. This is the recommended path per plan §Task 2
  §<action> and 03-PATTERNS.md §"Unique element — delete preview enrichment
  (D-3-03)" because `previewOrCall` has no business-logic surface for "fetch
  the thing the user is about to delete".

- **Verbatim echo of GET response into `would_delete`.** The tool surfaces
  whatever shape Keeping returns from `GET /{orgId}/time-entries/{entry_id}`
  with no wrapper-extraction step. The plan's Test 1 mocks `client.get` to
  return the entry directly (not wrapped in `{ time_entry: ... }`) and asserts
  `would_delete` deep-equals the fixture. This honors D-3-03 ("returns the
  entry that would be deleted") without adding strict-wrapper-read logic that
  the plan did not require. If the Keeping API ever wraps the response, the
  preview will reflect that wrapper verbatim — which is the desired schema-
  discovery behavior per D-34's raw pass-through philosophy.

- **204 path wraps null as `{ ok: true }`.** `client.delete` returns `null`
  on 204 (per 03-01 rawFetch fix). The tool nullish-coalesces null to
  `{ ok: true }` so the user sees a meaningful success surface rather than
  a bare `null` in the response text. Test 2 + Test 4 both verify the response
  is parseable JSON without throwing — proves D-3-27 closed end-to-end.

- **4xx on dry-run GET is definite-fail.** When the preview-fetch returns
  a 404 (entry not found) or any other 4xx, the tool flows through
  `toIsErrorContent` as definite-fail — no delete is attempted because the
  entry can't be located. T-03-04-05 mitigation: Test 7 asserts
  `deletes.length === 0` after the GET throws.

- **NO strict-wrapper-read with Array.isArray guard.** The orchestrator's
  plan_specifics mentioned this as a possibility (mirroring the Phase 2.5
  D-2.5-05a pattern), but the locked PLAN §Task 2 §<action> shows the
  verbatim echo pattern: `const wouldDelete = await client.get<unknown>(path);
  return { ... would_delete: wouldDelete }`. The plan's Test 1 confirms this
  by mocking `client.get` to return the entry directly (not wrapped) and
  asserting `would_delete` deep-equals the fixture. Adding strict-wrapper-read
  would have been a deviation from the plan and would have broken Test 1.

- **Annotations identical to add-entry / update-entry** (D-3-11): all four
  booleans byte-exact. Test 9 asserts via listTools().

- **Biome auto-format applied after GREEN.** One formatter finding: collapsed
  the multi-line `content: [{ type: "text", text: ... }]` array on the confirm
  branch's return statement onto a single line. No semantic change. Applied
  via `npx biome check --write` before the GREEN commit.

## Deviations from Plan

None. The plan executed exactly as written — RED on first run, GREEN on first
run after implementation, no test-iteration churn.

One observation:

1. The orchestrator's `<plan_specifics>` mentioned a strict-wrapper-read with
   `Array.isArray` guard as a possibility for the dry-run GET response. The
   actual locked PLAN §Task 2 §<action> shows the verbatim echo pattern
   (`const wouldDelete = await client.get<unknown>(path); return { ... would_delete: wouldDelete }`)
   and the plan's Test 1 fixture is NOT wrapped in `{ time_entry: ... }`.
   I followed the locked plan. This is not a deviation; it's a clarification
   of which spec takes precedence (the plan does).

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `cd001dc` | `test(03-04): add keeping_delete_entry tests — dry-run extra GET, confirm DELETE, 204 path, destructive warning (WRITE-03, D-3-03, D-3-27)` |
| 2 | `05b1738` | `feat(03-04): keeping_delete_entry — inline dry-run gate + extra GET for would_delete; 204-tolerant confirm (WRITE-03, D-3-03, D-3-27)` |

## Known Stubs

None. The tool is functionally complete — it just is not yet registered on the
server. Registration is deferred to Plan 03-08 per the wave-3 wiring decision;
this is documented in the source-file header comment and is NOT a stub in the
"hardcoded empty value flowing to UI" sense.

## Hand-off to Wave 3

Plan 03-08 (server wiring) will add the import + register call in `src/server.ts`:

```typescript
import { registerDeleteEntry } from "./tools/delete-entry.js";
// ... inside server bootstrap ...
registerDeleteEntry(server, client, config);
```

`KeepingConfig` is already loaded via `loadConfig()` in the bootstrap; no
config plumbing changes are needed.

## Self-Check: PASSED

Verified existence on disk:
- src/tools/delete-entry.ts — FOUND
- test/tools/delete-entry.test.ts — FOUND

Verified commits in git log:
- `cd001dc` (RED) — FOUND
- `05b1738` (GREEN) — FOUND

Verified gate compliance:
- 10 `it(` declarations in test file
- D-25, D-27, AMBIGUOUS_TEXT, `"keeping_delete_entry"`, `"would_delete"`,
  `"would_post"`, `"DELETE"`, `"https://api.keeping.nl/v1/47666/time-entries/12345"`,
  `"**DESTRUCTIVE: permanently deletes the entry**"` all present in test file
- D-3-12 confirm description verbatim in source file (line 68)
- `entry_id` declared as `z.number().int().positive()` and REQUIRED
- All four D-3-11 annotation booleans present in source file
- WRITE-07 destructive marker `**DESTRUCTIVE: permanently deletes the entry**`
  verbatim in source file description (line 82)
- INLINE gate check present: `const isDryRun = config.KEEPING_REQUIRE_CONFIRM && input.confirm !== true;`
- Dry-run branch calls `client.get<unknown>(path)` for would_delete
- Confirm branch delegates to `previewOrCall<unknown>(...)` with `method: "DELETE"`

TDD gate sequence verified:
1. `test(03-04): ...` RED commit `cd001dc` exists
2. `feat(03-04): ...` GREEN commit `05b1738` exists after RED
