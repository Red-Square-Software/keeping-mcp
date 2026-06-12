// keeping_resume_timer tool tests — Phase 3 Plan 07 vertical slice.
//
// Locks the resume-timer contract from D-3-05 + D-3-18 + D-3-19 + Pitfall 6:
//   - POST /{orgId}/time-entries/{entry_id}/resume via the NEW
//     client.requestWithHeaders<T>("POST", path) method from Plan 03-01
//     (NOT client.post — which drops the Response.headers handle that
//     X-Server-Time-Ms lives on). D-3-05 keeps resume = POST unchanged from
//     D-32-R; only the `stop` verb was corrected.
//   - On the confirm path, response Headers `X-Server-Time-Ms` is parsed
//     via Number() + Number.isFinite() gate and surfaced as
//     `server_time_ms` alongside the wrapper.
//   - Missing or non-numeric header → fall back to Date.now() AND emit
//     `client.log.warn("X-Server-Time-Ms header missing on resume response;
//     falling back to local clock")`. NOT an isError surface (D-3-19).
//   - Dry-run preview: `{ would_post: { method: "POST", url, body: null } }`.
//   - Pitfall 6 (RESEARCH §"200-vs-201"): response may carry a different
//     time_entry.id than the input entry_id (Keeping creates a NEW ongoing
//     entry when the original entry's date is no longer "today"). Tool MUST
//     NOT assert id-equality; it surfaces the response wrapper verbatim.
//   - 403 on locked entries = DEFINITE-FAIL via toIsErrorContent (per
//     RESEARCH Q3 resolution and the OpenAPI "cannot resume locked entry"
//     contract). NOT an ambiguous envelope.
//   - 5xx → ambiguous envelope; 4xx + MultiOrg + 401 via toIsErrorContent.
//   - Annotations: D-3-11 four booleans.
//
// Skeleton mirrors test/tools/stop-timer.test.ts — same buildClient
// harness, same defaultConfig, same Partial<KeepingClient> mocks pattern.
// The mock surface is identical: requestWithHeaders + client.log.warn.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeepingConfig } from "../../src/config.js";
import type { KeepingClient } from "../../src/keeping/client.js";
import { KeepingApiError, KeepingAuthError, MultiOrgError } from "../../src/keeping/errors.js";
import { registerResumeTimer } from "../../src/tools/resume-timer.js";

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
 * surface (warn/info/debug/error). Each is a vi.fn() so Test 4 / Test 5 can
 * assert call counts and the warn message substring.
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
  registerResumeTimer(server, mockClient as KeepingClient, config);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

describe("keeping_resume_timer tool", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Test 1: dry-run preview — no API call, would_post shape with POST verb (D-3-02, D-3-05)", async () => {
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
      name: "keeping_resume_timer",
      arguments: { entry_id: 12345 },
    });

    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed.would_post.method).toBe("POST");
    expect(parsed.would_post.url).toBe("https://api.keeping.nl/v1/47666/time-entries/12345/resume");
    expect(parsed.would_post.body).toBe(null);
    expect(calls.length).toBe(0);
  });

  it("Test 2: confirm path → POST via requestWithHeaders exactly once, X-Server-Time-Ms surfaced (D-3-05, D-3-18, D-3-19)", async () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const resumedEntry = {
      id: 12345,
      ongoing: true,
      date: "2026-06-12",
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
          body: { time_entry: resumedEntry, meta: {} } as T,
          headers: makeHeaders({ "X-Server-Time-Ms": "1718202000000" }),
        };
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_resume_timer",
      arguments: { entry_id: 12345, confirm: true },
    });

    expect(res.isError).toBeFalsy();
    expect(calls.length).toBe(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.path).toBe("/47666/time-entries/12345/resume");
    expect(calls[0]?.path).not.toContain("?");
    expect(calls[0]?.path).not.toContain("/organisations/");

    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed.time_entry).toEqual(resumedEntry);
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
          body: { time_entry: { id: 12345, ongoing: true }, meta: {} } as T,
          headers: makeHeaders({ "X-Server-Time-Ms": "1718202000000" }),
        };
      },
    };
    const envFalseConfig: KeepingConfig = { ...defaultConfig, KEEPING_REQUIRE_CONFIRM: false };
    const client = await buildClient(mockClient, envFalseConfig);

    const res = await client.callTool({
      name: "keeping_resume_timer",
      arguments: { entry_id: 12345 },
    });

    expect(res.isError).toBeFalsy();
    expect(calls.length).toBe(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.path).toBe("/47666/time-entries/12345/resume");
  });

  it("Test 4: missing X-Server-Time-Ms → fallback to Date.now() + log.warn, NOT isError (D-3-19)", async () => {
    const log = makeLog();
    const resumedEntry = { id: 12345, ongoing: true };
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      log,
      requestWithHeaders: async <T>(): Promise<{ body: T; headers: Headers }> => {
        return {
          body: { time_entry: resumedEntry, meta: {} } as T,
          // Empty Headers — no X-Server-Time-Ms.
          headers: makeHeaders({}),
        };
      },
    };
    const client = await buildClient(mockClient);

    const beforeMs = Date.now();
    const res = await client.callTool({
      name: "keeping_resume_timer",
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
    expect(parsed.time_entry).toEqual(resumedEntry);

    // log.warn was called at least once with the locked substring.
    expect(log.warn.mock.calls.length).toBeGreaterThanOrEqual(1);
    const firstWarnArg = log.warn.mock.calls[0]?.[0];
    expect(typeof firstWarnArg).toBe("string");
    expect(firstWarnArg as string).toContain("X-Server-Time-Ms header missing");
  });

  it("Test 5: Pitfall 6 — response time_entry.id differs from input.entry_id → surfaced VERBATIM (NO id-equality assertion)", async () => {
    // Critical case: resume on a new day creates a NEW ongoing entry with a
    // DIFFERENT id (Pitfall 6 in 03-RESEARCH.md). Tool MUST NOT throw or
    // error on id mismatch — it surfaces whatever the server returned so
    // the AI knows which entry to subsequently stop.
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const newEntryFromResume = {
      id: 99999, // DIFFERENT from input.entry_id (12345) — Keeping created a new entry
      ongoing: true,
      date: "2026-06-13",
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
          body: { time_entry: newEntryFromResume, meta: {} } as T,
          headers: makeHeaders({ "X-Server-Time-Ms": "1718202000000" }),
        };
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_resume_timer",
      arguments: { entry_id: 12345, confirm: true }, // input id is 12345
    });

    expect(res.isError).toBeFalsy(); // must NOT error on id mismatch
    expect(calls.length).toBe(1);
    // Path uses input.entry_id (12345) — the URL is built from the input
    // before the server can choose a different return id.
    expect(calls[0]?.path).toBe("/47666/time-entries/12345/resume");

    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    // Response id (99999) is the SERVER's id — surfaced verbatim, NOT
    // overwritten with input.entry_id.
    expect(parsed.time_entry.id).toBe(99999);
    expect(parsed.time_entry.id).not.toBe(12345);
    expect(parsed.time_entry).toEqual(newEntryFromResume);
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
      name: "keeping_resume_timer",
      arguments: { entry_id: 12345, confirm: true },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: 100 (Acme), 200 (Beta).",
    );
  });

  it("Test 7: 403 on locked entry → DEFINITE-FAIL via toIsErrorContent (RESEARCH Q3 RESOLVED — NOT ambiguous)", async () => {
    // Per the OpenAPI contract: cannot resume locked time entries → 403.
    // Per RESEARCH Q3 resolution: 403 is a DEFINITE failure (the server
    // knows the operation cannot succeed and the client got that signal),
    // NOT an ambiguous outcome. It MUST flow through toIsErrorContent
    // (definite-fail path) and the text MUST NOT contain "outcome unknown".
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      log: makeLog(),
      requestWithHeaders: async () => {
        throw new KeepingApiError(403, "cannot resume locked entry");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_resume_timer",
      arguments: { entry_id: 12345, confirm: true },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    const text = content[0]?.text ?? "";
    expect(text).toContain("Keeping API error 403");
    expect(text).toContain("cannot resume locked entry");
    // CRITICAL — must NOT be the ambiguous envelope. classifyAmbiguous
    // returns true only for status >= 500; 403 must flow through
    // toIsErrorContent unchanged.
    expect(text).not.toContain("outcome unknown");
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
      name: "keeping_resume_timer",
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
    const tool = list.tools.find((t) => t.name === "keeping_resume_timer");
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(false);
    expect(tool?.annotations?.destructiveHint).toBe(true);
    expect(tool?.annotations?.idempotentHint).toBe(false);
    expect(tool?.annotations?.openWorldHint).toBe(true);
  });

  it("Test 10: 401 KeepingAuthError flows through toIsErrorContent verbatim (D-25, D-3-20)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      log: makeLog(),
      requestWithHeaders: async () => {
        throw new KeepingAuthError();
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_resume_timer",
      arguments: { entry_id: 12345, confirm: true },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.",
    );
  });
});
