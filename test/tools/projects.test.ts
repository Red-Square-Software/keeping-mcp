import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import type { KeepingClient } from "../../src/keeping/client.js";
import { KeepingApiError, MultiOrgError } from "../../src/keeping/errors.js";
import { registerProjects } from "../../src/tools/projects.js";

async function buildClient(mockClient: Partial<KeepingClient>) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerProjects(server, mockClient as KeepingClient);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

describe("keeping_projects tool", () => {
  it("Test 1: happy path — returns project list raw from API at /{orgId}/projects (D-34-R)", async () => {
    const projects = [{ id: 1, name: "Website" }];
    const calls: string[] = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(path: string): Promise<T> => {
        calls.push(path);
        return projects as T;
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({ name: "keeping_projects", arguments: {} });
    expect(res.isError).toBeFalsy();
    // D-34-R: path is `/{orgId}/projects`, NOT `/organisations/{orgId}/projects`.
    expect(calls).toEqual(["/47666/projects"]);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.type).toBe("text");
    expect(JSON.parse(content[0]?.text ?? "")).toEqual(projects);
  });

  it("Test 2: feature disabled — 404 returns graceful note, NOT isError (META-01)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async () => {
        throw new KeepingApiError(404, "Not Found");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({ name: "keeping_projects", arguments: {} });
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    // Byte-identical wording per plan spec.
    expect(content[0]?.text).toBe("Projects feature not enabled for this organisation.");
  });

  it("Test 3: real failure — 500 surfaces as isError", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async () => {
        throw new KeepingApiError(500, "boom");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({ name: "keeping_projects", arguments: {} });
    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toContain("Keeping API error 500");
  });

  it("Test 4: multi-org — MultiOrgError surfaces with byte-identical D-27 wording", async () => {
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
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({ name: "keeping_projects", arguments: {} });
    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: 100 (Acme), 200 (Beta).",
    );
  });

  it("Test 5: tools/list reports readOnlyHint: true on keeping_projects (READ-03)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(): Promise<T> => [] as T,
    };
    const client = await buildClient(mockClient);

    const list = await client.listTools();
    const tool = list.tools.find((t) => t.name === "keeping_projects");
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(tool?.annotations?.destructiveHint).toBe(false);
    expect(tool?.annotations?.idempotentHint).toBe(true);
    expect(tool?.annotations?.openWorldHint).toBe(true);
  });
});
