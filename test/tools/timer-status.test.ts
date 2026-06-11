import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import type { KeepingClient } from "../../src/keeping/client.js";
import { KeepingApiError, KeepingAuthError, MultiOrgError } from "../../src/keeping/errors.js";
import { registerTimerStatus } from "../../src/tools/timer-status.js";

// Build a minimal MCP server that has only the `keeping_timer_status` tool
// registered against the supplied (mocked) KeepingClient, then link an
// InMemoryTransport pair and connect both sides. Returns the connected Client.
async function buildClient(mockClient: Partial<KeepingClient>) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTimerStatus(server, mockClient as KeepingClient);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

// Structural reference per D-2.5-12 / SC #5: the inner entry shape mirrors
// test/fixtures/time-entry-response.sample.json. Lifted inline so the tests
// own the wrapper construction (planner's discretion locking — no new fixture).
const fixtureEntry = {
  id: 20135088,
  user_id: 55458,
  date: "2026-05-29",
  purpose: "[REDACTED]",
  approval_status: "unsubmitted",
  project_id: 573243,
  task_id: null,
  tag_ids: [],
  note: "[REDACTED]",
  external_references: "[REDACTED]",
  start: "2026-05-29T16:09:00+02:00",
  end: "2026-05-29T16:58:00+02:00",
  hours: 0.8167,
  locked: false,
  is_direct_hours: true,
  included_in_total: true,
};

describe("keeping_timer_status tool", () => {
  it("Test 1: ongoing: true → is_running: true (D-2.5-02, SC #4)", async () => {
    const entry = { ...fixtureEntry, ongoing: true };
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(): Promise<T> => ({ time_entry: entry }) as T,
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_timer_status",
      arguments: {},
    });
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.type).toBe("text");
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed).toEqual({ time_entry: entry, is_running: true });
  });

  it("Test 2: ongoing: false → is_running: false (D-2.5-02, SC #4)", async () => {
    const entry = { ...fixtureEntry, ongoing: false };
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(): Promise<T> => ({ time_entry: entry }) as T,
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_timer_status",
      arguments: {},
    });
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed).toEqual({ time_entry: entry, is_running: false });
  });

  it("Test 3: missing ongoing field → is_running: false (D-2.5-02 defensive default)", async () => {
    // fixtureEntry intentionally omits `ongoing` already.
    const entry = { ...fixtureEntry };
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(): Promise<T> => ({ time_entry: entry }) as T,
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_timer_status",
      arguments: {},
    });
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed).toEqual({ time_entry: entry, is_running: false });
  });

  it("Test 4: 404 KeepingApiError → graceful empty { time_entry: null, is_running: false } (D-2.5-03, D-2.5-04a)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(): Promise<T> => {
        throw new KeepingApiError(404, '{"error":{"message":"No entry found"}}');
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_timer_status",
      arguments: {},
    });
    // Graceful empty MUST NOT set isError (Pitfall 8 — D-2.5-03 contract).
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed).toEqual({ time_entry: null, is_running: false });
  });

  it("Test 5: 200 OK with time_entry: null → graceful empty (D-2.5-04, D-2.5-05a)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(): Promise<T> => ({ time_entry: null }) as T,
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_timer_status",
      arguments: {},
    });
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    // Pitfall 4: time_entry MUST be literal null, NOT undefined (key dropped).
    expect(parsed).toEqual({ time_entry: null, is_running: false });
  });

  it("Test 6: 200 OK missing time_entry key → graceful empty (D-2.5-04, D-2.5-05a)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(): Promise<T> => ({ other_key: "x" }) as T,
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_timer_status",
      arguments: {},
    });
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed).toEqual({ time_entry: null, is_running: false });
  });

  it("Test 7: 401 KeepingAuthError → isError with D-25 byte-identical wording (D-2.5-10)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(): Promise<T> => {
        throw new KeepingAuthError();
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_timer_status",
      arguments: {},
    });
    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.",
    );
  });

  it("Test 8: MultiOrgError → isError with D-27 byte-identical wording (D-2.5-10)", async () => {
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
      name: "keeping_timer_status",
      arguments: {},
    });
    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: 100 (Acme), 200 (Beta).",
    );
  });

  it("Test 9: path is exactly /{orgId}/time-entries/last with no query string (D-2.5-05, D-34-R)", async () => {
    const calls: string[] = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(path: string): Promise<T> => {
        calls.push(path);
        return { time_entry: null } as T;
      },
    };
    const client = await buildClient(mockClient);

    await client.callTool({
      name: "keeping_timer_status",
      arguments: {},
    });

    expect(calls.length).toBe(1);
    // Exact-match assertion — D-2.5-05 zero query params is strict-equality.
    expect(calls[0]).toBe("/47666/time-entries/last");
    expect(calls[0]).not.toContain("?");
    expect(calls[0]).not.toContain("/organisations/");
  });

  it("Test 10: tools/list reports the four locked annotations on keeping_timer_status (D-2.5-08, SC #2)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      get: async <T>(): Promise<T> => ({ time_entry: null }) as T,
    };
    const client = await buildClient(mockClient);

    const list = await client.listTools();
    const tool = list.tools.find((t) => t.name === "keeping_timer_status");
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(tool?.annotations?.destructiveHint).toBe(false);
    expect(tool?.annotations?.idempotentHint).toBe(true);
    expect(tool?.annotations?.openWorldHint).toBe(true);
  });

  it("Test 11: empty-array time_entry collapses to graceful empty (D-2.5-05a, REVIEW.md WR-01)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      // Drift shape: `time_entry` is a bare array. typeof [] === "object" lets
      // this through the pre-fix guard, masking drift as a present-but-empty
      // entry. D-2.5-05a contract requires it to collapse to null.
      get: async <T>(): Promise<T> => ({ time_entry: [] }) as T,
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_timer_status",
      arguments: {},
    });
    // Graceful empty MUST NOT set isError (D-2.5-03 contract, Pitfall 8).
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    // Pitfall 4 + D-2.5-05a: array `time_entry` MUST collapse to literal null,
    // not pass through as [] (the bug REVIEW.md WR-01 documents).
    expect(parsed).toEqual({ time_entry: null, is_running: false });
  });

  it("Test 12: non-empty-array time_entry collapses to graceful empty even when wrapped entry has ongoing:true (D-2.5-05a, REVIEW.md WR-01)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      // The more dangerous drift: a plausible-looking array of one running
      // entry. Under D-2.5-05a the array MUST be discarded before
      // `entry?.ongoing` is read — `is_running` MUST stay false.
      get: async <T>(): Promise<T> => ({ time_entry: [{ ...fixtureEntry, ongoing: true }] }) as T,
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_timer_status",
      arguments: {},
    });
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    // BOTH dimensions pinned: time_entry === null AND is_running === false.
    // Catches the obvious regression (array surfaces as payload.time_entry)
    // AND the subtle regression (is_running set true because the wrapped
    // entry has ongoing:true).
    expect(parsed).toEqual({ time_entry: null, is_running: false });
  });
});
