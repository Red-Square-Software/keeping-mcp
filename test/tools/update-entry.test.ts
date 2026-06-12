// keeping_update_entry tool tests — Phase 3 Plan 03 vertical slice.
//
// Per-tool minimum test set per D-3-22 + PATCH partial-body assertions
// + immutable-field rejection (D-3-09 — date/purpose/user_id are removed
// from EntryEditBody per OpenAPI entry_edit_request). Skeleton mirrors
// test/tools/add-entry.test.ts (the canonical Phase 3 write-tool sibling) —
// reused buildClient + InMemoryTransport.createLinkedPair + Partial<KeepingClient>
// mocks + defaultConfig constant.
//
// All tests are byte-locked against:
//   - D-25 (KeepingAuthError wording)
//   - D-27 (MultiOrgError template)
//   - AMBIGUOUS_TEXT from src/keeping/write-gate.ts ("outcome unknown — verify
//     with keeping_list_entries before retrying.")
//   - D-3-05 endpoint verb table (PATCH /{orgId}/time-entries/{entry_id})
//   - D-3-11 four annotations (readOnlyHint:false, destructiveHint:true,
//     idempotentHint:false, openWorldHint:true)

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import type { KeepingConfig } from "../../src/config.js";
import type { KeepingClient } from "../../src/keeping/client.js";
import { KeepingApiError, KeepingAuthError, MultiOrgError } from "../../src/keeping/errors.js";
import { registerUpdateEntry } from "../../src/tools/update-entry.js";

const defaultConfig: KeepingConfig = {
  KEEPING_TOKEN: "kp_test_FAKE",
  KEEPING_REQUIRE_CONFIRM: true,
  KEEPING_LOG_LEVEL: "error",
};

async function buildClient(
  mockClient: Partial<KeepingClient>,
  config: KeepingConfig = defaultConfig,
) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerUpdateEntry(server, mockClient as KeepingClient, config);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

describe("keeping_update_entry tool", () => {
  it("Test 1: dry-run preview (env=true, confirm omitted) → would_post with PATCH, patch NOT called (D-3-01, D-3-02, WRITE-04)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      patch: async () => {
        throw new Error("patch should not be called on dry-run");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_update_entry",
      arguments: { entry_id: 12345, note: "updated note", start: "14:00" },
    });

    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed.would_post.method).toBe("PATCH");
    expect(parsed.would_post.url).toBe("https://api.keeping.nl/v1/47666/time-entries/12345");
    // Body MUST contain only the two supplied fields (PATCH partial — D-3-09).
    expect(parsed.would_post.body).toEqual({ note: "updated note", start: "14:00" });
    // Strict assertion: no `date`, no `purpose`, no `end`, no `hours`, no `project_id`, etc.
    expect(Object.keys(parsed.would_post.body).sort()).toEqual(["note", "start"]);
  });

  it("Test 2: confirm path → PATCH /47666/time-entries/12345 called exactly once with constructed body (WRITE-02, D-3-05)", async () => {
    const patches: Array<{ path: string; body: unknown }> = [];
    const mockResponse = {
      time_entry: { id: 12345, note: "updated note" },
      meta: {},
    };
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      patch: async <T>(path: string, body: unknown): Promise<T> => {
        patches.push({ path, body });
        return mockResponse as T;
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_update_entry",
      arguments: {
        entry_id: 12345,
        note: "updated note",
        start: "14:00",
        confirm: true,
      },
    });

    expect(res.isError).toBeFalsy();
    expect(patches.length).toBe(1);
    // Path: bare /{orgId}/time-entries/{entry_id} — no /v1/ prefix, no query.
    expect(patches[0]?.path).toBe("/47666/time-entries/12345");
    expect(patches[0]?.path).not.toContain("?");
    expect(patches[0]?.path).not.toContain("/organisations/");

    // Body must be EXACTLY the supplied two fields — no defaulting on update.
    expect(patches[0]?.body).toEqual({ note: "updated note", start: "14:00" });

    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed).toEqual(mockResponse);
  });

  it("Test 3: env-false escape hatch — KEEPING_REQUIRE_CONFIRM=false, no confirm → patch called (D-3-01)", async () => {
    const patches: Array<{ path: string; body: unknown }> = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      patch: async <T>(path: string, body: unknown): Promise<T> => {
        patches.push({ path, body });
        return { time_entry: { id: 12345 } } as T;
      },
    };
    const envFalseConfig: KeepingConfig = { ...defaultConfig, KEEPING_REQUIRE_CONFIRM: false };
    const client = await buildClient(mockClient, envFalseConfig);

    const res = await client.callTool({
      name: "keeping_update_entry",
      arguments: { entry_id: 12345, note: "updated" },
    });

    expect(res.isError).toBeFalsy();
    expect(patches.length).toBe(1);
    expect(patches[0]?.path).toBe("/47666/time-entries/12345");
    expect(patches[0]?.body).toEqual({ note: "updated" });
  });

  it("Test 4: single-field partial PATCH — only `note` supplied → body has ONLY `note` (PATCH partial, D-3-09)", async () => {
    const patches: Array<{ path: string; body: unknown }> = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      patch: async <T>(path: string, body: unknown): Promise<T> => {
        patches.push({ path, body });
        return { time_entry: { id: 12345 } } as T;
      },
    };
    const client = await buildClient(mockClient);

    await client.callTool({
      name: "keeping_update_entry",
      arguments: { entry_id: 12345, note: "just the note", confirm: true },
    });

    expect(patches.length).toBe(1);
    const body = patches[0]?.body as Record<string, unknown>;
    // Single-field PATCH — no other keys.
    expect(body).toEqual({ note: "just the note" });
    expect(Object.keys(body).sort()).toEqual(["note"]);
    // Defensive explicit assertions for the high-risk omissions:
    expect(body.start).toBeUndefined();
    expect(body.end).toBeUndefined();
    expect(body.hours).toBeUndefined();
    expect(body.project_id).toBeUndefined();
    expect(body.task_id).toBeUndefined();
    expect(body.tag_ids).toBeUndefined();
    expect(body.external_references).toBeUndefined();
  });

  it("Test 5: MultiOrgError flows through toIsErrorContent verbatim (D-27, D-3-20)", async () => {
    const orgs = [
      { id: 100, name: "Acme" },
      { id: 200, name: "Beta" },
    ];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => {
        throw new MultiOrgError(orgs);
      },
      patch: async () => {
        throw new Error("should not be called");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_update_entry",
      arguments: { entry_id: 12345, note: "test" },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: 100 (Acme), 200 (Beta).",
    );
  });

  it("Test 6: immutable fields (date/purpose) — Zod schema strips OR rejects (D-3-09 immutability contract)", async () => {
    const patches: Array<{ path: string; body: unknown }> = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      patch: async <T>(path: string, body: unknown): Promise<T> => {
        patches.push({ path, body });
        return { time_entry: { id: 12345 } } as T;
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_update_entry",
      arguments: {
        entry_id: 12345,
        date: "2026-06-13",
        purpose: "break",
        confirm: true,
      } as unknown as Record<string, unknown>,
    });

    // Two acceptable behaviors per plan §Task 1 §<behavior> §Test 6:
    //   (a) Zod schema does not declare these fields and Zod strips them at
    //       validation (default Zod object behavior is `.strip()`). In this
    //       case patches.length === 1 and body has no date/purpose keys.
    //   (b) Zod uses `.strict()` or a refine that rejects. In this case
    //       res.isError === true and the patch mock is never called.
    //
    // Either way the immutable fields MUST NOT reach the wire.
    const stripBranch =
      patches.length === 1 &&
      (patches[0]?.body as Record<string, unknown>).date === undefined &&
      (patches[0]?.body as Record<string, unknown>).purpose === undefined;
    const rejectBranch = res.isError === true && patches.length === 0;
    expect(stripBranch || rejectBranch).toBe(true);
  });

  it("Test 7: 5xx KeepingApiError (ambiguous) → AMBIGUOUS_TEXT envelope with original message parenthetical (D-3-16, WRITE-05)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      patch: async () => {
        throw new KeepingApiError(503, "service unavailable");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_update_entry",
      arguments: { entry_id: 12345, note: "x", confirm: true },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    const text = content[0]?.text ?? "";
    expect(
      text.startsWith("outcome unknown — verify with keeping_list_entries before retrying."),
    ).toBe(true);
    expect(text).toContain("Keeping API error 503");
    expect(text).toMatch(/\(.*Keeping API error 503.*\)/);
  });

  it("Test 8: 4xx KeepingApiError (404 not found) → toIsErrorContent, NOT ambiguous envelope (D-3-16)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      patch: async () => {
        throw new KeepingApiError(404, '{"error":{"message":"Not Found"}}');
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_update_entry",
      arguments: { entry_id: 99999, note: "x", confirm: true },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    const text = content[0]?.text ?? "";
    expect(text).toContain("Keeping API error 404");
    expect(text).not.toContain("outcome unknown");
  });

  it("Test 9: 401 KeepingAuthError flows through toIsErrorContent verbatim (D-25, D-3-20)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      patch: async () => {
        throw new KeepingAuthError();
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_update_entry",
      arguments: { entry_id: 12345, note: "x", confirm: true },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.",
    );
  });

  it("Test 10: listTools reflects four locked annotations (D-3-11, WRITE-07)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      patch: async () => ({ time_entry: { id: 1 } }) as never,
    };
    const client = await buildClient(mockClient);

    const list = await client.listTools();
    const tool = list.tools.find((t) => t.name === "keeping_update_entry");
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(false);
    expect(tool?.annotations?.destructiveHint).toBe(true);
    expect(tool?.annotations?.idempotentHint).toBe(false);
    expect(tool?.annotations?.openWorldHint).toBe(true);
  });
});
