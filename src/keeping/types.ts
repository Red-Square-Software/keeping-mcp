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
