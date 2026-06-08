# Feature Research

**Domain:** MCP server — Keeping time-tracking API wrapper for AI coding assistants
**Researched:** 2026-06-08
**Confidence:** MEDIUM (Keeping API SPA not parseable; endpoint shapes partially reconstructed from search snippets + competitor analysis. Flagged explicitly where schema is unverified.)

---

## Keeping API Surface — What Is Known

### Base URL and Auth

| Item | Value | Confidence |
|------|-------|------------|
| Base URL | `https://api.keeping.nl/v1` | HIGH — mentioned in auth quickstart |
| Auth header | `Authorization: Bearer <token>` | HIGH — official docs quickstart |
| Rate limit | 120 req/min | HIGH — locked in PROJECT.md |
| Server-time header | `X-Server-Time-Ms` (Unix ms) | MEDIUM — found in search snippet |

The `X-Server-Time-Ms` response header is used to correct local-clock skew when calculating elapsed time for running timers. Any timer-status display should incorporate this offset.

### Endpoint Inventory

Partially reconstructed from search snippets. **Schema fields marked UNVERIFIED must be confirmed against a live `keeping_list_entries` response before locking the POST body.**

#### `GET /v1/organisations`

Returns the list of organisations the token has access to. Each organisation object includes the organisation ID and which features are enabled (projects, tasks, timesheet mode). Auth quickstart example uses this as the first call to confirm a token works.

- **Pagination:** Unknown — flag for live verification.
- **Response shape:** Unknown exact field names. Likely contains `id`, `name`, and a features/settings sub-object that indicates whether the timesheet is in `hours` mode or `times` (start/end) mode.

#### `GET /v1/organisations/:org_id/users/me` (or similar)

Resolves the authenticated user's `user_id` within a specific organisation. Required because Keeping scopes time entries to a user within an org. Exact path unverified — PROJECT.md notes "admins can write other users' entries; v1 deliberately does not target that path."

- **Returns:** `user_id`, display name, email, role. Exact field names UNVERIFIED.

#### `GET /v1/organisations/:org_id/projects`

Available only when the projects feature is enabled for the org. Returns list of projects usable for time entry creation. Admin scope required to create/edit/delete projects; read is available to all users.

- **Pagination:** Unknown.
- **Response shape:** Each project has an `id` and a name. Whether archived projects are included by default is UNVERIFIED.

#### `GET /v1/organisations/:org_id/tasks`

Available when tasks feature is enabled. Returns all tasks (not project-scoped at the list level, per search snippet — tasks can be associated with projects). Admin scope required for CRUD; read available to all.

- **Pagination:** Unknown.
- **Response shape:** Each task has an `id` and name. UNVERIFIED whether tasks are nested under projects.

#### `GET /v1/organisations/:org_id/time_entries` (list)

List time entries. Expected filter parameters: date range (probably `from`/`to` as ISO 8601 dates or `day` as single date), and `user_id`. Pagination scheme UNVERIFIED.

**Critical use:** The first live call with a real entry is the ground-truth source for the time entry wire format. The `keeping_list_entries` tool doubles as schema discovery.

#### `POST /v1/organisations/:org_id/time_entries` (create)

**Schema UNVERIFIED — highest-risk unknown in the project.**

From search snippets, two modes exist depending on org configuration:

| Org timesheet mode | Creation behaviour |
|---|---|
| `hours` | POST creates or merges into an existing day bucket (201 = new, 200 = modified existing) |
| `times` | POST creates an entry with explicit start/end times on a timeline |

Best-guess field names based on documentation snippet language and Dutch SaaS convention:

```json
{
  "day": "2026-06-08",           // ISO date — likely "day" not "date", UNVERIFIED
  "hours": 2.5,                  // decimal hours for "hours" mode, UNVERIFIED
  "starting_time": "09:00",      // HH:MM for "times" mode, UNVERIFIED
  "ending_time": "11:30",        // HH:MM for "times" mode, UNVERIFIED
  "project_id": "abc123",        // optional, only when projects enabled
  "task_id": "def456",           // optional, only when tasks enabled
  "description": "...",          // free text
  "purpose": "billable"          // "billable" | "non_billable" | possibly "break" — UNVERIFIED enum
}
```

The `purpose` field name was found in a search snippet ("read the documentation of the purpose parameter on the create request"). The exact enum values are UNVERIFIED. "billable" and a non-billable variant are virtually certain given the product's invoicing focus; "break" may also be valid.

**Action required:** After token is available, run `keeping_list_entries` against a real entry, inspect the response fields, and lock the POST body schema before writing `keeping_add_entry`.

#### `PUT /v1/organisations/:org_id/time_entries/:id` (update)

Partial or full update. Exact updatable fields UNVERIFIED — assume same set as POST.

#### `DELETE /v1/organisations/:org_id/time_entries/:id`

Standard delete. Likely returns 204 No Content. UNVERIFIED.

#### Timer endpoints

**Status: EXISTS with HIGH confidence, exact paths UNVERIFIED.**

Evidence:
- Keeping marketing copy explicitly states "start and stop running timers" as a product feature.
- The `X-Server-Time-Ms` header exists specifically to support running-timer elapsed-time calculation — this header would not exist if there were no timer state on the server.
- PROJECT.md already flags this as "verify in research phase."

Best-guess paths (UNVERIFIED):
- `POST /v1/organisations/:org_id/timers` — start a timer
- `DELETE /v1/organisations/:org_id/timers/current` or `POST .../timers/stop` — stop
- `GET /v1/organisations/:org_id/timers/current` — get running timer

**Recommended approach:** Attempt `GET /v1/organisations/:org_id/timers` with a live token early in development. If it returns 404, fall back to the pattern used by Toggl (a running entry has `duration: -1` in the entry list) — some APIs represent "running" as a special entry state rather than a separate resource.

### Pagination — UNVERIFIED

No public documentation found for the Keeping pagination scheme. Two approaches are common for Dutch REST APIs:
1. Offset-based: `?page=1&per_page=50`
2. Cursor-based: `?cursor=<opaque token>` with a `next_cursor` in the response envelope

**Recommendation:** Implement a `page`/`per_page` probe first; inspect response envelope for cursor or total fields and adapt. Default the list tools to a safe upper limit (e.g., 200 entries) with an optional `limit` parameter.

### Error Response Shape — UNVERIFIED

Standard Dutch REST APIs typically use:
```json
{
  "errors": [
    { "code": "validation_failed", "field": "day", "message": "is not a valid date" }
  ]
}
```
or a simpler `{ "message": "..." }` envelope. UNVERIFIED for Keeping. MCP tool error handling should:
1. Forward the raw `message` or first `errors[0].message` to the tool result text.
2. Set `isError: true` on the MCP result.
3. Never swallow 4xx/5xx silently — an opaque error is worse than a raw one.

---

## Per-Tool Specification (Locked v1 Set)

### `keeping_me`

**Purpose:** Resolve the authenticated user's identity within an organisation.

**Inputs:**
```typescript
{
  organisation_id?: string  // required when user has multiple orgs; auto-resolved for single-org accounts
}
```

**Outputs:**
```typescript
{
  user_id: string
  name: string
  email: string
  organisation_id: string
  role: string  // "admin" | "member" — UNVERIFIED enum
}
```

**Dependency:** All write tools require `user_id` + `organisation_id`. This tool MUST be callable (or its result cached) before add/update/delete can proceed.

**Notes:** Claude Code should call this once at the start of a session and cache the result for subsequent tool calls. Do not require the user to pass `user_id` to every tool — that is friction without value.

---

### `keeping_organisations`

**Purpose:** List organisations and their feature flags. Required to know whether projects/tasks are enabled (affects which optional fields to expose on add/update).

**Inputs:** none

**Outputs:**
```typescript
Array<{
  id: string
  name: string
  features: {
    projects_enabled: boolean
    tasks_enabled: boolean
    timesheet_mode: "hours" | "times"  // UNVERIFIED — affects which time fields are valid
  }
}>
```

**Notes:** When `timesheet_mode` is `hours`, `keeping_add_entry` should accept `hours: number`. When `times`, it should accept `starting_time`/`ending_time`. The tool description should state which mode is active so Claude can construct the right POST body.

---

### `keeping_projects`

**Purpose:** List projects available for time entry creation.

**Inputs:**
```typescript
{
  organisation_id?: string  // auto-resolved if single org
  include_archived?: boolean  // default false
}
```

**Outputs:**
```typescript
Array<{
  id: string
  name: string
  archived: boolean
  // client association if present — UNVERIFIED field name
}>
```

**Notes:** Claude Code uses this to let the user pick a project. Format the output as a numbered list with `id` + `name` so Claude can present it clearly and refer back by number. Do not return raw IDs without names.

---

### `keeping_tasks`

**Purpose:** List tasks available for time entry creation.

**Inputs:**
```typescript
{
  organisation_id?: string  // auto-resolved if single org
  project_id?: string       // filter to tasks for a specific project — UNVERIFIED if supported at API level
}
```

**Outputs:**
```typescript
Array<{
  id: string
  name: string
  project_id?: string  // UNVERIFIED whether tasks are project-scoped
}>
```

**Notes:** Tasks are optional in Keeping. If the feature is disabled, this tool should return an empty list with a human-readable note ("Tasks are not enabled for this organisation") rather than an error.

---

### `keeping_list_entries`

**Purpose:** Read existing time entries for a date range. Also serves as the schema-discovery tool — the first live call against a real entry reveals the exact wire format.

**Inputs:**
```typescript
{
  organisation_id?: string  // auto-resolved if single org
  from: string              // ISO date YYYY-MM-DD (inclusive)
  to?: string               // ISO date YYYY-MM-DD (inclusive); defaults to `from` (single day)
  user_id?: string          // defaults to authenticated user
  limit?: number            // default 200, max TBD
}
```

**Outputs:** Array of time entry objects in the exact shape the API returns. Do not transform field names — preserve the wire format so the schema is visible to the caller. Include:
```
id, day (or date), hours (or starting_time/ending_time), project_id, project_name,
task_id, task_name, description, purpose, created_at, updated_at
```
(Exact field names UNVERIFIED — preserve whatever the API returns.)

**Notes:** This is a read-only tool. Should be called by Claude before `keeping_add_entry` to confirm the target day has no duplicate entry for the same project, and to discover the real field names on first use.

---

### `keeping_add_entry`

**Purpose:** Create a new time entry. The primary write path.

**Inputs:**
```typescript
{
  organisation_id?: string  // auto-resolved if single org
  day: string               // ISO date YYYY-MM-DD; defaults to today (server tz: Europe/Amsterdam)
  hours?: number            // decimal hours; required when org is in "hours" mode
  starting_time?: string    // "HH:MM"; required when org is in "times" mode
  ending_time?: string      // "HH:MM"; required when org is in "times" mode
  project_id?: string       // optional; required if org has projects + no default project set
  task_id?: string          // optional
  description?: string      // free text; recommended
  purpose?: "billable" | "non_billable"  // UNVERIFIED enum; defaults to "billable"
  confirm?: boolean         // default false (dry-run); set true to actually POST
}
```

**Dry-run behaviour (when `confirm` is omitted or false):**
- Returns a preview object showing exactly what would be sent to the API.
- Includes a `preview: true` flag in the response.
- Does NOT call the Keeping API.
- Response format mirrors what a successful POST would return, so Claude can present it to the user for review.

**Live behaviour (when `confirm: true`):**
- Posts to the Keeping API.
- Returns the created entry object.
- Annotate this tool with `destructiveHint: true` in MCP tool annotations (2025-11-25 spec).

**Outputs (dry-run):**
```typescript
{
  preview: true,
  would_send: { /* exact POST body */ },
  note: "Pass confirm: true to create this entry."
}
```

**Outputs (confirmed):**
```typescript
{
  preview: false,
  entry: { /* created entry as returned by API */ }
}
```

**Default-day logic:** When `day` is omitted, default to today in `Europe/Amsterdam` timezone, not UTC. If the current Amsterdam time is before 06:00, offer `yesterday` as an alternative (late-night coding session heuristic) — surface this as a note in the response, not an error.

---

### `keeping_update_entry`

**Purpose:** Edit an existing time entry.

**Inputs:**
```typescript
{
  organisation_id?: string
  entry_id: string           // required
  day?: string               // change the date
  hours?: number             // change duration (hours mode)
  starting_time?: string     // change start (times mode)
  ending_time?: string       // change end (times mode)
  project_id?: string
  task_id?: string
  description?: string
  purpose?: "billable" | "non_billable"
  confirm?: boolean          // default false (dry-run)
}
```

**Dry-run / confirmed pattern:** Same as `keeping_add_entry`. Annotate with `destructiveHint: true`.

**Notes:** The MCP tool should fetch the current entry (via `keeping_list_entries` or a single-entry GET if the API supports it) and merge the changes so the preview shows the full updated state, not just the diff.

---

### `keeping_delete_entry`

**Purpose:** Remove a time entry. Highest-impact destructive operation.

**Inputs:**
```typescript
{
  organisation_id?: string
  entry_id: string   // required
  confirm?: boolean  // default false (dry-run)
}
```

**Dry-run behaviour:** Fetches and returns the entry that would be deleted without calling DELETE.

**Live behaviour:** Calls DELETE. Returns confirmation with the deleted entry's summary (day, hours, description, project).

**Notes:** Annotate with `destructiveHint: true`. The dry-run default is especially important here — a deleted time entry cannot be recovered.

---

### `keeping_start_timer` and `keeping_stop_timer`

**Status: Include in v1 IF timer API exists; gate behind feature detection.**

**`keeping_start_timer` inputs:**
```typescript
{
  organisation_id?: string
  project_id?: string
  task_id?: string
  description?: string
}
```

**`keeping_start_timer` outputs:**
```typescript
{
  timer_id: string
  started_at: string   // ISO 8601 UTC
  project_name?: string
  note: string         // e.g. "Timer started. Use keeping_stop_timer to create the entry."
}
```

**`keeping_stop_timer` inputs:**
```typescript
{
  organisation_id?: string
  // No timer_id needed if there is only one running timer per user
}
```

**`keeping_stop_timer` outputs:**
```typescript
{
  entry: { /* created time entry */ }
  duration_hours: number
}
```

**Notes:** If the Keeping API does not expose a timer endpoint (verified by 404 on first probe), these tools should be omitted from v1 entirely. Do not ship stub tools that return "not supported" — that is noise. The PROJECT.md `keeping_start_timer`/`keeping_stop_timer` requirement is already flagged as conditional on API verification.

Timer tools are NOT write-confirmed (dry-run is not meaningful for a running timer). They should still be annotated `destructiveHint: false` because stopping a timer creates an entry which can be deleted if wrong.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Every time-tracking MCP server surveyed (Clockify, Harvest, Toggl) ships all of these without exception.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| List entries by date range | Verify what was logged; avoid duplicates | LOW | All 3 competitors ship this as first tool |
| Create entry (duration-based) | Core write operation | LOW | Must work before anything else |
| Update entry | Mistakes happen; no tracker omits this | LOW | Fetch + merge for clean preview |
| Delete entry | Must be able to undo | LOW | Highest-impact; dry-run is critical |
| List projects | Required to pick project_id | LOW | Toggl, Harvest, Clockify all expose this |
| List tasks | Required when task feature enabled | LOW | Conditional on org feature flag |
| Current user / organisation identity | Every write is scoped to a user+org | LOW | Foundation — required by all other tools |
| Useful error messages from API | 4xx must surface readable text, not status codes | LOW | MCP spec: isError: true + forwarded message |
| Graceful rate-limit handling | 120 req/min is tight for rapid tool sequences | MEDIUM | Exponential backoff; surface wait time to caller |

### Differentiators (Keeping + Claude Code Specific)

These are not present in any of the three competitor servers surveyed.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Dry-run-by-default writes (`confirm: false` default) | Billable hours: an unintended write is materially worse than a round-trip; standard MCP anti-pattern guidance in 2026 | LOW | The tool description in Claude's tool list should explicitly say "returns preview unless confirm: true" — this guides the LLM |
| Europe/Amsterdam timezone defaulting | Keeping is a Dutch product; users are in CET/CEST; `day: today` should mean Dutch today, not UTC today (differ after 22:00/23:00) | LOW | Use `Intl.DateTimeFormat` with `Europe/Amsterdam` tz; embed timezone note in tool description |
| Organisation feature-flag awareness | Tool descriptions adapt based on whether projects/tasks/timesheet_mode are active; avoids "project_id not found" errors | MEDIUM | On startup, call `keeping_organisations`, set tool descriptions / required fields accordingly |
| Multi-org auto-detect | Single-org users never see `organisation_id` in prompts; multi-org users are prompted once | LOW | Already a locked decision in PROJECT.md |
| `purpose` field exposure (billable vs non-billable) | Other MCP servers (Clockify, Toggl, Harvest wrappers) typically skip or default `billable`; Keeping's Jortt invoicing integration makes this a first-class concern | LOW | Expose `purpose` with a clear enum and default; document that billable entries flow to Jortt invoices |
| Session-summary entry suggestion | Claude can summarise git log or conversation context and propose a pre-filled `keeping_add_entry` call — no other surveyed MCP server does this | MEDIUM | The MCP server itself does not need to do this; Claude does, using the tool descriptions. The server enables it by: (1) returning `today` as default for `day`, (2) including project/task names in responses (not just IDs), (3) having a clean preview mode. Implementation note: tool description on `keeping_add_entry` should mention "Claude can infer description from recent work context." |
| Late-night session heuristic | When `day` defaults to today but local Amsterdam time is before ~06:00, include a note: "It is currently 01:30 in Amsterdam. Did you mean yesterday (2026-06-07)?" | LOW | Surface as a `hint` field in the dry-run response, not an error |

### Anti-Features (Deliberately NOT Building)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Automatic writes without `confirm: true` | Reduces round-trips | Billable-hours data; a single misfire could create a false invoice entry or overwrite a real one. MCP spec §Security says clients SHOULD prompt for sensitive operations | Dry-run default; single `confirm: true` param |
| Bulk CSV import | "I have a week of entries in a spreadsheet" | Out of scope for v1 (locked); adds significant parsing surface and error handling complexity with no Claude Code use-case justification | User enters entries one at a time via the MCP session workflow |
| Invoice generation | "Can you also invoice the client from Claude?" | Keeping's Jortt integration already does this natively and correctly; building a parallel path risks double-billing | Direct user to Keeping's UI for invoicing after entries are logged |
| Reporting / aggregation tools | "Show me hours per project this month" | `keeping_list_entries` with a date range returns all entries; Claude itself can aggregate them — no server-side computation needed for v1 | Claude aggregates from `keeping_list_entries` output |
| OAuth client flow | Enables third-party app distribution | Requires a hosted callback URI which does not exist for a local MCP server; personal access token is sufficient for solo developer | `KEEPING_TOKEN` env var (already locked) |
| Other users' time entries | "Log time on behalf of my colleague" | Requires admin scope; the solo-developer v1 use case is own time only | Explicitly document as out of scope; admin endpoints can be a v2 feature |
| Fuzzy project/task name resolution inside the server | "Add 2h to the project called 'website'" | Adds matching logic, edge cases (multiple projects match), and latency; Claude Code can do this resolution with `keeping_projects` output | Return the full project list and let Claude resolve the name to an ID |
| Running timer without API confirmation | "Start a timer when the session begins" | Auto-starting timers without user intent creates ghost entries; Keeping's timer also needs a stop before it becomes a real entry | Expose `keeping_start_timer` as an explicit tool call; never auto-invoke |
| Caching project/task lists locally | Reduces API calls | Cache invalidation is hard; stale project list leads to 422 on entry creation; 120 req/min is generous enough for fresh reads | Call the list endpoints fresh each session; implement only if benchmarks show rate-limit problems |

---

## Feature Dependencies

```
keeping_me
    └──required-by──> keeping_add_entry (needs user_id)
    └──required-by──> keeping_update_entry
    └──required-by──> keeping_delete_entry
    └──required-by──> keeping_list_entries (for filtering to own entries)

keeping_organisations
    └──required-by──> keeping_projects (needs org_id + feature flag check)
    └──required-by──> keeping_tasks (needs org_id + feature flag check)
    └──required-by──> keeping_list_entries (needs org_id)
    └──required-by──> keeping_add_entry (needs org_id + timesheet_mode to know which fields to use)
    └──informs──> tool-description adaptation (projects_enabled, tasks_enabled, timesheet_mode)

keeping_projects
    └──enhances──> keeping_add_entry (provides project_id candidates)
    └──enhances──> keeping_list_entries (project filter)

keeping_tasks
    └──enhances──> keeping_add_entry (provides task_id candidates)

keeping_list_entries
    └──schema-discovery-for──> keeping_add_entry (first live call reveals exact field names)
    └──used-before──> keeping_add_entry (duplicate check for target day)

keeping_add_entry (confirm: false)
    └──precedes──> keeping_add_entry (confirm: true)
    [dry-run always before live write]

keeping_start_timer
    └──precedes──> keeping_stop_timer
    └──conditional-on──> timer API existing (404 probe at startup)
```

### Dependency Notes

- **All write tools require `keeping_me` first:** `user_id` is required on every write call to Keeping. Cache this at session start.
- **`keeping_organisations` drives field availability:** The `timesheet_mode` flag determines whether `hours` or `starting_time`/`ending_time` is valid on `keeping_add_entry`. Read this first and reflect it in tool descriptions.
- **`keeping_list_entries` is schema discovery:** Ship this tool first and run it against a real entry before coding `keeping_add_entry` POST body logic.
- **Timer tools are conditionally activated:** Probe the timer API endpoint at startup; register timer tools only if the endpoint returns non-404.

---

## Competitor Feature Analysis

| Feature | Clockify MCP (aslamanver, hongkongkiwi) | Toggl MCP (verygoodplugins) | Harvest MCP (southleft, ianaleck) | keeping-mcp plan |
|---------|----------------------------------------|------------------------------|-----------------------------------|-----------------|
| List workspaces/orgs | Yes | Yes | Yes | Yes (`keeping_organisations`) |
| Current user | Yes | Yes | Yes (get_current_user) | Yes (`keeping_me`) |
| List projects | Yes | Yes | Yes | Yes (`keeping_projects`) |
| List tasks | Yes | Yes | Yes | Yes (`keeping_tasks`) |
| List entries | Yes | Yes | Yes | Yes (`keeping_list_entries`) |
| Create entry | Yes | No (Toggl: read-only focus) | Yes | Yes (`keeping_add_entry`) |
| Update entry | Yes | No | Yes | Yes (`keeping_update_entry`) |
| Delete entry | Yes | No | Yes | Yes (`keeping_delete_entry`) |
| Timer start/stop | Yes (Clockify) | Yes (Toggl) | Yes (Harvest) | Conditional (`keeping_start_timer/stop_timer`) |
| Get running timer | Yes (Clockify master MCP) | Yes (`get_current_entry`) | Yes | Conditional |
| Dry-run / confirm before write | No surveyed server implements this | No | No | YES — differentiator |
| Billable/purpose field | Clockify has `billable` bool | Toggl has billable flag | Harvest has billable flag | YES — `purpose` enum, Jortt-critical |
| Report / aggregation tools | Yes (Clockify: 5 report tools) | Yes (daily/weekly/project reports) | Yes (6 analytics tools) | NO — Claude aggregates from list output |
| Bulk tools | Yes (Clockify master: bulk edit) | No | No | NO — anti-feature |
| Timezone handling (explicit) | No | No | No | YES — Europe/Amsterdam default |
| Fuzzy name resolution | Yes (Clockify: search tools) | No | Yes (harvest_resolve_entities) | NO — Claude resolves from list |
| Cache management | Yes (Toggl: explicit cache tools) | Yes (explicit warm/clear) | No | NO — fresh reads each session |

---

## MVP Definition

### Launch With (v1)

All tools in the locked set are required for the core session-summary workflow:

- [ ] `keeping_organisations` — gatekeeper for all other tools
- [ ] `keeping_me` — resolves user identity once per session
- [ ] `keeping_projects` — needed to pick project on add_entry
- [ ] `keeping_tasks` — needed to pick task on add_entry (conditional on feature flag)
- [ ] `keeping_list_entries` — schema discovery + duplicate check
- [ ] `keeping_add_entry` (dry-run + confirmed) — the primary value delivery
- [ ] `keeping_update_entry` (dry-run + confirmed) — fix typos after review
- [ ] `keeping_delete_entry` (dry-run + confirmed) — remove mistaken entries
- [ ] Europe/Amsterdam timezone default — Dutch product, Dutch users
- [ ] MCP tool annotations (`readOnlyHint`, `destructiveHint`) on all tools

### Add After Validation (v1.x)

- [ ] `keeping_start_timer` / `keeping_stop_timer` — add if timer API exists; decision gate during development
- [ ] Late-night session heuristic (before-06:00 Amsterdam yesterday hint) — add once basic workflow is validated
- [ ] Structured output schema (`outputSchema` on `keeping_list_entries`) — add once wire format is confirmed from live API

### Future Consideration (v2+)

- [ ] Admin tools (manage other users' entries) — only if user feedback shows this use case
- [ ] Report/aggregation tools — only if Claude's native aggregation proves insufficient for common queries
- [ ] Multi-workspace caching — only if benchmarks show rate-limit pressure

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `keeping_add_entry` with dry-run | HIGH | LOW | P1 |
| `keeping_list_entries` (schema discovery) | HIGH | LOW | P1 |
| `keeping_me` + `keeping_organisations` | HIGH | LOW | P1 |
| `keeping_projects` + `keeping_tasks` | HIGH | LOW | P1 |
| Dry-run default (`confirm: false`) | HIGH | LOW | P1 |
| Europe/Amsterdam timezone default | MEDIUM | LOW | P1 |
| `keeping_update_entry` | MEDIUM | LOW | P1 |
| `keeping_delete_entry` | MEDIUM | LOW | P1 |
| MCP tool annotations (`destructiveHint`) | MEDIUM | LOW | P1 |
| `purpose` field (billable vs non-billable) | HIGH | LOW | P1 — Jortt invoicing depends on this |
| `keeping_start_timer` / `keeping_stop_timer` | MEDIUM | MEDIUM | P2 — conditional on API |
| Late-night session heuristic | LOW | LOW | P2 |
| Structured `outputSchema` | LOW | LOW | P2 |

---

## Sources

- Keeping API documentation SPA (`developer.keeping.nl`) — **non-parseable SPA, returned empty content.** Partial snippets recovered via web search indexing.
- Keeping product homepage (`keeping.nl/en`) — confirms timer feature exists in product
- `X-Server-Time-Ms` header — found in a search snippet quoting Keeping API docs
- `purpose` parameter — found in a search snippet quoting Keeping API docs: "read the documentation of the purpose parameter on the create request"
- Timesheet mode (`hours` vs `times`) — found in a search snippet: "when the organization's timesheet feature setting is set to hours, creating a time entry can result in either a new entry being created (201) or an existing entry being modified (200)"
- [Clockify MCP — aslamanver](https://github.com/aslamanver/mcp_clockify) — tool list analysis
- [Clockify Master MCP — hongkongkiwi](https://github.com/hongkongkiwi/clockify-master-mcp) — 33-tool breakdown
- [Toggl MCP — verygoodplugins](https://github.com/verygoodplugins/mcp-toggl) — tool list, timer support, caching pattern
- [Toggl Track MCP — vontell](https://github.com/vontell/toggl-track-mcp) — tool list
- [Harvest MCP — southleft](https://github.com/southleft/harvest-mcp) — tool list, 21 tools
- [Harvest MCP Server — ianaleck](https://github.com/ianaleck/harvest-mcp-server) — 60+ tools, timer start/stop/restart
- [Harvest natural language MCP — adrian-dotco](https://github.com/adrian-dotco/harvest-mcp-server) — natural language entry pattern
- [MCP Tool Annotations — mcpblog.dev](https://mcpblog.dev/blog/2026-03-13-mcp-tool-annotations) — `readOnlyHint`, `destructiveHint` annotation fields
- [MCP Tools Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) — `outputSchema`, error handling, `isError`
- [MCP Anti-Patterns Guide 2026](https://www.digitalapplied.com/blog/mcp-server-anti-patterns-design-mistakes-2026-developer-guide) — dry-run pattern, audit gate best practice

---
*Feature research for: keeping-mcp (MCP server for Keeping time-tracking API)*
*Researched: 2026-06-08*
