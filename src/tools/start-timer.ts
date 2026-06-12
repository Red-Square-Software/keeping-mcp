// keeping_start_timer tool — Phase 3 Plan 05 vertical slice.
//
// Implements TIMER-01 (start portion) + exercises WRITE-04 (AND-gate dry-run)
// and WRITE-05 (ambiguous-failure envelope). Requirement references:
//   D-3-05 (endpoint verb table: start = POST /{orgId}/time-entries),
//   D-3-06 (no dedicated /start endpoint — the absence of `end` AND `hours`
//     in the POST body is what Keeping interprets as "ongoing entry"; this
//     is the load-bearing invariant the strict Object.keys assertion in
//     test/tools/start-timer.test.ts protects),
//   D-3-09 (start_timer input surface: organisation_id?, project_id?,
//     task_id?, note?, purpose?, start?, confirm?: boolean — NO end, NO
//     hours, NO tag_ids, NO external_references),
//   D-3-11 (write-tool annotations — four booleans),
//   D-3-12 (confirm description verbatim),
//   D-3-16 (ambiguous-failure envelope on 5xx / abort / TypeError),
//   D-3-28 (start defaults to nowInAmsterdamHHMM() — HH:mm, NOT ISO 8601),
//   D-2.5-05a (strict-wrapper extractor with the three-clause Array.isArray
//     guard — copied verbatim from src/tools/timer-status.ts:58-65 for
//     timer_id derivation).
//
// Org-mode handling: per D-3-06 the start-timer body is the SAME shape as
// add-entry in `times` mode, minus end and hours. In `hours`-mode orgs the
// concept of a running timer doesn't apply (no start-time, just decimal
// hours), but the API will respond appropriately if a start-timer call is
// made — the tool does NOT pre-check org mode; any API rejection flows
// through the standard catch arm (definite-fail via toIsErrorContent, or
// ambiguous envelope for 5xx).
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

/**
 * Strict wrapper read per D-2.5-05a — copied VERBATIM from
 * `src/tools/timer-status.ts:58-65`. The three-clause guard:
 *   1. raw must be a non-null object
 *   2. raw.time_entry must be a non-null object
 *   3. raw.time_entry must NOT be an array (typeof [] === "object" in JS)
 *
 * Drift surfaces visibly via `timer_id: null` rather than crashing or
 * masking — same contract as keeping_timer_status's empty-state surface.
 */
function extractTimeEntry(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== "object") return null;
  const candidate = (raw as Record<string, unknown>).time_entry;
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  return candidate as Record<string, unknown>;
}

// Zod input schema per D-3-09 (start_timer surface). NO `end`, NO `hours`,
// NO `tag_ids`, NO `external_references` — those keys make the entry not a
// running timer (D-3-06). `date` defaults to today in Amsterdam server-side
// per D-3-26 + D-3-28; the input surface does NOT accept `date` because the
// "timer started today" semantics make a user-supplied date a footgun.
export const StartTimerInput = z.object({
  organisation_id: z
    .string()
    .optional()
    .describe("Override KEEPING_ORG_ID; required for multi-org tokens."),
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
  start: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:mm (24-hour, zero-padded)")
    .optional()
    .describe(
      "HH:mm in org timezone; defaults to the current time in Europe/Amsterdam when omitted.",
    ),
  confirm: z
    .boolean()
    .optional()
    .describe(
      "Set to true ONLY after a human has reviewed the would_post preview returned by a prior dry-run call. The MCP client (LLM) MUST NOT set this autonomously — wait for the human to type 'yes' / 'confirm'.",
    ),
});

export function registerStartTimer(
  server: McpServer,
  client: KeepingClient,
  config: KeepingConfig,
): void {
  server.registerTool(
    "keeping_start_timer",
    {
      title: "Start a running timer",
      description:
        "Start a new ongoing time entry (a running timer). Implemented as POST /{orgId}/time-entries " +
        "with `start` set and NO `end` / NO `hours` — Keeping interprets the omission of `end` as " +
        "'this entry is ongoing'. Returns { timer_id } on success; use this id with " +
        "keeping_stop_timer or keeping_resume_timer. DRY-RUN BY DEFAULT — call without confirm " +
        "first to receive a would_post preview; call again with confirm: true ONLY after a " +
        "human reviewed the preview. `start` defaults to the current time in Europe/Amsterdam; " +
        "purpose defaults to 'work'.",
      inputSchema: StartTimerInput,
      annotations: {
        // D-3-11 write-tool annotations — flips three booleans vs read tools.
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      // outputSchema OMITTED — deferred per Phase 2 / 2.5 / 03-02 precedent (UXv2-02);
      // wire shape will be locked through a full Phase 3 ship cycle first.
    },
    async (input) => {
      try {
        const orgId = await client.resolveOrgId(input.organisation_id);

        // D-3-06 body construction: ONLY `date`, `purpose`, `start` are
        // unconditionally present, plus the three optional inputs. `end` and
        // `hours` keys MUST NOT appear — their absence is the "ongoing" signal
        // Keeping reads. Strict Object.keys assertion in Test 1 + 2 of
        // test/tools/start-timer.test.ts is the regression gate for this
        // invariant (T-03-05-01 mitigation).
        const body: Record<string, unknown> = {
          date: todayInAmsterdam(),
          purpose: input.purpose,
          start: input.start ?? nowInAmsterdamHHMM(),
        };
        if (input.project_id !== undefined) body.project_id = input.project_id;
        if (input.task_id !== undefined) body.task_id = input.task_id;
        if (input.note !== undefined) body.note = input.note;

        const result = await previewOrCall<{ time_entry: unknown; meta?: unknown }>(
          client,
          { requireConfirm: config.KEEPING_REQUIRE_CONFIRM, confirm: input.confirm === true },
          { method: "POST", path: `/${orgId}/time-entries`, body },
        );

        // Dry-run path: pass the would_post envelope through verbatim.
        // No timer_id surfaced — there is no entry yet to extract from.
        if (result !== null && typeof result === "object" && "would_post" in result) {
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        // Confirm path: extract time_entry.id via the verbatim three-clause
        // Array.isArray guard (D-2.5-05a). Drift collapses to timer_id: null —
        // visible failure, never crashing (T-03-05-02 mitigation).
        const entry = extractTimeEntry(result);
        const rawId = entry?.id;
        const timer_id = typeof rawId === "number" ? rawId : null;
        return { content: [{ type: "text", text: JSON.stringify({ timer_id }, null, 2) }] };
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
