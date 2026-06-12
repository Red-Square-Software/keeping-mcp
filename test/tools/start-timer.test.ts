// keeping_start_timer tool tests — Phase 3 Plan 05 vertical slice.
//
// Locks the start-timer contract from D-3-06 + D-3-24 + D-3-28:
//   - POST /{orgId}/time-entries with `start` set, BOTH `end` and `hours` keys
//     STRICTLY ABSENT from the body (Object.keys assertion in Test 1 + 2).
//   - On the confirm path, `time_entry.id` is extracted via the verbatim
//     three-clause Array.isArray guard from timer-status.ts:58-65 (D-2.5-05a)
//     and surfaced as `{ timer_id }`.
//   - Drift (`{ time_entry: [] }` / `{ time_entry: null }`) collapses to
//     `{ timer_id: null }` — visible, never crashing.
//   - DST default: Date.now() = 2026-06-12T22:30:00Z (CEST +02:00) →
//     body.date = "2026-06-13", body.start = "00:30".
//   - Annotations: D-3-11 four booleans.
//   - 5xx ambiguous; 4xx + MultiOrg via toIsErrorContent.
//
// Skeleton mirrors test/tools/add-entry.test.ts — same buildClient harness,
// same defaultConfig + mockOrgTimes constants, same Partial<KeepingClient>
// mocks pattern.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeepingConfig } from "../../src/config.js";
import type { KeepingClient } from "../../src/keeping/client.js";
import { KeepingApiError, MultiOrgError } from "../../src/keeping/errors.js";
import { registerStartTimer } from "../../src/tools/start-timer.js";

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

async function buildClient(
  mockClient: Partial<KeepingClient>,
  config: KeepingConfig = defaultConfig,
) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerStartTimer(server, mockClient as KeepingClient, config);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

describe("keeping_start_timer tool", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Test 1: dry-run preview, body Object.keys STRICTLY omits `end` and `hours` (D-3-06, D-3-24)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgTimes],
      post: async () => {
        throw new Error("post should not be called on dry-run");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_start_timer",
      arguments: { purpose: "work", project_id: 555, start: "14:00" },
    });

    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed.would_post.method).toBe("POST");
    expect(parsed.would_post.url).toBe("https://api.keeping.nl/v1/47666/time-entries");

    const body = parsed.would_post.body as Record<string, unknown>;
    // Strict Object.keys assertion per D-3-24: body has exactly date, project_id,
    // purpose, start — no end, no hours, no tag_ids, no external_references.
    expect(Object.keys(body).sort()).toEqual(["date", "project_id", "purpose", "start"]);
    expect(body.end).toBeUndefined();
    expect(body.hours).toBeUndefined();
    expect("end" in body).toBe(false);
    expect("hours" in body).toBe(false);
    expect(body.start).toBe("14:00");
    expect(body.purpose).toBe("work");
    expect(body.project_id).toBe(555);
    // Dry-run preview has no timer_id (no entry exists yet).
    expect(parsed.timer_id).toBeUndefined();
  });

  it("Test 2: confirm path → POST exactly once, body strictly omits end/hours, response → { timer_id } (D-3-05, D-3-06)", async () => {
    const posts: Array<{ path: string; body: unknown }> = [];
    const mockResponse = {
      time_entry: { id: 456789123, ongoing: true, date: "2026-06-12", start: "14:00" },
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
      name: "keeping_start_timer",
      arguments: { purpose: "work", project_id: 555, start: "14:00", confirm: true },
    });

    expect(res.isError).toBeFalsy();
    expect(posts.length).toBe(1);
    expect(posts[0]?.path).toBe("/47666/time-entries");
    expect(posts[0]?.path).not.toContain("?");
    expect(posts[0]?.path).not.toContain("/organisations/");

    // Strict Object.keys assertion on the ACTUAL posted body (not just preview).
    const body = posts[0]?.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["date", "project_id", "purpose", "start"]);
    expect(body.end).toBeUndefined();
    expect(body.hours).toBeUndefined();
    expect("end" in body).toBe(false);
    expect("hours" in body).toBe(false);

    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed).toEqual({ timer_id: 456789123 });
  });

  it("Test 3: env-false escape — KEEPING_REQUIRE_CONFIRM=false, no confirm → post called, timer_id surfaced (D-3-01)", async () => {
    const posts: Array<{ path: string; body: unknown }> = [];
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgTimes],
      post: async <T>(path: string, body: unknown): Promise<T> => {
        posts.push({ path, body });
        return { time_entry: { id: 111, ongoing: true } } as T;
      },
    };
    const envFalseConfig: KeepingConfig = { ...defaultConfig, KEEPING_REQUIRE_CONFIRM: false };
    const client = await buildClient(mockClient, envFalseConfig);

    const res = await client.callTool({
      name: "keeping_start_timer",
      arguments: { purpose: "work", start: "09:00" },
    });

    expect(res.isError).toBeFalsy();
    expect(posts.length).toBe(1);
    expect(posts[0]?.path).toBe("/47666/time-entries");
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed).toEqual({ timer_id: 111 });
  });

  it("Test 4: DST default — Date.now()=2026-06-12T22:30:00Z → body.date='2026-06-13', body.start='00:30' (D-3-26, D-3-28)", async () => {
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
      name: "keeping_start_timer",
      arguments: { purpose: "work" },
    });

    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    // CEST = UTC+02:00 in June → 22:30 UTC = 00:30 next day in Amsterdam.
    expect(parsed.would_post.body.date).toBe("2026-06-13");
    expect(parsed.would_post.body.start).toBe("00:30");
    // Still strict — no end / no hours in the DST default body.
    expect(parsed.would_post.body.end).toBeUndefined();
    expect(parsed.would_post.body.hours).toBeUndefined();
    expect("end" in (parsed.would_post.body as Record<string, unknown>)).toBe(false);
    expect("hours" in (parsed.would_post.body as Record<string, unknown>)).toBe(false);
  });

  it("Test 5: strict wrapper drift — { time_entry: [] } collapses to { timer_id: null } (D-2.5-05a, Array.isArray guard)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgTimes],
      post: async <T>(): Promise<T> => {
        // Drift: API returned a bare array under time_entry instead of an
        // object. The verbatim three-clause guard rejects arrays.
        return { time_entry: [], meta: {} } as T;
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_start_timer",
      arguments: { purpose: "work", start: "14:00", confirm: true },
    });

    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed).toEqual({ timer_id: null });
  });

  it("Test 6: strict wrapper drift — { time_entry: null } collapses to { timer_id: null } (D-2.5-05a)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgTimes],
      post: async <T>(): Promise<T> => {
        return { time_entry: null, meta: {} } as T;
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_start_timer",
      arguments: { purpose: "work", start: "14:00", confirm: true },
    });

    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: "text"; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "");
    expect(parsed).toEqual({ timer_id: null });
  });

  it("Test 7: MultiOrgError flows through toIsErrorContent verbatim (D-27, D-3-20)", async () => {
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
      name: "keeping_start_timer",
      arguments: { purpose: "work", start: "14:00" },
    });

    expect(res.isError).toBe(true);
    const content = res.content as Array<{ type: "text"; text: string }>;
    expect(content[0]?.text).toBe(
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: 100 (Acme), 200 (Beta).",
    );
  });

  it("Test 8: 5xx KeepingApiError → AMBIGUOUS_TEXT envelope with parenthetical (D-3-16, WRITE-05)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgTimes],
      post: async () => {
        throw new KeepingApiError(503, "service unavailable");
      },
    };
    const client = await buildClient(mockClient);

    const res = await client.callTool({
      name: "keeping_start_timer",
      arguments: { purpose: "work", start: "14:00", confirm: true },
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

  it("Test 9: listTools reflects four locked annotations (D-3-11, WRITE-07)", async () => {
    const mockClient: Partial<KeepingClient> = {
      resolveOrgId: async () => "47666",
      organisations: async () => [mockOrgTimes],
      post: async () => ({ time_entry: { id: 1 } }) as never,
    };
    const client = await buildClient(mockClient);

    const list = await client.listTools();
    const tool = list.tools.find((t) => t.name === "keeping_start_timer");
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(false);
    expect(tool?.annotations?.destructiveHint).toBe(true);
    expect(tool?.annotations?.idempotentHint).toBe(false);
    expect(tool?.annotations?.openWorldHint).toBe(true);
  });
});
