// Foundation tests for src/keeping/write-gate.ts (D-3-01, D-3-02, D-3-04,
// D-3-16, D-3-17).
//
// The write-gate provides three named exports:
//   - `previewOrCall<T>(client, cfg, req)` — AND-gate semantics: only when
//     `cfg.requireConfirm && !cfg.confirm` is true does it return a
//     `{ would_post }` preview without calling the API. All other branches
//     delegate to `client.post/patch/delete`.
//   - `AMBIGUOUS_TEXT` — byte-locked WRITE-05 wording.
//   - `classifyAmbiguous(err)` — true for KeepingApiError.status>=500,
//     AbortError, raw TypeError; false for everything else.
//
// Tests rely on a `Partial<KeepingClient>` mock that records calls into a
// `calls` array — verbatim Phase 2.5 pattern from test/tools/timer-status.test.ts.

import { describe, expect, it } from "vitest";
import type { KeepingClient } from "../../src/keeping/client.js";
import { KeepingApiError, KeepingAuthError, MultiOrgError } from "../../src/keeping/errors.js";
import { AMBIGUOUS_TEXT, classifyAmbiguous, previewOrCall } from "../../src/keeping/write-gate.js";

type Call = { method: "POST" | "PATCH" | "DELETE"; path: string; body?: unknown };

function buildMockClient(returnBody: unknown = { time_entry: { id: 999 } }) {
  const calls: Call[] = [];
  const mock: Partial<KeepingClient> = {
    post: async <T>(path: string, body: unknown): Promise<T> => {
      calls.push({ method: "POST", path, body });
      return returnBody as T;
    },
    patch: async <T>(path: string, body: unknown): Promise<T> => {
      calls.push({ method: "PATCH", path, body });
      return returnBody as T;
    },
    delete: async <T>(path: string): Promise<T> => {
      calls.push({ method: "DELETE", path });
      return returnBody as T;
    },
  };
  return { mock, calls };
}

describe("src/keeping/write-gate.ts", () => {
  // ---------------------------------------------------------------------------
  // previewOrCall — dry-run branch (D-3-01, D-3-02)
  // ---------------------------------------------------------------------------

  it("Test W1: dry-run POST returns full URL would_post and never calls client.post", async () => {
    const { mock, calls } = buildMockClient();
    const result = await previewOrCall<unknown>(
      mock as KeepingClient,
      { requireConfirm: true, confirm: false },
      {
        method: "POST",
        path: "/47666/time-entries",
        body: { date: "2026-06-12" },
      },
    );
    expect(result).toEqual({
      would_post: {
        method: "POST",
        url: "https://api.keeping.nl/v1/47666/time-entries",
        body: { date: "2026-06-12" },
      },
    });
    expect(calls).toEqual([]);
  });

  it("Test W2: dry-run PATCH preview URL points at the exact entry path", async () => {
    const { mock, calls } = buildMockClient();
    const result = await previewOrCall<unknown>(
      mock as KeepingClient,
      { requireConfirm: true, confirm: false },
      {
        method: "PATCH",
        path: "/47666/time-entries/12345",
        body: { note: "fix" },
      },
    );
    expect(result).toEqual({
      would_post: {
        method: "PATCH",
        url: "https://api.keeping.nl/v1/47666/time-entries/12345",
        body: { note: "fix" },
      },
    });
    expect(calls).toEqual([]);
  });

  it("Test W3: dry-run DELETE collapses undefined body to null (D-3-02)", async () => {
    const { mock, calls } = buildMockClient();
    const result = await previewOrCall<unknown>(
      mock as KeepingClient,
      { requireConfirm: true, confirm: false },
      { method: "DELETE", path: "/47666/time-entries/12345" },
    );
    expect(result).toEqual({
      would_post: {
        method: "DELETE",
        url: "https://api.keeping.nl/v1/47666/time-entries/12345",
        body: null,
      },
    });
    expect(calls).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // previewOrCall — confirm branch (D-3-01)
  // ---------------------------------------------------------------------------

  it("Test W4: confirm=true on POST calls client.post exactly once", async () => {
    const { mock, calls } = buildMockClient({ time_entry: { id: 42 } });
    const body = { date: "2026-06-12", purpose: "work" };
    const result = await previewOrCall<{ time_entry: { id: number } }>(
      mock as KeepingClient,
      { requireConfirm: true, confirm: true },
      { method: "POST", path: "/47666/time-entries", body },
    );
    expect(calls).toEqual([{ method: "POST", path: "/47666/time-entries", body }]);
    expect(result).toEqual({ time_entry: { id: 42 } });
  });

  it("Test W5: confirm=true on PATCH calls client.patch exactly once", async () => {
    const { mock, calls } = buildMockClient({ time_entry: { id: 42 } });
    const body = { note: "refined" };
    await previewOrCall<unknown>(
      mock as KeepingClient,
      { requireConfirm: true, confirm: true },
      { method: "PATCH", path: "/47666/time-entries/42", body },
    );
    expect(calls).toEqual([{ method: "PATCH", path: "/47666/time-entries/42", body }]);
  });

  it("Test W6: confirm=true on DELETE calls client.delete with no body arg", async () => {
    const { mock, calls } = buildMockClient(null);
    await previewOrCall<unknown>(
      mock as KeepingClient,
      { requireConfirm: true, confirm: true },
      { method: "DELETE", path: "/47666/time-entries/42" },
    );
    expect(calls).toEqual([{ method: "DELETE", path: "/47666/time-entries/42" }]);
  });

  it("Test W7: env-false escape hatch (requireConfirm=false, confirm=false) still calls API", async () => {
    const { mock, calls } = buildMockClient();
    const body = { date: "2026-06-12" };
    await previewOrCall<unknown>(
      mock as KeepingClient,
      { requireConfirm: false, confirm: false },
      { method: "POST", path: "/47666/time-entries", body },
    );
    expect(calls).toEqual([{ method: "POST", path: "/47666/time-entries", body }]);
  });

  // ---------------------------------------------------------------------------
  // classifyAmbiguous — true cases (D-3-16)
  // ---------------------------------------------------------------------------

  it("Test W8: classifyAmbiguous — KeepingApiError 5xx true; 4xx false", () => {
    expect(classifyAmbiguous(new KeepingApiError(500, "boom"))).toBe(true);
    expect(classifyAmbiguous(new KeepingApiError(502, "bad gw"))).toBe(true);
    expect(classifyAmbiguous(new KeepingApiError(503, "unavail"))).toBe(true);
    expect(classifyAmbiguous(new KeepingApiError(599, "edge"))).toBe(true);
    expect(classifyAmbiguous(new KeepingApiError(400, "bad req"))).toBe(false);
    expect(classifyAmbiguous(new KeepingApiError(401, "auth"))).toBe(false);
    expect(classifyAmbiguous(new KeepingApiError(403, "forbidden"))).toBe(false);
    expect(classifyAmbiguous(new KeepingApiError(404, "missing"))).toBe(false);
    expect(classifyAmbiguous(new KeepingApiError(422, "validation"))).toBe(false);
  });

  it("Test W9: classifyAmbiguous — AbortError true; plain Error false", () => {
    const aborted = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(classifyAmbiguous(aborted)).toBe(true);
    expect(classifyAmbiguous(new Error("x"))).toBe(false);
  });

  it("Test W10: classifyAmbiguous — TypeError true; KeepingAuthError/MultiOrgError/duck-typed/null false", () => {
    expect(classifyAmbiguous(new TypeError("fetch failed"))).toBe(true);
    expect(classifyAmbiguous(new KeepingAuthError())).toBe(false);
    expect(classifyAmbiguous(new MultiOrgError([{ id: 1, name: "A" }]))).toBe(false);
    // Duck-typing trap: string-typed status must NOT be ambiguous.
    expect(classifyAmbiguous({ status: "500" })).toBe(false);
    expect(classifyAmbiguous(null)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // AMBIGUOUS_TEXT byte-exact lock (D-3-16)
  // ---------------------------------------------------------------------------

  it("Test W11: AMBIGUOUS_TEXT byte-exact wording", () => {
    expect(AMBIGUOUS_TEXT).toBe(
      "outcome unknown — verify with keeping_list_entries before retrying.",
    );
  });
});
