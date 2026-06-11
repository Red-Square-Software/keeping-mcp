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
    // Real time-entry shape per OpenAPI (subset).
    const entries = [
      {
        id: 456789,
        user_id: 789,
        date: "2026-06-09",
        purpose: "work",
        project_id: 100,
        task_id: 200,
        tag_ids: [],
        note: "Wrote spec",
        hours: 1.5,
        ongoing: false,
        custom_field_x: 42,
      },
    ];
    const calls: string[] = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(path: string): Promise<T> => {
        calls.push(path);
        // Real wrapper key is `time_entries` (underscore).
        return { time_entries: entries, meta: { date: "2026-06-09" } } as T;
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

  it("Test 2: single-day call uses /{orgId}/time-entries?date=... (D-34-R)", async () => {
    const calls: string[] = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(path: string): Promise<T> => {
        calls.push(path);
        return { time_entries: [] } as T;
      },
    };
    const client = await buildClient(mockClient);

    await client.callTool({
      name: "keeping_list_entries",
      arguments: { from: "2026-06-09" },
    });

    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("/47666/time-entries");
    expect(calls[0]).toContain("date=2026-06-09");
    expect(calls[0]).not.toContain("/organisations/");
    expect(calls[0]).not.toContain("time_entries"); // URL form uses hyphen
    expect(calls[0]).not.toContain("/report/");
  });

  it("Test 3: multi-day range uses /{orgId}/report/time-entries?from=&to=... (D-34-R)", async () => {
    const calls: string[] = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(path: string): Promise<T> => {
        calls.push(path);
        return { time_entries: [] } as T;
      },
    };
    const client = await buildClient(mockClient);

    await client.callTool({
      name: "keeping_list_entries",
      arguments: { from: "2026-06-01", to: "2026-06-09" },
    });

    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("/47666/report/time-entries");
    expect(calls[0]).toContain("from=2026-06-01");
    expect(calls[0]).toContain("to=2026-06-09");
    expect(calls[0]).not.toContain("/organisations/");
  });

  it("Test 4: bare array response (no wrapper) flattens to { entries, count }", async () => {
    const inner = [{ id: 1, note: "x" }];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(): Promise<T> => inner as T,
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
    expect(parsed).toEqual({ entries: inner, count: 1 });
  });

  it("Test 5: date regex rejection — `from: '06/09/2026'` fails before mock is hit", async () => {
    let getCalled = false;
    let resolveCalled = false;
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => {
        resolveCalled = true;
        return "47666";
      },
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

  it("Test 6: multi-org — MultiOrgError surfaces as isError with byte-identical D-27 wording", async () => {
    const orgs = [
      { id: 100, name: "Acme" },
      { id: 200, name: "Beta" },
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
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: 100 (Acme), 200 (Beta).",
    );
  });

  it("Test 7: 401 — KeepingAuthError surfaces as isError with byte-identical D-25 wording", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
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

  it("Test 8: limit cap — limit > 1000 rejected by Zod, mock untouched (Pitfall E)", async () => {
    let getCalled = false;
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
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

  it("Test 9: limit truncates large result sets (Pitfall E client-side guard)", async () => {
    // The Keeping API doesn't paginate, so `limit` is a post-fetch truncation
    // guard against pathological days, NOT a query param.
    const inner = Array.from({ length: 50 }, (_, i) => ({ id: i, hours: 0.1 }));
    const calls: string[] = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(path: string): Promise<T> => {
        calls.push(path);
        return { time_entries: inner } as T;
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_list_entries",
      arguments: { from: "2026-06-09", limit: 10 },
    });
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "") as {
      entries: unknown[];
      count: number;
    };
    expect(parsed.count).toBe(10);
    expect(parsed.entries.length).toBe(10);
    // limit must NOT appear as a query param (API ignores it; client-side only).
    expect(calls[0]).not.toContain("limit=");
  });

  it("Test 10: user_id is propagated as a query param when provided", async () => {
    const calls: string[] = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(path: string): Promise<T> => {
        calls.push(path);
        return { time_entries: [] } as T;
      },
    };
    const client = await buildClient(mockClient);

    await client.callTool({
      name: "keeping_list_entries",
      arguments: { from: "2026-06-09", user_id: "789" },
    });
    expect(calls[0]).toContain("user_id=789");
  });

  it("Test 11: tools/list reports readOnlyHint: true on keeping_list_entries (READ-03)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
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
