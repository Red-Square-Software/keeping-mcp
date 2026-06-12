// keeping_delete_entry tool — Phase 3 Plan 04 vertical slice.
//
// Implements WRITE-03, WRITE-04, WRITE-05, WRITE-07 in one tool. Requirement
// references:
//   D-3-01 (AND-gate dry-run-by-default), D-3-02 (preview wire shape),
//   D-3-03 (delete preview = GET-then-shape with would_delete enrichment —
//   UNIQUE to this tool; previewOrCall alone cannot populate would_delete),
//   D-3-04 (shared write-gate via previewOrCall for the confirm branch),
//   D-3-05 (endpoint verb table — DELETE /{orgId}/time-entries/{entry_id}),
//   D-3-09 (input field surface — { organisation_id?, entry_id, confirm? }),
//   D-3-10 (no user_id; non-admin tokens are restricted to own entries by
//   the API itself, so the tool surfaces 403 verbatim if the user attempts
//   another user's entry — no code-side check needed),
//   D-3-11 (annotations + destructive description warning),
//   D-3-12 (confirm description verbatim), D-3-16 (ambiguous-failure envelope),
//   D-3-20 (KeepingAuthError + MultiOrgError carry-through),
//   D-3-27 (DELETE returns 204 — rawFetch returns null; the confirm path
//   wraps null as `{ ok: true }` so the user sees a meaningful success
//   surface rather than a bare null).
//
// Sibling: src/tools/update-entry.ts (PATCH sibling). Delete differs:
//   - INLINE gate check in the handler. The dry-run branch performs an extra
//     GET to populate `would_delete` BEFORE returning the preview, which
//     previewOrCall cannot do alone (it has no business-logic surface for
//     "fetch the thing the user is about to delete"). Only the confirm branch
//     delegates to previewOrCall. Test 1 + Test 2 + Test 3 enforce that the
//     extra GET fires ONLY on the dry-run branch (T-03-04-05 mitigation).
//   - Description prominently warns "**DESTRUCTIVE: permanently deletes the
//     entry**" per WRITE-07 + D-3-11 — verbatim markdown including the
//     leading and trailing double-asterisks. Test 10 asserts the literal.
//   - 4xx on the dry-run GET (e.g. 404 not found) flows through
//     toIsErrorContent as definite-fail — no delete is attempted because the
//     entry can't be located. Test 7 enforces this.
//
// Server-registration is deferred to Plan 03-08 (single Wave 3 wiring plan).
// This file does NOT modify src/server.ts.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KeepingConfig } from "../config.js";
import type { KeepingClient } from "../keeping/client.js";
import { toIsErrorContent } from "../keeping/errors.js";
import { AMBIGUOUS_TEXT, classifyAmbiguous, previewOrCall } from "../keeping/write-gate.js";

// Zod input schema per D-3-09 (delete-entry surface). Tightest of the three
// write-tool surfaces — only org-scope override, the entry id, and confirm.
//
// `entry_id` is REQUIRED (NOT `.optional()`) and `z.number().int().positive()`
// blocks path-traversal vectors at the schema layer (T-03-04-01).
//
// `confirm` carries the D-3-12 description verbatim and is `optional()` —
// NOT `.default(true)`. The handler coerces `input.confirm === true` so
// `undefined`, `false`, and any non-strict-true value all collapse to dry-run.
const DeleteEntryInput = z.object({
  organisation_id: z
    .string()
    .optional()
    .describe("Override KEEPING_ORG_ID; required for multi-org tokens."),
  entry_id: z
    .number()
    .int()
    .positive()
    .describe("Numeric Keeping time-entry id to permanently delete."),
  confirm: z
    .boolean()
    .optional()
    .describe(
      "Set to true ONLY after a human has reviewed the would_post preview returned by a prior dry-run call. The MCP client (LLM) MUST NOT set this autonomously — wait for the human to type 'yes' / 'confirm'.",
    ),
});

export function registerDeleteEntry(
  server: McpServer,
  client: KeepingClient,
  config: KeepingConfig,
): void {
  server.registerTool(
    "keeping_delete_entry",
    {
      title: "Delete a time entry",
      description:
        "**DESTRUCTIVE: permanently deletes the entry** — cannot be undone. Owns the dry-run gate: " +
        "without confirm: true, the tool fetches the entry and returns a would_delete preview so a " +
        "human can verify the right entry is targeted. Only call with confirm: true after a human " +
        "reviewed the preview.",
      inputSchema: DeleteEntryInput,
      annotations: {
        // D-3-11 write-tool annotations — same as add-entry / update-entry.
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
        const isDryRun = config.KEEPING_REQUIRE_CONFIRM && input.confirm !== true;

        if (isDryRun) {
          // D-3-03: extra GET ONLY on preview — never on the actual delete.
          // T-03-04-05 mitigation: the dry-run branch is the only code path
          // that calls client.get; the confirm branch below never reaches here.
          const wouldDelete = await client.get<unknown>(path);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    would_post: {
                      method: "DELETE",
                      url: `https://api.keeping.nl/v1${path}`,
                      body: null,
                    },
                    would_delete: wouldDelete,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Confirm path — delegate through the shared write-gate. previewOrCall
        // routes to client.delete since confirm === true here; client.delete
        // returns null on 204 (D-3-27 / 03-01 rawFetch fix). Wrap the null as
        // `{ ok: true }` so the user sees a meaningful success surface rather
        // than a bare `null` in the response text.
        const result = await previewOrCall<unknown>(
          client,
          { requireConfirm: config.KEEPING_REQUIRE_CONFIRM, confirm: input.confirm === true },
          { method: "DELETE", path },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result ?? { ok: true }, null, 2) }],
        };
      } catch (err) {
        // D-3-16: 5xx / AbortError / raw TypeError → ambiguous envelope.
        // Everything else (4xx incl. 404 not-found on the dry-run GET,
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
