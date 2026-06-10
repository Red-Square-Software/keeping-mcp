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
- [ ] **Phase 2: Read Tools & Schema Discovery** — Server runnable via `npx keeping-mcp`; all identity, metadata, and read tools operational; live-API session locks POST body schema and probes timer endpoint; rate-limit, retry, and identity caching in place.
- [ ] **Phase 3: Write Tools + Conditional Timers** — Full CRUD (`add`, `update`, `delete`) with dry-run gate, tool annotations, Amsterdam timezone default, and `purpose` field. Timer tools shipped if Phase 2 probe returned non-404.
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
3. `package.json` contains `"mcpName": "io.github.red-square-software/keeping-mcp"`, `"bin": { "keeping-mcp": "./dist/..." }`, and the shebang works on macOS, Linux, and Windows 11 (Node resolves `.cmd` wrapper via npm).
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
- [ ] 02-03-PLAN.md — keeping_organisations (IDENT-02) + keeping_projects (META-01) + keeping_tasks (META-02) with graceful-empty for feature-disabled orgs
- [ ] 02-04-PLAN.md — keeping_list_entries raw pass-through (READ-01/02, D-34) + CI smoke upgrade (D-15 initialize handshake assertion)
- [ ] 02-05-PLAN.md — scripts/probe-live.ts (D-30..D-35) + tested anonymise() walker (D-35 step 3) + npm run probe-live entry
- [ ] 02-06-PLAN.md — autonomous:false human-verify gate: user runs probe-live, reviews LIVE-API.md + fixture for PII, updates REQUIREMENTS TIMER-01 row, commits three approved files

---

### Phase 3: Write Tools + Conditional Timers

**Goal**: Users can propose, preview, confirm, and if needed correct or delete a time entry — all through MCP tool calls — with explicit human confirmation required before any data reaches Keeping.
**Mode:** mvp
**Depends on**: Phase 2 (POST body schema confirmed via `keeping_list_entries` live session)
**Requirements**: WRITE-01, WRITE-02, WRITE-03, WRITE-04, WRITE-05, WRITE-06, WRITE-07, WRITE-08, TIMER-01, TIMER-02

**Success Criteria** (what must be TRUE):
1. Calling `keeping_add_entry` without `confirm: true` (and with `KEEPING_REQUIRE_CONFIRM=true`, the default) returns a `{ would_post: { method, url, body } }` preview and makes zero API calls — verified by a unit test with a mocked `KeepingClient.post`.
2. Calling `keeping_add_entry` with `confirm: true` posts to `POST /v1/organisations/:org_id/time_entries`, returns the created entry, and a subsequent `keeping_list_entries` call for that date confirms the entry exists — no duplicate is created on a simulated timeout (write tools do not auto-retry; they return `isError: true` with "outcome unknown — verify with keeping_list_entries before retrying").
3. `keeping_update_entry` and `keeping_delete_entry` follow the same dry-run gate; `keeping_delete_entry` dry-run returns the entry that would be deleted without calling `DELETE`; all three write tools carry `destructiveHint: true` and `idempotentHint: false` annotations.
4. When `day` is omitted, the entry defaults to today's date in `Europe/Amsterdam` timezone as a `YYYY-MM-DD` string — verified by checking the preview body when the test runs at a time that would differ from UTC (e.g., after 22:00 UTC); `Date.toISOString()` is never used for date fields.
5. Write tools accept a `purpose` field with `"billable"` and `"non_billable"` as first-class values (matching the confirmed Keeping enum); the `confirm` parameter description explicitly states it must be set by the user after reviewing the preview, not autonomously by the model.
6. *(Conditional — only if Phase 2 probe returned non-404)* `keeping_start_timer` starts a running timer and returns a `timer_id`; `keeping_stop_timer` stops it and creates the corresponding time entry; elapsed time uses `X-Server-Time-Ms` from the response header; if the probe returned 404, this criterion is marked "not applicable" and the omission is documented.

**Plans**: TBD

---

### Phase 4: Distribution & Release Pipeline

**Goal**: Anyone can discover keeping-mcp in the MCP Registry, install it with a single `npx` command on Windows or macOS/Linux, and the project owner can publish a new version by pushing a `v*` tag — no long-lived secrets required.
**Mode:** mvp
**Depends on**: Phase 3 (all tools working end-to-end before public release)
**Requirements**: DIST-04, DIST-05, REL-02, REL-03, REL-04, REL-05

**Success Criteria** (what must be TRUE):
1. `npm pack --dry-run` output contains only `dist/`, `README.md`, and `LICENSE` — no `.env`, test fixtures, `.github/`, or dotfiles appear; the `files` whitelist in `package.json` is the sole mechanism (no `.npmignore`).
2. Pushing a `v*` tag triggers the GitHub Actions release workflow; npm publishes with OIDC (no `NPM_TOKEN` secret) and a provenance attestation badge appears on the npm package page; `mcp-publisher` publishes to the MCP Registry under `io.github.red-square-software/keeping-mcp`; the `server.json` version is derived from `package.json` at publish time (not hand-edited).
3. The MCP Registry entry is discoverable at `io.github.red-square-software/keeping-mcp` and a user can add keeping-mcp to Claude Code using the registry entry.
4. README contains a Windows-specific Claude Code config block (`{ "command": "cmd", "args": ["/c", "npx", "-y", "keeping-mcp"] }`) alongside the macOS/Linux block, a step-by-step token setup section (enable developer features in Keeping prefs → generate access token), env var reference, and an example dry-run transcript.
5. README contains a prominent warning that `KEEPING_REQUIRE_CONFIRM=false` disables the dry-run gate and writes are immediate; a cold-start `npx keeping-mcp` smoke test on Windows 11 passes (no `ENOENT` or silent failure).

**Plans**: TBD
**UI hint**: no

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Scaffolding | 3/3 | Complete    | 2026-06-09 |
| 2. Read Tools & Schema Discovery | 2/6 | In Progress|  |
| 3. Write Tools + Conditional Timers | 0/? | Not started | - |
| 4. Distribution & Release Pipeline | 0/? | Not started | - |

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
| Timer Tools (conditional) | TIMER-01, TIMER-02 | 3 |
| Safety & Reliability | SAFE-01 | 1 |
| Safety & Reliability | SAFE-02, SAFE-03, SAFE-04, SAFE-05 | 2 |
| Release Pipeline | REL-01 | 1 |
| Release Pipeline | REL-02, REL-03, REL-04, REL-05 | 4 |

**Total mapped: 38/38 ✓ No orphaned requirements.**

---
*Roadmap created: 2026-06-09*
*Next: `/gsd:plan-phase 1`*
