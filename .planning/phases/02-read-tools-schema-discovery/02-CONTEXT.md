# Phase 2: Read Tools & Schema Discovery - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning
**Revised:** 2026-06-11 — D-32, D-34, D-35 superseded by ground-truth findings
(see `.planning/research/LIVE-API-FINDINGS.md`); see `### Revisions (2026-06-11)`
section below for the new canonical decisions.

<domain>
## Phase Boundary

Boot the MCP server end-to-end. `npx keeping-mcp` starts, performs the stdio handshake, and registers all read + identity + metadata tools (`keeping_me`, `keeping_organisations`, `keeping_projects`, `keeping_tasks`, `keeping_list_entries`). All tools call the real Keeping API through a single `KeepingClient` with stderr-only logging, identity caching, rate limiting, and read-only retry on 429. A one-shot `npm run probe-live` script captures (1) the timer endpoint reality and (2) a live `time_entries` response — both feed Phase 3.

Requirements covered: AUTH-04, AUTH-05, IDENT-01, IDENT-02, IDENT-03, META-01, META-02, READ-01, READ-02, READ-03, SAFE-02, SAFE-03, SAFE-04, SAFE-05.

Phase 3 boundary: every write tool (`add`, `update`, `delete`) + conditional timer tools.

</domain>

<decisions>
## Implementation Decisions

### Identity Cache

- **D-22:** Cache `/users/me` and `/organisations` for server lifetime (no TTL, no expiry). Per SAFE-05 + the MCP-server-per-Claude-session lifetime model — the staleness window is the duration of one Claude Code session.
- **D-23:** Cache scope is ONLY `/users/me` + `/organisations`. `/projects` and `/tasks` stay fresh per call. Avoids Phase 3 cache-invalidation surface (Pitfall 8) and respects the "feature-flag-driven" nature of project/task availability.
- **D-24:** Cache lives inside `KeepingClient` as private fields. Tools call `client.me()` / `client.organisations()` and the client memoises internally. No separate IdentityResolver module.
- **D-25:** On mid-session 401: surface as `{ isError: true, content: [...] }` from the affected tool with the message `Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.` Do not invalidate cache, do not auto-retry, do not exit the process. Restart is the user's signal of intent.

### Multi-Org Resolution

- **D-26:** `KEEPING_ORG_ID` is a DEFAULT, not a hard pin. A tool input `organisation_id` overrides the env var. The env's role is "select my usual org so I don't pass it every call".
- **D-27:** When the user has multiple orgs AND `KEEPING_ORG_ID` is unset AND the tool call did not pass `organisation_id`: return `{ isError: true, content: ... }` with a message listing the available orgs by id + name. Example: `Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: org_abc (Acme Studio), org_xyz (Beta BV).`
- **D-28:** Auto-detect + resolve lives in a single method: `client.resolveOrgId(input?: string): Promise<string>`. Tools call it; tools never re-implement the logic. Resolution order: (a) input arg if present, (b) `KEEPING_ORG_ID` if set, (c) auto-detect if cached `organisations()` returns exactly one org, (d) else throw the "multiple orgs" error from D-27.
- **D-29:** `resolveOrgId()` validates the resolved id against the cached `organisations()` list. If it doesn't match any of the user's orgs, return `isError` early with the same "Options: ..." message. Catches typos before the API does. (Revision 2026-06-11: real org `id` is numeric; comparison happens by string-coercion since `KEEPING_ORG_ID` env and tool-input args are strings. See `KeepingOrg.id: number` in `src/keeping/types.ts`.)

### Timer Endpoint Probe (ORIGINAL — superseded by D-32-R, see Revisions)

- **D-30:** Probe is a one-shot npm script (`npm run probe-live`), not a server-startup behaviour. Server itself never probes; tests never probe. User runs it once with `KEEPING_TOKEN` set; result is captured to disk + committed.
- **D-31:** Probe hits THREE best-guess paths in parallel and records the full response (status, headers, body):
  1. `GET /v1/organisations/:org_id/timers`
  2. `GET /v1/organisations/:org_id/timers/current`
  3. `GET /v1/organisations/:org_id/time_entries?running=true` (Toggl-style fallback)
- **D-32 (SUPERSEDED 2026-06-11 by D-32-R):** Probe result lives in TWO places (`LIVE-API.md` + REQUIREMENTS row). Original assumption: timer is plausibly absent and TIMER-01 may defer from v1. **Reality:** OpenAPI exposes `GET /{org_id}/time-entries/last`, the `ongoing: boolean` flag, plus `POST /{id}/stop` and `POST /{id}/resume`. Timer functionality is fully available via the time-entries lifecycle; there is no separate `/timers` resource.
- **D-33:** Phase 2 does NOT ship any timer-facing tool. Even if the probe finds a working endpoint, `keeping_timer_status` (read-only) ships together with `keeping_start_timer` / `keeping_stop_timer` in Phase 3 so annotations + dry-run pattern stay consistent. (Reaffirmed 2026-06-11: timer tools split as Phase 2.5 — see D-32-R.)

### Schema Discovery & Fixture (ORIGINAL — D-34, D-35 superseded)

- **D-34 (SUPERSEDED 2026-06-11 by D-34-R):** `keeping_list_entries` returns the API response with NO field renaming. Wire shape: `{ entries: <raw array from Keeping>, count: <number> }`. The "no field renaming" rule survives. The wrong assumption was on the **request path** (`/v1/organisations/{orgId}/time_entries?from=&to=`) and on `KeepingUser` typing (`{ id, name?, email? }`). See D-34-R for corrected request shape and `KeepingUser` typing.
- **D-35 (SUPERSEDED 2026-06-11 by D-35-R):** Live capture is folded into the same `npm run probe-live` script. The script writes raw to `.live-capture-raw.json` (gitignored), runs an anonymisation pass, and writes anonymised to `test/fixtures/time-entry-response.sample.json`. The "six-key denylist" (`description`, `project_name`, `task_name`, `client_name`, `user_name`, `user_email`) does NOT match real responses. See D-35-R for the observed-sensitive denylist.
- **D-36:** Phase 3 schema-drift CI test: load `test/fixtures/time-entry-response.sample.json`, parse through the strict Zod schema Phase 3 will write, assert no unknown/missing fields. Catches Keeping renames on every CI run.
- **D-37:** `.gitignore` augmented in Phase 2: add `.planning/research/.live-capture-raw.json` and `.planning/research/.probe-raw-*.json`. Raw captures NEVER hit the repo. Only the anonymised `test/fixtures/*.sample.json` + the human notes in `LIVE-API.md` are committed.

### Revisions (2026-06-11)

Ground-truth source: `.planning/research/keeping-openapi.json` mirrored from
`https://developer.keeping.nl/openapi.json`. Hand-curated delta:
`.planning/research/LIVE-API-FINDINGS.md`.

- **D-32-R (replaces D-32):** Timer functionality is in v1 scope. The Keeping
  v1 API exposes the full timer lifecycle through the existing `time-entries`
  resource:
  - `GET /{org_id}/time-entries/last` returns the most recent entry; the
    `ongoing: boolean` field is the canonical "is the timer running" signal.
  - `POST /{org_id}/time-entries/{entry_id}/stop` stops the running timer.
  - `POST /{org_id}/time-entries/{entry_id}/resume` resumes a stopped entry.
  - There is NO separate `/timers` collection.

  **Disposition:** TIMER-01 ships in a new Phase 2.5 carve-out (`keeping_timer_status` read tool only; `start`/`stop`/`resume` ride with Phase 3 writes per D-33). Phase 2's current rewrite (`/gsd-debug` session for slug `phase-2-api-contract`) stays scoped to the read+identity+metadata surface to keep the contract-fix atomic.
- **D-33-R (clarifies D-33):** Phase 2 still ships no timer-facing tool. Phase
  2.5 introduces `keeping_timer_status` (read-only) backed by
  `GET /{org_id}/time-entries/last` + the `ongoing` flag. Write-side timer
  tools (`keeping_start_timer`, `keeping_stop_timer`, `keeping_resume_timer`)
  remain in Phase 3 alongside the other write tools so the dry-run-by-default
  pattern stays consistent.
- **D-34-R (replaces D-34):** The "no field renaming" rule survives unchanged
  for `keeping_list_entries`. The corrections are on the request and on
  `KeepingUser`:
  - **Request path strategy:** All authenticated endpoints live under
    `/{organisation_id}/...` — NOT `/organisations/{organisation_id}/...`.
    `KeepingClient.request<T>(method, path)` prepends `https://api.keeping.nl/v1`
    only; tools build the path segment `/{orgId}/...` themselves. The single
    global endpoint at the base is `GET /organisations`.
  - **`/users/me` path:** `KeepingClient.me()` calls `/{orgId}/users/me`. It
    must resolve `orgId` from the cached `organisations()` list before issuing
    the request. Q1 RESOLVED contingency in `02-RESEARCH.md` is decided in
    favour of the org-scoped path.
  - **Endpoint name:** `time-entries` with a hyphen (the URL segment). The
    JSON wrapper key is `time_entries` with an underscore. Both are observed
    verbatim and must match exactly.
  - **List range params:** `?date=YYYY-MM-DD` (single day). Multi-day or
    multi-user ranges go through `GET /{org_id}/report/time-entries`.
    `keeping_list_entries` input retains `from`/`to`/`user_id` for ergonomic
    parity, but maps internally:
    - `from === to` (or `to` omitted) → `/{org_id}/time-entries?date={from}`
      (optionally with `user_id`).
    - `from !== to` → `/{org_id}/report/time-entries?from={from}&to={to}`
      (optionally with `user_id`).
  - **`KeepingUser` typing:** Match observed shape literally:
    `{ user: { id: number, first_name: string | null, surname: string | null, code: string | null, role: "administrator" | "team_manager" | "team_member", state: "needs_invite" | "invited" | "active" | "inactive" | "blocked" | "decoupled" } }`.
    The wrapper key `user` is preserved by `KeepingClient.me()` (no
    silent unwrap) so the `keeping_me` tool can decide on its own whether
    to flatten it or pass through.
  - **`KeepingOrg` typing:** Match observed shape:
    `{ id: number, name: string, url: string, current_plan: string, features: { timesheet: "times" | "hours", projects: boolean, tasks: boolean, breaks: boolean }, time_zone: string, currency: string }`.
    The `id` is numeric; `resolveOrgId()` continues to operate on the string
    form (env vars + tool inputs are strings) by `String(o.id)` coercion at
    the comparison boundary.
- **D-35-R (replaces D-35):** Live capture stays in `npm run probe-live`. The
  request path used for the capture is `GET /{org_id}/time-entries?date={today}`
  (single-day). The anonymisation denylist becomes the defensive observed-sensitive
  set:
  - Always: `note`, `first_name`, `surname` (the three confirmed-sensitive
    fields in real responses).
  - Identity / linkage: `code`, `email`, `name`, `user_name`, `user_email`,
    `client_name`, `project_name`, `task_name`, `description`. (Kept from the
    old list as defence-in-depth — these would be sensitive IF they appeared
    in a payload, even though they do not appear in current responses; cheap
    insurance against future schema additions.)
  - External references: `purpose`, `external_references`. (`purpose` is an
    enum and not strictly sensitive, BUT it can disclose category-of-work
    patterns over time; redact in committed fixtures.)
  - Numeric IDs are PRESERVED verbatim — they are opaque tokens, not PII.

  The drift guard test (Test 9 in `test/scripts/anonymise.test.ts`) is
  rewritten to assert the new denylist membership and exact size. Adding or
  removing a key without updating this revision in `02-CONTEXT.md` trips the
  test.

  `scripts/probe-live.ts` retains the `PROBE_WRITE_FIXTURE=1` env gate
  pending the user's explicit re-enable after this revision lands and a
  fresh probe-live run is reviewed; the gate then becomes redundant and can
  be removed in a follow-up cleanup commit.

### Claude's Discretion

- Exact HTTP library plumbing: native `fetch` + `p-retry` + `p-throttle` per STACK research; planner picks the wiring order.
- Pagination strategy for `keeping_list_entries`: best-guess offset (`page` / `per_page`) per FEATURES research; iterate if probe reveals cursor scheme. (Revision 2026-06-11: not paginated. Single-day endpoint returns full day; `report/time-entries` returns full range. No pagination params needed.)
- `keeping_list_entries` default `limit` value (200 per FEATURES recommendation). (Revision 2026-06-11: `limit` is now a client-side truncation guard since the API does not paginate; kept for forward-compatibility and Pitfall E protection.)
- Tool description copy for the 5 read tools — planner drafts; must include the timezone note for date params per Pitfall 5.
- MCP `initialize` JSON-RPC handshake CI smoke (D-15 deferred from Phase 1) — planner places it in `ci.yml`.
- HTTP error envelope: parse loosely; surface `errors[0].message` or `message` or raw body text — whichever exists — as the `isError` text. (Revision 2026-06-11: real envelope is `{ "error": { "message": "<string>" } }` — single-key, no `code`, no `details`. Tool error rendering may pull `error.message` for cleaner UX; current `KeepingApiError` wrapping of the raw text remains acceptable.)
- Anonymisation field list — D-35 step 3 lists the default; planner extends if probe reveals additional human-named fields. (Revision 2026-06-11: list is now LOCKED to D-35-R until the next CONTEXT revision.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Scope
- `.planning/PROJECT.md` — Core Value, locked Key Decisions table (incl. dry-run-by-default, auto-detect-single-org, schema-by-iteration)
- `.planning/REQUIREMENTS.md` — Phase 2 covers AUTH-04/05, IDENT-01/02/03, META-01/02, READ-01/02/03, SAFE-02/03/04/05; timer entry TIMER-01 updated by probe (D-32)
- `.planning/ROADMAP.md` §"Phase 2: Read Tools & Schema Discovery" — Goal, success criteria (esp. SC #3 schema discovery + SC #6 timer probe)

### Phase 1 Carry-forward (locked decisions Phase 2 must respect)
- `.planning/phases/01-foundation-scaffolding/01-CONTEXT.md` §D-01..D-21 — full Phase 1 decision set:
  - D-01..03 (src/ layout, ESM-only, Node >=22) — Phase 2 adds `src/server.ts`, `src/keeping/client.ts`, `src/keeping/types.ts`, `src/tools/*.ts`
  - D-04..05 (config loader + exact stderr error) — Phase 2 adds `KEEPING_ORG_ID` (already declared but currently unused) and may add `KEEPING_LOG_LEVEL` consumers
  - D-06..09 (stderr-only logger + token redaction + biome `noConsole`) — Phase 2 MUST NOT regress
  - D-13/D-15 (smoke test) — Phase 2 upgrades to MCP `initialize` JSON-RPC handshake assertion
  - D-20 (branch protection live) — Phase 2 work goes through feature branches + PRs, no direct push to `main`

### Research (locked stack + pitfalls)
- `.planning/research/STACK.md` — `@modelcontextprotocol/sdk ^1.29`, Zod 4, `p-retry`, `p-throttle`, native `fetch`. Already pinned.
- `.planning/research/ARCHITECTURE.md` §"Recommended Architecture" + §"Keeping HTTP Client" — 5-layer split; hand-rolled fetch wrapper ~150 LOC
- `.planning/research/ARCHITECTURE.md` §"Tool Registration Pattern" — `registerTool(name, {title, description, inputSchema, outputSchema?}, handler)` SDK pattern with Zod input schema
- `.planning/research/FEATURES.md` §"Per-Tool Specification" — input/output shapes for all 5 read tools (sole source of truth for Phase 2 schema sketches; UNVERIFIED fields will be confirmed by the live probe)
- `.planning/research/PITFALLS.md` §1 stdout pollution — applies to Phase 2 (server now boots)
- `.planning/research/PITFALLS.md` §2 token leak — error sanitization layer in `KeepingClient` is a Phase 2 task
- `.planning/research/PITFALLS.md` §5 timezone — Phase 2 documents the rule; Phase 3 implements `day` defaulting
- `.planning/research/PITFALLS.md` §7 rate limit exhaustion — informs the identity-cache decisions D-22..25
- `.planning/research/PITFALLS.md` §8 tool annotations — Phase 2 read tools MUST set `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`
- `.planning/research/PITFALLS.md` §12 schema drift — drives the fixture lock + CI parse test (D-36)
- `.planning/research/LIVE-API-FINDINGS.md` — ground-truth delta captured 2026-06-11; canonical source for D-32-R, D-34-R, D-35-R.
- `.planning/research/keeping-openapi.json` — verbatim mirror of `https://developer.keeping.nl/openapi.json`. Endpoint inventory, response schemas, enums.

### Output destinations (Phase 2 creates)
- `.planning/research/LIVE-API.md` — created by Phase 2; future phases read this
- `test/fixtures/time-entry-response.sample.json` — created by Phase 2; Phase 3 schema-drift test consumes it

### External (verify at planning time)
- https://www.npmjs.com/package/@modelcontextprotocol/sdk — confirm `^1.29` minor is still current
- https://www.npmjs.com/package/p-retry — confirm `^6.x`
- https://www.npmjs.com/package/p-throttle — confirm `^5.x`
- https://developer.keeping.nl/ — Keeping API docs SPA (still partially parseable); cross-reference any field names with what the live probe returns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/logger.ts` — stderr-only logger with `KEEPING_TOKEN` redaction at emit. KeepingClient MUST log through this (any object passed to `log.*` is automatically scrubbed via `String.prototype.replaceAll(token, "***")`).
- `src/config.ts` — Zod 4 schema already declares `KEEPING_ORG_ID` (optional) and `KEEPING_REQUIRE_CONFIRM` (default `true`). Phase 2 reads `org_id` from this config; Phase 3 reads `requireConfirm`.
- `bin/keeping-mcp.ts` — currently exits after `loadConfig()`. Phase 2 extends it: after config OK, construct `KeepingClient`, construct `McpServer`, call `registerTools()`, connect `StdioServerTransport`.

### Established Patterns
- Stderr-only logging (D-06..09) — every new module added in Phase 2 follows this. Biome `noConsole` enforces.
- Zod 4 with `z.stringbool()` for env booleans, `z.string({ error: "..." })` for missing-var messages (D-04..05 pattern). Phase 2 tool input schemas use Zod 4 directly.
- TDD discipline carries over (RED commit precedes GREEN commit per Phase 1 logger test pattern).

### Integration Points
- `bin/keeping-mcp.ts` is the only entry; nothing else holds the `StdioServerTransport`.
- `KeepingClient` is constructed once, in `bin/keeping-mcp.ts`, after `loadConfig()`. Passed to `registerTools()` so every tool shares one client (= one cache + one rate-limit queue).
- The MCP SDK `server.sendLoggingMessage({ level: "info", data: "..." })` is the protocol-channel log path; CLAUDE.md research notes it as the way to surface structured logs to the client. Use sparingly in Phase 2; stderr remains primary diagnostic.

### Files Phase 2 Will Create
- `src/server.ts` — McpServer instantiation + tool wiring (per ARCHITECTURE.md)
- `src/keeping/client.ts` — KeepingClient class (auth, throttle, retry, cache, error sanitisation)
- `src/keeping/types.ts` — minimal TS types for known response shapes (kept loose per D-34)
- `src/tools/me.ts`, `src/tools/organisations.ts`, `src/tools/projects.ts`, `src/tools/tasks.ts`, `src/tools/entries-list.ts` — one file per tool group
- `scripts/probe-live.ts` (or `.mjs`) — the one-shot script behind `npm run probe-live` (per D-30..D-32, D-35)
- `.planning/research/LIVE-API.md` — created by the probe-live script's first successful run
- `test/fixtures/time-entry-response.sample.json` — anonymised live capture (per D-35)
- Test files for client + each tool group under `test/`

</code_context>

<specifics>
## Specific Ideas

- Multi-org isError message wording (D-27): exact format `Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: <id> (<name>), <id> (<name>).` — used both at user-facing surface and in tests.
- Mid-session 401 message wording (D-25): exact `Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.`
- Probe script name: `npm run probe-live` (not `probe-timer` — captures schema too).
- Anonymisation default field list (D-35 step 3): `description`, `project_name`, `task_name`, `client_name`, `user_name`, `user_email`. IDs and timestamps preserved. (SUPERSEDED 2026-06-11 by D-35-R — see Revisions section above.)
- LIVE-API.md sections to populate on first run: "Timer endpoint result", "Time entry response shape", "Observed enum values (`purpose`, `timesheet_mode`)", "Pagination scheme observed", "Error envelope observed".
- Phase 2 CI smoke test (upgrade from D-13/D-15): pipe a minimal `initialize` JSON-RPC request into `node dist/bin/keeping-mcp.js` with a fake `KEEPING_TOKEN=kp_test_FAKE` env var; assert (a) exit code is 0 OR initialize-response is received then process kept open, (b) stdout contains ONLY valid JSON-RPC frames (no stray lines), (c) stderr does NOT contain the fake token. Exact mechanism: planner decides.

</specifics>

<deferred>
## Deferred Ideas

- `keeping_refresh_cache` tool — only useful if D-22 (forever-for-process cache) becomes friction in practice; revisit after Phase 4 launch feedback.
- `keeping_timer_status` read tool — Phase 2.5 carve-out per D-32-R / D-33-R. Backed by `GET /{org_id}/time-entries/last` + the `ongoing` flag.
- MCP Elicitation flow for confirmation — depends on Claude Code client support; track as v2 per existing UXv2-04.
- `outputSchema` on read tools — defer until wire format fully locked after Phase 2 live capture; ship in v1.x.
- Late-night session heuristic (before-06:00 Amsterdam → "did you mean yesterday?") — Phase 3 `keeping_add_entry`-only enhancement (UXv2-01 in REQUIREMENTS.md).
- ESLint plugin to ban `Date.toISOString()` on date fields — would prevent Pitfall 5 mechanically; defer until first regression surfaces.
- Removing the `PROBE_WRITE_FIXTURE=1` gate from `scripts/probe-live.ts` once a fresh probe-live run under D-35-R has been reviewed and the anonymised fixture committed.

</deferred>

---

*Phase: 2-Read Tools & Schema Discovery*
*Context gathered: 2026-06-10*
*Revised: 2026-06-11 — D-32, D-34, D-35 superseded; D-29 clarified for numeric ids*
