---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 3 Plan 03 complete (keeping_update_entry vertical slice)
last_updated: "2026-06-12T08:18:00.000Z"
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 19
  completed_plans: 14
  percent: 58
---

# Project State: keeping-mcp

**Last updated:** 2026-06-11  
**Session boundary:** Phase 2.5 Plan 02 complete (gap-closure — Array.isArray guard added to extractTimeEntry; bare-array time_entry now collapses to graceful empty; 2 new RED→GREEN tests; 79/79 total; src/keeping/ + src/server.ts untouched; D-2.5-05a re-enforced; REVIEW.md WR-01 closed; VERIFICATION.md Truth #3 transitions FAILED→VERIFIED on re-verify)

---

## Project Reference

**Core value:** A Claude Code (or any MCP client) user can log a reviewed time entry into their Keeping account through a single tool call, with explicit confirmation before anything is written.

**Source of truth:** `.planning/PROJECT.md`  
**Requirements:** `.planning/REQUIREMENTS.md`  
**Roadmap:** `.planning/ROADMAP.md`

---

## Current Position

Phase: 03 (write-tools-conditional-timers) — EXECUTING
Plan: 4 of 8

| Field | Value |
|-------|-------|
| Current phase | Phase 3 — Write Tools + Conditional Timers (executing) |
| Current plan | Plan 03-03 complete; Plan 03-04 next (keeping_delete_entry) |
| Phase status | Phase 3 in progress — 3 of 8 plans complete (01 foundation + 02 add-entry + 03 update-entry) |
| Overall progress | 3 / 4 phases complete (Phase 1, 2, 2.5); 14 plans complete through Phase 3 Plan 03 |

```
Progress: [███████░░░] 67%
Phase 1 [█████] · Phase 2 [██████] · Phase 2.5 [█] · Phase 3 [███░░░░░] · Phase 4 [░░░░░]
```

---

## Phase Summary

| Phase | Name | Status | Requirements |
|-------|------|--------|-------------|
| 1 | Foundation & Scaffolding | Complete (2026-06-09) | DIST-01..03, AUTH-01..03, SAFE-01, REL-01 |
| 2 | Read Tools & Schema Discovery | Complete (2026-06-11) | AUTH-04..05, IDENT-01..03, META-01..02, READ-01..03, SAFE-02..05 |
| 2.5 | Timer Status Read Tool | Complete (2026-06-11) | TIMER-01 (status-read portion) |
| 3 | Write Tools + Conditional Timers | Not started | WRITE-01..08, TIMER-01 (start/stop/resume), TIMER-02 |
| 4 | Distribution & Release Pipeline | Not started | DIST-04..05, REL-02..05 |

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases completed | 3 / 4 (Phase 1, 2, 2.5) |
| Requirements mapped | 38 / 38 |
| Plans created | 19 (3 Phase 1 + 6 Phase 2 + 2 Phase 2.5 + 8 Phase 3) |
| Plans completed | 14 (3 Phase 1 + 6 Phase 2 + 2 Phase 2.5 + 3 Phase 3) |

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 02-read-tools-schema-discovery P01 | 3min | 3 tasks | 6 files |
| Phase 02-read-tools-schema-discovery P02 | 6min | 2 tasks | 6 files |
| Phase 02 P03 | 4min | 2 tasks | 7 files |
| Phase 02 P04 | 3min | 2 tasks | 4 files |
| Phase 02 P05 | 4min | 2 tasks | 5 files |
| Phase 02.5-timer-status-read-tool P01 | 3min | 3 tasks | 3 files |
| Phase 02.5 P02 | 3min | 2 tasks | 2 files |
| Phase 03-write-tools-conditional-timers P01 | 5min | 2 tasks | 7 files |
| Phase 03-write-tools-conditional-timers P02 | 5min | 2 tasks | 2 files |
| Phase 03-write-tools-conditional-timers P03 | 3min | 2 tasks | 2 files |

## Accumulated Context

### Key Decisions (locked — do not reopen)

| Decision | Rationale |
|----------|-----------|
| Stack locked | TS, @modelcontextprotocol/sdk ^1.29, zod ^3.25, p-retry, p-throttle, tsup, vitest, biome, Node 22 |
| Distribution locked | npm + npx + MCP Registry via GitHub Actions OIDC, MIT license, namespace io.github.red-square-software/keeping-mcp |
| Architecture locked | 5-layer: bin → server.ts → tools/*.ts → keeping/client.ts → fetch |
| 4-phase roadmap (not 6) | Timer work folded into Phase 3 as conditional; coarse granularity target met |
| Read before write (hard dependency) | Keeping POST body field names unknown until `keeping_list_entries` runs against real API |
| Timer conditional on 404 probe | Phase 2 probes timer endpoint; TIMER-01/02 ship in Phase 3 only if probe non-404 |
| Dry-run-by-default | `KEEPING_REQUIRE_CONFIRM=true`; all write tools return preview unless `confirm: true` |
| D-25 wording locked (Plan 02-01) | `KeepingAuthError.message` is byte-identical to "Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server." — tests assert with `.toBe()` |
| D-27 template locked (Plan 02-01) | `MultiOrgError.message` template byte-identical to "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: <id> (<name>), <id> (<name>)." |
| Phase 2 deps pinned (Plan 02-01) | `@modelcontextprotocol/sdk@1.29.0`, `p-throttle@8.1.0`, `p-retry@8.0.0`, `tsx@4.22.4` (dev). Slopcheck-fallback human-verified |
| D-37 raw-capture gitignore (Plan 02-01) | `.planning/research/.live-capture-raw.json` and `.planning/research/.probe-raw-*.json` blocked before any code can write them |
| Token field storage (Plan 02-02) | KeepingClient.token installed via `Object.defineProperty(this, "token", { enumerable: false, ... })` — TS `private` is erasure-only and a plain class field would still leak via JSON.stringify(client). Test 15 is the regression gate. |
| me() global path unconditional (Plan 02-02) | `KeepingClient.me()` calls GET /v1/users/me regardless of multi-org status. Plan 02-06 Task 3 owns the contingency switch to /organisations/<id>/users/me iff the Plan 02-05 live probe returns 404. No runtime branching in client.ts. |
| p-retry tuned for fast tests (Plan 02-02) | `retries:3, minTimeout:0, factor:1` — Retry-After is the only delay honoured, slept for explicitly inside onFailedAttempt and guarded to GETs so non-GET 429s reject without delay. |
| Manual initialize-smoke contract locked (Plan 02-02) | `printf JSON-RPC | KEEPING_TOKEN=kp_test_FAKE node dist/bin/keeping-mcp.js` must produce one stdout frame with serverInfo.name="keeping-mcp" + protocolVersion="2025-11-25" and clean stderr. Byte-aligned with Plan 02-04 Task 2 CI smoke. |
| Graceful-empty discriminator (Plan 02-03) | `keeping_projects` / `keeping_tasks` distinguish "feature disabled" from "real failure" by HTTP status only: `KeepingApiError.status === 404` → byte-identical "<X> feature not enabled for this organisation." note WITHOUT `isError:true`. Body shape is not inspected. Plan 02-05/02-06 probe-live confirms the hypothesis. |
| Sibling-pattern copy locked (Plan 02-03) | `src/tools/tasks.ts` is a verbatim sibling of `src/tools/projects.ts` with only six string substitutions. Intentional duplication preserves the per-tool divergence point for Phase 3 write tools — no abstraction layer. |
| Raw pass-through wire shape (Plan 02-04, D-34 strict reading) | `keeping_list_entries` returns `{ entries: <raw array>, count: <number> }`. Top-level normalisation only — `Array.isArray(raw) ? raw : (raw.entries ?? [])` discards wrapper fields like `meta`; inner array items pass through verbatim including any future custom_field_x. NO outputSchema. The tool's response IS the schema-discovery surface for Phase 3 write tools. |
| CI initialize-handshake smoke locked (Plan 02-04, D-15) | New CI step appended after Phase 1 missing-token smoke (Phase 1 step UNTOUCHED). Pipes `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"ci-smoke","version":"1.0.0"}}}` into `node dist/bin/keeping-mcp.js` with fake `KEEPING_TOKEN=kp_test_FAKE_token_value`. Three assertions: (a) stdout-only-JSON via per-line `JSON.parse`, (b) stderr does NOT contain the fake token, (c) first frame has `result.serverInfo.name === "keeping-mcp"` + non-empty `result.protocolVersion`. Runs across [ubuntu, windows] × [22, 24]. |
| Anonymise denylist locked at six keys (Plan 02-05, D-35 step 3) | `ANONYMISE_KEYS` is a frozen `Set<string>` of exactly: `description`, `project_name`, `task_name`, `client_name`, `user_name`, `user_email`. Test 9 in `test/scripts/anonymise.test.ts` asserts `ANONYMISE_KEYS.size === 6` AND each name present once — adding a key without revisiting CONTEXT.md trips the test (T-02-05-02 mitigation). Denylist over allowlist because allowlist silently drops new fields; denylist surfaces them for developer eyeball during Plan 02-06 review. |
| Q1 contingency probe = raw fetch, not client.me() (Plan 02-05) | `scripts/probe-live.ts` issues a raw `fetch` to `/v1/users/me` (not via `KeepingClient.me()`) so that: (a) cache is never poisoned, (b) actual HTTP status is captured verbatim — not masked by `KeepingAuthError`, (c) probe continues regardless of result. The status feeds the LIVE-API.md `## /v1/users/me path probe` section that Plan 02-06 Task 3 reads to decide whether to switch `KeepingClient.me()` to the org-scoped path. |
| Probe-live pre-check + loadConfig double layer (Plan 02-05) | Script emits byte-identical `[probe-live] KEEPING_TOKEN must be set in env or .env before running probe-live` to stderr + `process.exit(1)` BEFORE calling `loadConfig()`. `loadConfig()` then runs as the regular validator for the rest of the env. Both messages may appear in some edge cases; the probe-specific one is the user's primary cue. Verified via manual smoke. |
| Probe-live source-isolation (Plan 02-05) | `scripts/probe-live.ts` and the npm script entry are the only artefacts; `bin/` and `src/` are line-for-line untouched. Verified via `git diff HEAD~3 HEAD -- bin/ src/` returning empty. Q1 contingency code change (if needed) is Plan 02-06 Task 3's responsibility. `tsup.config.ts` is NOT changed — the probe never bundles into `dist/`. `tsconfig.json` adds `scripts/**/*` to `include` so `npx tsc --noEmit` typechecks the probe. |
| Strict wrapper extractor locked (Plan 02.5-01, D-2.5-05a) | `src/tools/timer-status.ts:extractTimeEntry(raw)` accepts ONLY when `raw && typeof raw === 'object' && raw.time_entry && typeof raw.time_entry === 'object'`. No multi-key fallback (`entries[0]`, bare-array, aliases). Differs intentionally from `entries-list.ts:normaliseEntries` because the OpenAPI spec now authoritatively locks the singular `time_entry` wrapper post-Plan-02-06. Drift fails loudly via D-2.5-13 tests 5/6 (`toEqual({ time_entry: null, ... })`) rather than being masked. |
| 404-as-graceful-empty pattern locked (Plan 02.5-01, D-2.5-03 + D-2.5-04a) | `keeping_timer_status` catches `err instanceof KeepingApiError && err.status === 404` and returns `{ time_entry: null, is_running: false }` with NO `isError` key. Same payload as the strict-extractor "no usable time_entry" branch — one empty-state surface regardless of cause. Sibling pattern to Phase 2's "feature not enabled for this organisation" graceful empty (META-01, META-02). Reusable template for Phase 3's `keeping_resume_timer` "no recent entry to resume" sentinel. |
| Strict wrapper guard MUST pair typeof with Array.isArray (Plan 02.5-02, D-2.5-05a re-enforced) | `extractTimeEntry` guard now reads `candidate === null \|\| typeof candidate !== "object" \|\| Array.isArray(candidate)`. Closes the array-drift gap from `02.5-VERIFICATION.md` (REVIEW.md WR-01): `typeof [] === "object"` is `true` in JS, so the original two-clause guard silently accepted `{ time_entry: [] }` and `{ time_entry: [{...}] }` as valid wrappers — contradicting the source-comment contract (lines 17-22 / 53-56). Test 11 + Test 12 in `test/tools/timer-status.test.ts` are the regression gates (`toEqual({ time_entry: null, is_running: false })`). Phase 3 write tools that read entry shapes MUST reuse this three-clause guard pattern verbatim. |

### Open Questions (resolve during execution)

- Exact Keeping POST body field names (`day` vs `date`, `hours` vs `starting_time`/`ending_time`, `purpose` enum values) — resolve in Phase 2 via `keeping_list_entries` against real token
- Timer endpoint paths (`POST /v1/organisations/:org_id/timers` assumed) — probe in Phase 2
- Pagination scheme (offset or cursor) — probe in Phase 2
- Error response envelope shape — probe in Phase 2

### Critical Pitfalls to Track

1. **stdout pollution** — CI smoke test in Phase 1 prevents this; never use `console.log`
2. **Token leak** — unit test asserts fake token never appears in any tool output; HTTP client never logs `Authorization` header
3. **Duplicate write entries** — write tools never auto-retry; return "outcome unknown" on ambiguous failure
4. **Confirm bypass by model** — `confirm` parameter description must state it is a user-controlled gate
5. **OIDC misconfig** — verify provenance attestation badge on npm after first publish in Phase 4

### Todos

- [x] Phase 1: Foundation & Scaffolding (completed 2026-06-09)
- [x] Phase 2 Plan 01: install + leaf contracts (completed 2026-06-10)
- [x] Phase 2 Plan 02: KeepingClient + server.ts + bin wiring + keeping_me tool (completed 2026-06-10)
- [x] Phase 2 Plan 03: keeping_organisations + keeping_projects + keeping_tasks (completed 2026-06-10)
- [x] Phase 2 Plan 04: keeping_list_entries + CI initialize-handshake smoke (completed 2026-06-10)
- [x] Phase 2 Plan 05: scripts/probe-live.ts + anonymise() walker + npm run probe-live (completed 2026-06-10)
- [x] Phase 2 Plan 06: human-verify probe-live results + commit LIVE-API.md + Phase 2.5 carve-out (completed 2026-06-11)
- [x] Phase 2.5 Plan 01: keeping_timer_status read tool — 10 tests + impl + server.ts wiring (completed 2026-06-11)
- [x] Phase 2.5 Plan 02: array-drift gap closure — Array.isArray guard in extractTimeEntry + Test 11/12 (completed 2026-06-11)
- [x] Phase 3 Plan 01: foundation — date helpers, write-gate, requestWithHeaders, 204 fix (completed 2026-06-12)
- [x] Phase 3 Plan 02: keeping_add_entry vertical slice — dry-run gate, org-mode-aware body, DST default (completed 2026-06-12)
- [x] Phase 3 Plan 03: keeping_update_entry vertical slice — PATCH partial-body, immutable-field strip, dry-run gate (completed 2026-06-12)
- [ ] Phase 3 Plan 04..08: remaining write tools (delete, timers) + server.ts wiring (in progress)

### Blockers

None.

---

## Session Continuity

**To resume after a break:**

1. Read `.planning/ROADMAP.md` — phase goals and success criteria
2. Read `.planning/PROJECT.md` — core value and locked decisions
3. Read `.planning/REQUIREMENTS.md` — requirement IDs and traceability
4. Read `.planning/phases/02.5-timer-status-read-tool/02.5-02-SUMMARY.md` for the last completed plan (gap closure)
5. Re-run `/gsd:verify-phase 02.5` to transition VERIFICATION.md from gaps_found 9/10 → complete 10/10 (Truth #3 FAILED → VERIFIED)
6. Continue with Phase 3 (draft `.planning/phases/03-*/03-CONTEXT.md` first)

**Last session:** 2026-06-12T08:18:00.000Z
**Stopped at:** Completed Phase 3 Plan 03 (keeping_update_entry vertical slice — 10 tests, 123/123 total)
**Resume file:** None
**Next action:** `/gsd:execute-phase 3` continues with Plan 03-04 (`keeping_delete_entry`)

---
*State initialized: 2026-06-09 after roadmap creation*
*Last updated: 2026-06-11 after Phase 2.5 Plan 02 (gap closure) completion*
