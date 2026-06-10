# Requirements: keeping-mcp

**Defined:** 2026-06-08
**Core Value:** A Claude Code (or any MCP client) user can log a reviewed time entry into their Keeping account through a single tool call, with explicit confirmation before anything is written.

## v1 Requirements

### Distribution

- [x] **DIST-01**: Server is installable and runnable via `npx keeping-mcp` with no prior global install
- [x] **DIST-02**: npm package name is `keeping-mcp` and `package.json` contains `"mcpName": "io.github.red-square-software/keeping-mcp"` for MCP Registry verification
- [x] **DIST-03**: Bin entry has a shebang and works cross-platform (macOS, Linux, Windows 11)
- [ ] **DIST-04**: Published artifact uses a `"files"` whitelist in `package.json` (no `.npmignore`) so secrets, fixtures, and dotfiles cannot leak via `npm publish`
- [ ] **DIST-05**: Server is registered in the official MCP Registry under namespace `io.github.red-square-software/keeping-mcp`

### Authentication & Configuration

- [x] **AUTH-01**: Server reads personal access token from `KEEPING_TOKEN` env var
- [x] **AUTH-02**: Missing or empty `KEEPING_TOKEN` fails fast at startup with a clear stderr message before the stdio transport connects
- [x] **AUTH-03**: Token value is never written to stdout, never echoed in tool responses, never included in error messages, and never logged at any level
- [x] **AUTH-04**: `KEEPING_REQUIRE_CONFIRM` env var defaults to `true`; setting it to `false` allows writes without per-call `confirm: true`
- [x] **AUTH-05**: Optional `KEEPING_ORG_ID` env var pins all operations to one organisation when set

### Identity Tools

- [x] **IDENT-01**: `keeping_me` tool returns the authenticated user's `user_id` per organisation
- [ ] **IDENT-02**: `keeping_organisations` tool returns the list of organisations the token can access, including each org's enabled feature flags (`projects`, `tasks`, `timesheet_mode`)
- [x] **IDENT-03**: When `KEEPING_ORG_ID` is unset and the token only has access to one org, write tools auto-use that org id; when multiple, write tools require an explicit `organisation_id` input

### Metadata Tools

- [ ] **META-01**: `keeping_projects` tool returns the list of projects for a given organisation (gracefully empty if the projects feature is disabled)
- [ ] **META-02**: `keeping_tasks` tool returns the list of tasks for a given organisation (gracefully empty if the tasks feature is disabled)

### Read Tools

- [ ] **READ-01**: `keeping_list_entries` tool returns time entries for a given user and date range
- [ ] **READ-02**: `keeping_list_entries` exposes the raw API field names in its response so it can serve as the live-API schema-discovery tool that unblocks write tools
- [x] **READ-03**: Read tools are annotated `readOnlyHint: true`

### Write Tools

- [ ] **WRITE-01**: `keeping_add_entry` tool creates a new time entry for the authenticated user
- [ ] **WRITE-02**: `keeping_update_entry` tool edits an existing time entry owned by the authenticated user
- [ ] **WRITE-03**: `keeping_delete_entry` tool deletes an existing time entry owned by the authenticated user
- [ ] **WRITE-04**: All write tools accept a `confirm: boolean` input; when `KEEPING_REQUIRE_CONFIRM` is `true` and `confirm !== true`, the tool returns a preview (`would_post: { method, url, body }`) without calling the API
- [ ] **WRITE-05**: Write tools never auto-retry on network errors; on ambiguous failure they return `isError: true` with "outcome unknown — verify with keeping_list_entries before retrying"
- [ ] **WRITE-06**: Write tools accept a `purpose` field with `billable` and `non_billable` as first-class values (so Jortt invoicing surfaces the correct hours)
- [ ] **WRITE-07**: Write tools annotate `destructiveHint: true` and `idempotentHint: false`; `keeping_delete_entry` additionally annotates the destructive nature in its description
- [ ] **WRITE-08**: Date fields default to today in `Europe/Amsterdam`, not UTC; output is `YYYY-MM-DD` strings (never `Date.toISOString()`)

### Timer Tools (conditional)

- [ ] **TIMER-01**: At Phase 2 start, the server probes the suspected timer endpoint with a real token; if the API supports running timers, ship `keeping_start_timer` and `keeping_stop_timer` in v1; if not, drop them and document as deferred
- [ ] **TIMER-02**: When shipped, timer tools use `X-Server-Time-Ms` from response headers to compute elapsed time correctly

### Safety & Reliability

- [x] **SAFE-01**: All log output goes to stderr; no `console.log` or library write to stdout (verified by a CI smoke test that pipes an `initialize` request and asserts stdout is valid JSON-RPC)
- [x] **SAFE-02**: HTTP client respects Keeping's 120 req/min rate limit via a proactive token bucket (2 req/s, burst 10)
- [x] **SAFE-03**: Read requests retry on 429 honouring `Retry-After`; write requests do not retry
- [x] **SAFE-04**: HTTP errors are surfaced as `isError: true` tool responses with the Keeping error message; the tool never throws
- [x] **SAFE-05**: `/users/me` and `/organisations` responses are cached in-memory for server lifetime so a long session does not exhaust the rate limit on repeated identity lookups

### Release Pipeline & Docs

- [x] **REL-01**: GitHub repo at `red-square-software/keeping-mcp` with MIT license file
- [ ] **REL-02**: GitHub Actions release workflow triggers on `v*` tags, publishes to npm with provenance via OIDC (no `NPM_TOKEN` secret), and publishes to the MCP Registry via `mcp-publisher login github-oidc`
- [ ] **REL-03**: `server.json` version is derived from `package.json` at release time (not hand-edited)
- [ ] **REL-04**: README documents token setup (enable developer features in Keeping prefs → generate access token), Claude Code config snippets for **both** Windows (`{ "command": "cmd", "args": ["/c", "npx", "-y", "keeping-mcp"] }`) and macOS/Linux (`{ "command": "npx", "args": ["-y", "keeping-mcp"] }`), env var reference, and the dry-run workflow with an example transcript
- [ ] **REL-05**: README front-and-centre warns that setting `KEEPING_REQUIRE_CONFIRM=false` disables dry-run and writes immediately

## v2 Requirements

Deferred to a future release. Tracked but not in current roadmap.

### Auth & Distribution

- **AUTHv2-01**: OAuth client flow for redistributable integrations
- **DISTv2-01**: Provenance + SLSA attestation badge in README

### Reporting & UX

- **UXv2-01**: Late-night session heuristic ("before 06:00 Amsterdam → did you mean yesterday?")
- **UXv2-02**: `outputSchema` on all tools once wire format is fully locked
- **UXv2-03**: Admin tools (write on behalf of other users — requires team scope)
- **REPv2-01**: Reporting / aggregation tools (sum hours by project, week, etc.)
- **UXv2-04**: MCP Elicitation-based confirmation flow when more MCP clients support it

## Out of Scope

| Feature | Reason |
|---------|--------|
| Hosted / remote MCP server | Server runs locally next to user's MCP client; no hosting plane needed |
| Jortt invoice generation | Keeping already has a native Jortt integration that converts logged hours to invoices |
| Bulk CSV import | v1 is "log this session's hours"; bulk import is a different workflow |
| Python SDK port | TypeScript only for v1 |
| GUI / web dashboard | MCP tools are the interface |
| Toggl/Harvest/Clockify support | Separate ecosystem; existing MCP servers cover them |
| Fuzzy project/task name resolution inside the server | Belongs in the client (the LLM); server stays a thin, predictable wrapper |
| Auto-confirm writes without explicit `confirm: true` | Defeats the core safety property of dry-run-by-default writes |

## Traceability

Phase mapping populated during roadmap creation (2026-06-09).

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIST-01 | Phase 1 | Complete |
| DIST-02 | Phase 1 | Complete |
| DIST-03 | Phase 1 | Complete |
| DIST-04 | Phase 4 | Pending |
| DIST-05 | Phase 4 | Pending |
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 2 | Complete |
| AUTH-05 | Phase 2 | Complete |
| IDENT-01 | Phase 2 | Complete |
| IDENT-02 | Phase 2 | Pending |
| IDENT-03 | Phase 2 | Complete |
| META-01 | Phase 2 | Pending |
| META-02 | Phase 2 | Pending |
| READ-01 | Phase 2 | Pending |
| READ-02 | Phase 2 | Pending |
| READ-03 | Phase 2 | Complete |
| WRITE-01 | Phase 3 | Pending |
| WRITE-02 | Phase 3 | Pending |
| WRITE-03 | Phase 3 | Pending |
| WRITE-04 | Phase 3 | Pending |
| WRITE-05 | Phase 3 | Pending |
| WRITE-06 | Phase 3 | Pending |
| WRITE-07 | Phase 3 | Pending |
| WRITE-08 | Phase 3 | Pending |
| TIMER-01 | Phase 3 | Pending |
| TIMER-02 | Phase 3 | Pending |
| SAFE-01 | Phase 1 | Complete |
| SAFE-02 | Phase 2 | Complete |
| SAFE-03 | Phase 2 | Complete |
| SAFE-04 | Phase 2 | Complete |
| SAFE-05 | Phase 2 | Complete |
| REL-01 | Phase 1 | Complete |
| REL-02 | Phase 4 | Pending |
| REL-03 | Phase 4 | Pending |
| REL-04 | Phase 4 | Pending |
| REL-05 | Phase 4 | Pending |

**Coverage:**

- v1 requirements: 38 total (note: REQUIREMENTS.md header originally stated 32; actual enumerated count is 38; timer pair is conditional on Phase 2 API probe)
- Mapped to phases: 38 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-08*
*Last updated: 2026-06-09 — traceability table populated by roadmapper*
