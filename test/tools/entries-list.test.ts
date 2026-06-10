import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import type { KeepingClient } from "../../src/keeping/client.js";
import { KeepingAuthError, MultiOrgError } from "../../src/keeping/errors.js";
import { registerEntriesList } from "../../src/tools/entries-list.js";

// Build a minimal MCP server that has only the `keeping_list_entries` tool
// registered against the supplied (mocked) KeepingClient, then link an
// InMemoryTransport pair and connect both sides. Returns the connected Client.
async function buildClient(mockClient: Partial<KeepingClient>) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerEntriesList(server, mockClient as KeepingClient);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

describe("keeping_list_entries tool", () => {
  it("Test 1: happy path — raw pass-through preserves every field (including custom_field_x) per D-34", async () => {
    const entries = [
      {
        id: "te-1",
        day: "2026-06-09",
        hours: 1.5,
        project_id: "p-1",
        purpose: "billable",
        custom_field_x: 42,
      },
    ];
    const calls: string[] = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "org_abc",
      get: async <T>(path: string): Promise<T> => {
        calls.push(path);
        return entries as T;
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_list_entries",
      arguments: { from: "2026-06-09" },
    });
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.type).toBe("text");
    const parsed = JSON.parse(content[0]?.text ?? "") as {
      entries: Array<Record<string, unknown>>;
      count: number;
    };
    expect(parsed).toEqual({ entries, count: 1 });
    // D-34 raw pass-through: custom_field_x must survive verbatim.
    expect(parsed.entries[0]?.custom_field_x).toBe(42);
  });

  it("Test 2: top-level wrapped shape — { entries, meta } unwraps to { entries, count }", async () => {
    const inner = [{ id: "te-1" }];
    const wrapped = { entries: inner, meta: { total: 1 } };
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "org_abc",
      get: async <T>(): Promise<T> => wrapped as T,
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_list_entries",
      arguments: { from: "2026-06-09" },
    });
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "") as {
      entries: Array<Record<string, unknown>>;
      count: number;
    };
    // Only the top-level normalisation runs — `meta` is dropped, inner items
    // pass through unchanged.
    expect(parsed).toEqual({ entries: inner, count: 1 });
  });

  it("Test 3: date regex rejection — `from: '06/09/2026'` fails before mock is hit", async () => {
    let getCalled = false;
    let resolveCalled = false;
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => {
        resolveCalled = true;
        return "org_abc";
      },
      get: async <T>(): Promise<T> => {
        getCalled = true;
        return [] as T;
      },
    };
    const client = await buildClient(mockClient);

    // Any failure mode is acceptable as long as the underlying client is never
    // touched. SDK input validation may produce a protocol-level error (thrown
    // by client.callTool) or an isError result — accept either.
    let failedAsExpected = false;
    try {
      const res = await client.callTool({
        name: "keeping_list_entries",
        arguments: { from: "06/09/2026" },
      });
      if (res.isError === true) failedAsExpected = true;
    } catch {
      failedAsExpected = true;
    }
    expect(failedAsExpected).toBe(true);
    expect(getCalled).toBe(false);
    expect(resolveCalled).toBe(false);
  });

  it("Test 4: multi-org — MultiOrgError surfaces as isError with byte-identical D-27 wording", async () => {
    const orgs = [
      { id: "org_abc", name: "Acme" },
      { id: "org_xyz", name: "Beta" },
    ];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => {
        throw new MultiOrgError(orgs);
      },
      get: async <T>(): Promise<T> => {
        throw new Error("should not be called");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_list_entries",
      arguments: { from: "2026-06-09" },
    });
    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: org_abc (Acme), org_xyz (Beta).",
    );
  });

  it("Test 5: 401 — KeepingAuthError surfaces as isError with byte-identical D-25 wording", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "org_abc",
      get: async <T>(): Promise<T> => {
        throw new KeepingAuthError();
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_list_entries",
      arguments: { from: "2026-06-09" },
    });
    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.",
    );
  });

  it("Test 6: limit default — call without limit produces URL with limit=200", async () => {
    const calls: string[] = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "org_abc",
      get: async <T>(path: string): Promise<T> => {
        calls.push(path);
        return [] as T;
      },
    };
    const client = await buildClient(mockClient);

    await client.callTool({
      name: "keeping_list_entries",
      arguments: { from: "2026-06-09" },
    });
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("limit=200");
    // Sanity: from + to (defaulted to from) also present.
    expect(calls[0]).toContain("from=2026-06-09");
    expect(calls[0]).toContain("to=2026-06-09");
  });

  it("Test 7: limit cap — limit > 1000 rejected by Zod, mock untouched (Pitfall E)", async () => {
    let getCalled = false;
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "org_abc",
      get: async <T>(): Promise<T> => {
        getCalled = true;
        return [] as T;
      },
    };
    const client = await buildClient(mockClient);

    let failedAsExpected = false;
    try {
      const res = await client.callTool({
        name: "keeping_list_entries",
        arguments: { from: "2026-06-09", limit: 5000 },
      });
      if (res.isError === true) failedAsExpected = true;
    } catch {
      failedAsExpected = true;
    }
    expect(failedAsExpected).toBe(true);
    expect(getCalled).toBe(false);
  });

  it("Test 8: tools/list reports readOnlyHint: true on keeping_list_entries (READ-03)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "org_abc",
      get: async <T>(): Promise<T> => [] as T,
    };
    const client = await buildClient(mockClient);

    const list = await client.listTools();
    const tool = list.tools.find((t) => t.name === "keeping_list_entries");
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(tool?.annotations?.destructiveHint).toBe(false);
    expect(tool?.annotations?.idempotentHint).toBe(true);
    expect(tool?.annotations?.openWorldHint).toBe(true);
  });
});
