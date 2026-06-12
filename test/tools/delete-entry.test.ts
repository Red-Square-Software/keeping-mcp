// keeping_delete_entry tool tests — Phase 3 Plan 04 vertical slice.
//
// Per-tool minimum test set per D-3-22 + delete-preview enrichment (D-3-23)
// + destructive-warning assertion (WRITE-07 + D-3-11) + 204 path verification
// (D-3-27 end-to-end). Skeleton mirrors test/tools/update-entry.test.ts and
// test/tools/add-entry.test.ts (the canonical Phase 3 write-tool siblings) —
// reused buildClient + InMemoryTransport.createLinkedPair + Partial<KeepingClient>
// mocks + defaultConfig constant.
//
// All tests are byte-locked against:
//   - D-25 (KeepingAuthError wording)
//   - D-27 (MultiOrgError template)
//   - AMBIGUOUS_TEXT from src/keeping/write-gate.ts ("outcome unknown — verify
//     with keeping_list_entries before retrying.")
//   - D-3-03 (delete preview = GET-then-shape with would_delete enrichment)
//   - D-3-05 endpoint verb table (DELETE /{orgId}/time-entries/{entry_id})
//   - D-3-11 four annotations (readOnlyHint:false, destructiveHint:true,
//     idempotentHint:false, openWorldHint:true)
//   - WRITE-07 destructive description warning

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import type { KeepingConfig } from "../../src/config.js";
import type { KeepingClient } from "../../src/keeping/client.js";
import { KeepingApiError, KeepingAuthError, MultiOrgError } from "../../src/keeping/errors.js";
import { registerDeleteEntry } from "../../src/tools/delete-entry.js";

const defaultConfig: KeepingConfig = {
  KEEPING_TOKEN: "kp_test_FAKE",
  KEEPING_REQUIRE_CONFIRM: true,
  KEEPING_LOG_LEVEL: "error",
};

// Shared mock fixture for the to-be-deleted entry. Echoed verbatim into the
// dry-run preview's `would_delete` field (D-3-03).
const fixtureEntry = {
  id: 12345,
  user_id: 789,
  date: "2026-06-10",
  purpose: "work",
  note: "Working on Project X",
  hours: 1.5,
  ongoing: false,
};

async function buildClient(
  mockClient: Partial<KeepingClient>,
  config: KeepingConfig = defaultConfig,
) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerDeleteEntry(server, mockClient as KeepingClient, config);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

describe("keeping_delete_entry tool", () => {
  it("Test 1: dry-run (env=true, confirm omitted) → GET for would_delete + would_post envelope; client.delete NOT called (D-3-03)", async () => {
    const gets: string[] = [];
    const deletes: string[] = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(path: string): Promise<T> => {
        gets.push(path);
        return fixtureEntry as T;
      },
      delete: async <T>(path: string): Promise<T> => {
        deletes.push(path);
        return null as T;
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_delete_entry",
      arguments: { entry_id: 12345 },
    });

    expect(res.isError).toBeFalsy();
    // The dry-run path performs ONE extra GET — never on the actual delete.
    expect(gets).toEqual(["/47666/time-entries/12345"]);
    expect(deletes).toEqual([]);

    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed.would_post.method).toBe("DELETE");
    expect(parsed.would_post.url).toBe("https://api.keeping.nl/v1/47666/time-entries/12345");
    expect(parsed.would_post.body).toBe(null);
    // D-3-03 / D-3-23: would_delete echoes the fetched entry verbatim.
    expect(parsed.would_delete).toEqual(fixtureEntry);
  });

  it("Test 2: confirm path → DELETE /47666/time-entries/12345 called exactly once; client.get NOT called (D-3-05, WRITE-03)", async () => {
    const gets: string[] = [];
    const deletes: string[] = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(path: string): Promise<T> => {
        gets.push(path);
        throw new Error("get should not be called on confirm path");
      },
      delete: async <T>(path: string): Promise<T> => {
        deletes.push(path);
        // 204 path — foundation rawFetch returns null.
        return null as T;
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_delete_entry",
      arguments: { entry_id: 12345, confirm: true },
    });

    expect(res.isError).toBeFalsy();
    expect(gets).toEqual([]);
    expect(deletes.length).toBe(1);
    // Path: bare /{orgId}/time-entries/{entry_id} — no /v1/, no query.
    expect(deletes[0]).toBe("/47666/time-entries/12345");
    expect(deletes[0]).not.toContain("?");
    expect(deletes[0]).not.toContain("/organisations/");

    // Response body is parseable JSON (the tool wraps the null result).
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(() => JSON.parse(content[0]?.text ?? "")).not.toThrow();
  });

  it("Test 3: env-false escape hatch — KEEPING_REQUIRE_CONFIRM=false, no confirm → delete called directly (D-3-01)", async () => {
    const gets: string[] = [];
    const deletes: string[] = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(path: string): Promise<T> => {
        gets.push(path);
        throw new Error("get should not be called when env-false escape hatch active");
      },
      delete: async <T>(path: string): Promise<T> => {
        deletes.push(path);
        return null as T;
      },
    };
    const envFalseConfig: KeepingConfig = { ...defaultConfig, KEEPING_REQUIRE_CONFIRM: false };
    const client = await buildClient(mockClient, envFalseConfig);

    const res = await client.callTool({
      name: "keeping_delete_entry",
      arguments: { entry_id: 12345 },
    });

    expect(res.isError).toBeFalsy();
    expect(gets.length).toBe(0);
    expect(deletes.length).toBe(1);
    expect(deletes[0]).toBe("/47666/time-entries/12345");
  });

  it("Test 4: 204 No Content path — client.delete returns null, tool surfaces success without throwing (D-3-27)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      delete: async <T>(_path: string): Promise<T> => {
        // The 03-01 fix in rawFetch returns null on 204; verify the tool tolerates that.
        return null as T;
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_delete_entry",
      arguments: { entry_id: 12345, confirm: true },
    });

    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    // Response is parseable JSON — proves the tool wrapped the null result
    // rather than crashing on a JSON.stringify(null) edge.
    expect(() => JSON.parse(content[0]?.text ?? "")).not.toThrow();
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
      get: async () => {
        throw new Error("should not be called");
      },
      delete: async () => {
        throw new Error("should not be called");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_delete_entry",
      arguments: { entry_id: 12345 },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: 100 (Acme), 200 (Beta).",
    );
  });

  it("Test 6: 401 KeepingAuthError flows through toIsErrorContent verbatim (D-25, D-3-20)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async () => {
        throw new KeepingAuthError();
      },
      delete: async () => {
        throw new KeepingAuthError();
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_delete_entry",
      arguments: { entry_id: 12345, confirm: true },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.",
    );
  });

  it("Test 7: 4xx KeepingApiError on dry-run GET (404 not found) → toIsErrorContent, NOT ambiguous; delete NOT attempted (D-3-16)", async () => {
    const deletes: string[] = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async () => {
        throw new KeepingApiError(404, '{"error":{"message":"Not Found"}}');
      },
      delete: async <T>(path: string): Promise<T> => {
        deletes.push(path);
        return null as T;
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_delete_entry",
      arguments: { entry_id: 99999 },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    const text = content[0]?.text ?? "";
    expect(text).toContain("Keeping API error 404");
    expect(text).not.toContain("outcome unknown");
    // Critical: no delete attempted after a failed preview-fetch.
    expect(deletes.length).toBe(0);
  });

  it("Test 8: 5xx KeepingApiError on confirm DELETE → AMBIGUOUS_TEXT envelope (D-3-16, WRITE-05)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      delete: async () => {
        throw new KeepingApiError(500, "internal");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_delete_entry",
      arguments: { entry_id: 12345, confirm: true },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    const text = content[0]?.text ?? "";
    expect(
      text.startsWith("outcome unknown — verify with keeping_list_entries before retrying."),
    ).toBe(true);
    expect(text).toContain("Keeping API error 500");
  });

  it("Test 9: listTools reflects four locked annotations (D-3-11, WRITE-07)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async () => fixtureEntry as never,
      delete: async () => null as never,
    };
    const client = await buildClient(mockClient);

    const list = await client.listTools();
    const tool = list.tools.find((t) => t.name === "keeping_delete_entry");
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(false);
    expect(tool?.annotations?.destructiveHint).toBe(true);
    expect(tool?.annotations?.idempotentHint).toBe(false);
    expect(tool?.annotations?.openWorldHint).toBe(true);
  });

  it("Test 10: tool description contains the verbatim destructive warning (WRITE-07, D-3-11)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async () => fixtureEntry as never,
      delete: async () => null as never,
    };
    const client = await buildClient(mockClient);

    const list = await client.listTools();
    const tool = list.tools.find((t) => t.name === "keeping_delete_entry");
    expect(tool).toBeDefined();
    expect(tool?.description ?? "").toContain("**DESTRUCTIVE: permanently deletes the entry**");
  });
});
