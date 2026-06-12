import { afterEach, describe, expect, it, vi } from "vitest";
import { KeepingClient } from "../../src/keeping/client.js";
import { KeepingApiError, KeepingAuthError, MultiOrgError } from "../../src/keeping/errors.js";
import { createLogger } from "../../src/logger.js";

const FAKE_TOKEN = "kp_test_FAKE_token_value";

// Helper: build a logger that never writes (level 'error' + nothing emits at lower levels).
// The KeepingClient's `log.warn(...)` on retries does fire at 'error' level filter though;
// we mock process.stderr.write in tests that care, otherwise let it through to /dev/null in CI.
const silentLogger = () => createLogger(FAKE_TOKEN, "error");

const jsonResponse = (status: number, body: unknown, headers?: Record<string, string>) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });

/**
 * 2026-06-11 (D-34-R): `KeepingOrg.id` is numeric in real responses. Tests
 * use the real numeric shape to exercise the `String(o.id)` boundary
 * coercion in `resolveOrgId()`.
 */
const SAMPLE_ORG = {
  id: 47666,
  name: "Acme",
  url: "https://acme.keeping.nl",
  current_plan: "plus_2019",
  features: { timesheet: "times", projects: true, tasks: true, breaks: false },
  time_zone: "Europe/Amsterdam",
  currency: "EUR",
};

/**
 * D-34-R: `/{orgId}/users/me` returns a wrapper object `{ user: {...} }`.
 * `KeepingClient.me()` preserves the wrapper verbatim.
 */
const SAMPLE_ME = {
  user: {
    id: 789,
    first_name: "Ella",
    surname: "van Doorn",
    code: null,
    role: "administrator",
    state: "active",
  },
};

/**
 * Build a fetch mock that routes by URL substring. The KeepingClient.me()
 * path now needs `organisations()` to succeed first (it calls resolveOrgId
 * internally), so most identity-cache tests must mock BOTH endpoints.
 */
function routedFetchMock(handlers: {
  organisations?: () => Response;
  me?: () => Response;
  fallback?: (url: string) => Response;
}) {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.endsWith("/organisations") && handlers.organisations) {
      return handlers.organisations();
    }
    if (url.includes("/users/me") && handlers.me) {
      return handlers.me();
    }
    if (handlers.fallback) return handlers.fallback(url);
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
}

describe("KeepingClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.KEEPING_ORG_ID;
  });

  // ---------- Cache (D-22, D-23, D-24, SAFE-05) ----------

  it("Test 1: me() is cached across calls (D-22)", async () => {
    let meCalls = 0;
    let orgCalls = 0;
    routedFetchMock({
      organisations: () => {
        orgCalls += 1;
        return jsonResponse(200, { organisations: [SAMPLE_ORG] });
      },
      me: () => {
        meCalls += 1;
        return jsonResponse(200, SAMPLE_ME);
      },
    });
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    const first = await client.me();
    const second = await client.me();

    expect(meCalls).toBe(1);
    // organisations() is also cached, but resolveOrgId is called once per
    // me() invocation that hits the cache MISS — first call only, since
    // the second me() returns the cached me directly.
    expect(orgCalls).toBe(1);
    expect(first).toEqual(second);
    expect(first.user.id).toBe(789);
  });

  it("Test 2: organisations() is cached across calls (D-22)", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse(200, { organisations: [SAMPLE_ORG] }));
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    await client.organisations();
    await client.organisations();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("Test 2b: organisations() unwraps { organisations: [...] } wrapper shape", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(200, { organisations: [SAMPLE_ORG] }));
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    const orgs = await client.organisations();

    expect(orgs).toEqual([SAMPLE_ORG]);
  });

  it("Test 2c: organisations() unwraps { data: [...] } wrapper shape (defence-in-depth)", async () => {
    const alt = { ...SAMPLE_ORG, id: 47667, name: "Beta" };
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(200, { data: [alt] }));
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    const orgs = await client.organisations();

    expect(orgs).toEqual([alt]);
  });

  it("Test 2d: organisations() throws shape error when payload is neither array nor known wrapper", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(200, { foo: "bar" }));
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    await expect(client.organisations()).rejects.toThrow(/unexpected shape/);
  });

  it("Test 3: 401 from me() does NOT populate the cache; next call still fetches (D-25)", async () => {
    let meCalls = 0;
    routedFetchMock({
      organisations: () => jsonResponse(200, { organisations: [SAMPLE_ORG] }),
      me: () => {
        meCalls += 1;
        return jsonResponse(401, { error: { message: "unauthorized" } });
      },
    });
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    await expect(client.me()).rejects.toBeInstanceOf(KeepingAuthError);
    await expect(client.me()).rejects.toBeInstanceOf(KeepingAuthError);

    expect(meCalls).toBe(2);
  });

  // ---------- Throttle wiring (SAFE-02, D-22) ----------

  it("Test 4: throttle wiring does not stall consecutive GETs (one underlying fetch each)", async () => {
    // A Response body can only be consumed once, so return a FRESH Response per
    // call rather than mockResolvedValue (which would hand back the same one).
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockImplementation(async () => jsonResponse(200, { ok: true }));
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    await client.get("/x");
    await client.get("/x");
    await client.get("/x");
    await client.get("/x");
    await client.get("/x");

    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  // ---------- Retry policy (SAFE-03, Pitfall 3) ----------

  it("Test 5: GET retries on 429 honouring Retry-After: 0", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse(429, "", { "Retry-After": "0" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: 1 }));
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    const result = await client.get<{ ok: number }>("/x");

    expect(result).toEqual({ ok: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("Test 6: POST does NOT retry on 429 — single fetch then reject (SAFE-03)", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse(429, "", { "Retry-After": "0" }));
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    await expect(client.post("/x", { hello: "world" })).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("Test 7: PATCH and DELETE do NOT retry on 429 (SAFE-03)", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse(429, "", { "Retry-After": "0" }));
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    await expect(client.patch("/x", {})).rejects.toThrow();
    await expect(client.delete("/x")).rejects.toThrow();

    expect(fetchSpy).toHaveBeenCalledTimes(2); // exactly one per call
  });

  // ---------- 401 path (D-25) ----------

  it("Test 8: 401 on me() rejects with KeepingAuthError byte-identical D-25 message", async () => {
    routedFetchMock({
      organisations: () => jsonResponse(200, { organisations: [SAMPLE_ORG] }),
      me: () => jsonResponse(401, { error: { message: "nope" } }),
    });
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    await expect(client.me()).rejects.toMatchObject({
      name: "KeepingAuthError",
      message: "Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.",
    });
  });

  // ---------- Token scrub in error body (Pitfall G + AUTH-03) ----------

  it("Test 9: 500 error body containing the token is sanitised before KeepingApiError surfaces", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse(500, `boom: bearer ${FAKE_TOKEN} echoed`),
    );
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    let captured: unknown;
    try {
      await client.get("/x");
    } catch (e) {
      captured = e;
    }

    expect(captured).toBeInstanceOf(KeepingApiError);
    expect((captured as KeepingApiError).message).not.toContain(FAKE_TOKEN);
    expect((captured as KeepingApiError).message).toContain("***");
    expect((captured as KeepingApiError).status).toBe(500);
  });

  // ---------- resolveOrgId precedence (D-26, D-28, D-29, AUTH-05) ----------

  it("Test 10: resolveOrgId — input arg wins over env when both present", async () => {
    const orgs = [
      { ...SAMPLE_ORG, id: 100, name: "Acme" },
      { ...SAMPLE_ORG, id: 200, name: "Beta" },
    ];
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(200, { organisations: orgs }));
    process.env.KEEPING_ORG_ID = "100";
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    // Numeric id 200 supplied as string — D-29 boundary coercion.
    const resolved = await client.resolveOrgId("200");
    expect(resolved).toBe("200");
  });

  it("Test 11: resolveOrgId — input arg not in org list throws MultiOrgError (D-29 typo guard)", async () => {
    const orgs = [
      { ...SAMPLE_ORG, id: 100, name: "Acme Studio" },
      { ...SAMPLE_ORG, id: 200, name: "Beta BV" },
    ];
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(200, { organisations: orgs }));
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    let err: unknown;
    try {
      await client.resolveOrgId("999");
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(MultiOrgError);
    expect((err as Error).message).toBe(
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: 100 (Acme Studio), 200 (Beta BV).",
    );
  });

  it("Test 12: resolveOrgId — env var used when no input arg and orgs include it", async () => {
    const orgs = [
      { ...SAMPLE_ORG, id: 100, name: "Acme" },
      { ...SAMPLE_ORG, id: 200, name: "Beta" },
    ];
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(200, { organisations: orgs }));
    process.env.KEEPING_ORG_ID = "100";
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    expect(await client.resolveOrgId()).toBe("100");
  });

  it("Test 13: resolveOrgId — single-org auto-detect when no input, no env", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse(200, { organisations: [{ ...SAMPLE_ORG, id: 555, name: "Solo" }] }),
    );
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    expect(await client.resolveOrgId()).toBe("555");
  });

  it("Test 14: resolveOrgId — multi-org with no input + no env throws MultiOrgError with D-27 wording", async () => {
    const orgs = [
      { ...SAMPLE_ORG, id: 100, name: "Acme Studio" },
      { ...SAMPLE_ORG, id: 200, name: "Beta BV" },
    ];
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(200, { organisations: orgs }));
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    let err: unknown;
    try {
      await client.resolveOrgId();
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(MultiOrgError);
    expect((err as Error).message).toBe(
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: 100 (Acme Studio), 200 (Beta BV).",
    );
  });

  // ---------- Token leak regression check ----------

  it("Test 15: JSON.stringify(client) does NOT contain the token (leak regression)", () => {
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());
    const serialised = JSON.stringify(client);
    expect(serialised).not.toContain(FAKE_TOKEN);
  });

  // ---------- Path strategy (D-34-R) ----------

  it("Test 16: me() calls /{orgId}/users/me (D-34-R, not /organisations/{orgId}/users/me)", async () => {
    const urls: string[] = [];
    routedFetchMock({
      organisations: () => jsonResponse(200, { organisations: [SAMPLE_ORG] }),
      me: () => jsonResponse(200, SAMPLE_ME),
      fallback: () => jsonResponse(200, {}),
    });
    // Re-spy with a capturing implementation: vi.spyOn last write wins.
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      urls.push(url);
      if (url.endsWith("/organisations")) {
        return jsonResponse(200, { organisations: [SAMPLE_ORG] });
      }
      if (url.includes("/users/me")) {
        return jsonResponse(200, SAMPLE_ME);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    await client.me();

    const meUrl = urls.find((u) => u.includes("/users/me"));
    expect(meUrl).toBeDefined();
    // Must match `/v1/{orgId}/users/me`, NOT `/v1/organisations/{orgId}/users/me`.
    expect(meUrl).toBe(`https://api.keeping.nl/v1/${SAMPLE_ORG.id}/users/me`);
    expect(meUrl).not.toContain("/organisations/");
  });
});

// ---------------------------------------------------------------------------
// Phase 3 foundation surface — D-3-18 + D-3-27.
//
// Test C1: DELETE returns 204 No Content → client.delete<unknown>(path) resolves
//   to null and does NOT throw SyntaxError.
// Test C2: 500 on DELETE still surfaces a KeepingApiError (204 branch must
//   sit AFTER the !res.ok guard).
// Test C3: requestWithHeaders<T> returns { body, headers } and the headers
//   carry X-Server-Time-Ms verbatim.
// Test C4: requestWithHeaders<T> shares this.throttle with request<T> (Pitfall 3).
// ---------------------------------------------------------------------------

describe("KeepingClient — Phase 3 surface (D-3-18, D-3-27)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.KEEPING_ORG_ID;
  });

  it("Test C1: DELETE 204 No Content resolves to null without throwing (D-3-27)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    const result = await client.delete<unknown>("/47666/time-entries/12345");

    expect(result).toBeNull();
  });

  it("Test C2: DELETE 500 still throws KeepingApiError — 204 branch only applies to 204 (D-3-27)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("boom", { status: 500 }),
    );
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    let captured: unknown;
    try {
      await client.delete("/47666/time-entries/12345");
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(KeepingApiError);
    expect((captured as KeepingApiError).status).toBe(500);
    expect((captured as KeepingApiError).message).toContain("boom");
  });

  it("Test C3: requestWithHeaders<T> returns { body, headers } with X-Server-Time-Ms accessible (D-3-18)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response('{"time_entry":{"id":99}}', {
        status: 200,
        headers: {
          "X-Server-Time-Ms": "1718202000000",
          "Content-Type": "application/json",
        },
      }),
    );
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    const result = await client.requestWithHeaders<{ time_entry: { id: number } }>(
      "PATCH",
      "/47666/time-entries/99/stop",
    );

    expect(result.body).toEqual({ time_entry: { id: 99 } });
    expect(result.headers).toBeDefined();
    // WHATWG Headers.get is case-insensitive — verify either casing works.
    expect(result.headers.get("X-Server-Time-Ms")).toBe("1718202000000");
    expect(result.headers.get("x-server-time-ms")).toBe("1718202000000");
  });

  it("Test C4: requestWithHeaders<T> shares the same throttle slot allocator as request<T> (Pitfall 3)", async () => {
    let throttleCalls = 0;
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response('{"ok":true}', { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    // Replace the throttle property with a tracking proxy that delegates to a
    // pass-through implementation. If BOTH request<T> and requestWithHeaders<T>
    // route through `this.throttle(...)` the counter should hit 2.
    const realThrottle = (
      client as unknown as { throttle: <T>(fn: () => Promise<T>) => () => Promise<T> }
    ).throttle;
    (client as unknown as { throttle: <T>(fn: () => Promise<T>) => () => Promise<T> }).throttle = <
      T,
    >(fn: () => Promise<T>) => {
      throttleCalls += 1;
      return realThrottle(fn);
    };

    await client.get<unknown>("/x");
    await client.requestWithHeaders<unknown>("PATCH", "/y");

    expect(throttleCalls).toBe(2);
  });
});
