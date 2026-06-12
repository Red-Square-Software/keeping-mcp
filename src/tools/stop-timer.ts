// keeping_stop_timer tool — Phase 3 Plan 06 vertical slice.
//
// Implements TIMER-01 (stop portion) + TIMER-02 (X-Server-Time-Ms surfacing).
// Requirement / decision references:
//   D-3-05 (endpoint verb table: stop = PATCH /{orgId}/time-entries/{entry_id}/stop —
//     this SUPERSEDES D-32-R's POST claim; OpenAPI documents PATCH),
//   D-3-09 (stop_timer input surface: organisation_id?, entry_id, confirm?),
//   D-3-11 (write-tool annotations — four booleans),
//   D-3-12 (confirm description verbatim),
//   D-3-16 (ambiguous-failure envelope on 5xx / abort / TypeError),
//   D-3-18 (client.requestWithHeaders<T> — the NEW method from Plan 03-01 that
//     surfaces the Response.headers handle that X-Server-Time-Ms lives on;
//     client.patch alone drops headers and would erase TIMER-02),
//   D-3-19 (X-Server-Time-Ms: parse with Number() then Number.isFinite gate;
//     missing or non-numeric → fall back to Date.now() AND emit
//     `client.log.warn("X-Server-Time-Ms header missing on stop response;
//     falling back to local clock")`. NOT an isError surface — the stop
//     succeeded, only the wall-clock anchor is degraded).
//
// Inline-gate pattern (sibling to delete-entry.ts):
//   previewOrCall does NOT route through requestWithHeaders — it would drop
//   the Response.headers handle the confirm path needs. So this tool inlines
//   the dry-run gate inside the handler:
//     - Dry-run branch (KEEPING_REQUIRE_CONFIRM && !confirm) → return
//       { would_post: { method: "PATCH", url, body: null } } directly.
//     - Confirm branch → call client.requestWithHeaders<T>("PATCH", path)
//       directly, then read X-Server-Time-Ms from the returned headers.
//   Same shape delete-entry uses for its extra-GET enrichment — handler-owned
//   gate with shared catch-arm chain.
//
// Wire shape on the confirm path: `{ ...body, server_time_ms }` — spreading
// the response wrapper (`{ time_entry, meta? }`) keeps the AI-facing surface
// shaped like a regular write response AND adds server_time_ms as a sibling
// so the consumer can compute elapsed-time without parsing time_entry.start
// + time_entry.end ISO strings.
//
// Server-registration is deferred to Plan 03-08 (single Wave 3 wiring plan).
// This file does NOT modify src/server.ts.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KeepingConfig } from "../config.js";
import type { KeepingClient } from "../keeping/client.js";
import { toIsErrorContent } from "../keeping/errors.js";
import { AMBIGUOUS_TEXT, classifyAmbiguous } from "../keeping/write-gate.js";

// Zod input schema per D-3-09 (stop_timer surface). Tightest of the timer
// write tools — only org-scope override, the entry id, and confirm. No
// purpose / note / start / end / hours — stop just toggles ongoing=false
// on an existing entry.
//
// `entry_id` is REQUIRED and `z.number().int().positive()` blocks path-
// traversal vectors at the schema layer.
const StopTimerInput = z.object({
  organisation_id: z
    .string()
    .optional()
    .describe("Override KEEPING_ORG_ID; required for multi-org tokens."),
  entry_id: z
    .number()
    .int()
    .positive()
    .describe("Numeric Keeping time-entry id of the ongoing entry to stop."),
  confirm: z
    .boolean()
    .optional()
    .describe(
      "Set to true ONLY after a human has reviewed the would_post preview returned by a prior dry-run call. The MCP client (LLM) MUST NOT set this autonomously — wait for the human to type 'yes' / 'confirm'.",
    ),
});

export function registerStopTimer(
  server: McpServer,
  client: KeepingClient,
  config: KeepingConfig,
): void {
  server.registerTool(
    "keeping_stop_timer",
    {
      title: "Stop a running timer",
      description:
        "Stop an ongoing time entry (running timer) by setting its end. Implemented as " +
        "PATCH /{orgId}/time-entries/{entry_id}/stop. Returns the updated entry plus " +
        "server_time_ms — the millisecond-precision server timestamp captured from the " +
        "X-Server-Time-Ms response header (TIMER-02). When the header is missing or " +
        "unparseable, server_time_ms falls back to the local clock and a warning is " +
        "logged to stderr. DRY-RUN BY DEFAULT — call without confirm first to receive a " +
        "would_post preview; call again with confirm: true ONLY after a human reviewed " +
        "the preview.",
      inputSchema: StopTimerInput,
      annotations: {
        // D-3-11 write-tool annotations — flips three booleans vs read tools.
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      // outputSchema OMITTED — deferred per Phase 2 / 2.5 / 03-02..03-05 precedent (UXv2-02).
    },
    async (input) => {
      try {
        const orgId = await client.resolveOrgId(input.organisation_id);
        const path = `/${orgId}/time-entries/${input.entry_id}/stop`;
        const isDryRun = config.KEEPING_REQUIRE_CONFIRM && input.confirm !== true;

        if (isDryRun) {
          // Inline dry-run gate — mirrors delete-entry.ts's pattern. The
          // body field collapses to null for the wire-shape consistency
          // that the rest of Phase 3 maintains (D-3-02). PATCH /stop has
          // no request body — Keeping derives `end` server-side.
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    would_post: {
                      method: "PATCH",
                      url: `https://api.keeping.nl/v1${path}`,
                      body: null,
                    },
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Confirm path — D-3-18: use requestWithHeaders so we can read the
        // X-Server-Time-Ms response header for TIMER-02. body is undefined
        // (no PATCH /stop request body per OpenAPI).
        const { body, headers } = await client.requestWithHeaders<{
          time_entry: unknown;
          meta?: unknown;
        }>("PATCH", path);

        // D-3-19: parse X-Server-Time-Ms via Number() + Number.isFinite gate.
        // The gate rejects: null/undefined → NaN, non-numeric strings → NaN,
        // empty string → 0 (excluded by `> 0`), Infinity (excluded by
        // isFinite). On any rejection: fall back to Date.now() AND emit the
        // locked warn substring. NOT an isError — the stop succeeded, only
        // the wall-clock anchor is degraded (T-03-06-02 mitigation).
        const headerValue = headers.get("X-Server-Time-Ms");
        const parsed = Number(headerValue);
        let server_time_ms: number;
        if (Number.isFinite(parsed) && parsed > 0) {
          server_time_ms = parsed;
        } else {
          client.log.warn(
            "X-Server-Time-Ms header missing on stop response; falling back to local clock",
          );
          server_time_ms = Date.now();
        }

        // Spread the response wrapper so { time_entry, meta? } stays visible
        // AND server_time_ms appears as a sibling — the structure Test 2
        // asserts via `parsed.time_entry === stoppedEntry` AND
        // `parsed.server_time_ms === 1718202000000`.
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ ...body, server_time_ms }, null, 2),
            },
          ],
        };
      } catch (err) {
        // D-3-16: 5xx / AbortError / raw TypeError → ambiguous envelope.
        // Everything else (4xx including 422 "entry not ongoing",
        // KeepingAuthError, MultiOrgError, plain Error) flows through
        // toIsErrorContent unchanged (SAFE-04 definite-fail path).
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
