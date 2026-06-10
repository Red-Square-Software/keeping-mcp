import { afterEach, describe, expect, it, vi } from "vitest";
import { KeepingClient } from "../../src/keeping/client.js";
import {
  KeepingApiError,
  KeepingAuthError,
  MultiOrgError,
} from "../../src/keeping/errors.js";
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

describe("KeepingClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.KEEPING_ORG_ID;
  });

  // ---------- Cache (D-22, D-23, D-24, SAFE-05) ----------

  it("Test 1: me() is cached across calls (D-22)", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse(200, { id: "u-1", name: "X" }));
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    const first = await client.me();
    const second = await client.me();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.id).toBe("u-1");
  });

  it("Test 2: organisations() is cached across calls (D-22)", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse(200, [{ id: "org-1", name: "Acme" }]));
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    await client.organisations();
    await client.organisations();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("Test 3: 401 from me() does NOT populate the cache; next call still fetches (D-25)", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }));
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    await expect(client.me()).rejects.toBeInstanceOf(KeepingAuthError);
    await expect(client.me()).rejects.toBeInstanceOf(KeepingAuthError);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  // ---------- Throttle wiring (SAFE-02, D-22) ----------

  it("Test 4: throttle wiring does not stall consecutive GETs (one underlying fetch each)", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse(200, { ok: true }));
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
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(401, { error: "nope" }));
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    await expect(client.me()).rejects.toMatchObject({
      name: "KeepingAuthError",
      message:
        "Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.",
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
    vi.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse(200, [
        { id: "org_abc", name: "Acme" },
        { id: "org_xyz", name: "Beta" },
      ]),
    );
    process.env.KEEPING_ORG_ID = "org_abc";
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    const resolved = await client.resolveOrgId("org_xyz");
    expect(resolved).toBe("org_xyz");
  });

  it("Test 11: resolveOrgId — input arg not in org list throws MultiOrgError (D-29 typo guard)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse(200, [
        { id: "org_abc", name: "Acme Studio" },
        { id: "org_xyz", name: "Beta BV" },
      ]),
    );
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    let err: unknown;
    try {
      await client.resolveOrgId("org_typo");
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(MultiOrgError);
    expect((err as Error).message).toBe(
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: org_abc (Acme Studio), org_xyz (Beta BV).",
    );
  });

  it("Test 12: resolveOrgId — env var used when no input arg and orgs include it", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse(200, [
        { id: "org_abc", name: "Acme" },
        { id: "org_xyz", name: "Beta" },
      ]),
    );
    process.env.KEEPING_ORG_ID = "org_abc";
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    expect(await client.resolveOrgId()).toBe("org_abc");
  });

  it("Test 13: resolveOrgId — single-org auto-detect when no input, no env", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse(200, [{ id: "org_solo", name: "Solo" }]),
    );
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    expect(await client.resolveOrgId()).toBe("org_solo");
  });

  it("Test 14: resolveOrgId — multi-org with no input + no env throws MultiOrgError with D-27 wording", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse(200, [
        { id: "org_abc", name: "Acme Studio" },
        { id: "org_xyz", name: "Beta BV" },
      ]),
    );
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());

    let err: unknown;
    try {
      await client.resolveOrgId();
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(MultiOrgError);
    expect((err as Error).message).toBe(
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: org_abc (Acme Studio), org_xyz (Beta BV).",
    );
  });

  // ---------- Token leak regression check ----------

  it("Test 15: JSON.stringify(client) does NOT contain the token (leak regression)", () => {
    const client = new KeepingClient(FAKE_TOKEN, silentLogger());
    const serialised = JSON.stringify(client);
    expect(serialised).not.toContain(FAKE_TOKEN);
  });
});
