---
phase: 02-read-tools-schema-discovery
plan: 06
subsystem: human-verify-and-contract-fix
tags: [human-verify, probe-live, openapi-discovery, contract-fix, debug-session, anonymisation, d-32-r, d-33-r, d-34-r, d-35-r]

# Dependency graph
requires:
  - phase: 02-read-tools-schema-discovery
    plan: 05
    provides: "scripts/probe-live.ts + npm run probe-live wiring + anonymise() walker + LIVE-API.md emitter + Q1 contingency raw-fetch probe."
provides:
  - "test/fixtures/time-entry-response.sample.json: anonymised live time-entry sample (2026-05-29), all D-35-R denylist keys redacted to '[REDACTED]', numeric IDs and timestamps preserved as opaque tokens."
  - ".planning/research/keeping-openapi.json: verbatim mirror of Keeping's published OpenAPI 3.x spec — canonical contract source for all future phases."
  - ".planning/research/LIVE-API-FINDINGS.md: hand-curated ground-truth delta document; replaces the gitignored LIVE-API.md as the audit-safe canonical findings record."
  - ".planning/REQUIREMENTS.md: TIMER-01 row updated — verified-in-scope per D-32-R, split as Phase 2.5 (status read) + Phase 3 (start/stop/resume writes)."
  - ".planning/phases/02-read-tools-schema-discovery/02-CONTEXT.md: D-32, D-34, D-35 superseded by -R revisions; D-29 clarified for numeric ids."
  - "src/keeping/client.ts, src/keeping/types.ts, src/keeping/errors.ts, src/tools/{me,projects,tasks,entries-list}.ts, scripts/probe-live.ts: rewritten against OpenAPI ground truth (D-34-R path strategy, D-35-R denylist)."
  - "test/keeping/client.test.ts, test/scripts/anonymise.test.ts, test/tools/{me,organisations,projects,tasks,entries-list}.test.ts: mocks rewritten against ground-truth shapes."
  - ".planning/debug/phase-2-api-contract.md: debug session audit trail."
affects: [Phase 2.5 (new — keeping_timer_status read tool), Phase 3 (writes start/stop/resume; consumes the corrected fixture)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OpenAPI-anchored contract discovery: when an API's published docs are JS-rendered (Redoc) and resist scraping, fetch the underlying openapi.json directly. Mirror it into `.planning/research/` so future phases reference a stable local copy."
    - "Debug-session-driven contract fix: when a planned execution gate (human-verify) surfaces a fundamental design error, halt the plan, open `/gsd-debug`, and let the debug session drive the coordinated rewrite. Audit trail lives in `.planning/debug/<slug>.md`."
    - "Defence-in-depth anonymisation upgrade (D-35-R): broaden the denylist beyond observed-sensitive into identity + behavioural-leakage guards. Cost of over-redaction is zero; cost of under-redaction is leaking real business text into git."
    - "Two-step fixture commit safety gate: `PROBE_WRITE_FIXTURE=1` env var must be explicitly set before `probe-live` overwrites the committed fixture. Prevents accidental fixture-overwrite on routine reruns."
    - "Audit-trail-preserving CONTEXT revision: superseded decisions keep their original text in CONTEXT.md tagged `(SUPERSEDED N by D-N-R)`, with the revised decision in a new `## Revisions` section. Avoids destroying the planning history while still locking the new contract."

key-files:
  created:
    - "test/fixtures/time-entry-response.sample.json"
    - ".planning/research/keeping-openapi.json"
    - ".planning/research/LIVE-API-FINDINGS.md"
    - ".planning/debug/phase-2-api-contract.md"
    - ".planning/phases/02-read-tools-schema-discovery/02-06-SUMMARY.md"
  modified:
    - ".planning/REQUIREMENTS.md"
    - ".planning/phases/02-read-tools-schema-discovery/02-CONTEXT.md"
    - "src/keeping/client.ts"
    - "src/keeping/types.ts"
    - "src/keeping/errors.ts"
    - "src/tools/me.ts"
    - "src/tools/projects.ts"
    - "src/tools/tasks.ts"
    - "src/tools/entries-list.ts"
    - "scripts/probe-live.ts"
    - "test/keeping/client.test.ts"
    - "test/scripts/anonymise.test.ts"
    - "test/tools/entries-list.test.ts"
    - "test/tools/me.test.ts"
    - "test/tools/organisations.test.ts"
    - "test/tools/projects.test.ts"
    - "test/tools/tasks.test.ts"
    - ".gitignore"

key-decisions:
  - "D-32-R (replaces D-32): Timer functionality is in v1 scope via the time-entries lifecycle. The v1 API exposes /{org_id}/time-entries/last + `ongoing` flag for read, plus POST /{id}/stop and POST /{id}/resume for write. Split as Phase 2.5 (keeping_timer_status read tool) + Phase 3 (start/stop/resume writes) to keep the dry-run-by-default pattern consistent for writes."
  - "D-33-R (clarifies D-33): Phase 2 still ships no timer-facing tool. The new Phase 2.5 is the inclusion mechanism for the read-only status tool; D-33's 'timer tools ship with start/stop in Phase 3' constraint applies only to the write tools."
  - "D-34-R (replaces D-34): The 'no field renaming' raw pass-through rule survives. The wrong assumption was on the request path strategy (`/v1/organisations/{org_id}/...` is wrong — real path is `/v1/{org_id}/...`) and on `KeepingUser` typing. Real `/users/me` returns `{ user: { id, first_name, surname, code, role, state } }` — no `name`, no `email`, wrapped. `KeepingOrg.id` is numeric. `KeepingClient.request<T>()` now prepends only BASE; tools build the `/{orgId}/<path>` segment themselves. `keeping_list_entries` dispatches single-day (`?date=YYYY-MM-DD`) vs multi-day (`/report/time-entries?from=&to=`) based on input."
  - "D-35-R (replaces D-35): The original six-key denylist (`description, project_name, task_name, client_name, user_name, user_email`) was authored without live evidence — none of those keys exist in real responses. Real sensitive fields: `note`, `first_name`, `surname`. New denylist is the defensive 15-key set covering observed-sensitive + identity defence-in-depth (`code`, `email`, `name`, `user_name`, `user_email`, `client_name`, `project_name`, `task_name`, `description`) + behavioural-leakage (`purpose`, `external_references`). Numeric IDs (`id`, `user_id`, `project_id`, `task_id`, `tag_ids`) are NOT redacted — opaque tokens, not PII."
  - "Q1 (RESOLVED): the global `/v1/users/me` path returns 404; the org-scoped `/{orgId}/users/me` returns 200. `KeepingClient.me()` resolves the org id first, then calls `/{orgId}/users/me`. Wrapper `{ user: { ... } }` preserved verbatim per D-34-R."
  - "LIVE-API.md generator now scrubs raw response values — only top-level keys are embedded. The path is also gitignored as defence-in-depth. The canonical findings record is `.planning/research/LIVE-API-FINDINGS.md` (hand-curated, never embeds raw bodies)."
  - "`PROBE_WRITE_FIXTURE=1` env gate retained in scripts/probe-live.ts as a deliberate two-step safety. Routine reruns of `npm run probe-live` (e.g. for re-discovery) will NOT overwrite the committed fixture unless the developer explicitly opts in."

patterns-established:
  - "When a published API doc is JS-rendered (Redoc/Swagger UI), look for the underlying openapi.json or swagger.json reference in the HTML source. Mirror the spec locally for future phases."
  - "Halt-on-contract-mismatch: when human-verify gates reveal a planned contract is fundamentally wrong, halt the plan and open a debug session rather than patching inline. The debug session produces the coordinated rewrite + audit trail."
  - "Audit-trail-preserving CONTEXT revisions: keep originals in place tagged SUPERSEDED, introduce -R successors in a `## Revisions` section. Reviewers can trace the full decision lineage without breaking blame/diff archaeology."

requirements-completed:
  - "READ-02 (raw-shape pass-through schema discovery) — now satisfied by the committed anonymised fixture and the corrected `keeping_list_entries` tool. Fixture exposes the full field set Phase 3 write tools need."

# Metrics
duration: ~3h
completed: 2026-06-11
---

# Phase 2 Plan 06: Human-Verify Probe + Contract Fix Summary

**Plan 02-06 ran the live `npm run probe-live` against a real `KEEPING_TOKEN` and discovered that the Phase 2 production contract was wrong on six axes vs the published OpenAPI spec. The gate triggered (a) an immediate hotfix for `/organisations` payload unwrap (`3fcf1f5`), (b) iterative probe-discovery commits leading to the mirror of `developer.keeping.nl/openapi.json` as ground truth (`f4b6771`), (c) a `/gsd-debug` session that drove the coordinated 17-file rewrite of `KeepingClient`, types, errors, four tools, probe-live anonymisation, and all corresponding tests against the corrected mocks (`23c79fe`), and (d) the final anonymised fixture commit captured from a non-empty workday (`d2d92e3`). Phase 2's planned artefacts (anonymised fixture + REQUIREMENTS TIMER-01 update + canonical schema-discovery record) all landed; the LIVE-API.md path was demoted to gitignored status with `.planning/research/LIVE-API-FINDINGS.md` taking over as the audit-safe canonical findings record. `keeping_timer_status` (read-only timer view) is carved out as a new Phase 2.5 per D-32-R. 67/67 unit tests pass against the corrected mocks (was 62/62 against wrong-shape mocks); typecheck and lint clean.**

## Performance

- **Duration:** ~3 hours (planned: ~10 min human checkpoint)
- **Completed:** 2026-06-11
- **Commits landed:** 5 (`3fcf1f5`, `f4b6771`, `23c79fe`, `fa3decf`, `d2d92e3`)
- **Files touched:** 18 modified + 5 created (1 fixture, 2 research docs, 1 debug audit, 1 SUMMARY)

## Planned vs Actual

**Planned (per 02-06-PLAN.md):**
1. User runs `npm run probe-live` with real `KEEPING_TOKEN`.
2. Three files reviewed and committed: `LIVE-API.md`, `test/fixtures/time-entry-response.sample.json`, `REQUIREMENTS.md` (TIMER-01 row).
3. Optional: src/keeping/client.ts switched to org-scoped `/users/me` if probe returned 404 on global path.

**Actual outcome:** the first probe-live run failed with `orgs.map is not a function` because `/organisations` returned a `{ organisations: [...] }` wrapper, not a bare array (commit `3fcf1f5` hotfix). Subsequent probes against every plausible nested path under `/v1/organisations/{org_id}/...` returned 404. Discovery of the published OpenAPI spec at `developer.keeping.nl/openapi.json` revealed the contract was wrong at the level of:

- **Base path strategy:** `/v1/{org_id}/...` (no `/organisations/` segment under `/v1`).
- **Collection name:** `time-entries` (hyphen), not `time_entries` (underscore).
- **List query params:** `?date=YYYY-MM-DD` (single day, non-paginated), not `?from=&to=` range. Multi-day ranges use a separate endpoint at `/report/time-entries`.
- **`/users/me` shape:** wrapped `{ user: { id, first_name, surname, code, role, state } }` — no `name`, no `email`.
- **Timer resource:** the v1 API exposes the full timer lifecycle via `/{org_id}/time-entries/last`, the `ongoing` flag, `POST /{id}/stop`, and `POST /{id}/resume`. D-32's "defer timer to Phase 3" was wrong by construction.
- **Anonymisation denylist:** none of D-35's six keys exist in real responses. Real sensitive fields are `note`, `first_name`, `surname`.

These findings made Plan 02-06's original three-file commit impossible: shipping the fixture under the wrong denylist would leak the real `note` text into git; the LIVE-API.md generator embedded raw response bodies; the production tools all pointed at endpoints that 404'd. The plan halted (commit `f4b6771`) and a `/gsd-debug` session (`fa3decf`) drove the coordinated rewrite (`23c79fe`). The fixture was finally committed (`d2d92e3`) after a re-probe with `PROBE_FROM=2026-05-29` produced a non-empty time-entry sample and the D-35-R denylist redacted the sensitive fields cleanly.

## Accomplishments

### Probe execution (the planned task)

- **Real `KEEPING_TOKEN` validated** against `https://api.keeping.nl/v1`. Org `47666` ("Red Square") resolved automatically (single-org account).
- **Five live endpoints confirmed 200:** `/v1/organisations`, `/v1/47666/users/me`, `/v1/47666/time-entries?date=YYYY-MM-DD`, `/v1/47666/time-entries/last`.
- **Sample time-entry shape captured** (from 2026-05-29 workday). All 17 fields present: `id, user_id, date, purpose, approval_status, project_id, task_id, tag_ids, note, external_references, start, end, hours, ongoing, locked, is_direct_hours, included_in_total`.

### Contract realignment (the unplanned but necessary work)

- **`KeepingClient.request<T>()` rewrote:** now prepends only `BASE = "https://api.keeping.nl/v1"`. Tools build the `/{orgId}/<path>` segment themselves.
- **`KeepingClient.me()` rewrote:** resolves the org id first, calls `/{orgId}/users/me`, preserves the `{ user: {...} }` wrapper verbatim.
- **`KeepingClient.organisations()` retains** the post-hotfix wrapper unwrap (commit `3fcf1f5`).
- **`KeepingOrg.id` typed `number`;** `resolveOrgId()` coerces via `String(o.id)` at the env / input boundary.
- **`MultiOrgError` accepts** `id: string | number`.
- **`keeping_list_entries` dispatches** single-day (`?date=YYYY-MM-DD`) → `/{orgId}/time-entries`, multi-day → `/{orgId}/report/time-entries?from=&to=`. `limit` becomes a post-fetch truncation guard.
- **`keeping_projects` and `keeping_tasks`** drop the `/organisations/` prefix.
- **`keeping_me`** passes through the wrapped `{ user: {...} }` shape.
- **`ANONYMISE_KEYS`** broadened to the 15-key D-35-R defensive set.

### Schema-discovery artefacts (the originally-planned outputs)

- **`test/fixtures/time-entry-response.sample.json`** committed. Shape: `{ time_entries: [<one anonymised entry>], meta: { user_id, date } }`. All D-35-R denylist keys → `"[REDACTED]"`. Numeric IDs and timestamps preserved as opaque tokens.
- **`.planning/research/keeping-openapi.json`** committed — verbatim mirror of Keeping's OpenAPI 3.x spec, the canonical contract source.
- **`.planning/research/LIVE-API-FINDINGS.md`** committed — hand-curated ground-truth delta. NO raw response bodies. Designed as required reading for any future phase that needs to touch the Keeping API.
- **`.planning/research/LIVE-API.md`** generated by probe-live but **gitignored** — its body-embedding generator was deemed unsafe for committed artefacts.
- **`.planning/REQUIREMENTS.md` TIMER-01 row** updated: `Phase 2.5 (status) / Phase 3 (start/stop/resume) | Pending — verified-in-scope 2026-06-11 (D-32-R): backed by GET /{org_id}/time-entries/last + ongoing flag + POST /{id}/stop + POST /{id}/resume`.

### CONTEXT revisions

`02-CONTEXT.md` gained a `## Revisions` section. Original decisions retained in place tagged `(SUPERSEDED 2026-06-11 by D-N-R)`; new `-R` decisions cite OpenAPI ground truth + `.planning/research/LIVE-API-FINDINGS.md`. Decisions revised:

- **D-32 → D-32-R:** Timer functionality is in v1 scope (the original "may defer" assumption was wrong).
- **D-33 → D-33-R:** Timer-tool split as Phase 2.5 (read) + Phase 3 (writes).
- **D-34 → D-34-R:** Path strategy is `/v1/{orgId}/...`; `KeepingUser` matches observed wrapped shape; `KeepingOrg.id` is numeric.
- **D-35 → D-35-R:** Anonymise denylist replaced by the defensive 15-key set.
- **D-29 (clarification):** numeric-id handling spelled out (string coercion at the boundary).

### Debug session audit trail

`.planning/debug/phase-2-api-contract.md` captures the full investigation, eliminated hypotheses, evidence chain, and resolution. Status set to `resolved`. Marked as the reference for future "why did Phase 2's contract change" archaeology.

## Commits Landed

| Commit | Subject | Role |
|--------|---------|------|
| `3fcf1f5` | `fix(02-06): unwrap /organisations response shape` | Immediate hotfix; preserved as ground-truth-correct (`/organisations` returns `{ organisations: [...] }`). |
| `f4b6771` | `discover(02-06): capture Keeping v1 API ground truth, halt before client rewrite` | OpenAPI spec mirror + LIVE-API-FINDINGS.md + probe-live discovery improvements + safety gates on fixture/LIVE-API.md writes. |
| `23c79fe` | `fix(02): align Phase 2 with Keeping v1 OpenAPI ground truth` | The 17-file coordinated rewrite: client + types + errors + four tools + probe-live denylist + all tests + CONTEXT D-32-R..D-35-R + REQUIREMENTS TIMER-01. |
| `fa3decf` | `docs(debug): track phase-2-api-contract session` | Debug session audit trail. |
| `d2d92e3` | `test(02): commit anonymised time-entries sample fixture` | Final non-empty anonymised fixture from 2026-05-29 workday. |

All five pushed to `origin/main`.

## Verification

- `npx tsc --noEmit` → 0 errors.
- `npx biome check .` → 0 errors (28 files checked).
- `npx vitest run` → **67/67 tests pass across 9 files** (was 62/62; +5 D-34-R / D-35-R coverage).
- Live API → every read tool's endpoint returns 200 against the real token.
- Fixture grep for known PII text strings (real name, project text, note text) → 0 matches.
- LIVE-API-FINDINGS.md grep for known PII text strings → 0 matches.
- Raw capture path `.planning/research/.live-capture-raw.json` → present on disk locally, gitignored, not in any commit.

## Deviations from Plan

**Major.** The plan assumed Plan 02-06 would be a ~10 min human-checkpoint with a three-file commit. The plan's `must_haves.truths` list includes phrases like "Either: TIMER-01 row updated to 'verified — endpoint <path> — ships in Phase 3' OR 'deferred — 404 on all probes'" — neither of these reflects the actual outcome where timer is verified-in-scope but split across Phase 2.5 + Phase 3 per D-32-R / D-33-R.

The plan's `must_haves.truths` are no longer literally satisfiable in their original wording. The substantive intent — that Plan 02-06 commits the schema-discovery artefacts and updates TIMER-01 — is satisfied; the audit trail in `02-CONTEXT.md` §Revisions, this SUMMARY, `LIVE-API-FINDINGS.md`, and `.planning/debug/phase-2-api-contract.md` together document the deviation.

The plan's optional Task 3 ("switch KeepingClient.me() to org-scoped form if probe returns 404") landed as a non-optional part of the contract rewrite. The probe DID return 404 on `/v1/users/me`, AND the org-scoped form was already wrong (`/v1/organisations/{org_id}/users/me` also 404'd). The real path was `/v1/{org_id}/users/me`.

## Issues Encountered

- **First probe crashed** with `orgs.map is not a function` (commit `3fcf1f5` resolves).
- **Original D-35 denylist** would have leaked the real `note` field text into the committed fixture. Caught before commit; fixture writes gated behind `PROBE_WRITE_FIXTURE=1` until D-35-R landed.
- **LIVE-API.md generator** embedded raw response bodies including a real Dutch business `note`. File path now gitignored; generator scrubbed to embed only top-level keys.
- **`developer.keeping.nl` is JS-rendered (Redoc)** — `WebFetch` returned empty markdown. Resolved by grepping the raw HTML for the Redoc loader's `openapi.json` URL.

## User Setup Required

Performed by the user during this plan:

- `KEEPING_TOKEN` set via `$env:KEEPING_TOKEN = "..."` in PowerShell.
- `PROBE_FROM = "2026-05-29"` to capture a non-empty time-entry sample.
- `PROBE_WRITE_FIXTURE = "1"` to authorise the final fixture overwrite.

No persistent project setup added.

## Next Plan Readiness

Phase 2 is **complete** for the original four-phase roadmap. Two follow-on workstreams:

1. **Phase 2.5 (new — `keeping_timer_status` read tool)** carved out per D-32-R / D-33-R. Single read tool, backed by `GET /{org_id}/time-entries/last` + the `ongoing` flag. Needs a ROADMAP.md insertion + planning cycle.
2. **Phase 3 (writes — `keeping_create_entry`, `keeping_update_entry`, `keeping_start_timer`, `keeping_stop_timer`, `keeping_resume_timer`)** unblocked. The corrected fixture is the schema-lockdown source. The OpenAPI spec at `.planning/research/keeping-openapi.json` is the canonical reference for POST/PATCH body field names — eliminating the originally-planned Phase 2 → Phase 3 hard dependency on "read tools must run to discover field names" (the spec already discloses them).

## TDD Gate Compliance

Plan 02-06 was `autonomous: false` (human-verify, no TDD directive). The unplanned contract-fix detour was driven through `/gsd-debug` rather than `/gsd-execute-phase`, so the project-wide TDD-mode-off setting applied; the test rewrites landed alongside the production rewrites in commit `23c79fe` rather than as a RED → GREEN cycle. All 67 tests pass.

## Self-Check

- `test/fixtures/time-entry-response.sample.json` exists and is anonymised → FOUND, verified.
- `.planning/research/keeping-openapi.json` exists → FOUND.
- `.planning/research/LIVE-API-FINDINGS.md` exists → FOUND.
- `.planning/REQUIREMENTS.md` TIMER-01 updated → confirmed.
- `02-CONTEXT.md` §Revisions exists with D-32-R, D-33-R, D-34-R, D-35-R → confirmed.
- `.planning/debug/phase-2-api-contract.md` exists with `status: resolved` → confirmed.
- All five commits in `git log --oneline` → confirmed (`3fcf1f5`, `f4b6771`, `23c79fe`, `fa3decf`, `d2d92e3`).
- `git push` reports all commits in `origin/main` → confirmed.

## Self-Check: PASSED

---
*Phase: 02-read-tools-schema-discovery*
*Plan: 02-06-human-verify-and-contract-fix*
*Completed: 2026-06-11*
