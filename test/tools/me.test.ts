import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import type { KeepingClient } from "../../src/keeping/client.js";
import { KeepingAuthError, MultiOrgError } from "../../src/keeping/errors.js";
import { registerMe } from "../../src/tools/me.js";

// Build a minimal MCP server that has only the `keeping_me` tool registered
// against the supplied (mocked) KeepingClient, then link an InMemoryTransport
// pair and connect both sides. Returns the connected Client for tool calls.
async function buildClient(mockClient: Partial<KeepingClient>) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerMe(server, mockClient as KeepingClient);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

describe("keeping_me tool", () => {
  it("Test 1: happy path — returns wrapped user payload merged with organisation_id (D-34-R)", async () => {
    // D-34-R: client.me() returns the wrapper shape verbatim.
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      me: async () => ({
        user: {
          id: 789,
          first_name: "Ella",
          surname: "van Doorn",
          code: null,
          role: "administrator",
          state: "active",
        },
      }),
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({ name: "keeping_me", arguments: {} });
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.type).toBe("text");
    const parsed = JSON.parse(content[0]?.text ?? "") as {
      user: { id: number; first_name: string; role: string };
      organisation_id: string;
    };
    expect(parsed).toMatchObject({
      user: { id: 789, first_name: "Ella", role: "administrator" },
      organisation_id: "47666",
    });
  });

  it("Test 2: multi-org — MultiOrgError surfaces as isError with byte-identical D-27 wording", async () => {
    // D-34-R: org id is numeric in the orgs payload.
    const orgs = [
      { id: 100, name: "Acme" },
      { id: 200, name: "Beta" },
    ];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => {
        throw new MultiOrgError(orgs);
      },
      me: async () => {
        throw new Error("should not be called");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({ name: "keeping_me", arguments: {} });
    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: 100 (Acme), 200 (Beta).",
    );
  });

  it("Test 3: 401 — KeepingAuthError surfaces as isError with byte-identical D-25 wording", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      me: async () => {
        throw new KeepingAuthError();
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({ name: "keeping_me", arguments: {} });
    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.",
    );
  });

  it("Test 4: tools/list reports readOnlyHint: true on keeping_me (READ-03)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      me: async () => ({
        user: {
          id: 789,
          first_name: "Ella",
          surname: null,
          code: null,
          role: "administrator",
          state: "active",
        },
      }),
    };
    const client = await buildClient(mockClient);

    const list = await client.listTools();
    const me = list.tools.find((t) => t.name === "keeping_me");
    expect(me).toBeDefined();
    expect(me?.annotations?.readOnlyHint).toBe(true);
    expect(me?.annotations?.destructiveHint).toBe(false);
    expect(me?.annotations?.idempotentHint).toBe(true);
    expect(me?.annotations?.openWorldHint).toBe(true);
  });
});
