---
phase: 03-write-tools-conditional-timers
reviewed: 2026-06-12T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/keeping/client.ts
  - src/keeping/date.ts
  - src/keeping/write-gate.ts
  - src/keeping/types.ts
  - src/tools/add-entry.ts
  - src/tools/update-entry.ts
  - src/tools/delete-entry.ts
  - src/tools/start-timer.ts
  - src/tools/stop-timer.ts
  - src/tools/resume-timer.ts
  - src/server.ts
findings:
  critical: 2
  warning: 6
  info: 4
  total: 12
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-06-12T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 3 ships the six write tools, the shared write-gate, the date helpers, the
new `requestWithHeaders<T>` plumbing, and the server wiring. The architecture is
solid: the AND-gate dry-run gate, the strict-wrapper extractor pattern, the
inline-gate variants for delete/stop/resume, and the token-defence-in-depth
machinery all line up with the locked decisions in 03-CONTEXT.

Two issues are classified BLOCKER because they cause incorrect runtime behavior
in branches the design clearly meant to handle:

1. **`classifyAmbiguous` does not detect timeouts.** `AbortSignal.timeout(...)`
   produces a `DOMException` whose `.name` is `"TimeoutError"`, not
   `"AbortError"`. Every 10-second timeout falls through the ambiguous branch and
   reaches the user as a definite-fail definite envelope — exactly the opposite
   of the D-3-16 contract.
2. **`start` / `end` regex accepts non-`HH:mm` inputs.** The regex is
   loose enough to allow 12-hour suffixes (`"1:30pm"`), unpadded hours, hours
   like `"25"`, and minutes like `"99"`. D-3-28 commits to `HH:mm` on the wire,
   but the schema lets garbage through to the API. This is a correctness issue
   not just for body shape but for the user-visible behaviour described in the
   tool description ("HH:mm in org timezone").

The remaining warnings cover dead-code branches in the new `requestWithHeaders`
retry plumbing, duplicated BASE-url construction in three inline-gate paths,
concurrency races in the identity caches, and minor schema looseness.

## Critical Issues

### CR-01: `classifyAmbiguous` misses timeouts from `AbortSignal.timeout`

**File:** `src/keeping/write-gate.ts:103-104`
**Issue:** `KeepingClient.rawFetch` and `rawFetchWithHeaders` use
`AbortSignal.timeout(TIMEOUT_MS)` (`src/keeping/client.ts:243, 285`). When the
10-second timeout fires, Node 22's fetch surfaces a `DOMException` whose
`.name === "TimeoutError"` — **not** `"AbortError"`. The classifier only checks
`err.name === "AbortError"`, so timeouts:

- Do not match the `AbortError` arm.
- Are a `DOMException`, not a `TypeError`, so the `instanceof TypeError` arm
  misses too.
- Have no numeric `.status` property, so the duck-typed `>= 500` arm misses too.

Result: every fetch timeout is classified as **definite-fail** and routed to
`toIsErrorContent`. A real write that timed out (state unknown on the server)
is presented to the AI as a clean error, violating D-3-16 / WRITE-05's
ambiguous-envelope contract on the most important failure mode.

This contradicts the comment block on line 92-97 which explicitly lists
"`AbortError` (10-second timeout fired)" — the timeout never lands there.

**Fix:**
```typescript
export function classifyAmbiguous(err: unknown): boolean {
  if (err instanceof Error) {
    // AbortSignal.timeout() throws DOMException("TimeoutError"); manual aborts
    // throw DOMException("AbortError"). Treat both as ambiguous.
    if (err.name === "AbortError" || err.name === "TimeoutError") return true;
    if (err instanceof TypeError) return true;
  }
  // ... rest unchanged
}
```
Also: add a unit test that constructs `new DOMException("...", "TimeoutError")`
and asserts `classifyAmbiguous(...) === true`. The W11/W10 test pair documented
in the file does not cover this case.

---

### CR-02: `start` / `end` HH:mm regex accepts 12-hour, overflow, and unpadded values

**File:** `src/tools/add-entry.ts:90,95`; `src/tools/update-entry.ts:74,79`; `src/tools/start-timer.ts:89`
**Issue:** The regex used everywhere is
`/^\d{1,2}:\d{2}(:\d{2})?(am|pm)?$/i`. It accepts:

- `"1:30pm"` — 12-hour clock with suffix. The tool description and D-3-28
  commit to **HH:mm** (24-hour, zero-padded). Passing `"1:30pm"` through to
  `body.start` will either be rejected by Keeping (definite-fail surfaced to the
  user) or silently misinterpreted (`13:30` vs `01:30`).
- `"25:99"` — hour 25, minute 99. No range check.
- `"9:5"` — single-digit minutes; not a valid `HH:mm`.
- `"00:00:00"` — seconds permitted, but `HH:mm` excludes them.

The doc string on each field says "HH:mm in org timezone"; the schema does not
enforce HH:mm. An LLM caller reading the description will assume `HH:mm` is
required and will be confused when `"1:30pm"` succeeds locally but produces a
422 (or, worse, a shifted entry). The default values from
`nowInAmsterdamHHMM()` are well-formed, so this only bites user-supplied input —
but that is the only input that matters here.

**Fix:** Tighten the regex to a strict HH:mm:
```typescript
start: z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:mm (24-hour, zero-padded)")
  .optional()
  .describe("HH:mm in org timezone; only used when org timesheet is 'times' mode."),
```
Apply identically to `end` in `add-entry.ts` / `update-entry.ts` and to `start`
in `start-timer.ts`. Add explicit negative-test cases for `"1:30pm"`, `"25:00"`,
`"9:5"`, `"00:00:00"`.

---

## Warnings

### WR-01: `requestWithHeaders` retry plumbing contains permanently-dead branches

**File:** `src/keeping/client.ts:186-201`
**Issue:** `requestWithHeaders` is typed `method: "POST" | "PATCH"`. The body
of `onFailedAttempt` and `shouldRetry` then checks `method !== ("GET" as string)`
to decide whether to sleep / retry. Those branches are statically unreachable
(method literally cannot equal `"GET"`). The `(error instanceof KeepingRateLimitError)`
sleep is wrapped in an `if (method !== ("GET" as string)) return;` that is
always taken, so the sleep never executes and the `this.log.warn(...)` line is
dead code.

The cast `"GET" as string` is also a code smell — it exists only to silence
the "comparison always false" diagnostic from TS, which is itself a sign the
branch is dead.

This is not a runtime bug today (writes never retry — that's the intent), but
it's an attractive nuisance: a future maintainer broadening `requestWithHeaders`
to accept `"GET"` will see the existing 429 sleep code and think it works,
when in fact it depends on the retry config above being adjusted in lockstep.

**Fix:** Drop the dead branches and document the invariant:
```typescript
async requestWithHeaders<T>(
  method: "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<{ body: T; headers: Headers }> {
  // Writes never auto-retry (SAFE-03 + Pitfall 3). No pRetry wrapper — the
  // single throttle slot is sufficient; rate-limit / 5xx / network errors
  // propagate directly to the tool's catch arm for ambiguous classification.
  const result = await this.throttle(() => this.rawFetchWithHeaders(method, path, body))();
  return { body: result.body as T, headers: result.headers };
}
```
If consistency with `request<T>`'s pRetry shape is desired for diff readability,
remove the `method !== ("GET" as string)` and `KeepingRateLimitError` branches
and leave only `shouldRetry: () => false`.

---

### WR-02: `BASE` URL duplicated four times across modules — drift risk

**File:** `src/keeping/client.ts:32`, `src/keeping/write-gate.ts:24`, `src/tools/delete-entry.ts:115`, `src/tools/stop-timer.ts:119`, `src/tools/resume-timer.ts:141`
**Issue:** The string `"https://api.keeping.nl/v1"` appears in five places:

- `client.ts:32` — single source of truth for actual HTTP calls.
- `write-gate.ts:24` — duplicated with a comment justifying the duplication.
- `delete-entry.ts:115`, `stop-timer.ts:119`, `resume-timer.ts:141` — three inline
  dry-run gates each construct the preview URL as a hard-coded literal
  `` `https://api.keeping.nl/v1${path}` `` rather than importing from a shared
  constant.

The write-gate duplication is documented (D-3-02 trade-off). The three inline-gate
duplications in the tool files are NOT documented as deliberate and silently
bypass the shared constant entirely. If BASE ever changes (region split, v2 cut,
test server override), four locations must be updated in lockstep and three of
them are easy to miss.

**Fix:** Export BASE from `write-gate.ts` (or a new `src/keeping/constants.ts`)
and reuse:
```typescript
// write-gate.ts
export const KEEPING_BASE_URL = "https://api.keeping.nl/v1";

// delete-entry.ts
import { KEEPING_BASE_URL, ... } from "../keeping/write-gate.js";
url: `${KEEPING_BASE_URL}${path}`,
```
Same change in `stop-timer.ts` and `resume-timer.ts`.

---

### WR-03: Identity caches (`meCache`, `orgsCache`) race under concurrent first calls

**File:** `src/keeping/client.ts:99-113`
**Issue:** `me()` and `organisations()` use a simple "if cache is null, fetch
and store" pattern. If two tool handlers call `client.me()` (or
`client.organisations()`) before the first response lands, both will see
`meCache === null` and both will issue HTTP requests. The second response
overwrites the first.

In practice on stdio transport with a single in-flight tool call this rarely
fires, but `resolveOrgId` is called from every write tool's `try` block, so any
two near-simultaneous tool invocations can double-spend the throttle budget and
race the cache. The `organisations` cache is the more painful case because the
`/organisations` call has no org-scope and is what every other path depends on.

**Fix:** Memoise the in-flight Promise rather than the resolved value:
```typescript
private mePromise: Promise<KeepingUser> | null = null;

async me(): Promise<KeepingUser> {
  if (this.meCache !== null) return this.meCache;
  if (this.mePromise === null) {
    this.mePromise = (async () => {
      const orgId = await this.resolveOrgId();
      const fetched = await this.get<KeepingUser>(`/${orgId}/users/me`);
      this.meCache = fetched;
      return fetched;
    })().finally(() => { this.mePromise = null; });
  }
  return this.mePromise;
}
```
Same pattern for `organisations()`. Also covers the D-25 "401 keeps trying"
contract because `mePromise` is reset on the `.finally`.

---

### WR-04: `unwrapOrgList` and strict extractors do not differentiate "array as wrapper" drift

**File:** `src/keeping/client.ts:42-56`
**Issue:** `unwrapOrgList` accepts a bare array as a valid response, but the
strict extractor pattern (D-2.5-05a) used by `extractTimeEntry` in
`start-timer.ts` and `timer-status.ts` rejects bare arrays. The two helpers
disagree on what shape drift looks like:

- Orgs: bare array is *fine*, wrapped is *fine*, anything else throws.
- Time entries: only `{ time_entry: <object> }` is fine; bare array collapses
  to `null`.

The orgs unwrapper also accepts `{ data: [...] }` as a defensive fallback for
shape drift that has never been observed. If the live API ever does drift to a
new wrapper key, the silent acceptance of `data: [...]` could mask a real
regression: the OpenAPI spec locks `organisations`. Live drift detection works
better if the unwrapper fails closed for unknown keys.

The CONTEXT block flags "any new wrapper extractor that might silently accept
arrays (the D-2.5-05a class of bug)" as critical. `unwrapOrgList` is exactly
that — but for *orgs*, where the precedent allowed it. Worth a deliberate
review pass to confirm the asymmetry is intentional.

**Fix:** Either:
1. Document the asymmetry in `unwrapOrgList`'s docstring (orgs were
   pre-D-2.5-05a, kept tolerant by precedent), OR
2. Tighten `unwrapOrgList` to reject bare arrays and `{ data: [] }` once the
   live shape is confirmed stable.

No code change required if path (1); a single edit and test deletion if (2).

---

### WR-05: `update-entry.ts` does not enforce org-mode body coherence

**File:** `src/tools/update-entry.ts:128-138`
**Issue:** The comment on lines 23-26 states "the API will reject mode-mismatched
fields itself with a 422 (definite-fail → toIsErrorContent)". This is defended
by deferring validation to the server, but the handler will happily forward
**both** `start`/`end` AND `hours` in the same PATCH body if the caller provides
both:

```typescript
if (input.start !== undefined) body.start = input.start;
if (input.end !== undefined) body.end = input.end;
if (input.hours !== undefined) body.hours = input.hours;
```

There is no mutual-exclusion check at the Zod or handler level. A confused
caller (LLM) can send both and trigger a 422 round-trip for a problem the
schema could catch synchronously. `add-entry.ts` does NOT have this problem
because it inspects `org.features.timesheet` and branches.

**Fix:** Add a Zod refinement that forbids `hours` together with `start`/`end`:
```typescript
const UpdateEntryInput = z.object({ /* fields */ }).refine(
  (v) => !(v.hours !== undefined && (v.start !== undefined || v.end !== undefined)),
  { message: "Provide either start/end (times mode) OR hours (hours mode), not both." },
);
```
This is a cheap synchronous validation that avoids a wasted API round-trip and
matches `add-entry`'s mode-aware behaviour.

---

### WR-06: `nowInAmsterdamHHMM` uses `sv-SE` whose `00:00` mid-day differs from naïve expectations

**File:** `src/keeping/date.ts:46-53`
**Issue:** `Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit", hour12: false })`
emits `"24:00"` for the midnight rollover in some locale data revisions (the
spec historically allowed `00` vs `24`). On Node 22 with full-ICU 73+ this
returns `"00:00"` reliably, but the date.ts docblock just notes "sv-SE emits
24h `HH:mm` consistently with `hour12: false`" without an explicit assertion or
clamp.

The risk is concrete: a timer started exactly at `00:00:00` Amsterdam local
would have `start: "24:00"` on the wire under some ICU builds, which Keeping
will reject as out-of-range. The smoke test on ICU presence does not assert
midnight formatting.

**Fix:** Add an explicit midnight clamp and a regression test:
```typescript
export function nowInAmsterdamHHMM(now: Date = new Date()): string {
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return s === "24:00" ? "00:00" : s;
}
```
Test: `nowInAmsterdamHHMM(new Date("2026-06-13T22:00:00Z"))` should produce
`"00:00"` on the CEST midnight boundary, not `"24:00"`.

---

## Info

### IN-01: `KEEPING_ORG_ID` read via `process.env` inside `resolveOrgId`, bypassing the config schema

**File:** `src/keeping/client.ts:125`
**Issue:** `loadConfig` parses `KEEPING_ORG_ID` through Zod, but
`resolveOrgId` reads `process.env.KEEPING_ORG_ID` directly. The value is read
from the live environment at every call, ignoring the parsed config and any
defaults. If `process.env.KEEPING_ORG_ID` is mutated mid-process (test setup,
e.g.), behaviour diverges between code paths that see config and code paths
that see env directly.

**Fix:** Thread the resolved value from `KeepingConfig.KEEPING_ORG_ID` into the
client (e.g., constructor parameter) and replace the `process.env` read. This
makes the client a pure function of its construction arguments, simplifies test
setup, and removes a global-state read from a hot path.

---

### IN-02: Magic string `"X-Server-Time-Ms"` duplicated; should be a constant

**File:** `src/tools/stop-timer.ts:145`, `src/tools/resume-timer.ts:167`
**Issue:** Both timer tools `headers.get("X-Server-Time-Ms")` with a literal
string. If the header name ever changes (case typo, server rename, version
bump), two files must be updated together and there is no compile-time link.

**Fix:** Export the constant from `write-gate.ts` (or a new
`src/keeping/timer.ts`):
```typescript
export const X_SERVER_TIME_MS_HEADER = "X-Server-Time-Ms";
```
Import in both timer tools.

---

### IN-03: Inline-gate URL construction also duplicates the `would_post` shape

**File:** `src/tools/delete-entry.ts:112-117`, `src/tools/stop-timer.ts:117-121`, `src/tools/resume-timer.ts:139-143`
**Issue:** Each inline-gate tool builds its own `{ would_post: { method, url, body: null } }`
object. The `WouldPost` interface in `write-gate.ts:41` exists for exactly this
shape, but is not used by the inline-gate paths. Easy drift point if the wire
shape changes (e.g., D-3-02 ever grows a fourth field).

**Fix:** Export a small helper from `write-gate.ts`:
```typescript
export function wouldPost(method: WriteMethod, path: string, body: unknown = null): WouldPost {
  return { would_post: { method, url: `${BASE}${path}`, body } };
}
```
Then delete/stop/resume just do:
```typescript
return { content: [{ type: "text", text: JSON.stringify(wouldPost("PATCH", path), null, 2) }] };
```
Cuts the duplication in three places and reuses the existing exported
`WouldPost` type.

---

### IN-04: `_log` parameter in `createServer` is unused

**File:** `src/server.ts:38`
**Issue:** The signature reserves `_log: Logger` for "future plans can wire it
without changing call sites" but the logger is never used inside this scope and
is already reachable via `client.log` (the field is `public readonly`).
Carrying an unused parameter with a future-promise comment risks the parameter
sitting there past Phase 4 with nobody noticing it's still unused.

**Fix:** Either:
1. Drop the parameter; callers can read `client.log` if they want it, OR
2. Add a TODO with a specific plan reference (e.g., "TODO Phase 5: pass to
   sendLoggingMessage wiring when capabilities.logging is enabled").

---

_Reviewed: 2026-06-12T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
