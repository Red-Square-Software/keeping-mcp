// keeping_resume_timer tool — Phase 3 Plan 07 vertical slice.
//
// Implements TIMER-01 (resume portion) + TIMER-02 (X-Server-Time-Ms surfacing).
// Requirement / decision references:
//   D-3-05 (endpoint verb table: resume = POST /{orgId}/time-entries/{entry_id}/resume —
//     D-32-R's POST claim is UNCHANGED for resume; only `stop` was corrected to PATCH),
//   D-3-09 (resume_timer input surface: organisation_id?, entry_id, confirm?),
//   D-3-11 (write-tool annotations — four booleans),
//   D-3-12 (confirm description verbatim),
//   D-3-16 (ambiguous-failure envelope on 5xx / abort / TypeError),
//   D-3-18 (client.requestWithHeaders<T> — the NEW method from Plan 03-01 that
//     surfaces the Response.headers handle that X-Server-Time-Ms lives on;
//     client.post alone drops headers and would erase TIMER-02),
//   D-3-19 (X-Server-Time-Ms: parse with Number() then Number.isFinite gate;
//     missing or non-numeric → fall back to Date.now() AND emit
//     `client.log.warn("X-Server-Time-Ms header missing on resume response;
//     falling back to local clock")`. NOT an isError surface — the resume
//     succeeded, only the wall-clock anchor is degraded),
//   Pitfall 6 (RESEARCH §"200-vs-201 distinction"): resume may return 200
//     (modified existing entry, same id) OR 201 (NEW ongoing entry created
//     because the original entry's date is no longer "today" — new day
//     rollover). This tool DELIBERATELY does NOT compare
//     `response.time_entry.id` to `input.entry_id`. The server's id is the
//     authoritative one for any subsequent stop/resume call, and the AI must
//     read it verbatim from the response. Verified by Test 5.
//
// 403 = DEFINITE-FAIL (RESEARCH Q3 RESOLVED): Keeping returns 403 when the
// caller tries to resume a locked time entry. Per the classifyAmbiguous
// contract (D-3-16), only `status >= 500` is ambiguous; 4xx (including 403)
// flows through `toIsErrorContent` unchanged so the AI gets the localised
// error message verbatim. Verified by Test 7.
//
// Inline-gate pattern (sibling to stop-timer.ts and delete-entry.ts):
//   previewOrCall does NOT route through requestWithHeaders — it would drop
//   the Response.headers handle the confirm path needs. So this tool inlines
//   the dry-run gate inside the handler:
//     - Dry-run branch (KEEPING_REQUIRE_CONFIRM && !confirm) → return
//       { would_post: { method: "POST", url, body: null } } directly.
//     - Confirm branch → call client.requestWithHeaders<T>("POST", path)
//       directly, then read X-Server-Time-Ms from the returned headers.
//   Same shape stop-timer uses; the only differences are the verb (POST
//   here vs the stop verb), the path suffix (/resume vs /stop), the warn
//   substring, and the description text.
//
// Wire shape on the confirm path: `{ ...body, server_time_ms }` — spreading
// the response wrapper (`{ time_entry, meta? }`) keeps the AI-facing surface
// shaped like a regular write response AND adds server_time_ms as a sibling
// so the consumer can compute elapsed-time without parsing time_entry.start
// + time_entry.end ISO strings. Pitfall 6 falls out of this verbatim pass-
// through — `time_entry.id` is whatever the server returned, never compared
// to the input.
//
// Server-registration is deferred to Plan 03-08 (single Wave 3 wiring plan).
// This file does NOT modify src/server.ts.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KeepingConfig } from "../config.js";
import type { KeepingClient } from "../keeping/client.js";
import { toIsErrorContent } from "../keeping/errors.js";
import { AMBIGUOUS_TEXT, classifyAmbiguous } from "../keeping/write-gate.js";

// Zod input schema per D-3-09 (resume_timer surface). Identical to
// stop-timer — only org-scope override, the entry id, and confirm. No
// purpose / note / start / end / hours — resume just toggles
// ongoing=true on an existing entry (or creates a new one on day rollover
// per Pitfall 6).
//
// `entry_id` is REQUIRED and `z.number().int().positive()` blocks path-
// traversal vectors at the schema layer.
const ResumeTimerInput = z.object({
  organisation_id: z
    .string()
    .optional()
    .describe("Override KEEPING_ORG_ID; required for multi-org tokens."),
  entry_id: z
    .number()
    .int()
    .positive()
    .describe("Numeric Keeping time-entry id of the previously-stopped entry to resume."),
  confirm: z
    .boolean()
    .optional()
    .describe(
      "Set to true ONLY after a human has reviewed the would_post preview returned by a prior dry-run call. The MCP client (LLM) MUST NOT set this autonomously — wait for the human to type 'yes' / 'confirm'.",
    ),
});

export function registerResumeTimer(
  server: McpServer,
  client: KeepingClient,
  config: KeepingConfig,
): void {
  server.registerTool(
    "keeping_resume_timer",
    {
      title: "Resume a stopped timer",
      description:
        "Resume a previously-stopped time entry as an ongoing timer. Implemented as " +
        "POST /{orgId}/time-entries/{entry_id}/resume. Returns the resumed entry plus " +
        "server_time_ms — the millisecond-precision server timestamp captured from the " +
        "X-Server-Time-Ms response header (TIMER-02). When the header is missing or " +
        "unparseable, server_time_ms falls back to the local clock and a warning is " +
        "logged to stderr. NOTE: Keeping may return a different time_entry.id than the " +
        "input entry_id — when the original entry's date is no longer 'today', Keeping " +
        "creates a NEW ongoing entry rather than modifying the old one. Always read " +
        "time_entry.id from the response; do not assume it matches your input. Cannot " +
        "resume locked entries (returns a 403 error). DRY-RUN BY DEFAULT — call without " +
        "confirm first to receive a would_post preview; call again with confirm: true " +
        "ONLY after a human reviewed the preview.",
      inputSchema: ResumeTimerInput,
      annotations: {
        // D-3-11 write-tool annotations — flips three booleans vs read tools.
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      // outputSchema OMITTED — deferred per Phase 2 / 2.5 / 03-02..03-06 precedent (UXv2-02).
    },
    async (input) => {
      try {
        const orgId = await client.resolveOrgId(input.organisation_id);
        const path = `/${orgId}/time-entries/${input.entry_id}/resume`;
        const isDryRun = config.KEEPING_REQUIRE_CONFIRM && input.confirm !== true;

        if (isDryRun) {
          // Inline dry-run gate — mirrors stop-timer.ts / delete-entry.ts.
          // The body field collapses to null for the wire-shape consistency
          // that the rest of Phase 3 maintains (D-3-02). POST /resume has
          // no request body per OpenAPI — Keeping derives the resume
          // semantics from the path alone.
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    would_post: {
                      method: "POST",
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
        // (no POST /resume request body per OpenAPI).
        const { body, headers } = await client.requestWithHeaders<{
          time_entry: unknown;
          meta?: unknown;
        }>("POST", path);

        // D-3-19: parse X-Server-Time-Ms via Number() + Number.isFinite gate.
        // The gate rejects: null/undefined → NaN, non-numeric strings → NaN,
        // empty string → 0 (excluded by `> 0`), Infinity (excluded by
        // isFinite). On any rejection: fall back to Date.now() AND emit the
        // locked warn substring. NOT an isError — the resume succeeded, only
        // the wall-clock anchor is degraded (T-03-07-03 mitigation).
        const headerValue = headers.get("X-Server-Time-Ms");
        const parsed = Number(headerValue);
        let server_time_ms: number;
        if (Number.isFinite(parsed) && parsed > 0) {
          server_time_ms = parsed;
        } else {
          client.log.warn(
            "X-Server-Time-Ms header missing on resume response; falling back to local clock",
          );
          server_time_ms = Date.now();
        }

        // Spread the response wrapper so { time_entry, meta? } stays visible
        // AND server_time_ms appears as a sibling. The time_entry.id here is
        // whatever the server returned — Pitfall 6 falls out of this verbatim
        // pass-through; we DELIBERATELY do not compare to input.entry_id.
        // Test 5 enforces this by mocking a response with a different id and
        // asserting the tool surfaces the server's id (NOT the input's).
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
        // Everything else (4xx including 403 "cannot resume locked entry"
        // per RESEARCH Q3, KeepingAuthError, MultiOrgError, plain Error)
        // flows through toIsErrorContent unchanged (SAFE-04 definite-fail
        // path). 403 is DEFINITE-FAIL because the server explicitly told
        // the client the operation cannot succeed (locked entry) — verified
        // by Test 7.
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
