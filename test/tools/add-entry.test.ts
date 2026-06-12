// keeping_add_entry tool tests — Phase 3 Plan 02 vertical slice.
//
// Per-tool minimum test set per D-3-22 + DST default-date per D-3-26 +
// hours-mode coverage per D-3-08. Skeleton mirrors test/tools/timer-status.test.ts
// (buildClient + InMemoryTransport.createLinkedPair + Partial<KeepingClient>
// mocks) — the same harness Phase 2 / 2.5 used. The shared `defaultConfig`
// constant carries `KEEPING_REQUIRE_CONFIRM: true` so dry-run is the default
// path; tests override per case.
//
// All tests are byte-locked against:
//   - D-25 (KeepingAuthError wording)
//   - D-27 (MultiOrgError template)
//   - AMBIGUOUS_TEXT from src/keeping/write-gate.ts ("outcome unknown — verify
//     with keeping_list_entries before retrying.")
//   - D-3-13 / D-3-26 DST-correct date default ("2026-06-13" for UTC moment
//     "2026-06-12T22:30:00Z").

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeepingConfig } from "../../src/config.js";
import type { KeepingClient } from "../../src/keeping/client.js";
import { KeepingApiError, KeepingAuthError, MultiOrgError } from "../../src/keeping/errors.js";
import { registerAddEntry } from "../../src/tools/add-entry.js";

const defaultConfig: KeepingConfig = {
  KEEPING_TOKEN: "kp_test_FAKE",
  KEEPING_REQUIRE_CONFIRM: true,
  KEEPING_LOG_LEVEL: "error",
};

const mockOrgTimes = {
  id: 47666,
  name: "Acme",
  url: "https://acme.keeping.nl",
  current_plan: "plus_2019",
  features: { timesheet: "times" as const, projects: true, tasks: true, breaks: false },
  time_zone: "Europe/Amsterdam",
  currency: "EUR",
};

const mockOrgHours = {
  ...mockOrgTimes,
  features: { ...mockOrgTimes.features, timesheet: "hours" as const },
};

async function buildClient(
  mockClient: Partial<KeepingClient>,
  config: KeepingConfig = defaultConfig,
) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerAddEntry(server, mockClient as KeepingClient, config);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

describe("keeping_add_entry tool", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Test 1: dry-run (env=true, confirm omitted) → preview, post NOT called (D-3-01, D-3-02, WRITE-04)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgTimes],
      post: async () => {
        throw new Error("post should not be called on dry-run");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_add_entry",
      arguments: { date: "2026-06-12", purpose: "work", start: "13:45", end: "15:15" },
    });

    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed.would_post.method).toBe("POST");
    expect(parsed.would_post.url).toBe("https://api.keeping.nl/v1/47666/time-entries");
    expect(parsed.would_post.body.date).toBe("2026-06-12");
    expect(parsed.would_post.body.purpose).toBe("work");
    expect(parsed.would_post.body.start).toBe("13:45");
    expect(parsed.would_post.body.end).toBe("15:15");
    expect(parsed.would_post.body.hours).toBeUndefined();
  });

  it("Test 2: confirm path → POST /47666/time-entries called exactly once with constructed body (WRITE-01, D-3-05)", async () => {
    const posts: Array<{ path: string; body: unknown }> = [];
    const mockResponse = {
      time_entry: { id: 999, date: "2026-06-12", ongoing: false },
      meta: {},
    };
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgTimes],
      post: async <T>(path: string, body: unknown): Promise<T> => {
        posts.push({ path, body });
        return mockResponse as T;
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_add_entry",
      arguments: {
        date: "2026-06-12",
        purpose: "work",
        start: "13:45",
        end: "15:15",
        confirm: true,
      },
    });

    expect(res.isError).toBeFalsy();
    expect(posts.length).toBe(1);
    // Path: bare /{orgId}/time-entries — no /v1/ prefix at tool layer, no query.
    expect(posts[0]?.path).toBe("/47666/time-entries");
    expect(posts[0]?.path).not.toContain("?");
    expect(posts[0]?.path).not.toContain("/organisations/");

    const body = posts[0]?.body as Record<string, unknown>;
    expect(body.date).toBe("2026-06-12");
    expect(body.purpose).toBe("work");
    expect(body.start).toBe("13:45");
    expect(body.end).toBe("15:15");
    expect(body.hours).toBeUndefined();

    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed).toEqual(mockResponse);
  });

  it("Test 3: env-false escape hatch — KEEPING_REQUIRE_CONFIRM=false, no confirm → post called (D-3-01)", async () => {
    const posts: Array<{ path: string; body: unknown }> = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgTimes],
      post: async <T>(path: string, body: unknown): Promise<T> => {
        posts.push({ path, body });
        return { time_entry: { id: 1 } } as T;
      },
    };
    const envFalseConfig: KeepingConfig = { ...defaultConfig, KEEPING_REQUIRE_CONFIRM: false };
    const client = await buildClient(mockClient, envFalseConfig);

    const res = await client.callTool({
      name: "keeping_add_entry",
      arguments: { date: "2026-06-12", purpose: "work", start: "13:45", end: "15:15" },
    });

    expect(res.isError).toBeFalsy();
    expect(posts.length).toBe(1);
    expect(posts[0]?.path).toBe("/47666/time-entries");
  });

  it("Test 4: MultiOrgError flows through toIsErrorContent verbatim (D-27, D-3-20)", async () => {
    const orgs = [
      { id: 100, name: "Acme" },
      { id: 200, name: "Beta" },
    ];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => {
        throw new MultiOrgError(orgs);
      },
      organisations: async () => [],
      post: async () => {
        throw new Error("should not be called");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_add_entry",
      arguments: { purpose: "work", start: "13:45" },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: 100 (Acme), 200 (Beta).",
    );
  });

  it("Test 5: 401 KeepingAuthError flows through toIsErrorContent verbatim (D-25, D-3-20)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgTimes],
      post: async () => {
        throw new KeepingAuthError();
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_add_entry",
      arguments: { purpose: "work", start: "13:45", confirm: true },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.",
    );
  });

  it("Test 6: 4xx KeepingApiError (definite-fail) → toIsErrorContent, NOT ambiguous envelope (D-3-16)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgTimes],
      post: async () => {
        throw new KeepingApiError(422, '{"error":{"message":"validation"}}');
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_add_entry",
      arguments: { purpose: "work", start: "13:45", confirm: true },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    const text = content[0]?.text ?? "";
    expect(text).toContain("Keeping API error 422");
    expect(text).not.toContain("outcome unknown");
  });

  it("Test 7: 5xx KeepingApiError (ambiguous) → AMBIGUOUS_TEXT envelope with original message parenthetical (D-3-16, WRITE-05)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgTimes],
      post: async () => {
        throw new KeepingApiError(503, "service unavailable");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_add_entry",
      arguments: { purpose: "work", start: "13:45", confirm: true },
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

  it('Test 8: confirm: "true" (string) is rejected by Zod → isError, post NOT called (T-03-02-02)', async () => {
    const posts: Array<{ path: string; body: unknown }> = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgTimes],
      post: async <T>(path: string, body: unknown): Promise<T> => {
        posts.push({ path, body });
        return { time_entry: { id: 1 } } as T;
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_add_entry",
      arguments: {
        purpose: "work",
        start: "13:45",
        confirm: "true" as unknown as boolean,
      },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    const text = content[0]?.text ?? "";
    expect(text.toLowerCase()).toMatch(/expected boolean|invalid/);
    expect(posts.length).toBe(0);
  });

  it("Test 9: user_id input is stripped by Zod schema — never reaches body (T-03-02-03, D-3-10)", async () => {
    const posts: Array<{ path: string; body: unknown }> = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgTimes],
      post: async <T>(path: string, body: unknown): Promise<T> => {
        posts.push({ path, body });
        return { time_entry: { id: 1 } } as T;
      },
    };
    const client = await buildClient(mockClient);

    await client.callTool({
      name: "keeping_add_entry",
      arguments: {
        purpose: "work",
        start: "13:45",
        user_id: "evil",
        confirm: true,
      } as unknown as Record<string, unknown>,
    });

    // The MCP-SDK may strip unknown fields at the schema-validation boundary
    // before reaching the handler; either way the posted body MUST NOT carry
    // user_id (D-3-10: Keeping defaults user_id to authenticated user).
    expect(posts.length).toBe(1);
    const body = posts[0]?.body as Record<string, unknown>;
    expect(body.user_id).toBeUndefined();
  });

  it("Test 10: listTools reflects four locked annotations (D-3-11, WRITE-07)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgTimes],
      post: async () => ({ time_entry: { id: 1 } }) as never,
    };
    const client = await buildClient(mockClient);

    const list = await client.listTools();
    const tool = list.tools.find((t) => t.name === "keeping_add_entry");
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(false);
    expect(tool?.annotations?.destructiveHint).toBe(true);
    expect(tool?.annotations?.idempotentHint).toBe(false);
    expect(tool?.annotations?.openWorldHint).toBe(true);
  });

  it("Test 11: DST-correct date default — Date.now()=2026-06-12T22:30:00Z → date='2026-06-13', start='00:30' (WRITE-08, D-3-15, D-3-26)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T22:30:00Z"));

    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgTimes],
      post: async () => {
        throw new Error("post should not be called on dry-run");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_add_entry",
      arguments: { purpose: "work" },
    });

    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    // CEST = UTC+02:00 in June → 22:30 UTC = 00:30 next day in Amsterdam.
    expect(parsed.would_post.body.date).toBe("2026-06-13");
    expect(parsed.would_post.body.start).toBe("00:30");
  });

  it("Test 12: hours-mode org, missing `hours` → isError envelope (D-3-08)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgHours],
      post: async () => {
        throw new Error("post should not be called");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_add_entry",
      arguments: { purpose: "work", confirm: true },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    const text = content[0]?.text ?? "";
    expect(text).toContain("hours");
  });

  it("Test 13: hours-mode org, hours: 1.5 → body has hours, no start/end (D-3-08)", async () => {
    const posts: Array<{ path: string; body: unknown }> = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgHours],
      post: async <T>(path: string, body: unknown): Promise<T> => {
        posts.push({ path, body });
        return { time_entry: { id: 1 } } as T;
      },
    };
    const client = await buildClient(mockClient);

    await client.callTool({
      name: "keeping_add_entry",
      arguments: { purpose: "work", hours: 1.5, confirm: true },
    });

    expect(posts.length).toBe(1);
    const body = posts[0]?.body as Record<string, unknown>;
    expect(body.hours).toBe(1.5);
    expect(body.start).toBeUndefined();
    expect(body.end).toBeUndefined();
    // date defaults to today in Amsterdam — assert it's a YYYY-MM-DD string.
    expect(typeof body.date).toBe("string");
    expect(body.date as string).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
