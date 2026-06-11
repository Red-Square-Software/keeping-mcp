// keeping_me tool — returns the authenticated user payload merged with the
// resolved organisation_id. Identity is cached for the server's lifetime
// (D-22); the optional `organisation_id` input overrides KEEPING_ORG_ID (D-26).
//
// Response shape (D-34-R, 2026-06-11):
//   { user: { id, first_name, surname, code, role, state }, organisation_id }
//
// The `user` wrapper is preserved verbatim from the API response, consistent
// with `keeping_list_entries`' raw-pass-through philosophy. Clients who want
// a flat shape can read `parsed.user.id` etc.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KeepingClient } from "../keeping/client.js";
import { toIsErrorContent } from "../keeping/errors.js";

const MeInput = z.object({
  organisation_id: z
    .string()
    .optional()
    .describe("Override KEEPING_ORG_ID. Required when token has access to multiple orgs."),
});

export function registerMe(server: McpServer, client: KeepingClient): void {
  server.registerTool(
    "keeping_me",
    {
      title: "Who am I",
      description:
        "Returns the authenticated user (id, first_name, surname, code, role, state) wrapped " +
        "under a `user` key, plus the resolved `organisation_id`. Identity is cached for the " +
        "server's lifetime. Pass the optional `organisation_id` input to override the " +
        "KEEPING_ORG_ID default; required when the token has access to multiple organisations.",
      inputSchema: MeInput,
      annotations: {
        // READ-03: every read tool advertises read-only intent.
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        // Calls an external API (Keeping); host clients may use this to gate sandbox modes.
        openWorldHint: true,
      },
      // outputSchema OMITTED — deferred per 02-CONTEXT.md Deferred Ideas.
    },
    async (input) => {
      try {
        const orgId = await client.resolveOrgId(input.organisation_id);
        const me = await client.me();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ ...me, organisation_id: orgId }, null, 2),
            },
          ],
        };
      } catch (err) {
        // SAFE-04: never throw from a tool handler. Sanitised isError envelope.
        return toIsErrorContent(err);
      }
    },
  );
}
