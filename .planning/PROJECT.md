# keeping-mcp

## What This Is

Open-source Model Context Protocol (MCP) server that exposes the Keeping (api.keeping.nl) time-tracking API as tools an AI coding assistant can call. Built for solo developers who use Claude Code (or any MCP-capable client) and want their billable hours logged into Keeping at the end of a session instead of typed in by hand, while keeping Keeping's existing native Jortt invoicing integration intact.

## Core Value

A Claude Code (or any MCP client) user can log a reviewed time entry into their Keeping account through a single tool call, with explicit confirmation before anything is written.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- v1 scope. Building toward these. -->

- [ ] MCP server installable via `npx keeping-mcp` (no global install required)
- [ ] Personal access token auth via `KEEPING_TOKEN` env var (no OAuth in v1)
- [ ] `keeping_me` tool — resolve `user_id` per organisation
- [ ] `keeping_organisations` tool — list orgs and enabled features (projects/tasks)
- [ ] `keeping_projects` tool — list projects when feature enabled
- [ ] `keeping_tasks` tool — list tasks when feature enabled
- [ ] `keeping_list_entries` tool — read existing time entries for a date range (also used to learn the real entry schema)
- [ ] `keeping_add_entry` tool — create a time entry
- [ ] `keeping_update_entry` tool — edit an existing entry
- [ ] `keeping_delete_entry` tool — remove an entry
- [ ] `keeping_start_timer` / `keeping_stop_timer` tools — if Keeping API exposes running timers (verify in research phase)
- [ ] Dry-run-by-default writes: `keeping_add_entry` (and the other write tools) return a preview unless `confirm: true` is passed. Controlled by `KEEPING_REQUIRE_CONFIRM` env var (default `true`)
- [ ] Multi-organisation handling: auto-detect single org; require explicit `organisation_id` when user has multiple
- [ ] Rate-limit aware (Keeping API caps at 120 req/min) — back off cleanly instead of failing the whole tool call
- [ ] Published to npm under a name compatible with the MCP registry namespace `io.github.red-square-software/keeping-mcp`
- [ ] Published to the official MCP registry so clients can discover it
- [ ] GitHub Actions release pipeline: pushing a version tag publishes to npm and to the MCP registry (OIDC, no long-lived tokens)
- [ ] README documents: token setup, env vars, Claude Code config snippet, and the dry-run workflow

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
- **Registry**: Official MCP Registry uses reverse-DNS namespaces tied to verified GitHub orgs. Repo lives under the GitHub org `red-square-software`, giving namespace `io.github.red-square-software/keeping-mcp`.
- **Distribution**: TypeScript + official MCP SDK, published to npm so users add it to Claude Code with a single `npx` command. Bundled with a GitHub Actions workflow that publishes both to npm and the MCP registry on tagged release.

## Constraints

- **Tech stack**: TypeScript on Node.js, official `@modelcontextprotocol/sdk`, Zod for tool input schemas. — User's first MCP server; matches the dominant ecosystem and registry tooling.
- **License**: MIT. — Standard for MCP servers; permissive enough for downstream packaging.
- **Hosting / namespace**: GitHub repo under the `red-square-software` org; npm package name aligns with `io.github.red-square-software/keeping-mcp` registry namespace. — Required by the MCP registry's GitHub-verified namespace model.
- **Security**: Personal access token must never appear in logs, tool output, or commits. Read only from env var. — Billable-hours data and a write-capable API token; leak is high-impact.
- **API**: Must respect Keeping's 120 req/min rate limit, and must scope writes to the authenticated user (only admins can write other users' entries; v1 deliberately does not target that path).
- **Platform**: User runs Claude Code on Windows 11. Server must work on Windows + macOS + Linux (Node.js + npx covers this, but path/env handling needs to stay portable).

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript over Python | Official MCP SDK is most mature for TS; npx install fits the GitHub Actions → npm → MCP registry pipeline cleanly | — Pending |
| Stay on Keeping (do not switch tracker) | Keeping has the native Jortt integration; Jortt's own API has no time-entry endpoints; alternative trackers (Toggl/Harvest/Clockify) have MCP servers but lose the Jortt link | — Pending |
| Personal access token only in v1 | Solo-developer scope; OAuth is overkill and adds a hosted-callback surface that does not exist locally | — Pending |
| Dry-run-by-default writes (`KEEPING_REQUIRE_CONFIRM=true`) | Billable hours; an unintended write is materially worse than an extra round-trip | — Pending |
| Auto-detect single org, require explicit id on multi-org | Most users have one org; forcing the id on every call is friction without value when there is only one | — Pending |
| GitHub org `red-square-software` for namespace | MCP registry ties namespace to verified GitHub org; user already operates under redsquare.nl | — Pending |
| MIT license | Lowest friction for adoption and downstream packaging | — Pending |
| GitHub Actions OIDC release on tag | Removes long-lived npm/registry tokens from the repo; one tag = one published release | — Pending |
| Schema-by-iteration for time-entry POST body | Keeping docs SPA was not parseable in prior research; safest path is to confirm wire format against a real `keeping_list_entries` response before locking | — Pending |

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
*Last updated: 2026-06-08 after initialization*
