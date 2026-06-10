---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 02-03-PLAN.md
last_updated: "2026-06-10T11:23:57.120Z"
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 9
  completed_plans: 6
  percent: 67
---

# Project State: keeping-mcp

**Last updated:** 2026-06-10  
**Session boundary:** Phase 2 Plan 03 complete (organisations + projects + tasks read tools; four of five Phase 2 tools shipped)

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
| Current plan | 02-04-PLAN.md (next) |
| Phase status | In Progress (3 of 6 plans complete) |
| Overall progress | 1 / 4 phases complete; 6 / 9 plans complete |

```
Progress: [███████░░░] 67%
Phase 1 [█████] · Phase 2 [███░░░] · Phase 3 [░░░░░] · Phase 4 [░░░░░]
```

---

## Phase Summary

| Phase | Name | Status | Requirements |
|-------|------|--------|-------------|
| 1 | Foundation & Scaffolding | Complete (2026-06-09) | DIST-01..03, AUTH-01..03, SAFE-01, REL-01 |
| 2 | Read Tools & Schema Discovery | In Progress (3/6 plans) | AUTH-04..05, IDENT-01..03, META-01..02, READ-01..03, SAFE-02..05 |
| 3 | Write Tools + Conditional Timers | Not started | WRITE-01..08, TIMER-01..02 |
| 4 | Distribution & Release Pipeline | Not started | DIST-04..05, REL-02..05 |

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases completed | 1 / 4 |
| Requirements mapped | 38 / 38 |
| Plans created | 9 (3 Phase 1 + 6 Phase 2) |
| Plans completed | 6 (3 Phase 1 + 3 Phase 2) |

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 02-read-tools-schema-discovery P01 | 3min | 3 tasks | 6 files |
| Phase 02-read-tools-schema-discovery P02 | 6min | 2 tasks | 6 files |
| Phase 02 P03 | 4min | 2 tasks | 7 files |

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
- [ ] Phase 2 Plan 04: keeping_list_entries + CI initialize-handshake smoke
- [ ] Phase 2 Plan 05: scripts/probe-live.ts
- [ ] Phase 2 Plan 06: human-verify probe-live results + commit LIVE-API.md

### Blockers

None.

---

## Session Continuity

**To resume after a break:**

1. Read `.planning/ROADMAP.md` — phase goals and success criteria
2. Read `.planning/PROJECT.md` — core value and locked decisions
3. Read `.planning/REQUIREMENTS.md` — requirement IDs and traceability
4. Read `.planning/phases/02-read-tools-schema-discovery/02-03-SUMMARY.md` for the last completed plan
5. Continue with `.planning/phases/02-read-tools-schema-discovery/02-04-PLAN.md`

**Last session:** 2026-06-10T11:23:48.450Z
**Stopped at:** Completed 02-03-PLAN.md
**Resume file:** `.planning/phases/02-read-tools-schema-discovery/02-04-PLAN.md`
**Next action:** `/gsd:execute-phase 2` (or resume at Plan 02-04)

---
*State initialized: 2026-06-09 after roadmap creation*
*Last updated: 2026-06-10 after Phase 2 Plan 03 completion*
