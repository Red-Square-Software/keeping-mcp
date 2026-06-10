// KeepingClient — the only code path that touches api.keeping.nl.
//
// Owns: bearer-token construction, 120-req/min throttle (p-throttle), retry-on-429
//       for GETs only (p-retry, honouring Retry-After), identity cache for
//       /users/me + /organisations (D-22..D-24), org resolution (D-26..D-29),
//       and Pitfall G token scrub for API error bodies.
//
// Path commitment for me() — Q1 RESOLVED in 02-RESEARCH §"Open Questions
// (RESOLVED)": me() unconditionally calls the GLOBAL form `/users/me`.
// Plan 02-06 Task 3 will switch this to `/organisations/${orgId}/users/me`
// ONLY IF the live probe in Plan 02-05 returns 404 on the global path.
// Do not preemptively branch here.

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

  // ---- Identity cache (D-22, D-23, D-24) ----

  async me(): Promise<KeepingUser> {
    if (this.meCache !== null) return this.meCache;
    // GLOBAL path per Q1 RESOLVED. Plan 02-06 Task 3 owns the contingency switch.
    const fetched = await this.get<KeepingUser>("/users/me");
    this.meCache = fetched;
    return fetched;
  }

  async organisations(): Promise<KeepingOrg[]> {
    if (this.orgsCache !== null) return this.orgsCache;
    const fetched = await this.get<KeepingOrg[]>("/organisations");
    this.orgsCache = fetched;
    return fetched;
  }

  // ---- Org resolution (D-26, D-28, D-29) ----

  async resolveOrgId(input?: string): Promise<string> {
    const orgs = await this.organisations();
    const ids = orgs.map((o) => o.id);

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
    if (ids.length === 1) return ids[0];
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
    return res.json();
  }
}
