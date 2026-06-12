# Phase 3: Write Tools + Conditional Timers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 03-write-tools-conditional-timers
**Areas discussed:** Dry-run gate + preview shape, Endpoint paths + verbs, Date defaulting strategy, Ambiguous-failure + TIMER-02 header access

---

## Area A — Dry-run gate + preview shape

### A1. Confirm-gate semantics: when does a write actually hit the API?

| Option | Description | Selected |
|--------|-------------|----------|
| AND gate | Write only when `KEEPING_REQUIRE_CONFIRM=true` AND `confirm===true`. Env=false unlocks per-call confirm. Matches WRITE-04 phrasing literally. | ✓ |
| Confirm-only gate | Write only when `confirm===true`, regardless of env. Safer but contradicts WRITE-04. | |
| Tri-state with override | Three-way semantics with env=false forcing immediate write. | |

**User's choice:** AND gate. → D-3-01.

### A2. Preview URL shape: how is the `url` field in `would_post` rendered?

| Option | Description | Selected |
|--------|-------------|----------|
| Full URL with base | `https://api.keeping.nl/v1/{orgId}/time-entries`. Most informative; token in bearer header, no leak. | ✓ |
| Relative path only | `/{orgId}/time-entries` — schema-equivalent but requires inference. | |
| Both base + path | Structured `{ base, path }` — complicates SC #1 wire shape. | |

**User's choice:** Full URL with base. → D-3-02.

### A3. Where does the dry-run gate live?

| Option | Description | Selected |
|--------|-------------|----------|
| Shared helper in `src/keeping/` | `previewOrCall<T>(client, cfg, req)` single source of truth. DRY across 4-7 write tools. | ✓ |
| Per-tool inline gate | Each tool inlines `if (!requireConfirm || confirm===true) ...`. More boilerplate. | |
| Decorator wrapper | `withDryRun(handler)` HOF. Cleanest but breaks the read-tool pattern. | |

**User's choice:** Shared helper. → D-3-04.

### A4. Delete preview: how is the entry fetched per SC #3 ("returns the entry that would be deleted")?

| Option | Description | Selected |
|--------|-------------|----------|
| Extra GET in dry-run only | Fetch entry on preview; never on actual delete. 1 extra req per preview. Honors SC #3 literally. | ✓ |
| URL-only preview | Just preview URL+id; forces user to list-entries first. Doesn't honor SC #3. | |
| Caller-supplies-entry input | Tool requires full `entry` input. Pushes work to LLM; sync-drift risk. | |

**User's choice:** Extra GET in dry-run only. → D-3-03.

---

## Area B — Endpoint paths + verbs for 7 writes

### B1. Endpoint verb table — lock against OpenAPI ground truth (correcting D-32-R's `stop=POST` claim)?

| Option | Description | Selected |
|--------|-------------|----------|
| Lock OpenAPI verbs | add=POST, update=PATCH, delete=DELETE, stop=PATCH (not POST), resume=POST. Record D-3-05 superseding D-32-R. | ✓ |
| Defer + probe stop verb live | Add `npm run probe-stop` to hit both verbs on a real entry. Adds blocker. | |

**User's choice:** Lock OpenAPI verbs. → D-3-05 (supersedes D-32-R `stop` verb).

### B2. Start timer — no `/start` endpoint in API. How does `keeping_start_timer` create a running entry?

| Option | Description | Selected |
|--------|-------------|----------|
| POST `/time-entries` with start, no end | Body has `start` (ISO datetime) and NO `end` / no `hours`. Keeping returns `ongoing: true`. | ✓ |
| Wrap `keeping_add_entry` with ongoing flag | `start_timer` is alias for add_entry with `end:undefined`. Loses timer-specific input schema. | |
| Defer `keeping_start_timer` to v2 | Ship stop+resume only. Punts TIMER-01 start portion. | |

**User's choice:** POST with start, no end. → D-3-06.

### B3. `purpose` field — OpenAPI enum is `work|break|special_leave|...` (no billable). WRITE-06 + SC #5 say accept `billable`/`non_billable`. How to reconcile?

| Option | Description | Selected |
|--------|-------------|----------|
| Pass-through API enum | Tool accepts real enum literally. Default `work`. WRITE-06 + SC #5 superseded. Billable is project-level in Keeping. | ✓ |
| Alias `billable→work`, `non_billable→break` | Honors WRITE-06 surface but `break` ≠ `non_billable` semantically. | |
| Pass-through + `tag_ids` hint | Real enum on `purpose` + separate `billable?: boolean` mapping to a tag id. Adds env surface. | |

**User's choice:** Pass-through API enum. → D-3-07 (supersedes WRITE-06 + SC #5 wording).

### B4. Org timesheet mode (`times` vs `hours`) — POST body shape differs per org. How does `add_entry` handle this?

| Option | Description | Selected |
|--------|-------------|----------|
| Read from cached `organisations()` | Read `features.timesheet` from cached call. Branch body shape. Zod discriminated union. | ✓ |
| Accept all fields, defer validation to API | Send whatever user provides; Keeping rejects mismatch with 400. Simpler tool, uglier UX. | |
| `KEEPING_TIMESHEET_MODE` env override | New env var pins mode. Adds surface and lets mode drift. | |

**User's choice:** Read from cached `organisations()`. → D-3-08.

---

## Area C — Date defaulting strategy (Europe/Amsterdam)

### C1. Date defaulting library/approach for `date` field (YYYY-MM-DD in Europe/Amsterdam)?

| Option | Description | Selected |
|--------|-------------|----------|
| `Intl.DateTimeFormat` en-CA | Node 22 full-icu; `en-CA` formats `YYYY-MM-DD`; DST-correct; zero deps. | ✓ |
| `date-fns-tz` dependency | Battle-tested API; ~80 KB + transitive deps; overkill for one function. | |
| Manual UTC offset | Always-wrong-someday solution; DST policy can shift. | |

**User's choice:** `Intl.DateTimeFormat` en-CA. → D-3-13 + D-3-14.

### C2. `start` datetime (timer-start / times-mode `start` field) — same TZ helper, or different?

| Option | Description | Selected |
|--------|-------------|----------|
| Same module, separate function | `nowAmsterdamISO()` returns ISO 8601 with `+HH:MM` offset embedded. Unambiguous datetime. | ✓ |
| UTC ISO (Z suffix) | `Date.toISOString()` for start/end; works but mixes zones in one tool. | |
| User must supply explicit ISO | No default; pushes TZ correctness to AI client. | |

**User's choice:** Same module, separate function. → D-3-13.

---

## Area D — Ambiguous-failure classification + TIMER-02 header access

### D1. Ambiguous-failure classification (WRITE-05) — which errors trigger "outcome unknown"?

| Option | Description | Selected |
|--------|-------------|----------|
| 5xx + timeout + network | Ambiguous: `KeepingApiError.status >= 500`, `AbortError`, `TypeError`. Other errors flow through `toIsErrorContent` unchanged. | ✓ |
| Any non-2xx = ambiguous | Over-cautious; defeats safety purpose. | |
| Only timeout/network = ambiguous | 5xx flow through unchanged; tighter but risky if 5xx can mean "wrote then timed out reporting". | |

**User's choice:** 5xx + timeout + network. → D-3-16 + D-3-17.

### D2. TIMER-02 needs `X-Server-Time-Ms` response header. KeepingClient.request<T> only returns parsed JSON body. How to expose?

| Option | Description | Selected |
|--------|-------------|----------|
| New `requestWithHeaders<T>` method | Surgical surface addition; mirrors throttle+retry of `request<T>`. Backwards-compatible. | ✓ |
| Compute elapsed locally (no header) | Use `Date.now() - start`; subject to client-clock skew. TIMER-02 exists because header is more accurate. | |
| Headers always alongside body (refactor) | Cleanest API but big blast radius across all existing read tools. | |

**User's choice:** New `requestWithHeaders<T>`. → D-3-18 + D-3-19.

---

## Claude's Discretion

- File split inside `src/keeping/` (`write-gate.ts` vs `date.ts` vs `headers.ts`) — planner consolidates or splits.
- Tool description copy (AI-facing surface) — planner drafts; honors D-3-12 confirm wording + WRITE-07 destructive marker.
- Fresh POST-body fixture file vs inline construction in tests — either acceptable.
- `User-Agent` header customisation — Phase 1/2 didn't ship; planner decides whether to bundle.
- Public `keeping_get_entry` tool vs private fetch inside delete-tool — planner decides.
- REQUIREMENTS.md amendment text for WRITE-06 + SC #5 footnote — planner drafts.

## Deferred Ideas

- `outputSchema` on write tools (UXv2-02) — defer per Phase 2/2.5 precedent.
- Late-night session heuristic (UXv2-01).
- Admin / team-scope writes via `user_id` (UXv2-03) — v1 out of scope.
- `User-Agent` header customisation — small follow-up.
- `keeping_start_timer` past-`start` retroactive semantics — accept any `start`, no validation in v1.
- Bulk CSV import (out of scope per PROJECT.md).
- Reporting / aggregation via `/report/time-entries` (REPv2-01).
- MCP Elicitation-based confirmation (UXv2-04).

---

*Discussion log gathered: 2026-06-12 via /gsd:discuss-phase 3 --chain*
