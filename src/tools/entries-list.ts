// keeping_list_entries tool — schema-discovery cornerstone of Phase 2.
//
// Wire shape is RAW (D-34): the entries array passes through verbatim with
// no field renaming, dropping, or re-typing. Top-level normalisation only:
// whatever shape Keeping returns ({ entries: [...] } or [...]) gets flattened
// to { entries, count }. Phase 3 reads the raw array to lock POST body field
// names for the write tools.
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
  // Pitfall E: hard cap at 1000 to keep response sizes within MCP message
  // limits. Default 200 per FEATURES.md recommendation.
  limit: z.number().int().min(1).max(1000).default(200),
});

export function registerEntriesList(server: McpServer, client: KeepingClient): void {
  server.registerTool(
    "keeping_list_entries",
    {
      title: "List time entries",
      description:
        "Returns time entries for a date range. Wire shape preserved exactly as returned by the " +
        "Keeping API — no field renaming — so this tool doubles as schema discovery for Phase 3 " +
        "write tools. Dates are calendar dates in YYYY-MM-DD; not UTC timestamps.",
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
        const params = new URLSearchParams({
          from: input.from,
          to: input.to ?? input.from,
          limit: String(input.limit),
        });
        if (input.user_id) params.set("user_id", input.user_id);

        const raw = await client.get<{ entries?: unknown[] } | unknown[]>(
          `/organisations/${orgId}/time_entries?${params}`,
        );

        // D-34 top-level normalisation only — inner array items pass through
        // unchanged. `meta`/wrapper fields are intentionally dropped; the
        // discriminator is array-shape, not body inspection.
        const entries = Array.isArray(raw) ? raw : (raw.entries ?? []);
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
