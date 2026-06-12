// Response typings for the Keeping API.
//
// Revised 2026-06-11 to match ground-truth shapes captured from the live API
// (see `.planning/research/keeping-openapi.json` and
// `.planning/research/LIVE-API-FINDINGS.md`). The original "loose by design"
// stance (D-34 original) was based on no live evidence and turned out to be
// wrong on both fields (`name?`, `email?` do not exist in real responses).
//
// D-34-R: these types now reflect what the OpenAPI spec declares and what the
// live probe observed verbatim. They remain CACHE typings (no validator),
// so additional fields the API may add in future are tolerated structurally
// even though they would not appear on the TypeScript interface.

/**
 * `GET /{organisation_id}/users/me` returns a wrapper object with a single
 * `user` key. `KeepingClient.me()` preserves the wrapper verbatim so the
 * `keeping_me` tool decides whether to flatten or pass through.
 */
export interface KeepingUser {
  user: {
    id: number;
    first_name: string | null;
    surname: string | null;
    code: string | null;
    role: "administrator" | "team_manager" | "team_member";
    state: "needs_invite" | "invited" | "active" | "inactive" | "blocked" | "decoupled";
  };
}

/**
 * `GET /organisations` returns `{ organisations: KeepingOrg[] }`.
 * `KeepingClient.organisations()` unwraps to `KeepingOrg[]`.
 *
 * `id` is a numeric primary key in the API. `resolveOrgId()` operates on the
 * string form (env vars + tool inputs arrive as strings) by `String(o.id)`
 * coercion at the comparison boundary.
 */
export interface KeepingOrg {
  id: number;
  name: string;
  url: string;
  current_plan: string;
  features: {
    timesheet: "times" | "hours";
    projects: boolean;
    tasks: boolean;
    breaks: boolean;
  };
  time_zone: string;
  currency: string;
}

// ---------------------------------------------------------------------------
// Phase 3 write-tool body + response typings.
//
// Source: `.planning/research/keeping-openapi.json` §components.schemas —
//   - `entry_create_request` → EntryCreateBody
//   - `entry_edit_request`   → EntryEditBody (immutable date/purpose per
//                              OpenAPI; modelled as Omit)
//   - response wrapper       → TimeEntryResponse (`{ time_entry, meta? }`)
//
// Per D-3-28: request-body `start` / `end` are `HH:mm` time-only strings
// (NOT full ISO 8601). The response shape on `time_entry` is the asymmetric
// full ISO 8601 with offset — the read shape vs write shape is intentionally
// different.
//
// Per D-3-29: organisation field is `time_zone` (underscore).
// ---------------------------------------------------------------------------

/**
 * Body shape for `POST /{orgId}/time-entries` per OpenAPI `entry_create_request`.
 * `start` / `end` are HH:mm time-only strings (D-3-28); `hours` is the
 * decimal-hours alternative used by `features.timesheet === "hours"` orgs.
 */
export interface EntryCreateBody {
  date: string; // YYYY-MM-DD in org timezone
  purpose:
    | "work"
    | "break"
    | "special_leave"
    | "unpaid_leave"
    | "statutory_leave"
    | "sick_leave"
    | "work_reduction"
    | "trip";
  project_id?: number;
  task_id?: number;
  note?: string;
  tag_ids?: number[];
  external_references?: Array<{
    id: string;
    type: "generic_work_reference";
    name: string;
    url?: string;
  }>;
  start?: string; // HH:mm — D-3-28 (NOT ISO 8601)
  end?: string; // HH:mm — D-3-28
  hours?: number; // decimal hours; used by features.timesheet === "hours"
}

/**
 * Body shape for `PATCH /{orgId}/time-entries/{entry_id}` per OpenAPI
 * `entry_edit_request`. `date` and `purpose` are immutable post-creation —
 * Omit them from the edit shape so the write tool's Zod schema rejects them.
 */
export type EntryEditBody = Omit<EntryCreateBody, "date" | "purpose">;

/**
 * Response wrapper returned by `POST /time-entries`, `PATCH /time-entries/{id}`,
 * `PATCH /time-entries/{id}/stop`, and `POST /time-entries/{id}/resume`.
 *
 * `time_entry` is left as a drift-tolerant `Record<string, unknown>` per
 * D-34 — write tools surface it verbatim and never assert specific fields
 * beyond the strict-wrapper guard.
 */
export interface TimeEntryResponse {
  time_entry: Record<string, unknown>;
  meta?: {
    created_additional_time_entry_ids?: number[];
    modified_existing_time_entry_ids?: number[];
    deleted_existing_time_entry_ids?: number[];
  };
}
