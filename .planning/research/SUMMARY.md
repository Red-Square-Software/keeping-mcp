# Project Research Summary

**Project:** keeping-mcp
**Domain:** TypeScript MCP server — HTTP REST API wrapper for Keeping time-tracking (npm, stdio transport)
**Researched:** 2026-06-08
**Confidence:** MEDIUM-HIGH (stack HIGH, architecture HIGH, pitfalls HIGH, features MEDIUM due to unparseable Keeping API SPA)

## Executive Summary

keeping-mcp is a single-user, local-stdio MCP server that wraps the Keeping time-tracking REST API (api.keeping.nl). The MCP TypeScript SDK ecosystem is mature and opinionated: `@modelcontextprotocol/sdk ^1.29.0` with `McpServer.registerTool()`, `zod ^3.25`, `tsup` for ESM bundling, and `vitest` for tests are the settled choices. The distribution path — npm trusted publishing via GitHub Actions OIDC on a version tag, followed by a `mcp-publisher` publish to the official MCP registry using the same OIDC token — is fully documented and does not require any long-lived secrets. Node 22 is the correct runtime target (Node 20 reached EOL 2026-04-30). The architecture is a clean 5-layer stack: entrypoint validates env and wires stdio, server.ts registers tools, tool handlers contain dry-run logic, KeepingClient owns HTTP/rate-limiting/caching, and native fetch handles wire transport.

The dominant constraint across all four research areas is the **unknown Keeping API schema**. The Keeping developer documentation SPA was not parseable during research; the POST body field names for time entries (`day` vs `date`, `hours` vs `starting_time`/`ending_time`, the `purpose` enum) are best-guesses from search snippets, not confirmed from docs. This creates a hard sequencing constraint: `keeping_list_entries` must be implemented and run against a real token before `keeping_add_entry` POST body logic is locked. Read tools must ship before write tools — not as a best-practice choice, but as a schema discovery dependency. The timer API (start/stop) existence is highly probable (the `X-Server-Time-Ms` response header has no purpose without server-side timer state) but path-unverified; it must be probed with a 404 check before timer tools are included in v1.

The five risks that require active mitigation are: (1) stdout pollution corrupting the JSON-RPC stream — the single most common MCP server failure mode, must be eliminated in Phase 1 scaffolding; (2) Windows-specific `npx` failure requiring a `cmd /c npx` wrapper in Claude Code config; (3) the `confirm: true` parameter being passed autonomously by the model without human review; (4) write retries creating duplicate billable entries on network timeout; (5) GitHub Actions OIDC misconfiguration silently falling back to classic npm token auth. All five have clear prevention strategies and can be addressed proactively at their respective phases.

## Key Findings

### Recommended Stack

Stack locked by PROJECT.md decisions and confirmed by research. No open choices remain at the major-technology level.

**Core technologies (version-pinned):**

- `@modelcontextprotocol/sdk ^1.29.0` — MCP protocol, stdio transport, tool registration. Stable v1.x; v2.0-alpha not production-ready.
- `TypeScript ^5.8.0` with `"module": "Node16"`, `"moduleResolution": "Node16"`.
- `Node.js >=22.0.0` — Active LTS until 2027-04-30; stable native `fetch`.
- `zod ^3.25.0` — tool input/output schemas; below 3.25 fails at runtime with SDK 1.x.
- `p-retry ^6.2.1` + `p-throttle ^5.0.0` — exponential backoff for read 5xx/429 + client-side proactive token bucket for Keeping's 120 req/min cap.
- `tsup` — ESM bundle with shebang injection for the `npx` bin entry.
- `vitest` — ESM-native test runner; SDK's `InMemoryTransport` for in-process protocol tests.
- `biome ^2.0` — lint + format in one binary.

**Registry-mandatory fields:**

- `package.json` must include `"mcpName": "io.github.redsquare-nl/keeping-mcp"` — registry verifies this against `server.json`; missing it fails publication.
- `server.json` version must be derived from `package.json` at publish time. Registry versions are immutable.

**Logging discipline:** stderr-only (`process.stderr.write`, `console.error`). Any `console.log` corrupts the JSON-RPC stream and breaks the client.

### Expected Features

**Must have (table stakes — every time-tracking MCP server ships these):**

- `keeping_list_entries` — read entries by date range; also the schema-discovery tool that unblocks Phase 3.
- `keeping_add_entry` — primary value delivery; dry-run-by-default is the cross-ecosystem differentiator.
- `keeping_update_entry`, `keeping_delete_entry` — fix mistakes; `destructiveHint: true` on delete.
- `keeping_projects`, `keeping_tasks` — needed to resolve ids for entry creation.
- `keeping_me`, `keeping_organisations` — identity + feature flags + `timesheet_mode` (`hours` vs `times`).
- Graceful 4xx/5xx error returns via `{ content, isError: true }`; never swallow silently; never throw.

**Should have (keeping-mcp differentiators — absent in surveyed competitors Clockify/Toggl/Harvest):**

- `purpose` field as first-class enum (`billable` | `non_billable`) — Jortt invoicing depends on it.
- `Europe/Amsterdam` timezone default for `day` field.
- Auto-detect single-org; require explicit `organisation_id` on multi-org.
- `KEEPING_REQUIRE_CONFIRM=true` dry-run default for writes.
- MCP tool annotations (`readOnlyHint: true` on reads, `destructiveHint: true` + `idempotentHint: false` on writes).

**Conditional (Phase 4):** `keeping_start_timer` / `keeping_stop_timer` — only if the 404 probe in Phase 2 returns non-404.

**Anti-features (explicitly NOT building):** auto-confirm writes, bulk CSV import, invoice generation, fuzzy name resolution inside the server, OAuth client flow.

### Architecture Approach

5-layer stack with strict boundary enforcement. `KeepingClient` is instantiated once in the entrypoint and injected into all tool handlers — enables clean unit testing via mock injection. Token-bucket rate limiter (2 tokens/sec, burst 10) is proactive; `Retry-After` + 429 retry is the reactive safety net. `/users/me` and org list are cached in-memory for server lifetime. Fail-fast on missing `KEEPING_TOKEN` at startup (not on first tool call).

**Major components:**

1. `bin/keeping-mcp.ts` — validates env via `loadConfig()`, exits on missing token, wires stdio transport. No tool logic, no HTTP.
2. `src/config.ts` — Zod-validated typed config (`KEEPING_TOKEN`, `KEEPING_REQUIRE_CONFIRM` default `true`, optional `KEEPING_ORG_ID`).
3. `src/keeping/client.ts` (`KeepingClient`) — Bearer auth, token-bucket, identity cache, `resolveOrgId()`, 429 retry on reads, `AbortSignal.timeout(10_000)`.
4. `src/tools/*.ts` (me, organisations, projects, tasks, entries) — Zod input schema, dry-run gate, response shaping, `isError: true` on failure. Never throw.
5. `src/server.ts` (`createServer`) — pure function, no I/O; registers domain tool groups.

**Key contracts:**

- Write tools accept `confirm: boolean` (default `false` when `KEEPING_REQUIRE_CONFIRM=true`). When `confirm` is missing/false, return preview `{ would_post: { method, url, body } }` with `structuredContent`; do not call the API.
- Write tools never auto-retry on network error; surface "outcome unknown — verify with keeping_list_entries before retrying".

### Critical Pitfalls (priority order)

1. **stdout pollution corrupts JSON-RPC stream** — any `console.log()` or library writing to stdout breaks the client parser. Prevention: stderr-only logger from day one; CI smoke test pipes an `initialize` request and asserts stdout is valid JSON-RPC. Phase 1.

2. **Windows `cmd /c` wrapper missing from README config** — Claude Code on Windows cannot `spawn()` `npx.cmd` directly. Prevention: README provides `{ "command": "cmd", "args": ["/c", "npx", "-y", "keeping-mcp"] }` for Windows alongside macOS/Linux block. Phase 5.

3. **`confirm: true` bypass by the model** — LLM can pass `confirm: true` autonomously to "be helpful". Prevention: parameter description requires explicit human review; consider MCP Elicitation as a v1.x upgrade. Phase 3.

4. **Duplicate billable entries on write retry** — POST `/time_entries` is not idempotent. Prevention: never auto-retry write verbs; return "outcome unknown" error; `idempotentHint: false`, `destructiveHint: true` annotations. Phase 3.

5. **GitHub Actions OIDC silently falls back to classic npm token** — `id-token: write` must be on the specific job; trusted-publisher config on npmjs.com must match exactly; do not keep `NPM_TOKEN` secret alongside OIDC. Prevention: verify provenance attestation appears on npm package page after first publish. Phase 6.

## Implications for Roadmap

Build order is constrained by schema discovery. Keeping API POST body field names are unknown until `keeping_list_entries` runs against a real token — so read tools precede write tools as a hard data dependency, not a convention.

**Suggested phases (6 total, Phase 4 conditional):**

1. **Foundation & Scaffolding** — stderr-only logger, `KeepingClient` (rate limiter, identity cache, fail-fast config validation), CI smoke test. No MCP tools yet. Avoids pitfalls 1, 4-token-leak.
2. **Read Tools & Schema Discovery** — server runnable via `npx keeping-mcp`; all read tools operational; live-API session locks POST body field names; 404 probe for timer endpoint.
3. **Write Tools — Dry-Run First, Then Live** — `add_entry`, `update_entry`, `delete_entry` built on confirmed schema; dry-run path validated before live writes enabled; tool annotations. Avoids pitfalls 3, 4.
4. **Timer Tools (Conditional)** — only if Phase 2 probe found a timer endpoint; otherwise skipped entirely.
5. **Hardening & Distribution Prep** — `files` whitelist, `npm pack --dry-run`, README with dual Windows/macOS config blocks, token setup walkthrough, Windows 11 cold-start smoke test. Avoids pitfall 2.
6. **Release Pipeline** — GitHub Actions OIDC publish to npm + MCP registry on `v*` tag; provenance attestation verified post-publish. Avoids pitfall 5.

**Research flags:**

- **Phase 2** needs live-API session: lock POST body schema, probe timer endpoint, confirm `/users/me` path, confirm pagination, confirm error response shape.
- **Phase 4** conditional: if Phase 2 probe returns non-404, one additional live session needed to confirm timer paths.
- Phases 1, 3, 5, 6: standard patterns, no additional research needed.

## Open Questions (resolved in execution, not planning)

- Exact Keeping POST body field names (`day` vs `date`, `hours` vs `starting_time`/`ending_time`, `purpose` enum values) — resolve in Phase 2 via `keeping_list_entries` against real token.
- Timer endpoint paths — best-guess `POST /v1/organisations/:org_id/timers`; probe in Phase 2.
- Pagination scheme — offset or cursor; probe in Phase 2.
- Error response envelope — `{ errors: [{ code, field, message }] }` assumed from Dutch REST convention; HTTP client handles both that shape and `{ message }` until confirmed.
- Exact `/users/me` path — `/users/me` vs `/organisations/:org_id/users/me`; confirm in Phase 2.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm, official SDK docs, registry docs |
| Features | MEDIUM | Keeping API SPA non-parseable; POST body field names + timer paths UNVERIFIED |
| Architecture | HIGH | 5-layer pattern verified against SDK docs + multiple reference implementations |
| Pitfalls | HIGH | All five verified against official sources, real GitHub issues, MCP spec, OWASP guidance |

Overall: **MEDIUM-HIGH**. Schema unknowns are bounded and resolvable in a single live-API session in Phase 2.

---
*Research completed: 2026-06-08*
*Ready for roadmap: yes*
