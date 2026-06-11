// keeping_projects tool — lists projects for the resolved organisation.
//
// NOT cached (D-23): project availability follows feature flags + admin
// decisions, so each call hits the API fresh.
//
// Graceful-empty contract (META-01): when the API returns 404 for the
// projects endpoint, the org has the feature disabled. This is NOT a failure
// — we return a human-readable note WITHOUT setting `isError: true`.
// Distinguish "feature off" from "real failure" by HTTP status, not body.
//
// Path: `/{orgId}/projects` per D-34-R (NOT `/organisations/{orgId}/projects`).

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KeepingClient } from "../keeping/client.js";
import { KeepingApiError, toIsErrorContent } from "../keeping/errors.js";

const ProjectsInput = z.object({
  organisation_id: z
    .string()
    .optional()
    .describe("Override KEEPING_ORG_ID; required for multi-org tokens."),
});

export function registerProjects(server: McpServer, client: KeepingClient): void {
  server.registerTool(
    "keeping_projects",
    {
      title: "List projects",
      description:
        "Returns the list of projects available for the selected organisation. " +
        "If the projects feature is disabled for the organisation, returns a " +
        "human-readable note instead of an error. Not cached — fresh per call.",
      inputSchema: ProjectsInput,
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
        const raw = await client.get<unknown>(`/${orgId}/projects`);
        return {
          content: [{ type: "text", text: JSON.stringify(raw, null, 2) }],
        };
      } catch (err) {
        // META-01 graceful-empty: distinguish "feature off" by HTTP status.
        // 404 means the projects endpoint isn't enabled for this org — NOT a
        // failure, so do NOT set isError: true.
        if (err instanceof KeepingApiError && err.status === 404) {
          return {
            content: [
              { type: "text", text: "Projects feature not enabled for this organisation." },
            ],
          };
        }
        // SAFE-04: never throw from a tool handler. Sanitised isError envelope.
        return toIsErrorContent(err);
      }
    },
  );
}
