// keeping_list_entries tool — schema-discovery cornerstone of Phase 2.
//
// Wire shape is RAW (D-34, preserved by D-34-R): the entries array passes
// through verbatim with no field renaming, dropping, or re-typing. Top-level
// normalisation only: whatever wrapper shape Keeping returns flattens to
// `{ entries, count }`. Phase 3 reads the raw array to lock POST body field
// names for the write tools.
//
// Path strategy (D-34-R, 2026-06-11):
//   - Single-day call (`from === to` or `to` omitted):
//     `GET /{orgId}/time-entries?date={from}` (optionally `&user_id=...`).
//   - Multi-day range (`from !== to`):
//     `GET /{orgId}/report/time-entries?from={from}&to={to}` (optionally `&user_id=...`).
//   - Endpoint URL uses `time-entries` (hyphen). The JSON wrapper key the
//     API returns is `time_entries` (underscore) — both forms appear and
//     must match exactly.
//
// `limit` is enforced as a client-side post-fetch truncation. The Keeping
// API does NOT paginate either endpoint, so the param is not sent to the
// server; it survives as a Pitfall E size guard against pathological days.
//
// Date validation is enforced by Zod regex (Pitfall 5 — timezone confusion).
// The `.describe()` text is the documentation surface AI clients read; the
// Europe/Amsterdam timezone note is mandatory there, not just in the tool
// description.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KeepingClient } from "../keeping/client.js";
import { toIsErrorContent } from "../keeping/errors.js";

const EntriesListInput = z.object({
  organisation_id: z
    .string()
    .optional()
    .describe("Override KEEPING_ORG_ID; required for multi-org tokens."),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD (calendar date, not UTC timestamp)")
    .describe("Inclusive start date. Calendar date in YYYY-MM-DD; Europe/Amsterdam timezone."),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Inclusive end date; defaults to `from` (single day)."),
  user_id: z.string().optional().describe("Defaults to the authenticated user."),
  // Pitfall E: hard cap at 1000 — client-side truncation guard against
  // pathological days. The Keeping API does not paginate either endpoint,
  // so this never appears as a query param; it bounds the post-fetch array
  // size only. Default 200 per FEATURES.md recommendation.
  limit: z.number().int().min(1).max(1000).default(200),
});

/**
 * Top-level normaliser. The Keeping API returns:
 *   - Single-day endpoint: `{ time_entries: [...], meta: {...} }`.
 *   - Report endpoint:     `{ time_entries: [...], meta: {...} }` (same wrapper).
 *
 * Defence-in-depth: accept either wrapper-shape `time_entries` (the real
 * key), the legacy assumption `entries`, or a bare array. Wrapper / meta
 * fields are intentionally dropped — D-34 raw-pass-through applies to
 * the INNER items only.
 */
function normaliseEntries(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw !== null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.time_entries)) return obj.time_entries;
    if (Array.isArray(obj.entries)) return obj.entries;
  }
  return [];
}

export function registerEntriesList(server: McpServer, client: KeepingClient): void {
  server.registerTool(
    "keeping_list_entries",
    {
      title: "List time entries",
      description:
        "Returns time entries for a date range. Wire shape preserved exactly as returned by the " +
        "Keeping API — no field renaming — so this tool doubles as schema discovery for Phase 3 " +
        "write tools. Dates are calendar dates in YYYY-MM-DD; not UTC timestamps. " +
        "Single-day calls hit `GET /{orgId}/time-entries?date=...`; multi-day ranges hit " +
        "`GET /{orgId}/report/time-entries?from=...&to=...`.",
      inputSchema: EntriesListInput,
      annotations: {
        // READ-03: every read tool advertises read-only intent.
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        // Calls an external API (Keeping); host clients may use this to gate sandbox modes.
        openWorldHint: true,
      },
      // outputSchema OMITTED — deferred per 02-CONTEXT.md Deferred Ideas.
      // The whole point of this tool's response is to expose the raw wire
      // format for Phase 3 schema lockdown; a Zod outputSchema here would
      // defeat the purpose.
    },
    async (input) => {
      try {
        const orgId = await client.resolveOrgId(input.organisation_id);
        const to = input.to ?? input.from;
        const singleDay = input.from === to;

        const params = new URLSearchParams();
        if (singleDay) {
          params.set("date", input.from);
        } else {
          params.set("from", input.from);
          params.set("to", to);
        }
        if (input.user_id) params.set("user_id", input.user_id);

        const path = singleDay
          ? `/${orgId}/time-entries?${params}`
          : `/${orgId}/report/time-entries?${params}`;

        const raw = await client.get<unknown>(path);

        // D-34 top-level normalisation only — inner items pass through
        // unchanged. `meta`/wrapper fields are intentionally dropped.
        const entries = normaliseEntries(raw).slice(0, input.limit);
        const payload = { entries, count: entries.length };

        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        };
      } catch (err) {
        // SAFE-04: never throw from a tool handler. Sanitised isError envelope.
        return toIsErrorContent(err);
      }
    },
  );
}
