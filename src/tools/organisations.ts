// keeping_organisations tool — returns the cached organisation list verbatim
// from the Keeping API, with feature flags (projects, tasks, timesheet_mode)
// preserved as raw fields per IDENT-02. The org list is memoised inside
// KeepingClient for the server's lifetime (D-22, D-23, D-24).

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KeepingClient } from "../keeping/client.js";
import { toIsErrorContent } from "../keeping/errors.js";

// Pitfall B: use z.object({}) — never a raw empty shape.
const OrganisationsInput = z.object({});

export function registerOrganisations(server: McpServer, client: KeepingClient): void {
  server.registerTool(
    "keeping_organisations",
    {
      title: "List organisations",
      description:
        "Returns the list of organisations the token can access. Each organisation " +
        "includes feature flags (projects, tasks, timesheet_mode) verbatim from the " +
        "API. Cached for the server's lifetime.",
      inputSchema: OrganisationsInput,
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
    async () => {
      try {
        const orgs = await client.organisations();
        return {
          content: [{ type: "text", text: JSON.stringify(orgs, null, 2) }],
        };
      } catch (err) {
        // SAFE-04: never throw from a tool handler. Sanitised isError envelope.
        return toIsErrorContent(err);
      }
    },
  );
}
