// keeping_update_entry tool — Phase 3 Plan 03 vertical slice.
//
// Implements WRITE-02, WRITE-04, WRITE-05, WRITE-07, WRITE-08 in one tool.
// Requirement references:
//   D-3-01 (AND-gate dry-run-by-default), D-3-02 (preview wire shape),
//   D-3-04 (shared write-gate via previewOrCall), D-3-05 (endpoint verbs —
//   PATCH /{orgId}/time-entries/{entry_id}), D-3-09 (input field surface —
//   partial-of-add minus immutable date/purpose/user_id), D-3-11 (annotations),
//   D-3-12 (confirm description verbatim), D-3-16 (ambiguous-failure envelope),
//   D-3-20 (KeepingAuthError + MultiOrgError carry-through).
//
// Sibling: src/tools/add-entry.ts (POST sibling). Update differs:
//   - `entry_id` REQUIRED (Zod number().int().positive(), no .optional())
//   - PATCH partial semantics — body contains ONLY fields the caller supplied;
//     NO defaulting (no date default, no start default, no purpose default).
//     Undefined-skip pattern keeps the wire shape minimal per OpenAPI
//     entry_edit_request partial semantics.
//   - `date`, `purpose`, `user_id` are IMMUTABLE per OpenAPI entry_edit_request
//     (the schema literally omits them). The Zod input schema mirrors this by
//     not declaring those keys; Zod's default `.strip()` behavior drops any
//     such extras at the schema validation layer before the handler runs, so
//     they never reach the wire (T-03-03-02 mitigation).
//   - No `organisations()` call. PATCH does not need org-mode detection: the
//     mutable fields (start/end/hours) reflect whatever mode the existing
//     entry is already in, and the API will reject mode-mismatched fields
//     itself with a 422 (definite-fail → toIsErrorContent).
//
// Server-registration is deferred to Plan 03-08 (single Wave 3 wiring plan).
// This file does NOT modify src/server.ts.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KeepingConfig } from "../config.js";
import type { KeepingClient } from "../keeping/client.js";
import { toIsErrorContent } from "../keeping/errors.js";
import { AMBIGUOUS_TEXT, classifyAmbiguous, previewOrCall } from "../keeping/write-gate.js";

// Zod input schema per D-3-09 (update-entry surface) — note the absence of
// `date`, `purpose`, `user_id`. These are immutable post-creation per OpenAPI
// `entry_edit_request` (T-03-03-02 mitigation). Zod's default object behavior
// is `.strip()`, so any client that sends them gets them silently dropped at
// the validation boundary — they never reach the handler nor the wire.
//
// `entry_id` is REQUIRED (NOT `.optional()`) and `z.number().int().positive()`
// blocks path-traversal vectors at the schema layer (T-03-03-01).
//
// `confirm` carries the D-3-12 description verbatim and is `optional()` —
// NOT `.default(true)`. The AND-gate in `previewOrCall` coerces
// `input.confirm === true`, so `undefined`, `false`, and any non-strict-true
// value all collapse to dry-run (T-03-03-04 mitigation).
export const UpdateEntryInput = z.object({
  organisation_id: z
    .string()
    .optional()
    .describe("Override KEEPING_ORG_ID; required for multi-org tokens."),
  entry_id: z.number().int().positive().describe("Numeric Keeping time-entry id to update."),
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
    .describe("Decimal hours; only used when org timesheet is 'hours' mode."),
  confirm: z
    .boolean()
    .optional()
    .describe(
      "Set to true ONLY after a human has reviewed the would_post preview returned by a prior dry-run call. The MCP client (LLM) MUST NOT set this autonomously — wait for the human to type 'yes' / 'confirm'.",
    ),
});

export function registerUpdateEntry(
  server: McpServer,
  client: KeepingClient,
  config: KeepingConfig,
): void {
  server.registerTool(
    "keeping_update_entry",
    {
      title: "Update a time entry",
      description:
        "Edit an existing time entry owned by the authenticated user. PATCH semantics — only the " +
        "fields you supply are updated. DRY-RUN BY DEFAULT — call without confirm first to receive " +
        "a would_post preview; call again with confirm: true ONLY after a human reviewed the preview. " +
        "NOTE: date, purpose, and user_id are immutable in Keeping; this tool does not accept them.",
      inputSchema: UpdateEntryInput,
      annotations: {
        // D-3-11 write-tool annotations — same as add-entry (all four flipped vs read tools).
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      // outputSchema OMITTED — deferred per Phase 2 / 2.5 precedent (UXv2-02).
    },
    async (input) => {
      try {
        const orgId = await client.resolveOrgId(input.organisation_id);
        const path = `/${orgId}/time-entries/${input.entry_id}`;

        // PATCH partial body — include ONLY the fields the caller supplied.
        // No defaulting on update: undefined fields are skipped (NOT nulled,
        // NOT zeroed) so the API leaves them unchanged (T-03-03-03 mitigation).
        const body: Record<string, unknown> = {};
        if (input.project_id !== undefined) body.project_id = input.project_id;
        if (input.task_id !== undefined) body.task_id = input.task_id;
        if (input.note !== undefined) body.note = input.note;
        if (input.tag_ids !== undefined) body.tag_ids = input.tag_ids;
        if (input.external_references !== undefined) {
          body.external_references = input.external_references;
        }
        if (input.start !== undefined) body.start = input.start;
        if (input.end !== undefined) body.end = input.end;
        if (input.hours !== undefined) body.hours = input.hours;

        const result = await previewOrCall<{ time_entry: unknown; meta?: unknown }>(
          client,
          { requireConfirm: config.KEEPING_REQUIRE_CONFIRM, confirm: input.confirm === true },
          { method: "PATCH", path, body },
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        // D-3-16: 5xx / AbortError / raw TypeError → ambiguous envelope.
        // Everything else (4xx incl. 404 not-found, KeepingAuthError,
        // MultiOrgError, plain Error) flows through toIsErrorContent unchanged
        // (SAFE-04 definite-fail path).
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
