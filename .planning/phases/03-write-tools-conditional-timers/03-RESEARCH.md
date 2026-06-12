# Phase 3: Write Tools + Conditional Timers — Research

**Researched:** 2026-06-12
**Domain:** Keeping API write tools (POST/PATCH/DELETE) + timer lifecycle (start/stop/resume) over MCP with shared dry-run gate; Amsterdam timezone date defaulting via `Intl.DateTimeFormat` on Node 22 full-icu; `X-Server-Time-Ms` response-header capture
**Confidence:** HIGH (every claim is grounded in `.planning/research/keeping-openapi.json` §components.schemas / §paths, the live probe captured in `.planning/research/LIVE-API-FINDINGS.md`, the existing source tree, or a runtime check executed in this session)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Copied verbatim from `.planning/phases/03-write-tools-conditional-timers/03-CONTEXT.md` §decisions (D-3-01 .. D-3-26). All decisions below are LOCKED — the planner MUST honor them; research MUST NOT propose alternatives.

**Confirm Gate (Dry-Run-By-Default)**

- **D-3-01:** **AND-gate semantics.** A write tool calls the API only when `KEEPING_REQUIRE_CONFIRM === true` AND `confirm === true`. If env is `false`: writes go through without per-call confirm (power-user escape hatch — REL-05 README warning required). If env is `true` and `confirm !== true`: dry-run preview, no API call. Matches WRITE-04 phrasing exactly: "when `KEEPING_REQUIRE_CONFIRM` is `true` and `confirm !== true`, the tool returns a preview".
- **D-3-02:** Preview wire shape is `{ would_post: { method, url, body } }` for `add`/`update`. The `url` field is the FULL URL with base — `https://api.keeping.nl/v1/{orgId}/time-entries` etc. — not a relative path. Token is in the bearer header, not the URL, so no leak risk.
- **D-3-03:** Delete preview adds a sibling field `would_delete: <entry>`. On `delete_entry` with `confirm !== true` and `KEEPING_REQUIRE_CONFIRM=true`, the tool first calls `GET /{orgId}/time-entries/{id}` to fetch the entry, then returns `{ would_post: { method: "DELETE", url, body: null }, would_delete: <entry> }`. One extra read per preview only — never on the actual delete.
- **D-3-04:** **Shared write-gate helper** at `src/keeping/write-gate.ts`. Signature: `previewOrCall<T>(client, cfg, req): Promise<{ would_post } | T>` where `cfg = { requireConfirm: boolean, confirm: boolean }` and `req = { method: "POST"|"PATCH"|"DELETE", path: string, body?: unknown }`. All seven write tools call this helper. Delete-preview's extra GET lives in the `delete_entry` tool itself.

**Endpoint Verbs (OpenAPI ground-truth lock)**

- **D-3-05:** Endpoint verb table is canonical:
  | Op | Path | Method |
  |---|---|---|
  | add | `/{orgId}/time-entries` | `POST` |
  | update | `/{orgId}/time-entries/{entry_id}` | `PATCH` |
  | delete | `/{orgId}/time-entries/{entry_id}` | `DELETE` |
  | fetch one (for delete-preview) | `/{orgId}/time-entries/{entry_id}` | `GET` |
  | stop timer | `/{orgId}/time-entries/{entry_id}/stop` | **`PATCH`** |
  | resume timer | `/{orgId}/time-entries/{entry_id}/resume` | `POST` |
  | start timer | `/{orgId}/time-entries` (no end/no hours) | `POST` |

  **D-3-05 supersedes D-32-R's `stop = POST` claim** — OpenAPI documents `PATCH` for stop. D-32-R's `resume = POST` is correct and carries forward unchanged.
- **D-3-06:** **No dedicated `/start` endpoint exists.** `keeping_start_timer` implements start as `POST /{orgId}/time-entries` with `start` set (default: `nowAmsterdamISO()` per CONTEXT — see §"Critical correction" below for the request-body time-format issue) and BOTH `end` and `hours` omitted. Tool returns `{ timer_id: time_entry.id }`.

**Tool Input Surfaces**

- **D-3-07:** **`purpose` is the real OpenAPI enum, NOT `billable`/`non_billable`.** Zod schema: `z.enum(["work","break","special_leave","unpaid_leave","statutory_leave","sick_leave","work_reduction","trip"]).default("work")`. **D-3-07 supersedes WRITE-06 and ROADMAP SC #5** with respect to the enum values. Billable status in Keeping is determined at the PROJECT level, not on the entry. REQUIREMENTS.md WRITE-06 will be amended at execute time; ROADMAP SC #5 wording stays for historical traceability with a footnote citing D-3-07.
- **D-3-08:** **Org-mode-aware POST body.** Tool reads `features.timesheet: "times" | "hours"` from the cached `client.organisations()` for the resolved org id. If `times`: body uses `start`+`end`. If `hours`: body uses `hours` decimal. If `hours` not provided in `times` mode: tool returns an `isError` envelope.
- **D-3-09:** **Tool input fields:**
  - `keeping_add_entry`: `{ organisation_id?, date?, purpose?, project_id?, task_id?, note?, tag_ids?, external_references?, start?, end?, hours?, confirm?: boolean }`. `date` defaults to `todayInAmsterdam()` when omitted.
  - `keeping_update_entry`: `{ organisation_id?, entry_id: required, ...partial-of-add-fields, confirm?: boolean }`. PATCH semantics — only supplied fields sent.
  - `keeping_delete_entry`: `{ organisation_id?, entry_id: required, confirm?: boolean }`.
  - `keeping_start_timer`: `{ organisation_id?, project_id?, task_id?, note?, purpose?, start?, confirm?: boolean }`. `start` defaults to `nowAmsterdamISO()`. No `end`, no `hours`.
  - `keeping_stop_timer`: `{ organisation_id?, entry_id: required, confirm?: boolean }`.
  - `keeping_resume_timer`: `{ organisation_id?, entry_id: required, confirm?: boolean }`.
- **D-3-10:** **No `user_id` input on any write tool.** Keeping defaults `user_id` to the authenticated user.

**Annotations (WRITE-07)**

- **D-3-11:** All seven write tools annotate `readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true`. `keeping_delete_entry` description prominently states "**DESTRUCTIVE: permanently deletes the entry**".

**Confirm Parameter Description (SC #5)**

- **D-3-12:** Every write tool's `confirm` Zod field carries the exact description: `"Set to true ONLY after a human has reviewed the would_post preview returned by a prior dry-run call. The MCP client (LLM) MUST NOT set this autonomously — wait for the human to type 'yes' / 'confirm'."`

**Date / Time Defaulting (WRITE-08)**

- **D-3-13:** **`src/keeping/date.ts`** module exposes `todayInAmsterdam()` and `nowAmsterdamISO()` using `Intl.DateTimeFormat`. Both accept an injectable `now: Date` for deterministic tests. **`Date.toISOString()` is forbidden** for date fields.
- **D-3-14:** **Node 22 full-icu** is the runtime guarantee. Smoke test asserts `Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" })` produces `YYYY-MM-DD`.
- **D-3-15:** **DST-correct test:** mock `Date.now()` to `2026-06-12T22:30:00Z` (summer = next day Amsterdam). Assert preview body `date === "2026-06-13"`.

**Failure Classification (WRITE-05)**

- **D-3-16:** **Ambiguous-failure envelope** triggered when catch sees ANY of: `err instanceof KeepingApiError && err.status >= 500`, `err?.name === "AbortError"` (10s timeout), `err instanceof TypeError` (network). Returns `{ isError: true, content: [{ type: "text", text: "outcome unknown — verify with keeping_list_entries before retrying. (<original message>)" }] }`. Other errors flow through `toIsErrorContent(err)` unchanged.
- **D-3-17:** Ambiguous-failure helper lives in `src/keeping/write-gate.ts`. Single source of truth.

**TIMER-02 / Response Header Access**

- **D-3-18:** **New public method on `KeepingClient`:** `requestWithHeaders<T>(method, path, body?): Promise<{ body: T, headers: Headers }>`. Mirrors throttle + retry behavior of private `request<T>`. Backwards-compatible.
- **D-3-19:** Timer tools read `headers.get("X-Server-Time-Ms")`, parse to Number, use as canonical elapsed-time anchor. If missing/unparseable, fall back to `Date.now() - start` with a `log.warn(...)` stderr. Missing header is NOT an isError surface.

**Error / Multi-Org Inheritance**

- **D-3-20:** `MultiOrgError`, `KeepingAuthError`, `sanitiseBody` inherited from Phase 2 unchanged. No new error class.

**Test Strategy**

- **D-3-21..D-3-26:** Unit-only with `buildClient(mockClient) + InMemoryTransport.createLinkedPair()` pattern from Phase 2 / 2.5. Per-tool minimum test set: dry-run, confirm-path, env-false escape hatch, multi-org, 401, 4xx, 5xx ambiguous, path assertion, annotation assertion. Delete-preview, start-timer (no end/no hours assertion via strict `Object.keys`), stop-timer `X-Server-Time-Ms` header surfacing, DST date defaulting.

### Claude's Discretion

Copied verbatim from `.planning/phases/03-write-tools-conditional-timers/03-CONTEXT.md` §"Claude's Discretion":

- Exact file split inside `src/keeping/` for `write-gate.ts` vs `date.ts` vs `headers.ts` — planner decides whether to consolidate or split.
- Tool description copy (the AI-facing surface) — planner drafts; must include the confirm-from-human wording per D-3-12 and the destructive-warning per WRITE-07 / D-3-11.
- Fresh fixture file at `test/fixtures/time-entry-create-request.sample.json` (a sample POST body) vs constructing fixtures inline in tests — either acceptable. Phase 2.5 went inline.
- Server-side `User-Agent` header customisation (Keeping docs request it). Phase 1 / 2 didn't set one; can either ship now or defer.
- Whether to add a `keeping_get_entry` read tool (single-entry fetch) as a Phase 3 bonus — already implied by the delete-preview path.
- REQUIREMENTS.md amendment text for WRITE-06 and SC #5 footnote re: `purpose` enum — planner drafts.

### Deferred Ideas (OUT OF SCOPE)

Copied verbatim from `.planning/phases/03-write-tools-conditional-timers/03-CONTEXT.md` §deferred:

- `outputSchema` on write tools — defer per Phase 2 / 2.5 precedent.
- Late-night session heuristic (UXv2-01).
- Admin / team-scope writes (`user_id` input) — out of v1 scope per PROJECT.md (UXv2-03).
- `keeping_get_entry` as a public tool — Claude's Discretion.
- `User-Agent` header customisation — defer to a small follow-up unless planner bundles it.
- Bulk import / CSV — out of scope.
- Reporting / aggregation tools (REPv2-01).
- `keeping_start_timer` past-`start` semantics — defer richer semantics.
- MCP Elicitation-based confirmation flow (UXv2-04) — orthogonal to D-3-01..04.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (from REQUIREMENTS.md) | Research Support |
|----|------------------------------------|------------------|
| WRITE-01 | `keeping_add_entry` creates a new time entry for the authenticated user | §"Endpoint shapes" `POST /{orgId}/time-entries`; §"Request body — `entry_create_request`"; §"Standard Stack"; §Critical correction #2 (request-body time format) |
| WRITE-02 | `keeping_update_entry` edits an existing entry owned by the authenticated user | §"Endpoint shapes" `PATCH /{orgId}/time-entries/{entry_id}`; §"PATCH semantics confirmed partial"; §"Request body — `entry_edit_request`" |
| WRITE-03 | `keeping_delete_entry` deletes an existing entry | §"Endpoint shapes" `DELETE /{orgId}/time-entries/{entry_id}` returns **204 No Content**; §Critical correction #1 (KeepingClient.request<T> calls `res.json()` — will crash on 204; **MUST FIX**) |
| WRITE-04 | All write tools accept `confirm: boolean`; dry-run preview returns `would_post: { method, url, body }` when env=true and confirm!==true | §"`previewOrCall<T>` helper shape"; D-3-01..D-3-04 in §User Constraints |
| WRITE-05 | Write tools never auto-retry on network errors; ambiguous failure returns `isError: true` with "outcome unknown — verify with keeping_list_entries before retrying" | §"Ambiguous-failure envelope (D-3-16)"; §"`KeepingClient.shouldRetry` already excludes non-GET" (writes don't retry — SAFE-03 enforced at client level) |
| WRITE-06 | Write tools accept a `purpose` field (originally "billable"/"non_billable"; **superseded by D-3-07** — real OpenAPI enum) | §"`purpose` enum (8 values)"; planner drafts REQUIREMENTS.md amendment per CONTEXT §"Claude's Discretion" |
| WRITE-07 | Write tools annotate `destructiveHint: true, idempotentHint: false`; delete tool description states destructive nature | D-3-11; §"Annotation block — write variant" |
| WRITE-08 | Date fields default to today in Europe/Amsterdam, YYYY-MM-DD; never `Date.toISOString()` | §"Date / time defaulting"; §"Verified Intl.DateTimeFormat behavior on Node 22"; D-3-13..D-3-15 |
| TIMER-01 (start/stop/resume portion) | Timer lifecycle via existing time-entries resource per the 2026-06-11 live probe | §"Endpoint shapes" §"start (D-3-06)" / `PATCH /stop` / `POST /resume`; §"Resume can return 200 OR 201" |
| TIMER-02 | Timer tools use `X-Server-Time-Ms` from response headers to compute elapsed time | §"`X-Server-Time-Ms` header (CONFIRMED in OpenAPI info.description)"; D-3-18..D-3-19 |
</phase_requirements>

---

## Summary

This is a 100%-locked phase. CONTEXT.md §D-3-01..D-3-26 freezes every meaningful decision, so research's job is verification + filling small gaps the planner needs to write Zod schemas, mock shapes, and tests correctly — not exploration. Every claim below is grounded in `.planning/research/keeping-openapi.json` (mirror of `developer.keeping.nl/openapi.json`), the Phase 2 ground-truth probe captured in `.planning/research/LIVE-API-FINDINGS.md`, the existing source tree, or a runtime check executed in this session.

The most consequential finding is two **inconsistencies between CONTEXT.md / specifics and the OpenAPI spec** that the planner must address (see §"Critical Corrections" below): DELETE returns 204 No Content (existing `request<T>` will throw on that), and the request-body `start`/`end` fields are documented as **time-only `HH:mm` strings**, NOT full ISO 8601 datetimes as the §specifics example shows. Both are honest corrections of CONTEXT.md against ground truth; the planner should record the deltas before writing tasks.

**Primary recommendation:** Build Phase 3 by adding (a) `src/keeping/write-gate.ts` with `previewOrCall<T>` + `classifyAmbiguous(err)`, (b) `src/keeping/date.ts` with `todayInAmsterdam()` + `nowAmsterdamISOTimeOnly()` (NOT a full ISO timestamp — see §Critical Corrections), (c) `requestWithHeaders<T>` on `KeepingClient`, and (d) ONE small fix to `request<T>` so DELETE 204 doesn't crash. Then six write-tool files following the read-tool skeleton plus a strict-wrapper extractor for `{ time_entry, meta }` responses (D-2.5-05a pattern). Unit-only verification with Phase 2.5's `InMemoryTransport` pattern. No new external dependencies.

---

## Architectural Responsibility Map

The keeping-mcp 5-layer architecture is locked (bin → server.ts → tools/*.ts → keeping/client.ts → fetch). Within that, Phase 3 capabilities map to tiers as follows:

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tool registration + Zod input schema + annotations | `src/tools/<name>.ts` | — | Sibling pattern locked since Phase 2 (per-tool file, no abstraction layer) |
| Dry-run preview vs API-call decision | `src/keeping/write-gate.ts` (NEW) | tools/* | One shared helper consumed by all seven write tools (D-3-04) |
| Ambiguous-failure classification (5xx / AbortError / TypeError) | `src/keeping/write-gate.ts` (NEW) | tools/* | Single source of truth (D-3-17); tools call it from the catch arm |
| Multi-org resolution, identity cache, throttle, retry, sanitisation | `src/keeping/client.ts` (existing) | — | Reuse verbatim (D-3-20). The ONLY new method is `requestWithHeaders<T>` (D-3-18) |
| `X-Server-Time-Ms` header capture | `src/keeping/client.ts` (existing) + tools/* | — | Client exposes headers; timer tools read `X-Server-Time-Ms` and derive elapsed time (D-3-19) |
| Europe/Amsterdam date defaulting | `src/keeping/date.ts` (NEW) | tools/add-entry.ts, tools/start-timer.ts | Tiny stateless module — no client coupling (D-3-13) |
| Error envelope (SAFE-04) | `src/keeping/errors.ts` (existing) | tools/* | Reuse `toIsErrorContent` verbatim; no new error class (D-3-20) |
| Strict-wrapper read of `{ time_entry: ... }` responses | tools/* (each write tool) | — | Apply D-2.5-05a `Array.isArray` guard pattern when extracting the returned entry — keeps drift loud, not masked |
| Server registration (one call per new tool) | `src/server.ts` (existing) | — | Append six `register<Tool>` calls (or seven if `keeping_get_entry` ships per CONTEXT discretion) |
| Tests | `test/tools/*.test.ts` + `test/keeping/write-gate.test.ts` + `test/keeping/date.test.ts` | — | `InMemoryTransport.createLinkedPair()` + `buildClient(mockClient)` pattern from Phase 2.5 (D-3-21) |

Nothing in Phase 3 belongs in `bin/keeping-mcp.ts` (boot/transport), `src/config.ts` (env loading — `KEEPING_REQUIRE_CONFIRM` already plumbed), or `src/logger.ts` (stderr writer — reuse via `client.log` and `log.warn`).

---

## Critical Corrections — CONTEXT.md vs OpenAPI ground truth

> The planner MUST surface these before writing tasks. Each is a measurable mismatch between the locked CONTEXT and the OpenAPI spec / existing source. None of them reopen a D-3-* decision in spirit — they refine wire-format / runtime-behavior details the locked decision didn't anticipate.

### Correction #1 — DELETE returns `204 No Content`; `KeepingClient.request<T>` will throw `[VERIFIED: keeping-openapi.json line ~`responses.204`; src/keeping/client.ts:221]`

**Evidence:**
- `keeping-openapi.json` §paths `/{organisation_id}/time-entries/{entry_id}` DELETE responses: `"204": { "description": "Successfully deleted the time entry", "content": (none) }` — schema is absent, body is empty.
- `src/keeping/client.ts:221` does `return res.json();` unconditionally for `res.ok`. A `204 No Content` response has an empty body, and `Response.json()` rejects with `SyntaxError: Unexpected end of JSON input` on Node 22 (verified — `fetch`'s `Response.json()` does NOT special-case 204).

**Impact:** Without a fix, `keeping_delete_entry` will always surface an isError envelope reading "SyntaxError: Unexpected end of JSON input" — even on successful deletion. The dry-run gate doesn't help (preview never hits this path); only the confirm path is affected.

**Recommended fix (smallest possible):** In `KeepingClient.rawFetch`, after the `res.ok` check, branch on `res.status === 204` (or `res.headers.get("Content-Length") === "0"`) and return `null` or `undefined`. Then `keeping_delete_entry` returns `{ ok: true }` or similar from the tool layer regardless of API body. The change is one branch in `rawFetch` and stays compatible with every existing GET/POST/PATCH caller.

Alternative the planner may consider: make `delete<T>()` specifically tolerant in `client.ts` and leave `request<T>` unchanged. Slightly more surface but keeps the helper-method contract clear.

**This is the single highest-impact research finding for Phase 3.**

### Correction #2 — Request-body `start` / `end` are `HH:mm` time-only, NOT full ISO datetimes `[VERIFIED: keeping-openapi.json §components.schemas.entry_create_request]`

**Evidence:**
- `entry_create_request.start`: `"type": "string", "example": "13:45", "default": "11:06 (current time)"` with description "*You should **not** provide the full date, only a time is accepted by this property.*"
- `entry_create_request.end`: `"type": "string", "example": "15:15"` with the same description.
- The accepted format list in the description: "`g:ia` (e.g. `1:15pm`) and `G:i` (e.g. `13:15`) are both accepted." — both are PHP time-only formats, not date-time.
- The RESPONSE shape on `entry`: `start: "2026-06-11T13:45:10+02:00"` — full ISO 8601 with offset. The asymmetry is the trap: read-shape is full ISO, write-shape is `HH:mm`.

**Mismatch with CONTEXT.md:**
- D-3-13 says `nowAmsterdamISO()` returns `"YYYY-MM-DDTHH:mm:ss±HH:MM"` and that's used for the request body's `start` default.
- `03-CONTEXT.md` §specifics shows a preview example: `body: { date: "2026-06-12", start: "2026-06-12T14:30:00+02:00", end: "2026-06-12T16:00:00+02:00", ... }` — this would NOT match the OpenAPI request schema. Keeping documents that `start: "2026-06-12T14:30:00+02:00"` (a full date) is rejected; the entry's day comes from the `date` field exclusively.

**Recommended fix (smallest possible):** Rename / repurpose the helper in `src/keeping/date.ts`. Two functions:
- `todayInAmsterdam(now?: Date): string` → `"YYYY-MM-DD"` (unchanged — used for the `date` field).
- `nowInAmsterdamHHMM(now?: Date): string` → `"HH:mm"` (NEW — used for `start` defaults in `add_entry` + `start_timer`). 24-hour, zero-padded. No timezone suffix in the body (the API knows the org's timezone from `organisation.time_zone`).

The full-ISO `nowAmsterdamISO()` may still be useful for `start_timer`'s return surface or logs, but it MUST NOT appear in the request body. If the planner wants to keep the D-3-13 function name as the canonical "now in Amsterdam" anchor, that's fine — but the body must serialise the `HH:mm` portion only.

The DST-correct test (D-3-15) needs a parallel form: mock `Date.now()` to `2026-06-12T22:30:00Z` and assert preview body `{ date: "2026-06-13", start: "00:30" }` — the `date` is the day-rollover assertion, the `start` is the HH:mm conversion. `Date.toISOString()` remains forbidden.

This is a wire-format correction that affects the planner's Zod schema definitions and the test fixtures.

### Correction #3 — `time_zone` field name on organisation is `time_zone` (underscore), and `KeepingOrg.timezone` is the wrong key in some research docs `[VERIFIED: keeping-openapi.json §components.schemas.organisation; src/keeping/types.ts:50]`

`src/keeping/types.ts:50` already uses `time_zone` (correct). `.planning/research/LIVE-API-FINDINGS.md` §3 example shows `"timezone": "Europe/Amsterdam"` (one word) — that example is wrong against OpenAPI. Existing code is correct. No action needed for Phase 3; flagging to prevent the planner from typing `timezone` when consulting LIVE-API-FINDINGS.md.

---

## Standard Stack

> All dependencies are already installed. Phase 3 adds NO new external runtime or dev dependency. This section documents what's reused.

### Core (reused — already installed)

| Library | Installed Version | Purpose | Why |
|---------|------|---------|--------------|
| `@modelcontextprotocol/sdk` | `^1.29.0` (locked) `[VERIFIED: package.json:43]` | `McpServer.registerTool` + `Server.connect(transport)` + Phase 2's `InMemoryTransport` for tests | Inherited stack-lock from STACK.md; no change |
| `zod` | `^4.4.3` `[VERIFIED: package.json:46]` | Tool input schemas; `z.discriminatedUnion` for org-mode-aware add-entry body | NB the project is on **Zod 4 actual** (not 3.25). The `entries-list.ts` file uses `import { z } from "zod"` (v4 API). Continue this pattern. |
| `p-retry` | `^8.0.0` `[VERIFIED: package.json:44]` | Internal to `KeepingClient.request`. Write tools rely on `shouldRetry` returning `false` for non-GET (already enforced in `client.ts:188`) | SAFE-03 already implemented at the client level — tool layer adds nothing |
| `p-throttle` | `^8.1.0` `[VERIFIED: package.json:45]` | 120 req/min throttle applied at `request<T>` level | Already applied; `requestWithHeaders<T>` MUST inherit this throttle (see §"New code: KeepingClient extension") |
| Native `fetch` (Node 22) | N/A `[VERIFIED: process.versions.node=22.19.0, icu=77.1]` | All HTTP. `fetch` returns `Response.headers` already as a `Headers` instance — exactly what `requestWithHeaders<T>` returns | Already used by `rawFetch`; new method just exposes `headers` instead of dropping it |

### Supporting (reused — already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | `^4.1.8` `[VERIFIED: package.json:54]` | Unit tests with `vi.spyOn(global, "fetch")` mocks | Phase 2 + 2.5 pattern |
| `biome` | `^2.4.16` `[VERIFIED: package.json:49]` | Lint + format; `noConsole` rule already enforced | Forces all diagnostic output through `log.*` (which writes to stderr) |
| `tsup` | `^8.5.1` `[VERIFIED: package.json:51]` | ESM bundle to `dist/` | No build-config change for Phase 3 |

### NEW modules (no new dependencies)

| Module | Path | Purpose | Surface |
|--------|------|---------|---------|
| Write gate | `src/keeping/write-gate.ts` | Shared `previewOrCall<T>` + ambiguous-failure classifier | `previewOrCall<T>(client, cfg, req): Promise<{ would_post } \| T>`, `classifyAmbiguous(err): boolean` |
| Date defaulting | `src/keeping/date.ts` | Europe/Amsterdam date + time-of-day helpers | `todayInAmsterdam(now?: Date): string`, `nowInAmsterdamHHMM(now?: Date): string` (and optionally a full-ISO variant for non-body uses) |

### Installation

```bash
# No new packages. Phase 3 adds zero dependencies.
```

**Version verification commands** (planner re-confirm if more than 30 days have elapsed):
```bash
npm view @modelcontextprotocol/sdk version    # confirm 1.29.x still current
npm view zod version                           # confirm 4.4.x still current
```

## Package Legitimacy Audit

Phase 3 installs no external packages. All runtime + dev dependencies were vetted and committed in Phase 1 / Phase 2 Plan 02-01 (human-verified slopcheck fallback per `.planning/STATE.md` line 98).

| Package | Registry | Disposition |
|---------|----------|-------------|
| (none) | — | No new installs in Phase 3 |

---

## Architecture Patterns

### System Architecture Diagram (data flow for a single write call)

```
[MCP Client (Claude Code)] 
        │ tool call: keeping_add_entry { date, purpose, start, confirm? }
        ▼
[StdioServerTransport] (existing — bin/keeping-mcp.ts)
        │ JSON-RPC over stdin/stdout
        ▼
[McpServer.registerTool handler] (existing — McpServer in src/server.ts)
        │ Zod-parsed args
        ▼
[src/tools/add-entry.ts] (NEW)
        │ try { ... } catch (err) { classifyAmbiguous(err) ? ambiguous-envelope : toIsErrorContent(err) }
        │
        ├─→ [resolveOrgId(input.organisation_id)] ──→ KeepingClient.organisations() (cached)
        │
        ├─→ [organisation lookup for features.timesheet] (use cached orgs)
        │
        ├─→ [todayInAmsterdam() / nowInAmsterdamHHMM()] (defaulting) ──→ src/keeping/date.ts (NEW)
        │
        ├─→ [build body per mode (times | hours)]
        │
        ├─→ [previewOrCall<T>(client, { requireConfirm, confirm }, { method, path, body })] ──→ src/keeping/write-gate.ts (NEW)
        │     │
        │     ├─ if (requireConfirm && !confirm) → return { would_post: { method, url: BASE+path, body } }  (NO API CALL)
        │     │
        │     └─ else → client.post<T>(path, body)  ──→ KeepingClient.request<T> (existing)
        │                                                    │ p-throttle, no retry on POST
        │                                                    ▼
        │                                            [fetch → api.keeping.nl/v1] (network)
        ▼
[content: [{ type: "text", text: JSON.stringify(payload) }]]
        │ JSON-RPC response
        ▼
[MCP Client]
```

For TIMER tools, the same diagram applies but `client.post<T>` is replaced by `client.requestWithHeaders<T>(method, path, body)` (NEW). The tool reads `result.headers.get("X-Server-Time-Ms")` and derives elapsed time.

For DELETE preview, the diagram has one extra read step before `previewOrCall` returns: tool calls `client.get<unknown>("/${orgId}/time-entries/${entry_id}")` to populate `would_delete`. On the confirm path, no extra read.

### Recommended Project Structure (delta only)

```
src/
├── keeping/
│   ├── client.ts        # MODIFIED: + requestWithHeaders<T>; + 204-tolerant rawFetch (Correction #1)
│   ├── errors.ts        # UNCHANGED
│   ├── types.ts         # MODIFIED: + write-body types
│   ├── write-gate.ts    # NEW: previewOrCall<T> + classifyAmbiguous
│   └── date.ts          # NEW: todayInAmsterdam + nowInAmsterdamHHMM
├── tools/
│   ├── add-entry.ts     # NEW
│   ├── update-entry.ts  # NEW
│   ├── delete-entry.ts  # NEW
│   ├── start-timer.ts   # NEW
│   ├── stop-timer.ts    # NEW
│   └── resume-timer.ts  # NEW
└── server.ts            # MODIFIED: + 6 register* calls
```

### Pattern 1: Sibling write-tool skeleton

**What:** Each write tool file mirrors the read-tool skeleton (`src/tools/timer-status.ts` as the canonical reference) with an additional write-gate call and explicit ambiguous-failure branch in the catch.

**Source:** `src/tools/timer-status.ts:67-113` (existing), adapted.

**Sketch:**
```typescript
// src/tools/add-entry.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KeepingClient } from "../keeping/client.js";
import type { KeepingConfig } from "../config.js";
import { toIsErrorContent } from "../keeping/errors.js";
import { previewOrCall, classifyAmbiguous, AMBIGUOUS_TEXT } from "../keeping/write-gate.js";
import { todayInAmsterdam, nowInAmsterdamHHMM } from "../keeping/date.js";

const AddEntryInput = z.object({
  organisation_id: z.string().optional().describe("Override KEEPING_ORG_ID; required for multi-org tokens."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Calendar date YYYY-MM-DD; defaults to today in Europe/Amsterdam"),
  purpose: z.enum(["work","break","special_leave","unpaid_leave","statutory_leave","sick_leave","work_reduction","trip"]).default("work"),
  project_id: z.number().int().optional(),
  task_id: z.number().int().optional(),
  note: z.string().max(10000).optional(),
  tag_ids: z.array(z.number().int()).optional(),
  external_references: z.array(z.object({
    id: z.string().regex(/^[0-9a-f]{10,40}$/),
    type: z.literal("generic_work_reference"),
    name: z.string().max(191),
    url: z.string().max(2048).optional(),
  })).max(10).optional(),
  start: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?(am|pm)?$/i).optional().describe("HH:mm in org timezone; ignored if org timesheet is 'hours' mode"),
  end:   z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?(am|pm)?$/i).optional().describe("HH:mm in org timezone; ignored if org timesheet is 'hours' mode"),
  hours: z.number().min(0).max(1000).optional().describe("Required when org timesheet is 'hours' mode"),
  confirm: z.boolean().optional().describe("Set to true ONLY after a human has reviewed the would_post preview returned by a prior dry-run call. The MCP client (LLM) MUST NOT set this autonomously — wait for the human to type 'yes' / 'confirm'."),
});

export function registerAddEntry(server: McpServer, client: KeepingClient, config: KeepingConfig): void {
  server.registerTool(
    "keeping_add_entry",
    {
      title: "Create a time entry",
      description: "Create a new time entry. Dry-run by default — call with confirm: true ONLY after a human reviewed the preview. Body shape depends on org timesheet mode (times vs hours).",
      inputSchema: AddEntryInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (input) => {
      try {
        const orgId = await client.resolveOrgId(input.organisation_id);
        const orgs = await client.organisations();
        const org = orgs.find((o) => String(o.id) === orgId);
        if (!org) throw new Error(`Organisation ${orgId} not found in cache`); // defensive

        const date = input.date ?? todayInAmsterdam();
        const body: Record<string, unknown> = { date, purpose: input.purpose };
        if (input.project_id !== undefined) body.project_id = input.project_id;
        if (input.task_id !== undefined) body.task_id = input.task_id;
        if (input.note !== undefined) body.note = input.note;
        if (input.tag_ids !== undefined) body.tag_ids = input.tag_ids;
        if (input.external_references !== undefined) body.external_references = input.external_references;
        if (org.features.timesheet === "times") {
          body.start = input.start ?? nowInAmsterdamHHMM();
          if (input.end !== undefined) body.end = input.end;
        } else { // hours mode
          if (input.hours === undefined) {
            return toIsErrorContent(new Error("Organisation timesheet is in 'hours' mode; 'hours' input is required"));
          }
          body.hours = input.hours;
        }

        const result = await previewOrCall<{ time_entry: unknown; meta?: unknown }>(
          client,
          { requireConfirm: config.KEEPING_REQUIRE_CONFIRM, confirm: input.confirm === true },
          { method: "POST", path: `/${orgId}/time-entries`, body },
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        if (classifyAmbiguous(err)) {
          const msg = err instanceof Error ? err.message : String(err);
          return { isError: true, content: [{ type: "text", text: `${AMBIGUOUS_TEXT} (${msg})` }] };
        }
        return toIsErrorContent(err);
      }
    },
  );
}
```

The same skeleton fits `update-entry` (PATCH, partial body), `delete-entry` (DELETE, with extra GET in the dry-run path), `start-timer` (POST without `end`/`hours`), `stop-timer` (PATCH `/stop`, uses `requestWithHeaders<T>`), `resume-timer` (POST `/resume`, uses `requestWithHeaders<T>`).

### Pattern 2: Strict wrapper read of `{ time_entry, meta }` responses

**What:** Every write that returns a single entry wraps it as `{ time_entry: {...}, meta?: {...} }` per OpenAPI. Apply D-2.5-05a `Array.isArray` guard so drift is loud, not masked.

**Source:** `src/tools/timer-status.ts:58-65` (existing — verbatim three-clause guard).

```typescript
function extractWrittenEntry(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== "object") return null;
  const candidate = (raw as Record<string, unknown>).time_entry;
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  return candidate as Record<string, unknown>;
}
```

Each tool decides whether it wants to surface the raw wrapper (`{ time_entry, meta }`) or the extracted inner entry. Recommend surfacing the **raw wrapper verbatim** for symmetry with `keeping_timer_status` and the schema-discovery philosophy — only `start_timer` needs the extracted entry to derive `timer_id` per D-3-06.

### Pattern 3: `previewOrCall<T>` helper

**What:** The shared write-gate decides dry-run vs API-call.

**Sketch (D-3-04):**
```typescript
// src/keeping/write-gate.ts
import type { KeepingClient } from "./client.js";

const BASE = "https://api.keeping.nl/v1";

export type WriteMethod = "POST" | "PATCH" | "DELETE";

export interface WriteRequest {
  method: WriteMethod;
  path: string;        // e.g. "/47666/time-entries"
  body?: unknown;
}

export interface WriteGateConfig {
  requireConfirm: boolean;
  confirm: boolean;
}

export interface WouldPost {
  would_post: { method: WriteMethod; url: string; body: unknown };
}

export async function previewOrCall<T>(
  client: KeepingClient,
  cfg: WriteGateConfig,
  req: WriteRequest,
): Promise<WouldPost | T> {
  if (cfg.requireConfirm && !cfg.confirm) {
    return { would_post: { method: req.method, url: `${BASE}${req.path}`, body: req.body ?? null } };
  }
  switch (req.method) {
    case "POST":   return client.post<T>(req.path, req.body);
    case "PATCH":  return client.patch<T>(req.path, req.body);
    case "DELETE": return client.delete<T>(req.path);
  }
}

export const AMBIGUOUS_TEXT = "outcome unknown — verify with keeping_list_entries before retrying.";

export function classifyAmbiguous(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    if (err instanceof TypeError) return true; // network/DNS/TLS
  }
  // KeepingApiError.status >= 500
  if (err !== null && typeof err === "object" && "status" in err && typeof (err as { status: number }).status === "number") {
    return (err as { status: number }).status >= 500;
  }
  return false;
}
```

Notes:
- `BASE` is duplicated from `client.ts:32`. The planner can either (a) export `BASE` from `client.ts` and import here (cleaner), or (b) accept the duplication for clarity (D-3-02 says the preview URL is the full URL — keeping the constant adjacent to the preview construction makes the test assertion obvious).
- `classifyAmbiguous` checks `err.status >= 500` via duck-typing rather than `err instanceof KeepingApiError` to avoid a circular-ish import; equivalent semantically. Planner can switch to `instanceof` if cleaner — both work.
- Importantly: this helper does NOT touch retry. Retry is at the `KeepingClient.request` level, where `shouldRetry` already returns `false` for non-GET (`src/keeping/client.ts:188`). Write tools inherit "no retry" automatically.

### Pattern 4: `requestWithHeaders<T>` on `KeepingClient` (D-3-18)

**What:** New public method that mirrors `request<T>` but returns both body and headers.

**Sketch:**
```typescript
// src/keeping/client.ts (NEW method, appended)
async requestWithHeaders<T>(method: "POST" | "PATCH", path: string, body?: unknown): Promise<{ body: T; headers: Headers }> {
  // Same throttle + (no-retry-for-writes) behavior as request<T>.
  // Implemented as a small refactor: extract a `rawFetchWithResponse(method, path, body)` returning `{ body, headers }`,
  // call it from both request<T> (drops headers) and requestWithHeaders<T> (keeps headers).
  // OR: keep rawFetch unchanged and add a parallel rawFetchWithHeaders<T> that mirrors it.
  ...
}
```

Implementation guidance:
- The cleanest refactor is to change `rawFetch` to return `{ body, headers }` instead of `unknown`, and update `request<T>` to discard the headers. That keeps one fetch path. The diff is small (~10 lines).
- The throttle MUST be applied — passing a function into `this.throttle(...)` exactly as `request<T>` does (`client.ts:168`). Without that, two parallel `requestWithHeaders` calls bypass the 120 req/min rate limit.
- Retry: since timer write methods are PATCH/POST, `shouldRetry` returns `false` for them in the existing logic, so the new method should also wrap in `pRetry` for behavioral consistency even though no retry will fire. Cheap and keeps the surface uniform.
- The `Headers` instance has `.get("x-server-time-ms")` (case-insensitive — confirmed by the WHATWG `Headers` spec). Tools can read it directly.

### Pattern 5: Date defaulting via `Intl.DateTimeFormat` (D-3-13, Correction #2)

**What:** Tiny stateless module with two pure functions.

**Verified runtime behavior on Node 22.19.0 with ICU 77.1** (this session):

```text
Date('2026-06-12T22:30:00Z') in Europe/Amsterdam:
  en-CA format: "2026-06-13"             (the YYYY-MM-DD primary output)
  sv-SE longOffset parts: year=2026, month=06, day=13, hour=00, minute=30, second=00, timeZoneName="GMT+02:00"

Date('2026-12-15T23:30:00Z') in Europe/Amsterdam:
  en-CA format: "2026-12-16"             (winter rollover, CET)
  sv-SE longOffset parts: timeZoneName="GMT+01:00"
```

DST transition is correct in both directions. The `timeZoneName: "longOffset"` returns `"GMT+HH:MM"`; strip the `"GMT"` prefix to get `"+HH:MM"` if needed for a full ISO. For Phase 3 the request body wants `HH:mm` only, so `longOffset` is only needed if `nowAmsterdamISO()` is kept for non-body uses.

**Sketch:**
```typescript
// src/keeping/date.ts
export function todayInAmsterdam(now: Date = new Date()): string {
  // en-CA emits YYYY-MM-DD natively.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function nowInAmsterdamHHMM(now: Date = new Date()): string {
  // sv-SE emits 24h HH:mm format consistently.
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now);
}
```

Test strategy: inject `now: Date` for every assertion. No mocking of `Date.now` required if call sites consistently pass `now`. (CONTEXT D-3-15 says "mock `Date.now()`"; either works — passing `now` is simpler and matches the function's own optional parameter.)

### Anti-Patterns to Avoid

- **`Date.prototype.toISOString()` for any date field** — produces UTC, shifts day east of UTC. Forbidden per D-3-13. Smoke test greps `src/tools/*.ts` for `.toISOString(` (locked).
- **Using full ISO datetime for request-body `start`/`end`** — OpenAPI says HH:mm only. Don't repeat the §specifics example verbatim (see Correction #2).
- **Hand-rolling retry on writes** — `KeepingClient.shouldRetry` already returns `false` for non-GET. Tool layer must not add its own retry loop.
- **Inlining `previewOrCall` per tool** — D-3-04 mandates the shared helper. One source of truth.
- **Inlining `classifyAmbiguous` per tool** — D-3-17 mandates the shared classifier.
- **`console.log` / `console.error` / `process.stdout.write`** — Biome `noConsole` blocks. Use `log.warn(...)` etc.
- **Logging anything containing the request body when it includes a `note`** — `note` may contain user-confidential text. Use `log.warn` with structured messages, not body dumps.
- **Embedding `KEEPING_TOKEN` anywhere outside the `Authorization` header** — already enforced by `Object.defineProperty` non-enumerable token field; tools never see the token.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date formatting | Custom `pad2(d.getDate())` or `format(d, "YYYY-MM-DD")` helper | `Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" })` | `getDate()` returns the LOCAL machine day, which on a UTC-running CI box mis-fires. Intl handles DST and locale correctness for free. Node 22 ships full-icu. |
| DST detection | Custom "if month between 3 and 10 add 2 hours else add 1" | `Intl.DateTimeFormat("sv-SE", { timeZone: ..., timeZoneName: "longOffset" }).formatToParts(d)` | Manually applying DST gets the cutover days wrong. The Intl approach is correct on the cutover day itself. |
| Rate limiting | Custom token bucket in the tool layer | `KeepingClient` already has `p-throttle({ limit: 120, interval: 60_000 })` | One throttle at the HTTP layer covers every tool. Tool-layer throttles compose incorrectly. |
| Retry on write failure | `try { ... } catch { setTimeout(retry, 500) }` | DON'T retry — return ambiguous-failure envelope | Duplicate billable entries are materially worse than a manual re-check. SAFE-03 + Pitfall 3. |
| Multi-org error message construction | Custom join of org names | `MultiOrgError(orgs)` (existing) | D-27 wording is byte-locked; tests assert with `.toBe()`. |
| Token sanitization in error bodies | Custom regex strip | `sanitiseBody(text, token)` (existing) | Already applied inside `rawFetch` error path. New code in Phase 3 never touches raw response text — it goes through `request<T>` which already sanitises. |
| Confirm-gate per tool | Inline `if (config.KEEPING_REQUIRE_CONFIRM && !input.confirm) { return preview }` | Shared `previewOrCall<T>` helper (D-3-04) | One source of truth; one test file (`test/keeping/write-gate.test.ts`) covers the gate semantics for all seven tools. |
| Ambiguous-failure classification | Per-tool `if (err.status >= 500 || ...)` | Shared `classifyAmbiguous(err)` (D-3-17) | Same reasoning as above. |
| 204 No Content handling | Per-tool branch `if (status === 204) return null` | Fix inside `KeepingClient.rawFetch` (Correction #1) | The empty-body branch is a property of the HTTP layer, not the tool layer. One fix in `client.ts` makes every future delete-like endpoint safe. |
| `X-Server-Time-Ms` parsing per tool | Per-tool `Number(headers.get("X-Server-Time-Ms"))` with NaN guard | Optional: tiny helper `parseServerTimeMs(h: Headers): number \| null` in `write-gate.ts` (or co-located) | Three callers (`stop`, `resume`, possibly `start`). A 5-line helper avoids three NaN-guard copies. Planner discretion — inline is acceptable. |

**Key insight:** Every "common write-tool concern" (gating, classification, defaulting, header reading, retry exclusion) has a single home outside the tool files. Tool files end up shallow: input schema, body construction, one call into the helpers, one envelope.

---

## Runtime State Inventory

> Phase 3 is greenfield code addition with no migration semantics. No category requires data migration. Captured here for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — verified by inspection of `src/keeping/*.ts`. KeepingClient stores `meCache` and `orgsCache` in memory only; no on-disk state. The Keeping API is the only store; Phase 3 mutates it via the documented endpoints. | None |
| Live service config | **None** — Phase 3 does not change MCP capabilities, server.json, package.json `mcpName`, or any external registry. | None |
| OS-registered state | **None** — keeping-mcp runs as an `npx`-spawned child of the MCP client; no daemons, no scheduled tasks. | None |
| Secrets / env vars | `KEEPING_TOKEN`, `KEEPING_REQUIRE_CONFIRM`, `KEEPING_ORG_ID`, `KEEPING_LOG_LEVEL` all already declared in `src/config.ts`. Phase 3 reads `KEEPING_REQUIRE_CONFIRM` (already plumbed). **No new env vars.** | None |
| Build artifacts / installed packages | `dist/` rebuild on every `npm run build`. `package.json files: ["dist", "README.md", "LICENSE"]` whitelist is unchanged. New source files automatically included in next bundle. | Run `npm run build` after merge to confirm bundle is clean |

---

## Common Pitfalls

### Pitfall 1: DELETE 204 crashes the existing client

**What goes wrong:** `keeping_delete_entry` with `confirm: true` returns an `isError` envelope reading `SyntaxError: Unexpected end of JSON input` on every successful deletion.

**Why it happens:** `src/keeping/client.ts:221` does `return res.json()` unconditionally. A `204 No Content` body is empty; `Response.json()` rejects with SyntaxError.

**How to avoid:** Add a 204 branch in `rawFetch` (or in `delete<T>` specifically) that returns `null`/`undefined`. See §"Critical Correction #1".

**Warning signs:** A test that mocks DELETE with `new Response(null, { status: 204 })` and asserts the tool returns `isError: false` will catch this. Without that test, the bug ships silently.

### Pitfall 2: Request body sends full ISO datetime where API wants `HH:mm`

**What goes wrong:** Keeping returns 422 Validation failed on every `add_entry` with `start: "2026-06-12T14:30:00+02:00"`. The error message localised to Dutch (per LIVE-API-FINDINGS.md §5) is unhelpful for the developer.

**Why it happens:** Asymmetry between the response shape (full ISO with offset) and the request shape (time-only). The §specifics example in CONTEXT.md shows full ISO; the OpenAPI request schema documents `HH:mm`.

**How to avoid:** Use `nowInAmsterdamHHMM()` for defaults; have the Zod schema regex enforce `HH:mm` (or AM/PM). See §"Critical Correction #2".

**Warning signs:** Manual probe with `npm run probe-live` style script against a test org returns 422.

### Pitfall 3: `X-Server-Time-Ms` header missed because `requestWithHeaders<T>` doesn't share throttle

**What goes wrong:** Two concurrent `keeping_stop_timer` calls bypass the 120 req/min cap, eventually hitting 429. The throttle exists at the `request<T>` level; if `requestWithHeaders<T>` uses a separate `rawFetch` call NOT wrapped in `this.throttle(...)`, the throttle is bypassed.

**Why it happens:** Naive copy-paste of `rawFetch` without re-wrapping.

**How to avoid:** Refactor `rawFetch` to return `{ body, headers }`; have BOTH `request<T>` and `requestWithHeaders<T>` consume it through the same `this.throttle(...)` invocation. See Pattern 4.

**Warning signs:** Unit test that spawns 10 parallel `requestWithHeaders` calls and asserts the throttle's internal call counter stays within bounds — or simply rely on code review since the throttle is a single line.

### Pitfall 4: `note` content leaks via `would_post.body` echo

**What goes wrong:** The `note` field can contain confidential business text (LIVE-API-FINDINGS.md captured one in the raw probe). The preview shape `{ would_post: { body: { note: "..." } } }` echoes it back. The MCP client stores tool outputs in conversation history. This is by design — the user is the audience reviewing the preview — but it means the LLM also "sees" the note.

**Why it happens:** Confirm gate is a UX feature, not a privacy boundary.

**How to avoid:** Document the trade-off in README. Do NOT add note-redaction in the preview — that would defeat the review purpose. Keep `sanitiseBody` focused on tokens (where it already is).

**Warning signs:** A user reports surprise that the preview "sent my note to Claude". Pre-empt with README.

### Pitfall 5: `Intl.DateTimeFormat` falls back to ASCII when Node is built without full-icu

**What goes wrong:** A minimal Node 22 build (`--with-intl=small-icu`) returns `"2026-06-13"` but in a non-Europe/Amsterdam timezone, silently defaulting to UTC. `todayInAmsterdam()` returns the wrong day.

**Why it happens:** `small-icu` Node ships with English-locale data only and no full timezone DB; the `timeZone: "Europe/Amsterdam"` option silently degrades.

**How to avoid:** D-3-14 says the smoke test asserts `Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(...)` produces the right value. Add the explicit assertion in `test/keeping/date.test.ts` — e.g., mock a known UTC moment that crosses Amsterdam midnight and assert the day is correct. Also check `process.versions.icu` is set (truthy) — full-icu has it; small-icu does not.

**Verified this session:** Node 22.19.0 on Windows ships `process.versions.icu = "77.1"` and `Intl.DateTimeFormat` honors `Europe/Amsterdam` correctly. The CI matrix runs ubuntu + windows × node 22 + 24 (per `.planning/STATE.md` line 107), so the smoke test will catch any anomalous build.

**Warning signs:** Test assertion fails on a specific Node build/distro. Distinguish "ICU missing" (`process.versions.icu` undefined) vs "ICU present but wrong locale" (test fails on a specific date).

### Pitfall 6: `resume` returning 201 vs 200 — caller assumption breaks

**What goes wrong:** `resume_timer` test mocks 200 OK; production returns 201 Created (when a new ongoing entry is created on a NEW day, vs the same-day modification case). Tool layer's assertion on `result.time_entry.id === input.entry_id` is FALSE on 201 — the resumed entry has a different `id`.

**Why it happens:** Per OpenAPI: 200 = "modified an existing entry on `hours` timesheet" (same id); 201 = "created new ongoing entry" (different id). The §resume description warns: *"make sure to check `time_entry.id`"*.

**How to avoid:** Don't assert id-equality. Surface whatever id the API returns. The tool returns the wrapper `{ time_entry, meta }` verbatim. Document this in the tool description: "The returned `time_entry.id` may differ from the input `entry_id` — Keeping creates a new entry on a new day."

**Warning signs:** Pre-merge, a test fails when the mock returns a different `time_entry.id`. Add explicit test for both 200 and 201 paths.

### Pitfall 7: Overlap behavior (`meta.created_additional_time_entry_ids` / `modified_existing_time_entry_ids` / `deleted_existing_time_entry_ids`)

**What goes wrong:** Creating a `purpose: "break"` entry that overlaps existing work entries causes Keeping to AUTOMATICALLY split or modify those existing entries. The response `meta` lists the IDs. If the tool surfaces only `time_entry`, the user has no idea other entries were modified.

**Why it happens:** Documented Keeping behavior (entry_create_request.purpose description, lines 200-230 of the dumped schema): "*Keeping will adjust the `start` or `end` of your new entry as to prevent overlap with the break. Keeping will also split your new entry in multiple entries if necessary, in which case you receive one in `time_entry` and references to the others in `meta.created_additional_time_entry_ids`.*"

**How to avoid:** Surface the **full** API response wrapper (`{ time_entry, meta }`) verbatim from the tool, not just the inner entry. Recommend in tool description copy: "If `meta` contains non-empty arrays, other entries were modified/created/deleted by side effect."

**Warning signs:** None at code level; this is a UX concern. Test should assert the meta wrapper is passed through unchanged.

---

## Code Examples

### Verified `entry_create_request` shape (POST `/{orgId}/time-entries` body) `[VERIFIED: keeping-openapi.json §components.schemas.entry_create_request]`

For an org with `features.timesheet === "times"`:
```json
{
  "user_id": 789456,
  "date": "2026-06-12",
  "purpose": "work",
  "project_id": 56790,
  "task_id": 34567,
  "note": "Working on some e-mails",
  "tag_ids": [123, 456],
  "external_references": [
    {
      "id": "d69e192e3827b90e9d13e888317113e1",
      "type": "generic_work_reference",
      "name": "Send e-mail to venue",
      "url": "https://planner.ellas-evenementen.nl/todos/123456789"
    }
  ],
  "start": "13:45",
  "end": "15:15"
}
```

For an org with `features.timesheet === "hours"`:
```json
{
  "date": "2026-06-12",
  "purpose": "work",
  "project_id": 56790,
  "task_id": 34567,
  "note": "Working on some e-mails",
  "hours": 1.5
}
```

For a start-timer call (POST without `end` and `hours` — D-3-06):
```json
{ "date": "2026-06-12", "purpose": "work", "project_id": 56790, "start": "13:45" }
```

The omission of `end` triggers "ongoing entry" creation. (Schema description: *"If this property is left out of the response and `start` is in the past you will create an ongoing time entry."*)

### Verified POST `/{orgId}/time-entries` 201 response shape `[VERIFIED: keeping-openapi.json §paths]`

```json
{
  "time_entry": {
    "id": 456789123,
    "user_id": 789456,
    "date": "2026-06-12",
    "purpose": "work",
    "project_id": 56790,
    "task_id": 34567,
    "tag_ids": [],
    "note": "Working on some e-mails",
    "external_references": [],
    "start": "2026-06-12T13:45:10+02:00",
    "end": null,
    "hours": null,
    "ongoing": true,
    "locked": false,
    "is_direct_hours": true
  },
  "meta": {
    "created_additional_time_entry_ids": [],
    "modified_existing_time_entry_ids": [],
    "deleted_existing_time_entry_ids": []
  }
}
```

POST also returns **200 OK** in `hours` mode when the submitted body matches an existing entry — Keeping increments the existing entry's hours instead of creating a new one. Tool layer should treat 200 and 201 identically (both return the wrapper) — don't gate on status code.

### Verified PATCH `/{orgId}/time-entries/{entry_id}` semantics `[VERIFIED: keeping-openapi.json §info.description]`

> "PATCH — These requests are used to mutate data instances by either updating properties or executing a mutative command. The Keeping API does **not** support PUT, HEAD, OPTIONS or other unspecified HTTP methods."

PATCH accepts a partial body (subset of `entry_edit_request` fields). Only supplied fields are updated. Response shape mirrors POST 200 (`{ time_entry, meta }`). 422 on validation failure; 404 on missing entry; 403 on permission denied.

The `entry_edit_request` schema is identical to `entry_create_request` minus `user_id`, `date`, `purpose` (those three are documented as **immutable** once an entry exists — `entry_create_request.user_id` says "Once a time entry is created you cannot change its `user_id`"; same for `date` and `purpose`). The tool should reject these fields in `keeping_update_entry`'s Zod schema or silently drop them.

### Verified DELETE `/{orgId}/time-entries/{entry_id}` response `[VERIFIED: keeping-openapi.json §paths]`

```
204 No Content
(empty body)
```

`KeepingClient.request<T>` MUST be made 204-tolerant. See Correction #1.

### Verified `X-Server-Time-Ms` header `[VERIFIED: keeping-openapi.json §info.description, "Server time" section]`

> "To make sure you know the server time at the moment of processing your request Keeping sends along a special header in the response: `X-Server-Time-Ms`. The value is the current Unix Time on the server expressed in **milliseconds**."

Sent on ALL responses (documented as a general feature, not per-endpoint). Reading:

```typescript
const ms = Number(headers.get("X-Server-Time-Ms"));
const valid = Number.isFinite(ms) && ms > 0;
```

Use as the canonical "server now" anchor. For an ongoing timer with `start: "2026-06-12T13:45:10+02:00"` (full ISO from the entry response):

```typescript
const startMs = Date.parse(entry.start);              // "2026-06-12T13:45:10+02:00" → ms (UTC)
const elapsedMs = ms - startMs;
const elapsedHours = elapsedMs / 3_600_000;
```

D-3-19 fallback: if header missing/invalid, use `Date.now() - startMs` and emit `client.log.warn("X-Server-Time-Ms header missing on stop/resume response; falling back to local clock")` — NOT an isError.

### Verified `organisation.features.timesheet` enum `[VERIFIED: keeping-openapi.json §components.schemas.organisation.features.timesheet]`

```
"enum": ["times", "hours"]
"default": "times"
```

Exactly two values. `KeepingOrg.features.timesheet: "times" | "hours"` in `src/keeping/types.ts:43` is correct. D-3-08 mode-switch keys off this. (LIVE-API-FINDINGS.md §3 wrote `"times" | "..."` — incomplete enum hint; OpenAPI is canonical.)

### Verified rate-limit + usage etiquette `[VERIFIED: keeping-openapi.json §info.description, "Usage limitations" + "Usage etiquette"]`

> "You can make `120` requests to the API every `1` minute" + headers `X-RateLimit-Limit: 120`, `X-RateLimit-Remaining: <n>`, `Retry-After: 60` on 429, `X-RateLimit-Reset: <unix-seconds>`.

> "Do not send more than `3` requests in parallel" + "Please send along with the name of your software, its exact version and the developer's e-mail address in the `User-Agent` header."

The existing `KeepingClient.throttle = pThrottle({ limit: 120, interval: 60_000 })` honors the 120/min cap. The "3 parallel max" is a soft etiquette ask; `p-throttle` sequences requests so concurrency is bounded by the throttle rate, not an explicit concurrency limit. Phase 3 does not need to address this.

`User-Agent` is CONTEXT's "Claude's Discretion" item — planner decides whether to ship. The patch is small: add to the `headers:` literal in `rawFetch`:
```typescript
"User-Agent": "keeping-mcp/0.1.0 (https://github.com/red-square-software/keeping-mcp)"
```
(deriving the version from `package.json` is nice-to-have but not required).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Date.toISOString()` for date fields | `Intl.DateTimeFormat("en-CA", { timeZone })` for `YYYY-MM-DD` | Node 22 (full-icu by default) `[VERIFIED: process.versions.icu=77.1]` | Removes the UTC-day-shift bug; locale-correct DST handling for free |
| `pino`/`winston` logger | Tiny stderr writer (`src/logger.ts`) | Phase 1 lock | Zero dependency; never accidentally writes to stdout |
| MCP `tool()` deprecated method | `server.registerTool(name, { title, description, inputSchema, annotations }, handler)` | SDK 1.x stable | Annotations (incl. `destructiveHint`, `idempotentHint`) are a typed top-level option |
| Zod 3 with `z.object({ ... })` and `.parse` | Zod 4 same API surface — discriminated unions and enums work identically | Project upgraded to `^4.4.3` `[VERIFIED: package.json:46]` | Imports stay `import { z } from "zod"` (NOT `zod/v4` since the project uses v4 as the default) |

**Deprecated/outdated for this codebase:**
- LIVE-API-FINDINGS.md §3 mentions `"timezone"` (one word) on the org payload — the OpenAPI spec and existing `types.ts` use `time_zone` (underscore). Use the OpenAPI / `types.ts` form.
- `02-CONTEXT.md` §D-32 "no timer tool in v1" — superseded by D-32-R (timer in scope, status read in Phase 2.5, writes in Phase 3) and D-3-05 (verb correction).
- The §specifics preview body example in 03-CONTEXT.md uses full ISO datetimes for `start`/`end` — superseded by OpenAPI's `HH:mm`-only request shape (this RESEARCH.md §Correction #2).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `User-Agent` header customisation can be deferred without affecting publish-readiness | §Code Examples, Verified rate-limit + usage etiquette | LOW — Keeping docs say "Please send" not "MUST"; absence of a custom UA may register as a generic `node-fetch` UA but is unlikely to trigger blocking. Recommend planner ships it (1-line change) for politeness. |
| A2 | Refactoring `rawFetch` to return `{ body, headers }` does not break any existing test in `test/keeping/client.test.ts` | §Pattern 4 | MEDIUM — depends on whether tests assert on the raw `rawFetch` shape. Spot check: `test/keeping/client.test.ts` mocks `global.fetch` and asserts on TOOL output, not on `rawFetch` return shape. Risk is low. Planner should run the existing test suite as the first task after the refactor. |
| A3 | `org.features.breaks` is documented as boolean but the impact on `purpose: "break"` validation isn't enforced client-side | §Pitfall 7 | LOW — if a user sends `purpose: "break"` against an org with `breaks: false`, Keeping returns 422. The tool surfaces the error envelope. No silent corruption risk. |
| A4 | `external_references` items use the exact regex `^[0-9a-f]{10,40}$` for the `id` field; tag_ids are numeric | §Pattern 1 sketch | LOW — verified directly in the OpenAPI dump. Zod schema mirrors. |
| A5 | The shared `BASE` constant (`https://api.keeping.nl/v1`) is the same for preview URL construction as for live requests | §Pattern 3 sketch | LOW — already hardcoded in `client.ts:32`. Constant is server-environment-stable. |
| A6 | 200 vs 201 distinction on POST `/time-entries` (existing-entry merge vs new-entry create in `hours` mode) does not require tool-layer branching | §Code Examples, POST 201 response | LOW — both paths return the same `{ time_entry, meta }` shape per OpenAPI. Tool surfaces the wrapper verbatim. |

If the Assumptions Log is non-empty (it is), the planner / discuss-phase reviewer should glance at each row. A1 in particular is a 1-line opportunity the planner can either bundle or defer per CONTEXT's "Claude's Discretion".

---

## Open Questions

1. **Should `keeping_get_entry` ship as a public tool, or stay internal to `keeping_delete_entry`'s dry-run path?**
   - What we know: D-3-03 mandates `GET /{orgId}/time-entries/{entry_id}` before delete preview. The internal call is required; the question is whether to expose it via a public tool too.
   - What's unclear: User intent. The CONTEXT §"Claude's Discretion" item explicitly defers to the planner.
   - Recommendation: Ship it. The cost is one tool file (~30 lines mirroring `timer-status.ts`) and one test file. The benefit is that `keeping_update_entry`'s caller can read the current state before constructing the partial update — which matches the "review-before-write" philosophy.

2. **Should `nowAmsterdamISO()` (full ISO `YYYY-MM-DDTHH:mm:ss±HH:MM`) be kept at all, given the request body wants `HH:mm`?**
   - What we know: D-3-13 specifies it for `start_timer`'s `start` default. But D-3-13 was written before the OpenAPI ground-truth check.
   - What's unclear: Whether the planner wants a single canonical "now in Amsterdam" function or two functions (date-only + time-only).
   - Recommendation: Two functions — `todayInAmsterdam()` and `nowInAmsterdamHHMM()`. Drop full-ISO entirely from Phase 3 scope; the response side returns full ISO but the tool layer can pass through verbatim without parsing.

3. **What does `keeping_resume_timer` do when the user resumes an entry whose `purpose` is `break` and breaks are now disabled on the org?**
   - What we know: OpenAPI says 403 in this case (resume description: "you cannot resume locked time entries, and trying to do so will result in a `403`").
   - What's unclear: Whether 403 should surface as ambiguous-failure or definite-fail.
   - Recommendation: 403 is a definite-fail per D-3-16's "4xx flows through `toIsErrorContent`" branch. Tool returns the localised error message verbatim. No special-casing.

4. **Should `keeping_stop_timer` reject a non-ongoing entry with a friendly message before hitting the API?**
   - What we know: OpenAPI says "you can only stop an ongoing time entry"; mismatched calls return error.
   - What's unclear: Whether the tool should do a pre-flight `GET` to check `ongoing` (extra cost, extra latency) or just surface the API's 422.
   - Recommendation: NO pre-flight. Let the API decide. Reduces complexity and matches the read-tool-then-write workflow the user is expected to follow (`keeping_timer_status` first, then `keeping_stop_timer`).

---

## Environment Availability

> Phase 3 has no external CLI or service dependencies beyond what Phase 1/2 already requires. The Keeping API is the only external dependency, and the OpenAPI spec is already mirrored locally.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ `[VERIFIED: process.versions.node]` | 22.19.0 | — |
| ICU full data | `Intl.DateTimeFormat("Europe/Amsterdam")` | ✓ `[VERIFIED: process.versions.icu]` | 77.1 | — (D-3-14 smoke test fails loudly if missing) |
| `@modelcontextprotocol/sdk` | All tool registrations | ✓ (already installed) | `^1.29.0` | — |
| `zod` | All input schemas | ✓ (already installed) | `^4.4.3` | — |
| Keeping API | Live writes / reads | ✓ (live probe in Phase 2 confirmed reachability) | v1 | None — outage propagates as TypeError → ambiguous envelope |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

---

## Project Constraints (from CLAUDE.md)

CLAUDE.md is currently the same as PROJECT.md (no separate file; both reference the same constraints). Constraints relevant to Phase 3 that the planner MUST verify in plans:

| Constraint | Source | How Phase 3 honors it |
|------------|--------|----------------------|
| TypeScript + `@modelcontextprotocol/sdk` + Zod for input schemas | PROJECT.md §Constraints | Locked stack reused; no new dep |
| MIT license | PROJECT.md §Constraints | No license change |
| Hosting / namespace `io.github.red-square-software/keeping-mcp` | PROJECT.md §Constraints | Not touched in Phase 3 (Phase 4 concern) |
| `KEEPING_TOKEN` never in logs / tool output / commits | PROJECT.md §Constraints | Token is non-enumerable property; `sanitiseBody` runs in `rawFetch` error path; new code in Phase 3 only adds dry-run preview body that includes user inputs, never the token (token is in bearer header only) |
| Respect 120 req/min rate limit | PROJECT.md §Constraints | `p-throttle` at HTTP layer; new `requestWithHeaders<T>` MUST share the throttle (see §Pattern 4) |
| Scope writes to authenticated user | PROJECT.md §Constraints | D-3-10 — no `user_id` input on any write tool |
| Cross-platform (Windows + macOS + Linux) | PROJECT.md §Constraints | New code uses no path manipulation; `Intl.DateTimeFormat` is platform-independent; CI matrix in Phase 1 covers ubuntu + windows |
| Stderr-only logging | CLAUDE.md (project guidelines) | Reuse `client.log.*`; Biome `noConsole` rule blocks `console.log` |
| TDD discipline | CLAUDE.md | D-3-22 specifies the per-tool test set; planner schedules RED-GREEN per tool |
| Node engines >= 22 | CLAUDE.md, `package.json:7` | Node 22-only APIs (e.g., `AbortSignal.timeout`) already used in existing code |

---

## Sources

### Primary (HIGH confidence — used as canonical ground truth)

- `.planning/research/keeping-openapi.json` — Local mirror of `developer.keeping.nl/openapi.json`. §paths and §components.schemas inspected via dedicated Node script (`Intl` + JSON.parse, BOM-stripped). All endpoint verbs, request schemas (`entry_create_request`, `entry_edit_request`), response schemas (`entry`, `organisation`), and the `X-Server-Time-Ms` documentation in §info.description verified here.
- `.planning/research/LIVE-API-FINDINGS.md` — Phase 2 live probe (2026-06-11 against org 47666). §3 response shapes for `GET /organisations`, `GET /{orgId}/users/me`, `GET /{orgId}/time-entries`, `GET /{orgId}/time-entries/last`. §5 error envelope shape.
- `src/keeping/client.ts`, `src/keeping/errors.ts`, `src/keeping/types.ts`, `src/tools/timer-status.ts`, `src/tools/entries-list.ts`, `src/server.ts`, `src/config.ts`, `src/logger.ts`, `package.json`, `biome.json`, `.planning/config.json` — read in full during this research session.
- Runtime check: `node` 22.19.0 with `process.versions.icu = "77.1"` — executed `Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" })` for both summer and winter UTC moments; both correctly rolled over to the next day in Amsterdam. `Intl.DateTimeFormat("sv-SE", { ..., timeZoneName: "longOffset" }).formatToParts(...)` correctly emitted `GMT+02:00` (CEST) and `GMT+01:00` (CET).

### Secondary (MEDIUM confidence — used for cross-reference)

- `.planning/research/PITFALLS.md` — §3 (no-retry on writes), §5 (timezone), §8 (annotations) confirm Phase 3 strategy.
- `.planning/research/STACK.md` — version recommendations (planner installed `zod ^4.4.3` rather than the recommended `^3.25.0`; both work with SDK 1.29 per the STACK doc's compatibility table).
- `.planning/STATE.md` — Phase 2 / 2.5 completion context and locked decisions for client architecture.
- `.planning/ROADMAP.md` §"Phase 3: Write Tools + Conditional Timers" — 6 Success Criteria; SC #5 wording superseded by D-3-07.

### Tertiary (LOW confidence — none used as authoritative for this research)

- No WebSearch performed; all claims derive from local sources or the runtime check.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version is read directly from `package.json`.
- Endpoint verbs + request/response shapes: HIGH — read directly from the local OpenAPI mirror and cross-checked against `LIVE-API-FINDINGS.md`.
- Date defaulting behavior: HIGH — runtime-verified this session on the target platform/version.
- DELETE 204 behavior: HIGH — `Response.json()` rejecting on empty body is well-documented in WHATWG; existing source unambiguously calls `res.json()` unconditionally.
- Request-body `start`/`end` as `HH:mm`: HIGH — OpenAPI `entry_create_request` schema is explicit and includes both examples and "do not provide the full date" wording.
- Resume 200-vs-201 semantics: HIGH — OpenAPI examples explicit; description states "make sure to check `time_entry.id`".
- Pitfalls 3/4/7: MEDIUM — derived from OpenAPI behavior descriptions; not independently runtime-verified, but the behavior is documented in primary sources.

**Research date:** 2026-06-12
**Valid until:** 2026-07-12 (30 days; Keeping API ground truth is stable per Phase 2 probe; recheck if a Keeping changelog entry indicates schema changes)
