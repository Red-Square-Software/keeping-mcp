import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import type { KeepingClient } from "../../src/keeping/client.js";
import { KeepingAuthError, MultiOrgError } from "../../src/keeping/errors.js";
import { registerOrganisations } from "../../src/tools/organisations.js";

// Build a minimal MCP server that has only the `keeping_organisations` tool
// registered against the supplied (mocked) KeepingClient, then link an
// InMemoryTransport pair and connect both sides. Returns the connected Client.
async function buildClient(mockClient: Partial<KeepingClient>) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerOrganisations(server, mockClient as KeepingClient);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

describe("keeping_organisations tool", () => {
  it("Test 1: happy path — returns raw org list with feature flags preserved (IDENT-02, D-34-R numeric ids)", async () => {
    // Real org shape per OpenAPI (subset): numeric id, nested `features`.
    const orgs = [
      {
        id: 47666,
        name: "Acme Studio",
        url: "https://acme.keeping.nl",
        current_plan: "plus_2019",
        features: { timesheet: "times" as const, projects: true, tasks: false, breaks: false },
        time_zone: "Europe/Amsterdam",
        currency: "EUR",
      },
    ];
    const mockClient: Partial<KeepingClient> = {
      organisations: async () => orgs,
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({ name: "keeping_organisations", arguments: {} });
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.type).toBe("text");
    // Raw fields preserved verbatim — no field renaming (IDENT-02).
    expect(JSON.parse(content[0]?.text ?? "")).toEqual(orgs);
  });

  it("Test 2: multi-org error pass-through — surfaces as isError with byte-identical D-27 wording", async () => {
    // Even though keeping_organisations itself does not call resolveOrgId,
    // this test verifies the same envelope pattern reaches the client when
    // something goes wrong upstream — exercising the IDENT-03 surface.
    const orgs = [
      { id: 100, name: "Acme" },
      { id: 200, name: "Beta" },
    ];
    const mockClient: Partial<KeepingClient> = {
      organisations: async () => {
        throw new MultiOrgError(orgs);
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({ name: "keeping_organisations", arguments: {} });
    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: 100 (Acme), 200 (Beta).",
    );
  });

  it("Test 3: 401 — KeepingAuthError surfaces as isError with byte-identical D-25 wording", async () => {
    const mockClient: Partial<KeepingClient> = {
      organisations: async () => {
        throw new KeepingAuthError();
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({ name: "keeping_organisations", arguments: {} });
    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.",
    );
  });

  it("Test 4: tools/list reports readOnlyHint: true on keeping_organisations (READ-03)", async () => {
    const mockClient: Partial<KeepingClient> = {
      organisations: async () => [],
    };
    const client = await buildClient(mockClient);

    const list = await client.listTools();
    const tool = list.tools.find((t) => t.name === "keeping_organisations");
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(tool?.annotations?.destructiveHint).toBe(false);
    expect(tool?.annotations?.idempotentHint).toBe(true);
    expect(tool?.annotations?.openWorldHint).toBe(true);
  });
});
