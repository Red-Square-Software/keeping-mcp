// keeping_timer_status tool — Phase 2.5 read-only sibling of the Phase 3
// timer writes (D-33-R). Closes TIMER-01 status-read portion.
//
// Wire shape (D-2.5-01): `{ time_entry: <raw inner entry>, is_running: <boolean> }`.
// The `time_entry` wrapper key from the API is preserved as-is at the payload
// level. `is_running` is added as a TOP-LEVEL sibling — not merged into the
// inner entry — and is derived strictly from `entry?.ongoing === true`
// (D-2.5-02). Missing or non-boolean `ongoing` collapses to `false` —
// defensive default, never throws.
//
// Path strategy (D-2.5-05, D-2.5-09, D-34-R):
//   Bare `GET /{orgId}/time-entries/last` — zero query parameters, no
//   `/organisations/` prefix. The endpoint already returns the absolute
//   most-recent entry for the authenticated user; client-side derivation
//   of `is_running` is what answers "is a timer running NOW?".
//
// Strict wrapper read (D-2.5-05a): `extractTimeEntry(raw)` accepts ONLY
// when `raw.time_entry` is a non-null object. Anything else (missing key,
// null value, non-object, bare-array) collapses to null. This intentionally
// differs from entries-list.ts's tolerant `normaliseEntries` — the OpenAPI
// spec authoritatively locks the singular `time_entry` wrapper, and drift
// should fail loudly via the schema-drift test rather than be masked.
//
// Empty-state handling (D-2.5-03, D-2.5-04, D-2.5-04a):
//   - 404 from the endpoint → `{ time_entry: null, is_running: false }` with
//     NO `isError` key. New users with zero historical entries get a usable
//     answer, not an error.
//   - 200 OK whose body lacks a usable `time_entry` → same graceful empty
//     shape. One empty-state surface, regardless of cause.
//   - 404 is detected by `err instanceof KeepingApiError && err.status === 404`.
//     Every other error (401, 403, 5xx, network, MultiOrg) flows through
//     `toIsErrorContent` unchanged (SAFE-04).
//
// Phase 2's `KeepingClient` is reused verbatim — no new method, no new
// request-path strategy, no new error class (D-2.5-09).

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KeepingClient } from "../keeping/client.js";
import { KeepingApiError, toIsErrorContent } from "../keeping/errors.js";

const TimerStatusInput = z.object({
  organisation_id: z
    .string()
    .optional()
    .describe("Override KEEPING_ORG_ID; required for multi-org tokens."),
});

/**
 * Strict wrapper read per D-2.5-05a. Returns the raw inner entry only when
 * `raw.time_entry` is a non-null object. Anything else (missing key, null,
 * non-object) collapses to null — caller treats as graceful empty (D-2.5-04).
 *
 * This intentionally differs from entries-list.ts's tolerant normaliseEntries —
 * the OpenAPI spec authoritatively locks the singular `time_entry` wrapper;
 * drift should fail loudly via the schema-drift test, not be masked.
 */
function extractTimeEntry(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== "object") return null;
  const candidate = (raw as Record<string, unknown>).time_entry;
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  return candidate as Record<string, unknown>;
}

export function registerTimerStatus(server: McpServer, client: KeepingClient): void {
  server.registerTool(
    "keeping_timer_status",
    {
      title: "Timer status (read-only)",
      description:
        "Returns the most recent time entry for the authenticated user plus a " +
        "derived `is_running` boolean indicating whether a Keeping timer is currently " +
        "running. Read-only; no API mutation. Use this to decide whether " +
        "`keeping_stop_timer` (running timer → stop) or `keeping_resume_timer` " +
        "(stopped entry → resume) is the appropriate next call (both ship in Phase 3).",
      inputSchema: TimerStatusInput,
      annotations: {
        // READ-03: every read tool advertises read-only intent.
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        // Calls an external API (Keeping); host clients may use this to gate sandbox modes.
        openWorldHint: true,
      },
      // outputSchema OMITTED — deferred per 02.5-CONTEXT.md Claude's Discretion
      // + Phase 2 read-tool deferral noted in 02-CONTEXT.md Deferred Ideas.
    },
    async (input) => {
      try {
        const orgId = await client.resolveOrgId(input.organisation_id);
        const raw = await client.get<unknown>(`/${orgId}/time-entries/last`);
        const entry = extractTimeEntry(raw);
        const is_running = entry?.ongoing === true;
        const payload = { time_entry: entry, is_running };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        };
      } catch (err) {
        // D-2.5-03 + D-2.5-04a: 404 = "no entry yet" = graceful empty (NOT isError).
        if (err instanceof KeepingApiError && err.status === 404) {
          const payload = { time_entry: null, is_running: false };
          return {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          };
        }
        // SAFE-04: every other error (401/403/5xx/network/MultiOrg) → isError envelope.
        return toIsErrorContent(err);
      }
    },
  );
}
