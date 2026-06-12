// keeping_stop_timer tool tests — Phase 3 Plan 06 vertical slice.
//
// Locks the stop-timer contract from D-3-05 + D-3-18 + D-3-19:
//   - PATCH /{orgId}/time-entries/{entry_id}/stop via the NEW
//     client.requestWithHeaders<T>("PATCH", path) method from Plan 03-01
//     (NOT client.patch — which drops the Response.headers handle that
//     X-Server-Time-Ms lives on). D-3-05 supersedes D-32-R's POST claim.
//   - On the confirm path, response Headers `X-Server-Time-Ms` is parsed
//     via Number() + Number.isFinite() gate and surfaced as
//     `server_time_ms` alongside the wrapper.
//   - Missing or non-numeric header → fall back to Date.now() AND emit
//     `client.log.warn("X-Server-Time-Ms header missing on stop response;
//     falling back to local clock")`. NOT an isError surface (D-3-19).
//   - Dry-run preview: `{ would_post: { method: "PATCH", url, body: null } }`.
//   - 5xx ambiguous; 4xx + MultiOrg + 401 via toIsErrorContent.
//   - Annotations: D-3-11 four booleans.
//
// Skeleton mirrors test/tools/start-timer.test.ts — same buildClient
// harness, same defaultConfig, same Partial<KeepingClient> mocks pattern.
// The mock surface differs: this tool calls requestWithHeaders (not post)
// and uses client.log.warn for the fallback warn assertion.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeepingConfig } from "../../src/config.js";
import type { KeepingClient } from "../../src/keeping/client.js";
import { KeepingApiError, KeepingAuthError, MultiOrgError } from "../../src/keeping/errors.js";
import { registerStopTimer } from "../../src/tools/stop-timer.js";

const defaultConfig: KeepingConfig = {
  KEEPING_TOKEN: "kp_test_FAKE",
  KEEPING_REQUIRE_CONFIRM: true,
  KEEPING_LOG_LEVEL: "error",
};

/**
 * Construct a fake Headers instance from a plain object. Headers is a native
 * Node 22 global (per CLAUDE.md engines>=22), so no polyfill needed.
 */
function makeHeaders(entries: Record<string, string>): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(entries)) h.set(k, v);
  return h;
}

/**
 * Build a fake `client.log` shape compatible with the real KeepingClient.log
 * surface (warn/info/debug/error). Each is a vi.fn() so Test 4/5 can assert
 * call counts and the warn message substring.
 */
function makeLog() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

async function buildClient(
  mockClient: Partial<KeepingClient>,
  config: KeepingConfig = defaultConfig,
) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerStopTimer(server, mockClient as KeepingClient, config);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

describe("keeping_stop_timer tool", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Test 1: dry-run preview — no API call, would_post shape with PATCH verb (D-3-02, D-3-05)", async () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      log: makeLog(),
      requestWithHeaders: async () => {
        throw new Error("requestWithHeaders should not be called on dry-run");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_stop_timer",
      arguments: { entry_id: 12345 },
    });

    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed.would_post.method).toBe("PATCH");
    expect(parsed.would_post.url).toBe(
      "https://api.keeping.nl/v1/47666/time-entries/12345/stop",
    );
    expect(parsed.would_post.body).toBe(null);
    expect(calls.length).toBe(0);
  });

  it("Test 2: confirm path → PATCH via requestWithHeaders exactly once, X-Server-Time-Ms surfaced (D-3-05, D-3-18, D-3-19, D-3-25)", async () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const stoppedEntry = {
      id: 12345,
      ongoing: false,
      end: "2026-06-12T16:00:00+02:00",
    };
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      log: makeLog(),
      requestWithHeaders: async <T>(
        method: string,
        path: string,
        body?: unknown,
      ): Promise<{ body: T; headers: Headers }> => {
        calls.push({ method, path, body });
        return {
          body: { time_entry: stoppedEntry, meta: {} } as T,
          headers: makeHeaders({ "X-Server-Time-Ms": "1718202000000" }),
        };
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_stop_timer",
      arguments: { entry_id: 12345, confirm: true },
    });

    expect(res.isError).toBeFalsy();
    expect(calls.length).toBe(1);
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.path).toBe("/47666/time-entries/12345/stop");
    expect(calls[0]?.path).not.toContain("?");
    expect(calls[0]?.path).not.toContain("/organisations/");

    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed.time_entry).toEqual(stoppedEntry);
    expect(parsed.server_time_ms).toBe(1718202000000);
    expect(typeof parsed.server_time_ms).toBe("number");
    expect(Number.isFinite(parsed.server_time_ms)).toBe(true);
  });

  it("Test 3: env-false escape — KEEPING_REQUIRE_CONFIRM=false, no confirm → requestWithHeaders called (D-3-01)", async () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      log: makeLog(),
      requestWithHeaders: async <T>(
        method: string,
        path: string,
        body?: unknown,
      ): Promise<{ body: T; headers: Headers }> => {
        calls.push({ method, path, body });
        return {
          body: { time_entry: { id: 12345, ongoing: false }, meta: {} } as T,
          headers: makeHeaders({ "X-Server-Time-Ms": "1718202000000" }),
        };
      },
    };
    const envFalseConfig: KeepingConfig = { ...defaultConfig, KEEPING_REQUIRE_CONFIRM: false };
    const client = await buildClient(mockClient, envFalseConfig);

    const res = await client.callTool({
      name: "keeping_stop_timer",
      arguments: { entry_id: 12345 },
    });

    expect(res.isError).toBeFalsy();
    expect(calls.length).toBe(1);
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.path).toBe("/47666/time-entries/12345/stop");
  });

  it("Test 4: missing X-Server-Time-Ms → fallback to Date.now() + log.warn, NOT isError (D-3-19)", async () => {
    const log = makeLog();
    const stoppedEntry = { id: 12345, ongoing: false };
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      log,
      requestWithHeaders: async <T>(): Promise<{ body: T; headers: Headers }> => {
        return {
          body: { time_entry: stoppedEntry, meta: {} } as T,
          // Empty Headers — no X-Server-Time-Ms.
          headers: makeHeaders({}),
        };
      },
    };
    const client = await buildClient(mockClient);

    const beforeMs = Date.now();
    const res = await client.callTool({
      name: "keeping_stop_timer",
      arguments: { entry_id: 12345, confirm: true },
    });
    const afterMs = Date.now();

    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    // server_time_ms must be a positive finite number (NOT NaN, NOT null),
    // derived from Date.now() and within the test execution window.
    expect(typeof parsed.server_time_ms).toBe("number");
    expect(Number.isFinite(parsed.server_time_ms)).toBe(true);
    expect(parsed.server_time_ms).toBeGreaterThan(0);
    expect(parsed.server_time_ms).toBeGreaterThanOrEqual(beforeMs);
    expect(parsed.server_time_ms).toBeLessThanOrEqual(afterMs);
    expect(parsed.time_entry).toEqual(stoppedEntry);

    // log.warn was called at least once with the locked substring.
    expect(log.warn.mock.calls.length).toBeGreaterThanOrEqual(1);
    const firstWarnArg = log.warn.mock.calls[0]?.[0];
    expect(typeof firstWarnArg).toBe("string");
    expect(firstWarnArg as string).toContain("X-Server-Time-Ms header missing");
  });

  it("Test 5: non-numeric X-Server-Time-Ms → fallback + warn (D-3-19)", async () => {
    const log = makeLog();
    const stoppedEntry = { id: 12345, ongoing: false };
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      log,
      requestWithHeaders: async <T>(): Promise<{ body: T; headers: Headers }> => {
        return {
          body: { time_entry: stoppedEntry, meta: {} } as T,
          headers: makeHeaders({ "X-Server-Time-Ms": "not-a-number" }),
        };
      },
    };
    const client = await buildClient(mockClient);

    const beforeMs = Date.now();
    const res = await client.callTool({
      name: "keeping_stop_timer",
      arguments: { entry_id: 12345, confirm: true },
    });
    const afterMs = Date.now();

    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(typeof parsed.server_time_ms).toBe("number");
    expect(Number.isFinite(parsed.server_time_ms)).toBe(true);
    expect(parsed.server_time_ms).toBeGreaterThan(0);
    expect(parsed.server_time_ms).toBeGreaterThanOrEqual(beforeMs);
    expect(parsed.server_time_ms).toBeLessThanOrEqual(afterMs);

    expect(log.warn.mock.calls.length).toBeGreaterThanOrEqual(1);
    const firstWarnArg = log.warn.mock.calls[0]?.[0];
    expect(typeof firstWarnArg).toBe("string");
    expect(firstWarnArg as string).toContain("X-Server-Time-Ms header missing");
  });

  it("Test 6: MultiOrgError flows through toIsErrorContent verbatim (D-27, D-3-20)", async () => {
    const orgs = [
      { id: 100, name: "Acme" },
      { id: 200, name: "Beta" },
    ];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => {
        throw new MultiOrgError(orgs);
      },
      log: makeLog(),
      requestWithHeaders: async () => {
        throw new Error("should not be called");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_stop_timer",
      arguments: { entry_id: 12345, confirm: true },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: 100 (Acme), 200 (Beta).",
    );
  });

  it("Test 7: 401 KeepingAuthError flows through toIsErrorContent verbatim (D-25, D-3-20)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      log: makeLog(),
      requestWithHeaders: async () => {
        throw new KeepingAuthError();
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_stop_timer",
      arguments: { entry_id: 12345, confirm: true },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.",
    );
  });

  it("Test 8: 5xx KeepingApiError (500) → AMBIGUOUS_TEXT envelope with parenthetical (D-3-16, WRITE-05)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      log: makeLog(),
      requestWithHeaders: async () => {
        throw new KeepingApiError(500, "boom");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_stop_timer",
      arguments: { entry_id: 12345, confirm: true },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    const text = content[0]?.text ?? "";
    expect(
      text.startsWith("outcome unknown — verify with keeping_list_entries before retrying."),
    ).toBe(true);
    expect(text).toContain("Keeping API error 500");
    expect(text).toMatch(/\(.*Keeping API error 500.*\)/);
  });

  it("Test 9: listTools reflects four locked annotations (D-3-11, WRITE-07)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      log: makeLog(),
      requestWithHeaders: async <T>(): Promise<{ body: T; headers: Headers }> => ({
        body: { time_entry: { id: 1 } } as T,
        headers: makeHeaders({ "X-Server-Time-Ms": "1718202000000" }),
      }),
    };
    const client = await buildClient(mockClient);

    const list = await client.listTools();
    const tool = list.tools.find((t) => t.name === "keeping_stop_timer");
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(false);
    expect(tool?.annotations?.destructiveHint).toBe(true);
    expect(tool?.annotations?.idempotentHint).toBe(false);
    expect(tool?.annotations?.openWorldHint).toBe(true);
  });
});
