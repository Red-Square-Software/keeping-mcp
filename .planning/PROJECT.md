# keeping-mcp

## What This Is

Open-source Model Context Protocol (MCP) server that exposes the Keeping (api.keeping.nl) time-tracking API as tools an AI coding assistant can call. Built for solo developers who use Claude Code (or any MCP-capable client) and want their billable hours logged into Keeping at the end of a session instead of typed in by hand, while keeping Keeping's existing native Jortt invoicing integration intact.

## Core Value

A Claude Code (or any MCP client) user can log a reviewed time entry into their Keeping account through a single tool call, with explicit confirmation before anything is written.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] `keeping_add_entry` tool — create a time entry (Validated in Phase 3: write-tools-conditional-timers)
- [x] `keeping_update_entry` tool — edit an existing entry (Validated in Phase 3)
- [x] `keeping_delete_entry` tool — remove an entry (Validated in Phase 3)
- [x] `keeping_start_timer` / `keeping_stop_timer` tools (Validated in Phase 3 — includes `keeping_resume_timer`, `keeping_timer_status`)
- [x] Dry-run-by-default writes: write tools return a preview unless `confirm: true` is passed. Controlled by `KEEPING_REQUIRE_CONFIRM` env var (default `true`) (Validated in Phase 3)
- [x] MCP server installable via `npx keeping-mcp` (Validated in Phase 4 — shipped as `keeping-mcp@1.0.1` on npm with sigstore provenance)
- [x] Personal access token auth via `KEEPING_TOKEN` env var (Validated Phase 1 + 4)
- [x] `keeping_me` tool (Validated Phase 2)
- [x] `keeping_organisations` tool (Validated Phase 2)
- [x] `keeping_projects` tool (Validated Phase 2)
- [x] `keeping_tasks` tool (Validated Phase 2)
- [x] `keeping_list_entries` tool (Validated Phase 2)
- [x] MCP Registry listing under `io.github.Red-Square-Software/keeping-mcp` (Validated Phase 4)
- [x] GitHub Actions release pipeline (tag → npm + Registry publish) (Validated Phase 4 — NPM_TOKEN classic auth fallback; sigstore provenance via OIDC)

### Active

<!-- v1 scope complete. v1.1 candidates surfaced during v1.0; defer until /gsd:new-milestone. -->

(v1.0 milestone complete — all v1 requirements validated. Carry-forward candidates for v1.1: live UAT closure for the 3 Phase 3 scenarios; revisit OIDC trusted publishing if free npm tier exposes UI; CLAUDE.md style audit; v2 README polish.)

### Out of Scope

<!-- Explicit boundaries with reasoning to prevent re-adding. -->

- OAuth client flow — personal access token covers the solo-developer use case; OAuth is for redistributable integrations
- Building Jortt invoices directly — Keeping already has a native Jortt integration; the server only needs to land correct time entries
- Hosted/remote MCP server — server runs locally next to the user's Claude Code instance, no hosting plane
- Non-Keeping time tracking systems (Toggl, Harvest, Clockify) — separate servers already exist
- Python SDK port — TypeScript only for v1
- GUI / web dashboard — MCP tools are the interface
- Bulk import from CSV / other trackers — out of scope for v1; user logs hours one session at a time

## Context

- **Domain**: Keeping (api.keeping.nl, v1 REST API) — Dutch time-tracking SaaS. Native integration with Jortt (Dutch invoicing) is the reason the user wants to stay on Keeping rather than switch trackers.
- **Auth model**: Personal access tokens generated in Keeping preferences after enabling "Show features for developers". Bearer header. Rate limit 120 req/min.
- **Known schema unknowns**: Exact field names for the time-entry POST body (day vs date, hours vs starting_time/ending_time, project_id, task_id, description, purpose) were not retrievable from the Keeping docs SPA in prior research. v1 strategy is best-guess from docs + iterate using `keeping_list_entries` against a real entry to confirm the wire format.
- **Use case**: At the end of a Claude Code session, the user asks Claude to summarise the work done; Claude proposes a time entry (duration, project, description); user reviews; the server posts to Keeping only after explicit confirmation.
- **Registry**: Official MCP Registry uses reverse-DNS namespaces tied to verified GitHub orgs. Repo lives under the GitHub org `Red-Square-Software` (canonical OIDC casing), giving namespace `io.github.Red-Square-Software/keeping-mcp`.
- **Distribution**: TypeScript + official MCP SDK, published to npm so users add it to Claude Code with a single `npx` command. Bundled with a GitHub Actions workflow that publishes both to npm and the MCP registry on tagged release.

## Constraints

- **Tech stack**: TypeScript on Node.js, official `@modelcontextprotocol/sdk`, Zod for tool input schemas. — User's first MCP server; matches the dominant ecosystem and registry tooling.
- **License**: MIT. — Standard for MCP servers; permissive enough for downstream packaging.
- **Hosting / namespace**: GitHub repo under the `Red-Square-Software` org; npm package name `keeping-mcp` (unscoped) and MCP Registry namespace `io.github.Red-Square-Software/keeping-mcp`. Canonical GitHub org casing required by OIDC subject claim. — Required by the MCP registry's GitHub-verified namespace model.
- **Security**: Personal access token must never appear in logs, tool output, or commits. Read only from env var. — Billable-hours data and a write-capable API token; leak is high-impact.
- **API**: Must respect Keeping's 120 req/min rate limit, and must scope writes to the authenticated user (only admins can write other users' entries; v1 deliberately does not target that path).
- **Platform**: User runs Claude Code on Windows 11. Server must work on Windows + macOS + Linux (Node.js + npx covers this, but path/env handling needs to stay portable).

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript over Python | Official MCP SDK is most mature for TS; npx install fits the GitHub Actions → npm → MCP registry pipeline cleanly | ✓ Good (v1.0) |
| Stay on Keeping (do not switch tracker) | Keeping has the native Jortt integration; Jortt's own API has no time-entry endpoints; alternative trackers (Toggl/Harvest/Clockify) have MCP servers but lose the Jortt link | ✓ Good (v1.0) |
| Personal access token only in v1 | Solo-developer scope; OAuth is overkill and adds a hosted-callback surface that does not exist locally | ✓ Good (v1.0) |
| Dry-run-by-default writes (`KEEPING_REQUIRE_CONFIRM=true`) | Billable hours; an unintended write is materially worse than an extra round-trip | ✓ Good (v1.0) |
| Auto-detect single org, require explicit id on multi-org | Most users have one org; forcing the id on every call is friction without value when there is only one | ✓ Good (v1.0) |
| GitHub org `Red-Square-Software` for namespace (canonical OIDC casing) | MCP registry ties namespace to verified GitHub org; canonical casing required by OIDC subject claim | ✓ Good (v1.0 — amended from lowercase) |
| MIT license | Lowest friction for adoption and downstream packaging | ✓ Good (v1.0) |
| GitHub Actions OIDC release on tag | Removes long-lived npm/registry tokens from the repo; one tag = one published release | ⚠️ Revisit (v1.0 — OIDC trusted publishing unavailable on free npm tier; fallback to classic NPM_TOKEN, sigstore provenance via OIDC still works) |
| Schema-by-iteration for time-entry POST body | Keeping docs SPA was not parseable in prior research; safest path is to confirm wire format against a real `keeping_list_entries` response before locking | ✓ Good (v1.0 — superseded by live OpenAPI mirror in Phase 2.5 / D-32-R) |
| Strict 24-hour HH:mm regex on user-supplied start/end | Loose `am/pm` regex accepted invalid input that the API would 422 reject; pre-validation reduces round-trips and matches D-3-28 wire contract | ✓ Good (v1.0, gap closure CR-02) |
| `classifyAmbiguous` covers both AbortError AND TimeoutError | Node 22 `AbortSignal.timeout()` throws `DOMException("TimeoutError")` not `AbortError`; missing arm misclassified real timeouts as definite-fail | ✓ Good (v1.0, gap closure CR-01) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-12 after v1.0 milestone close — `keeping-mcp@1.0.1` shipped to npm + MCP Registry with sigstore provenance; 5 phases, 25 plans, 4-day timeline, 206 tests passing*
