// keeping_add_entry tool — Phase 3 Plan 02 vertical slice.
//
// Implements WRITE-01, WRITE-04, WRITE-05, WRITE-06 (per D-3-07 amendment),
// WRITE-07, WRITE-08 in one tool. Requirement references:
//   D-3-01 (AND-gate dry-run-by-default), D-3-02 (preview wire shape),
//   D-3-04 (shared write-gate via previewOrCall), D-3-05 (endpoint verbs),
//   D-3-07 (purpose enum, NOT billable/non_billable), D-3-08 (org-mode-aware
//   body construction — times vs hours), D-3-09 (input field surface minus
//   user_id), D-3-11 (annotations), D-3-12 (confirm description verbatim),
//   D-3-13 + D-3-28 (Amsterdam date + HH:mm — NO Date.toISOString()),
//   D-3-15 + D-3-26 (DST-correct default), D-3-16 (ambiguous-failure envelope),
//   D-3-20 (KeepingAuthError + MultiOrgError carry-through), D-3-29 (time_zone
//   underscore).
//
// Sibling skeleton: src/tools/timer-status.ts (READ). Write-tool flips:
//   - extra `config: KeepingConfig` parameter for KEEPING_REQUIRE_CONFIRM
//   - annotations: readOnlyHint:false, destructiveHint:true, idempotentHint:false
//   - API call routed through `previewOrCall<T>` for the dry-run gate
//   - catch arm distinguishes ambiguous (5xx / abort / TypeError) via
//     `classifyAmbiguous` before falling through to `toIsErrorContent`
//
// Org-mode-aware body construction (D-3-08):
//   - features.timesheet === "times": body.start defaults to nowInAmsterdamHHMM()
//     when omitted; body.end is forwarded only when explicitly supplied. No
//     `hours` key is added.
//   - features.timesheet === "hours": body.hours is required input; if omitted,
//     return isError envelope explaining the mode mismatch. No start/end keys.
//
// Server-registration is deferred to Plan 03-08 (single Wave 3 wiring plan).
// This file does NOT modify src/server.ts.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KeepingConfig } from "../config.js";
import type { KeepingClient } from "../keeping/client.js";
import { nowInAmsterdamHHMM, todayInAmsterdam } from "../keeping/date.js";
import { toIsErrorContent } from "../keeping/errors.js";
import { AMBIGUOUS_TEXT, classifyAmbiguous, previewOrCall } from "../keeping/write-gate.js";

// Zod input schema per D-3-09 (add-entry surface) — note the absence of
// `user_id` per D-3-10 (admin/team-scope writes are out of v1 scope and
// Keeping defaults user_id to the authenticated user).
//
// `confirm` carries the D-3-12 description verbatim and is `optional()` —
// NOT `.default(true)`. The AND-gate in `previewOrCall` coerces
// `input.confirm === true`, so `undefined`, `false`, and any non-strict-true
// value all collapse to dry-run (T-03-02-01 / T-03-02-02 mitigation).
export const AddEntryInput = z.object({
  organisation_id: z
    .string()
    .optional()
    .describe("Override KEEPING_ORG_ID; required for multi-org tokens."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Calendar date YYYY-MM-DD; defaults to today in Europe/Amsterdam."),
  purpose: z
    .enum([
      "work",
      "break",
      "special_leave",
      "unpaid_leave",
      "statutory_leave",
      "sick_leave",
      "work_reduction",
      "trip",
    ])
    .default("work")
    .describe(
      "Time-entry category. Maps to Keeping's purpose enum; billable status is determined at the project level.",
    ),
  project_id: z.number().int().positive().optional(),
  task_id: z.number().int().positive().optional(),
  note: z.string().max(10000).optional(),
  tag_ids: z.array(z.number().int().positive()).optional(),
  external_references: z
    .array(
      z.object({
        id: z.string().regex(/^[0-9a-f]{10,40}$/),
        type: z.literal("generic_work_reference"),
        name: z.string().max(191),
        url: z.string().max(2048).optional(),
      }),
    )
    .max(10)
    .optional(),
  start: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:mm (24-hour, zero-padded)")
    .optional()
    .describe("HH:mm in org timezone; only used when org timesheet is 'times' mode."),
  end: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:mm (24-hour, zero-padded)")
    .optional()
    .describe("HH:mm in org timezone; only used when org timesheet is 'times' mode."),
  hours: z
    .number()
    .min(0)
    .max(1000)
    .optional()
    .describe("Decimal hours; required when org timesheet is 'hours' mode."),
  confirm: z
    .boolean()
    .optional()
    .describe(
      "Set to true ONLY after a human has reviewed the would_post preview returned by a prior dry-run call. The MCP client (LLM) MUST NOT set this autonomously — wait for the human to type 'yes' / 'confirm'.",
    ),
});

export function registerAddEntry(
  server: McpServer,
  client: KeepingClient,
  config: KeepingConfig,
): void {
  server.registerTool(
    "keeping_add_entry",
    {
      title: "Create a time entry",
      description:
        "Create a new time entry. DRY-RUN BY DEFAULT — call without confirm first to receive a " +
        "would_post preview; call again with confirm: true ONLY after a human reviewed the preview. " +
        "Body shape depends on the organisation's timesheet mode: 'times' mode requires start/end " +
        "(HH:mm in org timezone); 'hours' mode requires a decimal hours value. Purpose defaults to " +
        "'work'. The date defaults to today in Europe/Amsterdam.",
      inputSchema: AddEntryInput,
      annotations: {
        // D-3-11 write-tool annotations — flips three booleans vs read tools.
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      // outputSchema OMITTED — deferred per Phase 2 / 2.5 precedent (UXv2-02);
      // wire shape will be locked through a full Phase 3 ship cycle first.
    },
    async (input) => {
      try {
        const orgId = await client.resolveOrgId(input.organisation_id);
        const orgs = await client.organisations();
        const org = orgs.find((o) => String(o.id) === orgId);
        if (!org) {
          // Defensive: resolveOrgId returned an id not in the cached list. The
          // only way this triggers is a race / cache eviction; surfacing it as
          // a plain Error flows through toIsErrorContent (NOT ambiguous —
          // there's no API call to be ambiguous about).
          throw new Error(`Organisation ${orgId} not found in cache`);
        }

        const date = input.date ?? todayInAmsterdam();
        const body: Record<string, unknown> = { date, purpose: input.purpose };
        if (input.project_id !== undefined) body.project_id = input.project_id;
        if (input.task_id !== undefined) body.task_id = input.task_id;
        if (input.note !== undefined) body.note = input.note;
        if (input.tag_ids !== undefined) body.tag_ids = input.tag_ids;
        if (input.external_references !== undefined) {
          body.external_references = input.external_references;
        }

        if (org.features.timesheet === "times") {
          // D-3-08 + D-3-28: `start` is HH:mm in org timezone. Default to now
          // in Amsterdam when omitted. `end` is forwarded only when explicitly
          // supplied — leaving it unset is the timer-style ongoing case, which
          // belongs to keeping_start_timer (Plan 03-05), not add-entry. The
          // caller is expected to supply `end` (HH:mm) for completed entries.
          body.start = input.start ?? nowInAmsterdamHHMM();
          if (input.end !== undefined) body.end = input.end;
        } else {
          // D-3-08 hours mode: `hours` is the required shape; start/end are
          // not used. Missing `hours` is a definite-fail (not ambiguous —
          // the request was never sent).
          if (input.hours === undefined) {
            return toIsErrorContent(
              new Error("Organisation timesheet is in 'hours' mode; 'hours' input is required."),
            );
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
        // D-3-16: 5xx / AbortError / raw TypeError → ambiguous envelope.
        // Everything else (4xx, KeepingAuthError, MultiOrgError, plain Error)
        // flows through toIsErrorContent unchanged (SAFE-04 definite-fail path).
        if (classifyAmbiguous(err)) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            isError: true,
            content: [{ type: "text", text: `${AMBIGUOUS_TEXT} (${msg})` }],
          };
        }
        return toIsErrorContent(err);
      }
    },
  );
}
