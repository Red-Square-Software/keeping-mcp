// keeping_tasks tool — lists tasks for the resolved organisation.
//
// NOT cached (D-23): task availability follows feature flags + admin
// decisions, so each call hits the API fresh.
//
// Graceful-empty contract (META-02): when the API returns 404 for the tasks
// endpoint, the org has the feature disabled. This is NOT a failure — we
// return a human-readable note WITHOUT setting `isError: true`. Distinguish
// "feature off" from "real failure" by HTTP status, not body.
//
// Sibling pattern of src/tools/projects.ts — same shape, "tasks" substitutions.
//
// Path: `/{orgId}/tasks` per D-34-R (NOT `/organisations/{orgId}/tasks`).

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KeepingClient } from "../keeping/client.js";
import { KeepingApiError, toIsErrorContent } from "../keeping/errors.js";

const TasksInput = z.object({
  organisation_id: z
    .string()
    .optional()
    .describe("Override KEEPING_ORG_ID; required for multi-org tokens."),
});

export function registerTasks(server: McpServer, client: KeepingClient): void {
  server.registerTool(
    "keeping_tasks",
    {
      title: "List tasks",
      description:
        "Returns the list of tasks available for the selected organisation. " +
        "If the tasks feature is disabled for the organisation, returns a " +
        "human-readable note instead of an error. Not cached — fresh per call.",
      inputSchema: TasksInput,
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
        const raw = await client.get<unknown>(`/${orgId}/tasks`);
        return {
          content: [{ type: "text", text: JSON.stringify(raw, null, 2) }],
        };
      } catch (err) {
        // META-02 graceful-empty: distinguish "feature off" by HTTP status.
        // 404 means the tasks endpoint isn't enabled for this org — NOT a
        // failure, so do NOT set isError: true.
        if (err instanceof KeepingApiError && err.status === 404) {
          return {
            content: [{ type: "text", text: "Tasks feature not enabled for this organisation." }],
          };
        }
        // SAFE-04: never throw from a tool handler. Sanitised isError envelope.
        return toIsErrorContent(err);
      }
    },
  );
}
