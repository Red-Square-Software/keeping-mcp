# Phase 3: Write Tools + Conditional Timers - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the four write tools — `keeping_add_entry`, `keeping_update_entry`,
`keeping_delete_entry` — plus the three timer write tools —
`keeping_start_timer`, `keeping_stop_timer`, `keeping_resume_timer`. All seven
tools are dry-run-by-default through a single shared write-gate helper. Tools
reuse Phase 2's `KeepingClient.post/patch/delete`, `resolveOrgId`,
`KeepingApiError`, `MultiOrgError`, `KeepingAuthError`, `sanitiseBody`, and
`toIsErrorContent` unchanged. One new `requestWithHeaders<T>` method is added
to `KeepingClient` so timer tools can read `X-Server-Time-Ms` (TIMER-02). One
new tiny `src/keeping/date.ts` module exposes `todayInAmsterdam()` and
`nowAmsterdamISO()` using `Intl.DateTimeFormat` (no new dependencies).

Requirements covered:
- **WRITE-01..WRITE-08** in full.
- **TIMER-01** start/stop/resume portion (status-read portion shipped in
  Phase 2.5).
- **TIMER-02** (`X-Server-Time-Ms` accurate elapsed-time).

**Out of scope (later phases):**
- Bulk import.
- Reporting/aggregation tools (REPv2-01).
- `outputSchema` on write tools (defer per Phase 2 / 2.5 precedent until
  the wire format is locked across a full ship cycle).
- Late-night session heuristic (UXv2-01).

</domain>

<decisions>
## Implementation Decisions

### Confirm Gate (Dry-Run-By-Default)

- **D-3-01:** **AND-gate semantics.** A write tool calls the API only when
  `KEEPING_REQUIRE_CONFIRM === true` AND `confirm === true`. If env is
  `false`: writes go through without per-call confirm (power-user escape
  hatch — REL-05 README warning required). If env is `true` and
  `confirm !== true`: dry-run preview, no API call. Matches WRITE-04 phrasing
  exactly: "when `KEEPING_REQUIRE_CONFIRM` is `true` and `confirm !== true`,
  the tool returns a preview".
- **D-3-02:** Preview wire shape is
  `{ would_post: { method, url, body } }` for `add`/`update`. The `url`
  field is the FULL URL with base —
  `https://api.keeping.nl/v1/{orgId}/time-entries` etc. — not a relative
  path. Token is in the bearer header, not the URL, so no leak risk.
- **D-3-03:** Delete preview adds a sibling field `would_delete: <entry>`.
  Implementation: on `delete_entry` with `confirm !== true` and
  `KEEPING_REQUIRE_CONFIRM=true`, the tool first calls
  `GET /{orgId}/time-entries/{id}` to fetch the entry, then returns
  `{ would_post: { method: "DELETE", url, body: null }, would_delete: <entry> }`.
  One extra read per preview only — never on the actual delete. Honors
  ROADMAP SC #3 literally ("returns the entry that would be deleted").
- **D-3-04:** **Shared write-gate helper** at `src/keeping/write-gate.ts`
  (or equivalent within `src/keeping/`). Signature roughly:
  `previewOrCall<T>(client, cfg, req): Promise<{ would_post } | T>` where
  `cfg = { requireConfirm: boolean, confirm: boolean }` and
  `req = { method: "POST"|"PATCH"|"DELETE", path: string, body?: unknown }`.
  All four "object-writes" tools (add, update, delete, plus the three timer
  writes) call this helper. Delete-preview's extra GET happens in the
  `delete_entry` tool itself (it owns the `would_delete` enrichment), not in
  the gate.

### Endpoint Verbs (OpenAPI ground-truth lock)

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

  Verbs are read from `.planning/research/keeping-openapi.json`. **D-3-05
  supersedes D-32-R's `stop = POST` claim** — OpenAPI documents `PATCH` for
  stop. D-32-R's `resume = POST` is correct and carries forward unchanged.
- **D-3-06:** **No dedicated `/start` endpoint exists.** `keeping_start_timer`
  implements start as `POST /{orgId}/time-entries` with `start` set (default:
  `nowAmsterdamISO()`) and BOTH `end` and `hours` omitted. Keeping marks the
  returned entry `ongoing: true`. Tool returns `{ timer_id: time_entry.id }`
  (canonical handle for subsequent stop/resume calls). The wire body still
  flows through the shared write-gate helper.

### Tool Input Surfaces

- **D-3-07:** **`purpose` is the real OpenAPI enum, NOT `billable`/`non_billable`.**
  Zod schema is `z.enum(["work","break","special_leave","unpaid_leave","statutory_leave","sick_leave","work_reduction","trip"]).default("work")`.
  **D-3-07 supersedes WRITE-06 and ROADMAP SC #5** with respect to the
  enum values: `billable`/`non_billable` do NOT exist as `purpose` values in
  the live Keeping API. Billable status in Keeping is determined at the
  PROJECT level (project configuration), not on the entry. REQUIREMENTS.md
  WRITE-06 will be amended at execute time (the planner records the
  amendment); the ROADMAP SC #5 wording stays for historical traceability
  and a footnote citing D-3-07 is added.
- **D-3-08:** **Org-mode-aware POST body.** Tool reads
  `features.timesheet: "times" | "hours"` from the cached
  `client.organisations()` for the resolved org id. If `times`: body uses
  `start`+`end` ISO datetimes (default `start = nowAmsterdamISO()`,
  `end = nowAmsterdamISO()` only when explicitly provided — start_timer
  omits `end`). If `hours`: body uses `hours` decimal (required input;
  if not provided in `times` mode, the tool returns an
  `isError` envelope explaining the org is in `times` mode). Zod
  discriminated union or per-mode branching — planner picks.
- **D-3-09:** **Tool input fields** for write tools:
  - `keeping_add_entry`: `{ organisation_id?, date?, purpose?, project_id?, task_id?, note?, tag_ids?, external_references?, start?, end?, hours?, confirm?: boolean }`.
    `date` defaults to `todayInAmsterdam()` when omitted.
  - `keeping_update_entry`: `{ organisation_id?, entry_id: required, ...partial-of-add-fields, confirm?: boolean }`. PATCH semantics — only supplied fields are sent.
  - `keeping_delete_entry`: `{ organisation_id?, entry_id: required, confirm?: boolean }`.
  - `keeping_start_timer`: `{ organisation_id?, project_id?, task_id?, note?, purpose?, start?, confirm?: boolean }`. `start` defaults to `nowAmsterdamISO()`. No `end`, no `hours` (those make it not-a-timer).
  - `keeping_stop_timer`: `{ organisation_id?, entry_id: required, confirm?: boolean }`.
  - `keeping_resume_timer`: `{ organisation_id?, entry_id: required, confirm?: boolean }`.
- **D-3-10:** **No `user_id` input on any write tool.** Keeping defaults
  `user_id` to the authenticated user when omitted (verified in
  `entry_create_request` schema). Admin/team-scope writes are out of v1
  scope (PROJECT.md). This keeps the input surface narrow and matches
  Phase 2.5's `{ organisation_id? }`-only precedent.

### Annotations (WRITE-07)

- **D-3-11:** All seven write tools annotate
  `readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true`.
  `keeping_delete_entry` additionally puts "**DESTRUCTIVE: permanently deletes the entry**"
  prominently in its `description` per WRITE-07.

### Confirm Parameter Description (SC #5)

- **D-3-12:** Every write tool's `confirm` Zod field carries the exact
  description: `"Set to true ONLY after a human has reviewed the would_post
  preview returned by a prior dry-run call. The MCP client (LLM) MUST NOT
  set this autonomously — wait for the human to type 'yes' / 'confirm'."`
  Wording matches the spirit of SC #5 ("must be set by the user after
  reviewing the preview, not autonomously by the model").

### Date / Time Defaulting (WRITE-08)

- **D-3-13:** **`src/keeping/date.ts`** module (new file) exposes:
  - `todayInAmsterdam(now: Date = new Date()): string` returning
    `YYYY-MM-DD` via `Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year, month, day })`.
  - `nowAmsterdamISO(now: Date = new Date()): string` returning
    `YYYY-MM-DDTHH:mm:ss±HH:MM` via `Intl.DateTimeFormat("sv-SE", ..., timeZoneName: "longOffset")`
    plus manual assembly of the offset string.
  - Both functions accept an injectable `now: Date` for deterministic tests.
  - **`Date.toISOString()` is forbidden** for date fields. Lint hint: a
    smoke test greps `src/tools/*.ts` for `.toISOString(` — should hit
    zero in the new write tool files (acceptable in non-date contexts but
    we are strict to honor WRITE-08).
- **D-3-14:** **Node 22 full-icu** is the runtime guarantee. The smoke test
  asserts `Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(...)`
  produces `YYYY-MM-DD`. If a build of Node 22 ever ships without full-icu
  this test fails loudly.
- **D-3-15:** **DST-correct test** (ROADMAP SC #4): mock `Date.now()` to a
  UTC moment that's the next day in Amsterdam (e.g., `2026-06-12T22:30:00Z`
  in summer = `2026-06-13T00:30:00+02:00` in Amsterdam). Assert preview body
  `date === "2026-06-13"`.

### Failure Classification (WRITE-05)

- **D-3-16:** **Ambiguous-failure envelope** is triggered when the catch
  arm sees ANY of:
  - `err instanceof KeepingApiError && err.status >= 500`,
  - `err?.name === "AbortError"` (10 s timeout fired),
  - `err instanceof TypeError` (network / DNS / TLS error).

  These return `{ isError: true, content: [{ type: "text", text: "outcome unknown — verify with keeping_list_entries before retrying. (<original message>)" }] }`.
  All other errors (4xx validation, 401 via KeepingAuthError, MultiOrgError,
  any other non-retry-class) flow through `toIsErrorContent(err)` unchanged
  per SAFE-04 — "definite-fail" path.
- **D-3-17:** The ambiguous-failure helper lives in
  `src/keeping/write-gate.ts` (or co-located with `previewOrCall`). Tools
  do NOT inline the classification — single source of truth, single test
  target.

### TIMER-02 / Response Header Access

- **D-3-18:** **New public method on `KeepingClient`:**
  `requestWithHeaders<T>(method, path, body?): Promise<{ body: T, headers: Headers }>`.
  Mirrors the throttle + retry behaviour of the private `request<T>`
  (writes still don't retry per SAFE-03). Returns the `Headers` object
  from the underlying fetch Response. Existing read/write tools keep
  using `client.get/post/patch/delete`; only the three timer write tools
  reach for `requestWithHeaders`. Backwards-compatible — no caller of
  `get/post/patch/delete` changes.
- **D-3-19:** Timer tools read `headers.get("X-Server-Time-Ms")`, parse to
  Number, and use it as the canonical elapsed-time anchor (TIMER-02). If
  the header is missing or unparseable, fall back to `Date.now() - start`
  with a stderr warning via `log.warn(...)` (Pitfall 5 / TIMER-02 spirit
  — accurate header preferred but defensive fallback so the tool still
  works). Missing header is NOT an isError surface.

### Error / Multi-Org Inheritance (Phase 2 carry-forward)

- **D-3-20:** `MultiOrgError` (D-27 wording), `KeepingAuthError` (D-25
  wording), and `sanitiseBody` are inherited from Phase 2 unchanged. Write
  tools do NOT add new error classes. The ambiguous-failure envelope from
  D-3-16 is a presentation layer atop existing `KeepingApiError`, not a new
  error type.

### Test Strategy

- **D-3-21:** **Unit tests are the only verification surface.** Each tool
  has a sibling `test/tools/<tool>.test.ts` with the
  `buildClient(mockClient) + InMemoryTransport.createLinkedPair()`
  pattern from Phase 2 / 2.5. Mocks return `{ time_entry: ... }`
  wrappers per D-34-R. The fixture at
  `test/fixtures/time-entry-response.sample.json` is the structural
  reference.
- **D-3-22:** **Per-tool minimum test set:**
  - Dry-run with `KEEPING_REQUIRE_CONFIRM=true` + `confirm` omitted → preview, zero `post`/`patch`/`delete` calls on mock.
  - Confirm path with `confirm: true` → API called exactly once with the expected method+path+body.
  - Env-false escape hatch (`KEEPING_REQUIRE_CONFIRM=false`) → API called even without `confirm`.
  - Multi-org error → flows through `toIsErrorContent` (D-3-20).
  - 401 KeepingAuthError → flows through `toIsErrorContent` (D-3-20).
  - 4xx validation error → flows through `toIsErrorContent` (definite-fail).
  - 5xx server error → returns ambiguous-failure envelope with "outcome unknown" text (D-3-16).
  - Path assertion: client mock is called with the exact path string (D-34-R + D-3-05 verbs).
  - Annotation assertion (one canonical test per tool): `listTools` reflects `destructiveHint: true, idempotentHint: false`.
- **D-3-23:** **Delete-preview test:** mock `client.get` to return a known
  entry, assert `would_delete` contains that entry verbatim AND
  `client.delete` was never called.
- **D-3-24:** **Start-timer test:** assert POST body contains `start` and
  has NO `end` / NO `hours` keys (strict `Object.keys` assertion). Assert
  return is `{ timer_id }`.
- **D-3-25:** **Stop-timer header test:** mock the new
  `client.requestWithHeaders` to return a Headers object with
  `X-Server-Time-Ms: "1718202000000"`; assert tool surfaces the value as
  the elapsed-time anchor.
- **D-3-26:** **Date defaulting test (ROADMAP SC #4):** mock
  `Date.now()` to `2026-06-12T22:30:00Z`; assert preview body
  `date === "2026-06-13"` (next day in Amsterdam, +02:00 CEST).

### Revisions (2026-06-12, post-research)

Surfaced by `gsd-phase-researcher` reading `keeping-openapi.json` against
the locked decisions. Ground-truth deltas — record before planning.

- **D-3-27 (amends rawFetch contract):** `DELETE /{orgId}/time-entries/{entry_id}`
  returns `204 No Content` per OpenAPI. `KeepingClient.rawFetch` at
  `src/keeping/client.ts:221` currently does `return res.json()`
  unconditionally for `res.ok`, which throws `SyntaxError: Unexpected end
  of JSON input` on a 204. **Smallest fix:** in `rawFetch`, after the
  `res.ok` check, branch on `res.status === 204` and return `null`. The
  change is one branch in `rawFetch` and is backward-compatible with every
  existing GET/POST/PATCH caller (none of them currently observe a 204).
  `keeping_delete_entry`'s actual-call path then returns `{ ok: true }`
  (or similar) regardless of API body. Without this fix, `keeping_delete_entry`
  with `confirm: true` will surface a synthetic `SyntaxError` through
  `toIsErrorContent` even though the delete succeeded — a false-failure
  envelope that mimics the WRITE-05 "outcome unknown" case but is in fact
  a definite success. The fix is the first task of the phase.
- **D-3-28 (amends D-3-13 — request-body time shape):** The request body
  fields `start` and `end` on `entry_create_request` / `entry_edit_request`
  are documented as **`HH:mm` time-only strings**, NOT full ISO 8601
  datetimes. Example from OpenAPI: `"start": "13:45"`. The response shape
  uses full ISO 8601 with offset (`"start": "2026-06-11T13:45:10+02:00"`)
  — the read-shape and write-shape are asymmetric. D-3-13's
  `nowAmsterdamISO()` is the WRONG helper for request bodies. Lock the
  request-body helper as `nowInAmsterdamHHMM(now?: Date): string` returning
  `"HH:mm"` (24-hour, zero-padded, no timezone suffix — the API derives the
  zone from `organisation.time_zone`). `nowAmsterdamISO()` may still be
  used for non-body purposes (logs, return surfaces) but MUST NOT appear in
  any request body. DST-correct test (D-3-15) extends: mock `Date.now() =
  2026-06-12T22:30:00Z` ⇒ preview body `{ date: "2026-06-13", start: "00:30" }`.
- **D-3-29 (typo correction):** Organisation field name is `time_zone`
  (underscore), not `timezone`. `src/keeping/types.ts:50` is already correct;
  this revision is for documentation hygiene only — any planner output
  citing `organisation.timezone` should use `organisation.time_zone`.

### Claude's Discretion

- Exact file split inside `src/keeping/` for `write-gate.ts` vs
  `date.ts` vs `headers.ts` — planner decides whether to consolidate or
  split.
- Tool description copy (the AI-facing surface) — planner drafts; must
  include the confirm-from-human wording per D-3-12 and the
  destructive-warning per WRITE-07 / D-3-11.
- Fresh fixture file at `test/fixtures/time-entry-create-request.sample.json`
  (a sample POST body) vs constructing fixtures inline in tests — either
  acceptable. Phase 2.5 went inline.
- Server-side `User-Agent` header customisation (Keeping docs request it).
  Phase 1 / 2 didn't set one; can either ship now or defer.
- Whether to add a `keeping_get_entry` read tool (single-entry fetch) as a
  Phase 3 bonus — already implied by the delete-preview path. Planner can
  choose to ship it as a public tool or keep the fetch internal to the
  delete-tool.
- REQUIREMENTS.md amendment text for WRITE-06 and SC #5 footnote re:
  `purpose` enum — planner drafts.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Scope
- `.planning/PROJECT.md` — Core Value, Key Decisions (dry-run-by-default
  locked, multi-org locked, schema-by-iteration, single-developer scope).
- `.planning/REQUIREMENTS.md` §"Write Tools" (WRITE-01..08), §"Timer Tools"
  (TIMER-01 start/stop/resume portion, TIMER-02), §"Safety & Reliability"
  (SAFE-03 writes-do-not-retry, SAFE-04 isError envelope).
- `.planning/ROADMAP.md` §"Phase 3: Write Tools + Conditional Timers" —
  Goal + 6 Success Criteria. SC #5 wording about `purpose` is footnoted by
  D-3-07.

### Phase 2 + 2.5 Carry-forward (locked, MUST NOT modify)
- `.planning/phases/02-read-tools-schema-discovery/02-CONTEXT.md`
  §D-22..D-29 — identity cache + `resolveOrgId()` rules.
- `.planning/phases/02-read-tools-schema-discovery/02-CONTEXT.md`
  §Revisions §D-34-R — path strategy (`/{orgId}/...`, no
  `/organisations/`, no `/v1/` prefix at the tool layer), `time_entries`
  hyphen, single-day vs report-range, `KeepingUser` / `KeepingOrg`
  typing.
- `.planning/phases/02-read-tools-schema-discovery/02-CONTEXT.md`
  §D-32-R — timer endpoints (D-3-05 corrects the `stop` verb to `PATCH`).
- `.planning/phases/02.5-timer-status-read-tool/02.5-CONTEXT.md`
  §D-2.5-04, §D-2.5-05a — strict-wrapper-read contract; post-2.5
  `Array.isArray` guard precedent (any wrapper extractor in Phase 3 must
  reject arrays the same way).
- `.planning/phases/02.5-timer-status-read-tool/02.5-CONTEXT.md`
  §D-2.5-09 — `client.get` reused unchanged precedent. Phase 3 adds
  `requestWithHeaders<T>` but does not touch `request<T>`'s contract.

### API Ground Truth
- `.planning/research/keeping-openapi.json` §paths
  `/{organisation_id}/time-entries` (POST + GET),
  `/{organisation_id}/time-entries/{entry_id}` (GET + PATCH + DELETE),
  `/{organisation_id}/time-entries/{entry_id}/stop` (PATCH),
  `/{organisation_id}/time-entries/{entry_id}/resume` (POST),
  `/{organisation_id}/time-entries/last` (GET) — canonical verbs +
  schemas.
- `.planning/research/keeping-openapi.json` §components.schemas
  `entry_create_request`, `entry_edit_request`, `time_entry`,
  `organisation` — wire shape for request + response bodies.
- `.planning/research/keeping-openapi.json` §info.description — base URL
  `https://api.keeping.nl/v1`; "3 parallel requests max" usage etiquette;
  PATCH semantics (partial update); no PUT support.
- `.planning/research/LIVE-API-FINDINGS.md` — Phase 2 ground-truth probe
  capture; includes error envelope `{ error: { message } }` shape.
- `.planning/research/PITFALLS.md` §5 timezone — date defaulting must
  respect Europe/Amsterdam.
- `.planning/research/PITFALLS.md` §8 tool annotations — writes flip to
  `destructiveHint: true, idempotentHint: false`.
- `.planning/research/PITFALLS.md` §10 (or local) writes-do-not-retry —
  enforced at the KeepingClient.request `shouldRetry` level already; tool
  code MUST NOT add its own retry loop.
- `.planning/research/PITFALLS.md` §12 schema drift — D-36 Phase 3 ships
  the schema-drift CI test.
- `.planning/research/STACK.md` — Node 22 full-icu by default; Zod 4 for
  input schemas; native fetch + p-retry + p-throttle locked.

### Code (reuse, do not duplicate)
- `src/keeping/client.ts` — `KeepingClient.post/patch/delete` already
  plumbed. `resolveOrgId()` reused. New `requestWithHeaders<T>` is the
  only client surface change (D-3-18).
- `src/keeping/errors.ts` — `KeepingApiError.status`, `KeepingAuthError`,
  `MultiOrgError`, `sanitiseBody`, `toIsErrorContent` reused. No new
  error class.
- `src/keeping/types.ts` — extend with `WriteEntryInput`, `EntryCreateBody`,
  `EntryUpdateBody`, `TimerStartBody`, `TimerStopResponse`,
  `TimerResumeResponse` as needed. Strict-wrapper-read pattern (D-2.5-05a
  + `Array.isArray` guard) applies to any new extractor.
- `src/tools/entries-list.ts` + `src/tools/timer-status.ts` — canonical
  read-tool skeletons (registration, Zod input schema, try/catch envelope,
  annotation block). Phase 3 write tools mirror the structure with writes
  routed through the new write-gate helper.
- `src/server.ts` — registration site. Append seven new
  `register<Tool>(server, client)` calls.
- `src/config.ts` — `KEEPING_REQUIRE_CONFIRM` Zod schema already present
  with default `true`. Write tools read the boolean via the loaded config
  passed through the registration function.
- `src/logger.ts` — stderr-only logger; `log.warn(...)` used by D-3-19
  fallback path.
- `test/fixtures/time-entry-response.sample.json` — structural reference
  for response mocks (D-2.5-12 precedent). Phase 3 may add a sample
  POST-body fixture but the response shape is shared.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `KeepingClient.post<T>(path, body)`, `.patch<T>(path, body)`,
  `.delete<T>(path)` — already implemented, route through
  `request<T>` which already enforces SAFE-03 (writes never retry).
- `KeepingClient.get<T>(path)` — used by `delete_entry`'s extra-GET in
  the dry-run path (D-3-03).
- `KeepingClient.resolveOrgId(input?)` — multi-org resolution per
  D-26..D-29.
- `KeepingClient.organisations()` — cached for server lifetime; reads
  `features.timesheet` per resolved org for D-3-08 mode switch.
- `KeepingApiError` carries `status: number` — D-3-16 ambiguous-failure
  classification keys off this.
- `KeepingAuthError`, `MultiOrgError` — surface through
  `toIsErrorContent` unchanged.
- `sanitiseBody(text, token)` — already used inside rawFetch; write
  tools never re-encounter raw token text.
- Stderr-only `logger.ts` with token redaction — `log.warn` for the
  D-3-19 fallback.

### Established Patterns
- `registerXyz(server, client)` per tool file. Phase 3 adds:
  `registerAddEntry`, `registerUpdateEntry`, `registerDeleteEntry`,
  `registerStartTimer`, `registerStopTimer`, `registerResumeTimer`.
- Zod 4 input schemas via `z.object({...})` with `.optional()` and
  `.describe(...)` per Phase 2 / 2.5 read tools.
- `try { ... } catch (err) { ... }` envelope per SAFE-04. Write tools
  add ONE branch: the D-3-16 ambiguous-failure classifier BEFORE the
  `toIsErrorContent` delegation.
- Annotation block per tool. Reads = `readOnlyHint: true`. Writes =
  `destructiveHint: true, idempotentHint: false`. `openWorldHint: true`
  on all (we call an external API).
- Strict-wrapper-read with `Array.isArray` guard for ANY new extractor.

### Integration Points
- `src/server.ts` is the single registration site. Phase 3 appends seven
  new register calls alongside the seven existing ones.
- `src/config.ts` `KEEPING_REQUIRE_CONFIRM` boolean is consumed by the
  shared write-gate helper. The config is loaded once at boot and the
  resolved boolean is passed into each tool registrar (or accessed via
  closure — planner decides).
- `KeepingClient` receives one new public method
  (`requestWithHeaders<T>`) and otherwise keeps its existing contract.
- The new `src/keeping/date.ts` module is consumed by `add_entry`,
  `start_timer`, and (defensively) any test that needs to assert the
  default values.

### Files Phase 3 Will Create
- `src/tools/add-entry.ts`
- `src/tools/update-entry.ts`
- `src/tools/delete-entry.ts`
- `src/tools/start-timer.ts`
- `src/tools/stop-timer.ts`
- `src/tools/resume-timer.ts`
- `src/keeping/write-gate.ts` — `previewOrCall<T>` + ambiguous-failure
  classifier helper.
- `src/keeping/date.ts` — `todayInAmsterdam()` + `nowAmsterdamISO()`.
- `test/tools/add-entry.test.ts`
- `test/tools/update-entry.test.ts`
- `test/tools/delete-entry.test.ts`
- `test/tools/start-timer.test.ts`
- `test/tools/stop-timer.test.ts`
- `test/tools/resume-timer.test.ts`
- `test/keeping/write-gate.test.ts` (centralised gate behaviour
  + ambiguous classifier coverage)
- `test/keeping/date.test.ts` (DST + offset assembly coverage)

### Files Phase 3 Will Modify
- `src/server.ts` — six new imports + six new register calls (one per
  write tool); plus seven if `keeping_get_entry` is shipped as a public
  tool (Claude's Discretion).
- `src/keeping/client.ts` — one new public method `requestWithHeaders<T>`
  (D-3-18). NOTHING ELSE in this file changes.
- `src/keeping/types.ts` — append new typed bodies / response shapes.

### Files Phase 3 MUST NOT Touch
- `src/keeping/errors.ts` — no new error class. Ambiguous-failure
  classification reads `KeepingApiError.status` only.
- Existing read tool files (`entries-list.ts`, `timer-status.ts`,
  `me.ts`, `organisations.ts`, `projects.ts`, `tasks.ts`) —
  registration site changes only happen in `server.ts`.
- `src/config.ts` — `KEEPING_REQUIRE_CONFIRM` is already wired.

</code_context>

<specifics>
## Specific Ideas

- Confirm-parameter description (D-3-12, locked verbatim):
  `"Set to true ONLY after a human has reviewed the would_post preview returned by a prior dry-run call. The MCP client (LLM) MUST NOT set this autonomously — wait for the human to type 'yes' / 'confirm'."`
- Ambiguous-failure envelope text (D-3-16, locked verbatim):
  `"outcome unknown — verify with keeping_list_entries before retrying. (<original message>)"`
- Delete tool description must include "**DESTRUCTIVE: permanently
  deletes the entry**" prominently per WRITE-07.
- Preview URL format example for `add_entry` in `times`-mode org:
  ```
  {
    would_post: {
      method: "POST",
      url: "https://api.keeping.nl/v1/47666/time-entries",
      body: { date: "2026-06-12", start: "2026-06-12T14:30:00+02:00", end: "2026-06-12T16:00:00+02:00", purpose: "work", project_id: 555 }
    }
  }
  ```
- Preview URL format example for `delete_entry`:
  ```
  {
    would_post: { method: "DELETE", url: "https://api.keeping.nl/v1/47666/time-entries/12345", body: null },
    would_delete: { id: 12345, date: "2026-06-12", hours: 1.5, purpose: "work", note: "...", ... }
  }
  ```
- Start-timer return shape: `{ timer_id: <number> }` (canonical handle
  for subsequent stop / resume). Body MUST omit `end` and `hours`.
- DST-aware default-date test: `Date.now() = 2026-06-12T22:30:00Z`
  (summer / CEST) ⇒ preview body `date === "2026-06-13"`. Also test
  winter (CET): `Date.now() = 2026-12-15T23:30:00Z` ⇒ preview body
  `date === "2026-12-16"`.

</specifics>

<deferred>
## Deferred Ideas

- `outputSchema` on write tools — defer per Phase 2 / 2.5 precedent;
  revisit once the wire format is locked through a full Phase 3 ship
  cycle (UXv2-02).
- Late-night session heuristic ("before 06:00 Amsterdam → did you mean
  yesterday?") — product UX layer; belongs in a later phase (UXv2-01).
- Admin / team-scope writes (`user_id` input) — out of v1 scope per
  PROJECT.md and AUTH section; belongs in v2 admin-tools phase (UXv2-03).
- `keeping_get_entry` as a public tool — Claude's Discretion; planner
  may ship it as a side-effect of the delete-preview fetch. Defer the
  decision to plan-phase.
- `User-Agent` header customisation per Keeping docs etiquette — Phase
  1 / 2 didn't set one. Defer to a small follow-up unless planner
  bundles it.
- Bulk import / CSV — explicitly out of scope (PROJECT.md).
- Reporting / aggregation tools (`/{orgId}/report/time-entries`) —
  REPv2-01 / belongs in a later "reporting" phase.
- `keeping_start_timer` past-`start` semantics (the equivalent of "I
  forgot to start the timer at 9:00, please start it retroactively") —
  product UX layer; current decision is "start defaults to now, but
  caller may pass any `start`, no validation". Defer richer semantics.
- MCP Elicitation-based confirmation flow once more clients support it
  (UXv2-04) — orthogonal to D-3-01..04.

</deferred>

---

*Phase: 3-Write Tools + Conditional Timers*
*Context gathered: 2026-06-12*
