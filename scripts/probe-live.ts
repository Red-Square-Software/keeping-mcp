// scripts/probe-live.ts — one-shot live API probe (D-30..D-37 + D-35).
//
// Owns:
//   1. Three timer-endpoint best-guess probes in parallel (D-31).
//   2. A single `/v1/users/me` GET to gather Q1 contingency evidence
//      (RESEARCH §Open Questions RESOLVED — Plan 02-06 Task 3 reads the
//      result before deciding whether to switch KeepingClient.me()).
//   3. One time_entries capture for a user-supplied date range (default
//      last 7 days, override via PROBE_FROM / PROBE_TO).
//   4. Anonymisation pass (D-35 step 3) → committed fixture under
//      test/fixtures/.
//   5. Human-readable notes file at .planning/research/LIVE-API.md with
//      the seven mandated sections (CONTEXT §Specific Ideas line 149 +
//      the /v1/users/me path probe section).
//
// Never runs from server code paths. Invoked manually by the developer
// via `npm run probe-live`. The script + tested anonymiser ship in this
// plan (02-05); the running of it against a real KEEPING_TOKEN is the
// human-verify checkpoint owned by Plan 02-06.

// TODO Task 2: main flow (live HTTP probes + LIVE-API.md writer).
// Task 1 only ships the anonymise primitive + denylist constant so the
// vitest unit tests can import them — the rest of the file is stubbed.

/**
 * D-35 step 3 denylist. Exactly six keys — adding one without revisiting
 * 02-CONTEXT.md §"Specific Ideas" line 148 and the T-02-05-02 mitigation
 * trips Test 9 in test/scripts/anonymise.test.ts.
 */
export const ANONYMISE_KEYS: ReadonlySet<string> = new Set([
  "description",
  "project_name",
  "task_name",
  "client_name",
  "user_name",
  "user_email",
]);

/**
 * Depth-first walker. At every key in ANONYMISE_KEYS, the value is
 * replaced with the literal string "[REDACTED]". Every other key
 * (and every array element) is recursed into. Primitives, booleans,
 * numbers, and null pass through unchanged at leaf positions.
 */
export function anonymise(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(anonymise);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = ANONYMISE_KEYS.has(k) ? "[REDACTED]" : anonymise(v);
    }
    return out;
  }
  return value;
}
