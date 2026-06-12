// KeepingClient — the only code path that touches api.keeping.nl.
//
// Owns: bearer-token construction, 120-req/min throttle (p-throttle), retry-on-429
//       for GETs only (p-retry, honouring Retry-After), identity cache for
//       /{orgId}/users/me + /organisations (D-22..D-24), org resolution
//       (D-26..D-29), and Pitfall G token scrub for API error bodies.
//
// Path strategy (D-34-R, 2026-06-11):
//   - BASE is `https://api.keeping.nl/v1`.
//   - All authenticated endpoints live under `/{orgId}/...` — NOT
//     `/organisations/{orgId}/...`. Tools build the `/{orgId}/<path>` segment
//     themselves; this client's `request<T>()` only prepends BASE.
//   - The single global endpoint at BASE is `GET /organisations`.
//   - `me()` calls `/{orgId}/users/me` after resolving the org id; it
//     deliberately bypasses the public `get()` helper to break the cycle
//     against `resolveOrgId()` which itself depends on the orgs cache (not
//     the user cache), so no recursion risk.

import pRetry from "p-retry";
import pThrottle from "p-throttle";
import {
  KeepingApiError,
  KeepingAuthError,
  KeepingRateLimitError,
  MultiOrgError,
  sanitiseBody,
} from "./errors.js";
import type { KeepingOrg, KeepingUser } from "./types.js";

type Logger = ReturnType<typeof import("../logger.js").createLogger>;

const BASE = "https://api.keeping.nl/v1";
const TIMEOUT_MS = 10_000;

/**
 * Defensive unwrap for the `/organisations` payload. The live API returns
 * `{ organisations: [...] }`. We also accept `{ data: [...] }` and a bare
 * array as defence-in-depth against future shape drift. Discovered during
 * the Plan 02-06 human-verify probe — the original implementation assumed a
 * bare array and crashed with `orgs.map is not a function`.
 */
function unwrapOrgList(raw: unknown): KeepingOrg[] {
  if (Array.isArray(raw)) return raw as KeepingOrg[];
  if (raw !== null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.organisations)) return obj.organisations as KeepingOrg[];
    if (Array.isArray(obj.data)) return obj.data as KeepingOrg[];
  }
  const keys =
    raw !== null && typeof raw === "object"
      ? Object.keys(raw as Record<string, unknown>).join(", ")
      : typeof raw;
  throw new Error(
    `/organisations returned unexpected shape (top-level: ${keys}). Expected array, { organisations: [] }, or { data: [] }.`,
  );
}

export class KeepingClient {
  // `token` is installed as a non-enumerable own property in the constructor
  // via Object.defineProperty (NOT a regular `private readonly` class field),
  // so `JSON.stringify(client)` cannot serialise it. TypeScript's `private` is
  // an *erasure* — at runtime a class field is still enumerable. Test 15
  // enforces this invariant. `declare` tells TS the field exists without
  // emitting a constructor initialiser that would overwrite the descriptor.
  private declare readonly token: string;
  readonly log: Logger;
  // Single throttle instance shared by every call from this client.
  // 120 req/min matches Keeping's documented cap (SAFE-02).
  private readonly throttle = pThrottle({ limit: 120, interval: 60_000 });
  // Identity cache — no TTL, lifetime of the process (D-22, SAFE-05).
  // Both fields stay null on 401 so the next call retries (D-25, RESEARCH §"401
  // handling per D-25"): the user is meant to restart; until they do, every
  // tool call hits the API again and emits the same isError message.
  private meCache: KeepingUser | null = null;
  private orgsCache: KeepingOrg[] | null = null;

  constructor(token: string, log: Logger) {
    // Defence-in-depth for T-02-02-02 (threat model): defineProperty with
    // enumerable: false keeps the token off JSON.stringify(client).
    Object.defineProperty(this, "token", {
      value: token,
      enumerable: false,
      writable: false,
      configurable: false,
    });
    this.log = log;
  }

  // ---- Identity cache (D-22, D-23, D-24, D-34-R) ----

  /**
   * `GET /{orgId}/users/me` — org-scoped per D-34-R.
   *
   * Returns the wrapped shape `{ user: { ... } }` verbatim. Wrapper preserved
   * intentionally so the `keeping_me` tool decides whether to flatten or
   * pass through — keeps schema-discovery transparency consistent with
   * `keeping_list_entries` D-34 raw pass-through philosophy.
   */
  async me(): Promise<KeepingUser> {
    if (this.meCache !== null) return this.meCache;
    const orgId = await this.resolveOrgId();
    const fetched = await this.get<KeepingUser>(`/${orgId}/users/me`);
    this.meCache = fetched;
    return fetched;
  }

  async organisations(): Promise<KeepingOrg[]> {
    if (this.orgsCache !== null) return this.orgsCache;
    const raw = await this.get<unknown>("/organisations");
    const list = unwrapOrgList(raw);
    this.orgsCache = list;
    return list;
  }

  // ---- Org resolution (D-26, D-28, D-29) ----

  async resolveOrgId(input?: string): Promise<string> {
    const orgs = await this.organisations();
    // D-34-R: `KeepingOrg.id` is `number` (numeric primary key in the API).
    // `KEEPING_ORG_ID` env and tool-input `organisation_id` arrive as strings.
    // Compare by string-coercion at the boundary.
    const ids = orgs.map((o) => String(o.id));

    // Precedence per D-28: (a) input → (b) env → (c) single-org auto-detect → (d) error.
    const candidate = input ?? process.env.KEEPING_ORG_ID;
    if (candidate !== undefined && candidate !== "") {
      if (!ids.includes(candidate)) {
        // D-29 typo guard: candidate didn't match a real org → surface the
        // canonical multi-org list so the user can see valid options.
        throw new MultiOrgError(orgs);
      }
      return candidate;
    }
    if (ids.length === 1) {
      const only = ids[0];
      // Narrow `string | undefined` → `string` for the return type without
      // a non-null assertion. `ids.length === 1` guarantees `only` is set.
      if (only === undefined) throw new MultiOrgError(orgs);
      return only;
    }
    throw new MultiOrgError(orgs);
  }

  // ---- HTTP verbs — all route through request<T> ----

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  /**
   * D-3-18 / TIMER-02 — public method that exposes the underlying `Response`
   * headers alongside the parsed body. Used by `keeping_stop_timer` and
   * `keeping_resume_timer` to read `X-Server-Time-Ms` as the canonical
   * elapsed-time anchor.
   *
   * Shares the same `this.throttle` slot allocator and `pRetry` machinery as
   * `request<T>` (Pitfall 3). Limited to write verbs that have a header-read
   * use case in Phase 3; reads still flow through `get<T>()`.
   *
   * Writes still don't retry — `shouldRetry` rejects non-GET methods at the
   * `pRetry` layer, so the surface is purely for consistency with `request<T>`.
   */
  async requestWithHeaders<T>(
    method: "POST" | "PATCH",
    path: string,
    body?: unknown,
  ): Promise<{ body: T; headers: Headers }> {
    const throttled = this.throttle(() => this.rawFetchWithHeaders(method, path, body));

    const result = await pRetry(throttled, {
      retries: 3,
      minTimeout: 0,
      factor: 1,
      onFailedAttempt: async ({ error }) => {
        if (!(error instanceof KeepingRateLimitError)) return;
        // Writes never retry on rate limits (shouldRetry returns false below),
        // so this never sleeps — kept for surface symmetry with request<T>.
        if (method !== ("GET" as string)) return;
        this.log.warn(`429 received, sleeping ${error.retryAfter}s before retry`);
        await new Promise((r) => setTimeout(r, error.retryAfter * 1000));
      },
      shouldRetry: ({ error }) => {
        // SAFE-03 + Pitfall 3: writes never retry on rate limits or network blips.
        // requestWithHeaders is restricted to POST | PATCH, so this is always false —
        // kept explicit for code-reading clarity.
        if (method !== ("GET" as string)) return false;
        if (error instanceof KeepingRateLimitError) return true;
        return false;
      },
    });
    return { body: result.body as T, headers: result.headers };
  }

  // ---- Internals ----

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    // Each invocation of `throttled` consumes one throttle slot. A retry IS a
    // new HTTP request and should consume its own slot — passing `throttled`
    // (not rawFetch) into pRetry keeps the rate limit honest on retries too.
    const throttled = this.throttle(() => this.rawFetch(method, path, body));

    return (await pRetry(throttled, {
      retries: 3,
      // No artificial backoff between retries — Retry-After is the only delay
      // we honour, and we sleep for it inside onFailedAttempt. Without this,
      // p-retry adds a 1-second minTimeout per attempt which would make a
      // 429-then-200 GET test take seconds (test 5 must complete fast).
      minTimeout: 0,
      factor: 1,
      onFailedAttempt: async ({ error }) => {
        if (!(error instanceof KeepingRateLimitError)) return;
        // Only sleep when we'll actually retry — writes will be rejected by
        // shouldRetry below, no need to delay the rejection.
        if (method !== "GET") return;
        this.log.warn(`429 received, sleeping ${error.retryAfter}s before retry`);
        await new Promise((r) => setTimeout(r, error.retryAfter * 1000));
      },
      shouldRetry: ({ error }) => {
        // SAFE-03 + Pitfall 3: writes never retry on rate limits or network blips.
        if (method !== "GET") return false;
        if (error instanceof KeepingRateLimitError) return true;
        // Defer TypeError handling to p-retry's built-in network-error rules.
        return false;
      },
    })) as T;
  }

  private async rawFetch(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      // D-25 — exact wording owned by the error class.
      throw new KeepingAuthError();
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "30");
      throw new KeepingRateLimitError(Number.isFinite(retryAfter) ? retryAfter : 30);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Pitfall G defence-in-depth: scrub before the body reaches the error message.
      throw new KeepingApiError(res.status, sanitiseBody(text, this.token));
    }
    // D-3-27: DELETE returns 204 No Content (empty body); res.json() would
    // throw SyntaxError. The 204 branch must sit AFTER the !res.ok guard so
    // it never executes on error responses (Test C2 regression gate).
    if (res.status === 204) return null;
    return res.json();
  }

  /**
   * D-3-18 sibling of `rawFetch`. Identical request shape but returns the
   * `Response.headers` alongside the parsed body so `requestWithHeaders<T>`
   * can surface them. Token-sanitisation + 401 / 429 / 204 / !ok branches
   * mirror `rawFetch` verbatim.
   */
  private async rawFetchWithHeaders(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ body: unknown; headers: Headers }> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      throw new KeepingAuthError();
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "30");
      throw new KeepingRateLimitError(Number.isFinite(retryAfter) ? retryAfter : 30);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new KeepingApiError(res.status, sanitiseBody(text, this.token));
    }
    if (res.status === 204) {
      return { body: null, headers: res.headers };
    }
    return { body: await res.json(), headers: res.headers };
  }
}
