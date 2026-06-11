---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: ready_to_plan
stopped_at: Phase 2.5 context gathered
last_updated: "2026-06-11T16:50:26.558Z"
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 9
  completed_plans: 9
  percent: 33
---

# Project State: keeping-mcp

**Last updated:** 2026-06-10  
**Session boundary:** Phase 2 Plan 05 complete (scripts/probe-live.ts + anonymise() walker + npm run probe-live wiring; tool in tree, ready for Plan 02-06 human-verify run)

---

## Project Reference

**Core value:** A Claude Code (or any MCP client) user can log a reviewed time entry into their Keeping account through a single tool call, with explicit confirmation before anything is written.

**Source of truth:** `.planning/PROJECT.md`  
**Requirements:** `.planning/REQUIREMENTS.md`  
**Roadmap:** `.planning/ROADMAP.md`

---

## Current Position

| Field | Value |
|-------|-------|
| Current phase | Phase 2 — Read Tools & Schema Discovery |
| Current plan | 02-06-PLAN.md (next — human-verify gate) |
| Phase status | In Progress (5 of 6 plans complete) |
| Overall progress | 1 / 4 phases complete; 8 / 9 plans complete |

```
Progress: [█████████░] 89%
Phase 1 [█████] · Phase 2 [█████░] · Phase 3 [░░░░░] · Phase 4 [░░░░░]
```

---

## Phase Summary

| Phase | Name | Status | Requirements |
|-------|------|--------|-------------|
| 1 | Foundation & Scaffolding | Complete (2026-06-09) | DIST-01..03, AUTH-01..03, SAFE-01, REL-01 |
| 2 | Read Tools & Schema Discovery | In Progress (5/6 plans) | AUTH-04..05, IDENT-01..03, META-01..02, READ-01..03, SAFE-02..05 |
| 3 | Write Tools + Conditional Timers | Not started | WRITE-01..08, TIMER-01..02 |
| 4 | Distribution & Release Pipeline | Not started | DIST-04..05, REL-02..05 |

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases completed | 1 / 4 |
| Requirements mapped | 38 / 38 |
| Plans created | 9 (3 Phase 1 + 6 Phase 2) |
| Plans completed | 8 (3 Phase 1 + 5 Phase 2) |

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 02-read-tools-schema-discovery P01 | 3min | 3 tasks | 6 files |
| Phase 02-read-tools-schema-discovery P02 | 6min | 2 tasks | 6 files |
| Phase 02 P03 | 4min | 2 tasks | 7 files |
| Phase 02 P04 | 3min | 2 tasks | 4 files |
| Phase 02 P05 | 4min | 2 tasks | 5 files |

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
- [ ] Phase 2 Plan 06: human-verify probe-live results + commit LIVE-API.md

### Blockers

None.

---

## Session Continuity

**To resume after a break:**

1. Read `.planning/ROADMAP.md` — phase goals and success criteria
2. Read `.planning/PROJECT.md` — core value and locked decisions
3. Read `.planning/REQUIREMENTS.md` — requirement IDs and traceability
4. Read `.planning/phases/02-read-tools-schema-discovery/02-05-SUMMARY.md` for the last completed plan
5. Continue with `.planning/phases/02-read-tools-schema-discovery/02-06-PLAN.md` (human-verify gate — user runs the probe)

**Last session:** 2026-06-11T16:50:26.545Z
**Stopped at:** Phase 2.5 context gathered
**Resume file:** .planning/phases/02.5-timer-status-read-tool/02.5-CONTEXT.md
**Next action:** `/gsd:execute-phase 2` (or resume at Plan 02-06)

---
*State initialized: 2026-06-09 after roadmap creation*
*Last updated: 2026-06-10 after Phase 2 Plan 05 completion*
