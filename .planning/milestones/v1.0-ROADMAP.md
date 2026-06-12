# ROADMAP: keeping-mcp

**Project:** keeping-mcp — TypeScript MCP server wrapping the Keeping time-tracking API  
**Mode:** MVP (vertical slices; each phase ships a runnable increment)  
**Granularity:** Coarse (4 phases; below 5-phase cap)  
**Created:** 2026-06-09  
**Coverage:** 38/38 v1 requirements mapped (REQUIREMENTS.md header states 32; actual enumerated count is 38 — all mapped)

---

## Phase notes: timer handling

The research SUMMARY suggested 6 phases including a separate conditional Phase 4 for timers. This roadmap uses **4 phases** instead, folding timer work into Phase 3 as a "ship if probe passes" task. Rationale: the timer probe happens in Phase 2 (live API session); if the probe returns non-404, timer tool implementation is natural co-work with the other write tools in Phase 3 because they share the same `KeepingClient`, same dry-run gate pattern, and the same live-API session. A separate phase for two tools that may not ship at all adds friction without coherence benefit. TIMER-01..02 are homed in Phase 3 and explicitly marked conditional.

---

## Phases

- [x] **Phase 1: Foundation & Scaffolding** — Project skeleton, KeepingClient, stderr-only logger, fail-fast token validation, CI pipeline green. No MCP tools yet; server does not start. Observable output: CI workflow exits green on every push. (completed 2026-06-09)
- [x] **Phase 2: Read Tools & Schema Discovery** — Server runnable via `npx keeping-mcp`; all identity, metadata, and read tools operational; live-API session locked POST body schema (via the published OpenAPI spec at `developer.keeping.nl/openapi.json`, mirrored locally) and probed timer endpoint; rate-limit, retry, and identity caching in place. (completed 2026-06-11)
- [x] **Phase 2.5: Timer Status Read Tool** — Single read-only `keeping_timer_status` tool backed by `GET /{org_id}/time-entries/last` + the `ongoing` flag. Carved out per D-32-R / D-33-R: timer functionality is verified-in-scope but writes (start/stop/resume) stay in Phase 3 to keep the dry-run-by-default pattern consistent. (completed 2026-06-11)
- [x] **Phase 3: Write Tools + Conditional Timers** — Full CRUD (`add`, `update`, `delete`) with dry-run gate, tool annotations, Amsterdam timezone default, and `purpose` field. Timer write tools (`start`, `stop`, `resume`) ship alongside per D-33-R. (completed 2026-06-12)
- [ ] **Phase 4: Distribution & Release Pipeline** — `files` whitelist, `npm pack --dry-run` audit, dual-platform README, GitHub Actions OIDC publish to npm + MCP Registry on `v*` tag, provenance attestation verified.

---

## Phase Details

### Phase 1: Foundation & Scaffolding

**Goal**: The project compiles, passes CI, and the token guard works — even though no MCP tools exist yet.
**Mode:** mvp
**Depends on**: Nothing
**Requirements**: DIST-01, DIST-02, DIST-03, AUTH-01, AUTH-02, AUTH-03, SAFE-01, REL-01

**Success Criteria** (what must be TRUE):
1. `npm run build` produces a `dist/` bundle with a shebang-injected bin entry; `npx keeping-mcp` exits non-zero with a clear stderr message (`[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty`) when `KEEPING_TOKEN` is unset — no tools are invoked, no API is called.
2. Running the CI smoke test (pipe a minimal `initialize` JSON-RPC request to the built binary) produces stdout that is entirely valid JSON-RPC — zero non-JSON lines — confirming no stdout pollution.
3. `package.json` contains `"mcpName": "io.github.Red-Square-Software/keeping-mcp"`, `"bin": { "keeping-mcp": "./dist/..." }`, and the shebang works on macOS, Linux, and Windows 11 (Node resolves `.cmd` wrapper via npm).
4. GitHub repo exists at `red-square-software/keeping-mcp` with MIT `LICENSE` file committed and CI workflow passing on push to `main`.
5. A unit test asserts that no tool handler output or error path contains the string value of a known fake test token (`kp_test_FAKE`), verifying token redaction from day one.

**Plans**: 3 plans
- [x] 01-01-PLAN.md — Project skeleton: package.json (mcpName, files whitelist, MIT, Node ≥22), tsconfig, tsup, biome (noConsole), vitest, .gitignore, .gitattributes (LF), LICENSE, README placeholder; `npm install` produces lockfile.
- [x] 01-02-PLAN.md — Source files + tests: src/config.ts (Zod 4 env loader, exact D-05 message), src/logger.ts (stderr factory + token redaction), bin/keeping-mcp.ts (loadConfig + exit, no MCP boot per D-02), test/logger.test.ts (vitest D-16). Local D-13 smoke proven.
- [x] 01-03-PLAN.md — CI workflow (matrix [ubuntu, windows] × [22, 24], lint → typecheck → test → build → smoke asserting D-13 a/b/c) + first commit/push to red-square-software/keeping-mcp + `gh repo edit` (D-18 description + homepage) + branch protection on main after first green CI run (D-20).

---

### Phase 2: Read Tools & Schema Discovery

**Goal**: Users can run `npx keeping-mcp`, point a MCP client at it, and call all read, identity, and metadata tools against a real Keeping account — and the resulting `keeping_list_entries` response locks the POST body schema for Phase 3.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: AUTH-04, AUTH-05, IDENT-01, IDENT-02, IDENT-03, META-01, META-02, READ-01, READ-02, READ-03, SAFE-02, SAFE-03, SAFE-04, SAFE-05

**Success Criteria** (what must be TRUE):
1. `npx keeping-mcp` starts successfully when `KEEPING_TOKEN` is set; a MCP client can call `keeping_me` and receive the authenticated user's `user_id` per organisation, and `keeping_organisations` returns the list of orgs with feature flags (`projects`, `tasks`, `timesheet_mode`).
2. `keeping_projects` and `keeping_tasks` return results (or a graceful empty response with a human-readable note) depending on whether those features are enabled for the org — no errors when the feature is disabled.
3. `keeping_list_entries` returns time entries for a given user and date range, exposes the raw API field names in the response (no field renaming), and serves as ground-truth schema discovery: after one live call against a real entry, the exact POST body field names (`day` vs `date`, `hours` vs `starting_time/ending_time`, `purpose` enum values) are confirmed and documented in a test fixture.
4. Ten consecutive tool calls in a single session do not exceed 10 API requests (identity caching verified: `/users/me` and `/organisations` are served from cache on subsequent calls) and a simulated 429 response triggers a clean back-off rather than a failed tool call.
5. All read tools carry the `readOnlyHint: true` annotation; HTTP errors surface as `isError: true` tool responses with the Keeping error message; no tool throws an unhandled exception.
6. Timer endpoint probe result is documented (either: path confirmed, non-404 → timer tools will ship in Phase 3; or: 404 → timer tools deferred/dropped and documented in PROJECT.md).

**Plans**: 6 plans
- [x] 02-01-PLAN.md — Install Phase 2 deps (slopcheck human-verify) + .gitignore augment (D-37) + leaf contracts: src/keeping/types.ts (loose per D-34) + src/keeping/errors.ts (D-25, D-27 byte-identical messages)
- [x] 02-02-PLAN.md — KeepingClient (throttle, retry, cache, sanitisation, resolveOrgId per D-22..29) + src/server.ts + bin/keeping-mcp.ts StdioServerTransport boot + keeping_me tool + first vertical slice
- [x] 02-03-PLAN.md — keeping_organisations (IDENT-02) + keeping_projects (META-01) + keeping_tasks (META-02) with graceful-empty for feature-disabled orgs
- [x] 02-04-PLAN.md — keeping_list_entries raw pass-through (READ-01/02, D-34) + CI smoke upgrade (D-15 initialize handshake assertion)
- [x] 02-05-PLAN.md — scripts/probe-live.ts (D-30..D-35) + tested anonymise() walker (D-35 step 3) + npm run probe-live entry (completed 2026-06-10)
- [x] 02-06-PLAN.md — autonomous:false human-verify gate: user ran probe-live; planned three-file commit escalated into the contract-fix detour (CONTEXT D-32-R..D-35-R + 17-file rewrite + `keeping_timer_status` carve-out as Phase 2.5). See `02-06-SUMMARY.md`. (completed 2026-06-11)

---

### Phase 2.5: Timer Status Read Tool

**Goal**: A MCP client can call `keeping_timer_status` and receive the most-recent time entry plus a derived `is_running` boolean (from the API's `ongoing` field), without modifying any data.
**Mode:** mvp
**Depends on**: Phase 2 (KeepingClient + tool annotation pattern + read-tool error envelope)
**Requirements**: TIMER-01 (status read portion only — start/stop/resume are Phase 3)

**Success Criteria** (what must be TRUE):
1. `keeping_timer_status` returns the raw `time_entry` object from `GET /{org_id}/time-entries/last`, including a top-level `is_running` boolean derived from `time_entry.ongoing`. No field renaming on the API payload (D-34-R pass-through).
2. The tool carries `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true` annotations consistent with Phase 2 read tools.
3. The tool dispatches via the Phase 2 `KeepingClient.get<T>("/${orgId}/time-entries/last")` path — no new request-path strategy.
4. A unit test asserts the `is_running` derivation: `ongoing: true` → `is_running: true`; `ongoing: false` → `is_running: false`; missing `ongoing` → `is_running: false` (defensive default).
5. The fixture from Plan 02-06 (`test/fixtures/time-entry-response.sample.json` shape) is reused as a structural reference for the test mock.

**Plans**: 2 plans
- [x] 02.5-01-PLAN.md — Single-slice TDD: wrote 10 D-2.5-13 tests, implemented src/tools/timer-status.ts (strict raw.time_entry read + 404 graceful-empty branch + is_running===true derivation), wired registerTimerStatus into src/server.ts. See `02.5-01-SUMMARY.md`. (completed 2026-06-11)
- [x] 02.5-02-PLAN.md — Gap closure (Truth #3 / D-2.5-05a, REVIEW.md WR-01): RED two array-drift tests, then GREEN add Array.isArray(candidate) to extractTimeEntry guard so { time_entry: [] } and { time_entry: [{...}] } collapse to graceful empty.

**UI hint**: no

---

### Phase 3: Write Tools + Conditional Timers

**Goal**: Users can propose, preview, confirm, and if needed correct or delete a time entry — all through MCP tool calls — with explicit human confirmation required before any data reaches Keeping.
**Mode:** mvp
**Depends on**: Phase 2 (POST body schema confirmed via `developer.keeping.nl/openapi.json` mirror at `.planning/research/keeping-openapi.json` and the anonymised fixture at `test/fixtures/time-entry-response.sample.json`)
**Requirements**: WRITE-01, WRITE-02, WRITE-03, WRITE-04, WRITE-05, WRITE-06, WRITE-07, WRITE-08, TIMER-01 (start/stop/resume portion), TIMER-02

**Success Criteria** (what must be TRUE):
1. Calling `keeping_add_entry` without `confirm: true` (and with `KEEPING_REQUIRE_CONFIRM=true`, the default) returns a `{ would_post: { method, url, body } }` preview and makes zero API calls — verified by a unit test with a mocked `KeepingClient.post`.
2. Calling `keeping_add_entry` with `confirm: true` posts to `POST /v1/organisations/:org_id/time_entries`, returns the created entry, and a subsequent `keeping_list_entries` call for that date confirms the entry exists — no duplicate is created on a simulated timeout (write tools do not auto-retry; they return `isError: true` with "outcome unknown — verify with keeping_list_entries before retrying").
3. `keeping_update_entry` and `keeping_delete_entry` follow the same dry-run gate; `keeping_delete_entry` dry-run returns the entry that would be deleted without calling `DELETE`; all three write tools carry `destructiveHint: true` and `idempotentHint: false` annotations.
4. When `day` is omitted, the entry defaults to today's date in `Europe/Amsterdam` timezone as a `YYYY-MM-DD` string — verified by checking the preview body when the test runs at a time that would differ from UTC (e.g., after 22:00 UTC); `Date.toISOString()` is never used for date fields.
5. Write tools accept a `purpose` field with `"billable"` and `"non_billable"` as first-class values (matching the confirmed Keeping enum); the `confirm` parameter description explicitly states it must be set by the user after reviewing the preview, not autonomously by the model.
   > ⚠ **Footnote (2026-06-12, D-3-07):** The `billable`/`non_billable` wording above is preserved for historical traceability but does NOT match the real Keeping API. Per D-3-07 (CONTEXT.md), the live OpenAPI enum is `work`, `break`, `special_leave`, `unpaid_leave`, `statutory_leave`, `sick_leave`, `work_reduction`, `trip`. Phase 3 implements that 8-value enum (default `work`). The SC #5 spirit is honored — `confirm` parameter description still mandates human-set-only (D-3-12) — but the enum values differ. REQUIREMENTS.md WRITE-06 carries the full amendment text.
6. *(Conditional — only if Phase 2 probe returned non-404)* `keeping_start_timer` starts a running timer and returns a `timer_id`; `keeping_stop_timer` stops it and creates the corresponding time entry; elapsed time uses `X-Server-Time-Ms` from the response header; if the probe returned 404, this criterion is marked "not applicable" and the omission is documented.

**Plans**: 10 plans (8 original + 2 gap-closure 2026-06-12)
- [x] 03-01-PLAN.md — Foundation: rawFetch 204 fix (D-3-27), `requestWithHeaders<T>` (D-3-18), `src/keeping/date.ts` (`todayInAmsterdam` + `nowInAmsterdamHHMM`), `src/keeping/write-gate.ts` (`previewOrCall` + `classifyAmbiguous` + byte-locked `AMBIGUOUS_TEXT`), types append. TDD with 20+ tests across three test files.
- [x] 03-02-PLAN.md — `keeping_add_entry` vertical slice (13 tests, 2 commits): dry-run gate via previewOrCall, org-mode-aware body (times vs hours per D-3-08), DST-correct date default per D-3-15/D-3-26, real OpenAPI 8-value purpose enum per D-3-07. server.ts wiring deferred to 03-08. See `03-02-SUMMARY.md`. (completed 2026-06-12)
- [x] 03-03-PLAN.md — `keeping_update_entry` vertical slice (10 tests, 2 commits): PATCH partial; Zod schema OMITS `date`/`purpose`/`user_id` per OpenAPI `entry_edit_request` (Zod's default `.strip()` enforcement); undefined-skip body builder ensures only supplied fields hit the wire; same dry-run gate + ambiguous-failure envelope as add-entry. server.ts wiring deferred to 03-08. See `03-03-SUMMARY.md`. (completed 2026-06-12)
- [x] 03-04-PLAN.md — `keeping_delete_entry` vertical slice (10 tests, 2 commits): inline dry-run gate + extra GET for `would_delete` (D-3-03); confirm path proves D-3-27 204-tolerant rawFetch end-to-end (result `?? { ok: true }` wraps the null from `client.delete`); description carries the verbatim `**DESTRUCTIVE: permanently deletes the entry**` marker per D-3-11. server.ts wiring deferred to 03-08. See `03-04-SUMMARY.md`. (completed 2026-06-12)
- [x] 03-05-PLAN.md — `keeping_start_timer` vertical slice (9 tests): POST `/{orgId}/time-entries` per D-3-06 with strict `Object.keys` assertion that body OMITS `end` AND `hours`; `timer_id` extracted via verbatim three-clause `Array.isArray` guard (D-2.5-05a); DST default for `date` + `nowInAmsterdamHHMM()` for `start`.
- [x] 03-06-PLAN.md — `keeping_stop_timer` vertical slice (9 tests): PATCH `/{orgId}/time-entries/{entry_id}/stop` per D-3-05 (supersedes D-32-R's POST claim); uses new `client.requestWithHeaders<T>` to read `X-Server-Time-Ms` (TIMER-02, D-3-19); missing/invalid header falls back to `Date.now()` + `log.warn`, NOT an isError.
- [x] 03-07-PLAN.md — `keeping_resume_timer` vertical slice (10 tests): POST `/{orgId}/time-entries/{entry_id}/resume` per D-3-05 (resume = POST is unchanged from D-32-R); same `X-Server-Time-Ms` surface as stop-timer; tool does NOT assert `response.time_entry.id === input.entry_id` (Pitfall 6 — resume on new day creates a new entry with different id); 403 on locked entries = DEFINITE-FAIL via toIsErrorContent per RESEARCH Q3.
- [x] 03-08-PLAN.md — Wrap-up: wire all six write tools into `src/server.ts` + `test/server.test.ts` listTools smoke (asserts the 12-tool sorted name list); amend REQUIREMENTS.md WRITE-06 per D-3-07 (preserve original wording in footnote); add ROADMAP SC #5 footnote citing D-3-07.
- [x] 03-09-PLAN.md — Gap closure CR-01 (D-3-16 violation): added TimeoutError arm to classifyAmbiguous (`src/keeping/write-gate.ts:104`) — Node 22 `AbortSignal.timeout()` throws `DOMException(name=TimeoutError)`, not `AbortError`. New W12 test constructs real `new DOMException("timeout", "TimeoutError")`. 163/163 tests; closes VERIFICATION.md Gap #1 / Truth #2 / SC #2. (completed 2026-06-12)
- [x] 03-10-PLAN.md — Gap closure CR-02 (D-3-28 spirit violation): replaced loose HH:mm regex with strict 24-hour zero-padded form `/^([01]\d|2[0-3]):[0-5]\d$/` across add-entry.ts (start+end), update-entry.ts (start+end), start-timer.ts (start). Exported AddEntryInput/UpdateEntryInput/StartTimerInput schemas; added 43 negative+positive tests rejecting `1:30pm`/`25:00`/`9:5`/`00:00:00` and accepting `00:00`/`09:05`/`13:45`/`23:59`. 206/206 tests, tsc+biome clean. Closes VERIFICATION.md Truth #6 / SC #6. (completed 2026-06-12)

---

### Phase 4: Distribution & Release Pipeline

**Goal**: Anyone can discover keeping-mcp in the MCP Registry, install it with a single `npx` command on Windows or macOS/Linux, and the project owner can publish a new version by pushing a `v*` tag — no long-lived secrets required.
**Mode:** mvp
**Depends on**: Phase 3 (all tools working end-to-end before public release)
**Requirements**: DIST-04, DIST-05, REL-02, REL-03, REL-04, REL-05

**Success Criteria** (what must be TRUE):
1. `npm pack --dry-run` output contains only `dist/`, `README.md`, and `LICENSE` — no `.env`, test fixtures, `.github/`, or dotfiles appear; the `files` whitelist in `package.json` is the sole mechanism (no `.npmignore`).
2. Pushing a `v*` tag triggers the GitHub Actions release workflow; npm publishes with OIDC (no `NPM_TOKEN` secret) and a provenance attestation badge appears on the npm package page; `mcp-publisher` publishes to the MCP Registry under `io.github.Red-Square-Software/keeping-mcp`; the `server.json` version is derived from `package.json` at publish time (not hand-edited).
3. The MCP Registry entry is discoverable at `io.github.Red-Square-Software/keeping-mcp` and a user can add keeping-mcp to Claude Code using the registry entry.
4. README contains a Windows-specific Claude Code config block (`{ "command": "cmd", "args": ["/c", "npx", "-y", "keeping-mcp"] }`) alongside the macOS/Linux block, a step-by-step token setup section (enable developer features in Keeping prefs → generate access token), env var reference, and an example dry-run transcript.
5. README contains a prominent warning that `KEEPING_REQUIRE_CONFIRM=false` disables the dry-run gate and writes are immediate; a cold-start `npx keeping-mcp` smoke test on Windows 11 passes (no `ENOENT` or silent failure).

**Plans**: 4 plans
- [x] 04-01-PLAN.md — server.json + scripts/check-publish-shape.ts (DIST-04 allowlist guard, DIST-05 namespace binding, REL-03 placeholder shape)
- [x] 04-02-PLAN.md — README rewrite: Windows-first install UX, token setup, dry-run warning callouts (REL-04, REL-05)
- [x] 04-03-PLAN.md — .github/workflows/release.yml: tag-triggered OIDC publish to npm + MCP Registry with jq version injection (DIST-04 enforcement, REL-02, REL-03)
- [x] 04-04-PLAN.md — v1.0.1 SHIPPED to npm + MCP Registry with sigstore provenance; cold-start smoke verified (DIST-05 end-to-end, REL-02 end-to-end, REL-05 cold-start) — completed 2026-06-12
**UI hint**: no

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Scaffolding | 3/3 | Complete    | 2026-06-09 |
| 2. Read Tools & Schema Discovery | 6/6 | Complete    | 2026-06-11 |
| 2.5. Timer Status Read Tool | 2/2 | Complete   | 2026-06-11 |
| 3. Write Tools + Conditional Timers | 10/10 | Implementation + both gap closures complete (CR-01 via 03-09, CR-02 via 03-10); awaiting verifier re-pass | 2026-06-12 |
| 4. Distribution & Release Pipeline | 4/4 | Plans complete; v1.0.1 SHIPPED to npm + MCP Registry; awaiting verifier | 2026-06-12 |

---

## Coverage Map

| Category | Requirements | Phase |
|----------|-------------|-------|
| Distribution | DIST-01, DIST-02, DIST-03 | 1 |
| Distribution | DIST-04, DIST-05 | 4 |
| Authentication | AUTH-01, AUTH-02, AUTH-03 | 1 |
| Authentication | AUTH-04, AUTH-05 | 2 |
| Identity Tools | IDENT-01, IDENT-02, IDENT-03 | 2 |
| Metadata Tools | META-01, META-02 | 2 |
| Read Tools | READ-01, READ-02, READ-03 | 2 |
| Write Tools | WRITE-01..08 | 3 |
| Timer Tools (status read) | TIMER-01 (read portion) | 2.5 |
| Timer Tools (writes) | TIMER-01 (start/stop/resume), TIMER-02 | 3 |
| Safety & Reliability | SAFE-01 | 1 |
| Safety & Reliability | SAFE-02, SAFE-03, SAFE-04, SAFE-05 | 2 |
| Release Pipeline | REL-01 | 1 |
| Release Pipeline | REL-02, REL-03, REL-04, REL-05 | 4 |

**Total mapped: 38/38 ✓ No orphaned requirements.**

---
*Roadmap created: 2026-06-09*
*Last updated: 2026-06-12 — Phase 4 (distribution & release pipeline) planned: 4 plans, 3 waves
