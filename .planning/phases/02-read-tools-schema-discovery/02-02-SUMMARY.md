---
phase: 02-read-tools-schema-discovery
plan: 02
subsystem: mcp-server-core
tags: [mcp-server, keeping-client, throttle, retry, cache, resolve-org-id, keeping_me, stdio-transport, vertical-slice]

# Dependency graph
requires:
  - phase: 02-read-tools-schema-discovery
    plan: 01
    provides: KeepingAuthError, MultiOrgError, KeepingApiError, KeepingRateLimitError, sanitiseBody(), toIsErrorContent(), KeepingUser/KeepingOrg types, @modelcontextprotocol/sdk@1.29.0, p-throttle@8.1.0, p-retry@8.0.0
provides:
  - "src/keeping/client.ts: KeepingClient class with me(), organisations(), resolveOrgId(), get/post/patch/delete — sole code path to api.keeping.nl"
  - "src/server.ts: createServer(client, config, log) factory; consumed by bin and by Plans 02-03/02-04 which will register more tools"
  - "src/tools/me.ts: registerMe(server, client) — first MCP read tool with READ-03 annotations"
  - "bin/keeping-mcp.ts: extended to boot StdioServerTransport — the vertical slice is now runnable"
affects: [02-03 (organisations/projects/tasks tools register on the same server), 02-04 (entries-list tool + CI initialize smoke that this plan's manual smoke is byte-aligned with), 02-05 (probe-live script will import the same KeepingClient + errors), 02-06 (contingency switch for me() global path lives there)]

# Tech tracking
tech-stack:
  added: []  # all deps already installed in Plan 02-01
  patterns:
    - "Token is installed as a non-enumerable own property via Object.defineProperty (NOT a regular `private readonly` class field) so JSON.stringify(client) cannot leak it — TypeScript `private` is erasure-only, Test 15 enforces"
    - "p-throttle wraps the inner rawFetch, p-retry wraps the throttled function — retries consume their own throttle slot (each retry IS a new HTTP request)"
    - "p-retry shouldRetry returns false for any method !== 'GET' — writes never retry, SAFE-03 + Pitfall 3 mechanically enforced"
    - "p-retry minTimeout:0 + factor:1 — no artificial backoff; Retry-After is the only delay we honour, slept for inside onFailedAttempt and guarded to GETs"
    - "Tool handlers wrap every error path through toIsErrorContent — never throw (Anti-Pattern 4); MultiOrgError + KeepingAuthError propagate byte-identical to the MCP client"
    - "TDD discipline carried forward: RED commit precedes GREEN per task"

key-files:
  created:
    - "src/keeping/client.ts"
    - "src/server.ts"
    - "src/tools/me.ts"
    - "test/keeping/client.test.ts"
    - "test/tools/me.test.ts"
  modified:
    - "bin/keeping-mcp.ts"

key-decisions:
  - "Token storage: non-enumerable own property via defineProperty in constructor + declare-only TS field (not auto-initialised). Test 15 asserts JSON.stringify(client) does not contain the token."
  - "p-retry tuning: retries:3, minTimeout:0, factor:1. The default 1-second minTimeout would make Test 5 (429-then-200 GET) take seconds; setting it to 0 keeps tests fast without compromising Retry-After honour because the actual sleep happens inside onFailedAttempt."
  - "onFailedAttempt sleeps only for GETs even though the same callback fires for all methods — paired with shouldRetry returning false for non-GET, this avoids a needless Retry-After delay before rejecting a write."
  - "me() path is the GLOBAL form `/users/me` per Q1 RESOLVED — Plan 02-06 Task 3 owns the contingency switch to `/organisations/<id>/users/me` IFF the live probe in Plan 02-05 returns 404. No conditional branch in this plan."
  - "Logger field is `readonly log: Logger` (public, not private) — pragmatic: the test file does not need it but keeping it accessible avoids friction for Plans 02-03/02-04 if they ever need to log from outside the class."

patterns-established:
  - "Pattern A (KeepingClient): single source of truth for all Keeping API I/O; per-instance throttle; lazy cache for identity; resolveOrgId precedence (input → env → single-org → MultiOrgError)"
  - "Pattern B (Tool handler): inputSchema:z.object(...) form (Pitfall B); try { resolveOrgId + client.* } catch { toIsErrorContent }; readOnlyHint annotations for all read tools"
  - "Pattern C (Server factory): createServer(client, config, log) returns McpServer with explicit comment forbidding capabilities.logging (Pitfall A)"
  - "Pattern D (Manual smoke contract): printf an initialize JSON-RPC line + KEEPING_TOKEN=kp_test_FAKE → expect serverInfo.name='keeping-mcp', protocolVersion='2025-11-25', clean stderr. Byte-aligned with Plan 02-04 Task 2 CI smoke."

requirements-completed: [AUTH-04, AUTH-05, IDENT-01, IDENT-03, READ-03, SAFE-02, SAFE-03, SAFE-05]
# SAFE-04 already completed in Plan 02-01 — toIsErrorContent envelope is now exercised end-to-end here.

# Metrics
duration: 6min
completed: 2026-06-10
---

# Phase 2 Plan 02: client-server-keeping-me Summary

**First vertical slice for Phase 2: `npx keeping-mcp` boots a real MCP server over stdio, registers the read-only `keeping_me` tool, and serves identity through a memoised KeepingClient with 120-req/min throttle, GET-only retry on 429 honouring Retry-After, byte-identical D-25/D-27 error wording at the tool boundary, and a non-enumerable token field that survives a JSON.stringify-the-whole-client leak check.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-10T11:04:24Z
- **Completed:** 2026-06-10T11:10:49Z
- **Tasks:** 2 (Task 1 = KeepingClient + 15 tests; Task 2 = server.ts + me tool + bin wiring + 4 InMemoryTransport tests)
- **Files created/modified:** 5 new + 1 modified

## Accomplishments

### KeepingClient (Task 1 — `src/keeping/client.ts`)

- Owns every byte that leaves the process for `api.keeping.nl`: bearer header, JSON encoding, 10s `AbortSignal.timeout`, 401/429/!ok branches in that order.
- **Throttle:** single `pThrottle({ limit: 120, interval: 60_000 })` instance per client; windowed algorithm matches Keeping's documented per-minute cap; retries consume their own slot (each retry IS a new HTTP request).
- **Retry:** `pRetry(throttled, { retries: 3, minTimeout: 0, factor: 1, ... })`. `shouldRetry` returns `false` for any non-GET (SAFE-03 + Pitfall 3); for GETs, returns `true` only when the error is `KeepingRateLimitError`. `onFailedAttempt` sleeps `retryAfter * 1000` ms but ONLY for GETs — non-GET 429s reject without a needless Retry-After delay.
- **Cache:** `meCache` and `orgsCache` are private nullable fields, lazy-populated on first call, never invalidated. After a 401 the field stays `null` so the next tool call hits the API again and emits the same D-25 message (matches RESEARCH §"401 handling per D-25").
- **Token storage:** declared as `private declare readonly token: string` (no auto-initialiser) and installed by `Object.defineProperty(this, "token", { enumerable: false, writable: false, configurable: false })` in the constructor. Test 15 asserts `JSON.stringify(client)` does not contain `FAKE_TOKEN`.
- **resolveOrgId precedence (D-26, D-28, D-29):** input arg → `KEEPING_ORG_ID` env → single-org auto-detect → `MultiOrgError`. Candidate is validated against the cached org list before being returned (D-29 typo guard).

### keeping_me tool + server wiring (Task 2)

- `src/tools/me.ts` — `registerMe(server, client)` registers `keeping_me` with:
  - `inputSchema: z.object({ organisation_id: z.string().optional().describe(...) })` (Pitfall B — never raw shape).
  - Annotations `{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }` per READ-03 + Pitfall 8.
  - Handler: `try { resolveOrgId → me → JSON.stringify({...me, organisation_id: orgId}, null, 2) } catch { toIsErrorContent(err) }`. Never throws.
- `src/server.ts` — `createServer(client, _config, _log)` returns `new McpServer({ name: "keeping-mcp", version: "0.1.0" })` and calls `registerMe`. Inline comment block documents the deliberate omission of `capabilities.logging` per Pitfall A.
- `bin/keeping-mcp.ts` — preserves the Phase 1 `loadConfig() + createLogger()` fail-fast prelude, then constructs `KeepingClient` → `createServer` → `await server.connect(new StdioServerTransport())`. No `process.exit` afterwards — the transport owns the event loop.

### Manual initialize smoke (byte-aligned with Plan 02-04 CI smoke contract)

Run:
```
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0.0"}}}\n' | KEEPING_TOKEN=kp_test_FAKE node dist/bin/keeping-mcp.js
```

Result on stdout (single JSON-RPC response line):
```json
{"result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"keeping-mcp","version":"0.1.0"}},"jsonrpc":"2.0","id":1}
```

Stderr: empty. Token-leak check: `grep -q "kp_test_FAKE" stderr` returned non-zero → **CLEAN**. Server process kept running until SIGTERM, confirming `StdioServerTransport` owns the event loop (no `process.exit` after `connect`).

## Task Commits

Each task split into RED → GREEN per `tdd="true"`:

1. **Task 1 (RED):** `test(02-02): add failing tests for KeepingClient` — `6581217`
2. **Task 1 (GREEN):** `feat(02-02): add KeepingClient with throttle, retry, cache, and org resolution` — `f8bb787`
3. **Task 2 (RED):** `test(02-02): add failing tests for keeping_me tool` — `92ca612`
4. **Task 2 (GREEN):** `feat(02-02): boot McpServer with keeping_me tool wired through KeepingClient` — `4984317`

_TDD: every RED commit had its corresponding test file imported from a module that did not exist yet — vitest failed at module-resolution time before any test body ran, per the RED gate convention carried forward from Phase 1 and Plan 02-01._

## Test Results

- **KeepingClient (test/keeping/client.test.ts):** 15/15 expected, 15/15 pass.
  - Cache (T1–T3): me() and organisations() each cause exactly one fetch on repeated calls; 401 keeps the cache `null` so the next call retries.
  - Throttle (T4): 5 consecutive GETs each cause one underlying fetch; throttle does not stall.
  - Retry (T5–T7): GET retries on 429 with `Retry-After: 0`; POST/PATCH/DELETE each reject after exactly one fetch.
  - 401 path (T8): rejects with `KeepingAuthError` whose `.message` is byte-identical to D-25.
  - Token scrub (T9): 500 body containing `FAKE_TOKEN` → `KeepingApiError.message` contains `***`, not the token, with `status: 500`.
  - resolveOrgId (T10–T14): input wins over env; input-not-in-list throws MultiOrgError with D-27 wording; env used when no input; single-org auto-detect; multi-org no-input no-env throws MultiOrgError with D-27 wording.
  - Leak regression (T15): `JSON.stringify(client)` does not contain `FAKE_TOKEN`.
- **keeping_me tool (test/tools/me.test.ts):** 4/4 expected, 4/4 pass.
  - T1: happy path returns `{ id, organisation_id: "org-1" }` with `isError` falsy.
  - T2: `MultiOrgError` surfaces as `isError: true` with byte-identical D-27 wording.
  - T3: `KeepingAuthError` surfaces as `isError: true` with byte-identical D-25 wording.
  - T4: `tools/list` reports `annotations.readOnlyHint === true`, `destructiveHint === false`, `idempotentHint === true`, `openWorldHint === true`.

**Total project test results:** 28/28 across 4 files (3 Phase 1 logger + 6 Plan 02-01 errors + 15 Plan 02-02 client + 4 Plan 02-02 me tool).

## Files Created/Modified

- `src/keeping/client.ts` (NEW, 184 lines) — `KeepingClient` class. Public surface: `me()`, `organisations()`, `resolveOrgId(input?)`, `get<T>`, `post<T>`, `patch<T>`, `delete<T>`. Private internals: `request<T>` (throttle+retry composition), `rawFetch` (HTTP boundary with 401/429/!ok branches).
- `src/server.ts` (NEW, 37 lines) — `createServer(client, _config, _log): McpServer`. Constructs the McpServer; calls `registerMe`; explicit comment forbids `capabilities.logging` (Pitfall A).
- `src/tools/me.ts` (NEW, 60 lines) — `registerMe(server, client): void`. Tool name `keeping_me`; Zod input schema; read-only annotations; handler wraps every error path through `toIsErrorContent`.
- `bin/keeping-mcp.ts` (MODIFIED) — preserves the fail-fast `loadConfig() + createLogger()` prelude, replaces the Phase 1 `log.info() + process.exit(0)` tail with `KeepingClient + createServer + StdioServerTransport.connect()`. Top comment documents stdout-reserved-for-MCP rule.
- `test/keeping/client.test.ts` (NEW, 247 lines) — 15 vitest cases using `vi.spyOn(global, "fetch")`.
- `test/tools/me.test.ts` (NEW, 95 lines) — 4 InMemoryTransport tests pairing `Client` + `McpServer` via `InMemoryTransport.createLinkedPair()`.

## Decisions Made

### Token storage as non-enumerable own property

The plan's `<acceptance_criteria>` and threat model entry T-02-02-02 require that `JSON.stringify(client)` not leak the token. TypeScript `private` is erasure-only — a `private readonly token: string` class field is still enumerable on the instance at runtime. Two patterns were considered:

1. **`#token` private field** (ECMAScript native private). Works, not enumerable, but `JSON.stringify` of an instance with only `#` fields still includes non-`#` fields normally — safe by exclusion. Downsides: requires TS target `>=ES2022`; `tsup` config targets `node22` so this would work, but the pattern leaks if a future `toJSON()` is ever added.
2. **`Object.defineProperty(this, "token", { enumerable: false, ... })`** (chosen). Explicit, descriptor-based, declared as `private declare readonly token: string` so TS sees the type without emitting an auto-initialiser that would overwrite the descriptor.

Chose (2) for explicitness — the comment block at the declaration site flags the intent and the threat model entry. Test 15 is the regression gate.

### p-retry tuning for fast test cycles

p-retry v8's default `minTimeout` is 1000ms — a 429→200 GET test would take >1s of real sleep between attempts. Setting `minTimeout: 0` + `factor: 1` makes the attempt loop fire-without-backoff; the only sleep we want is the explicit `await new Promise(r => setTimeout(r, retryAfter * 1000))` inside `onFailedAttempt`, and that's keyed on `Retry-After: 0` in tests for instant retry. Production behaviour is unchanged: a real 429 carries `Retry-After: N` (`N >= 0`) and we sleep for it explicitly.

### onFailedAttempt guarded to GETs

`onFailedAttempt` is called before `shouldRetry` for every failure. If we slept for `Retry-After` unconditionally and `shouldRetry` then said "no" (because method is POST/PATCH/DELETE), we'd add a needless delay before rejecting. Guarding the sleep to `method === "GET"` makes the write rejection path immediate — Test 6 and Test 7 each complete with fetch called exactly once and no measurable delay.

### Public `log` field

`KeepingClient.log` is `readonly` and public, not private. Pragmatic: makes the field self-documenting in stack traces / debugger, and avoids friction for future code that might log from outside the class. The token is still well-guarded — `log` itself does not expose anything sensitive (the logger redacts on emit).

## Deviations from Plan

None — plan executed exactly as written.

Biome auto-format ran on `test/keeping/client.test.ts` (whitespace-only) during the GREEN step of Task 1 and on `src/tools/me.ts` (whitespace + one `import type` upgrade — `McpServer` is only used as a type parameter to `registerTool` so biome flagged the regular import) during the GREEN step of Task 2. Both fixes were folded into the GREEN commit, same convention as Plan 02-01.

## Issues Encountered

**Test 4 first-pass failure: "Body has already been read."**

After the first GREEN attempt, Test 4 ("throttle wiring does not stall consecutive GETs") failed because `vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(200, { ok: true }))` returns the *same* `Response` object on every call. `Response.body` can be consumed only once, so the second `res.json()` inside `rawFetch` threw `TypeError: Body is unusable`.

Fix: switched Test 4 to `mockImplementation(async () => jsonResponse(200, { ok: true }))` so each call returns a fresh `Response`. Tests 1, 2, 7 keep `mockResolvedValue` because:
- Tests 1 and 2 rely on the cache — only one fetch ever fires.
- Test 7's 429 path reads `headers.get(...)` only; the body is never consumed.

This is a vitest/Fetch interaction, not a regression — caught and fixed inside the same task. Not a deviation from the plan.

## User Setup Required

None — no external service configuration. The Phase 1 `KEEPING_TOKEN` env var requirement remains the only user-facing setup, already documented in `CLAUDE.md`.

## Verification Gate (Plan-Level)

All four checks pass simultaneously:

1. `npx vitest run` → **28 tests passed across 4 files** (3 logger + 6 errors + 15 client + 4 me tool)
2. `npx tsc --noEmit` → **0 errors**
3. `npx biome check .` → **0 errors**
4. `npm run build` → **success**; `dist/bin/keeping-mcp.js` exists (8.55 KB) with shebang.
5. Manual initialize-handshake smoke → one valid JSON-RPC frame on stdout, `serverInfo.name === "keeping-mcp"`, `protocolVersion === "2025-11-25"`, stderr empty (no token leak).

Trust-but-verify grep:
```
grep -rn "process.stdout.write\|console.log" src/ bin/
```
returns zero matches (biome `noConsole` enforces, but spot-checked).

## p-retry v8 behaviour notes for LIVE-API.md

(Plan 02-05 will fold these into LIVE-API.md if the live probe surfaces any contradictions.)

- `shouldRetry` is called AFTER `onFailedAttempt` per the v8 contract — so any side effects inside `onFailedAttempt` happen for *every* failure, not only retry-able ones. We guard the Retry-After sleep accordingly.
- p-retry v8 type for `shouldRetry` and `onFailedAttempt` is `(context: RetryContext) => ...` where `context.error` is typed as `Error`. Our `instanceof KeepingRateLimitError` narrows correctly in TS 6.x without explicit casts.
- p-retry does NOT retry non-network `TypeError`s by default ("Non-network TypeErrors always abort retries"). Our `shouldRetry` only opts-in `KeepingRateLimitError` on GETs; everything else falls through to the built-in defaults, which is correct.

## TDD Gate Compliance

Plan's `tdd="true"` directive applied to both tasks. Git log shows the cycle:

- Task 1 RED: `6581217 test(02-02): add failing tests for KeepingClient`
- Task 1 GREEN: `f8bb787 feat(02-02): add KeepingClient with throttle, retry, cache, and org resolution` (follows RED)
- Task 2 RED: `92ca612 test(02-02): add failing tests for keeping_me tool`
- Task 2 GREEN: `4984317 feat(02-02): boot McpServer with keeping_me tool wired through KeepingClient` (follows RED)

No REFACTOR commits needed — biome auto-format ran inside each GREEN step (whitespace + one `import type` upgrade) and was folded into the GREEN commit, same convention as Plan 02-01.

## MVP+TDD Gate

MVP_MODE=true, TDD_MODE=true. Both tasks were behavior-adding (tdd="true" + `<behavior>` block + non-test source files). The plan-level gate was satisfied: both tasks have a `test(...)` commit landing before the corresponding `feat(...)` commit. No gate trips. No halt-and-report.

## Next Plan Readiness

Plan 02-03 (organisations / projects / tasks) is unblocked:

- `KeepingClient.resolveOrgId(input?)` is the single dispatch point — Plan 02-03's tools call `await client.resolveOrgId(input.organisation_id)` and `await client.get<KeepingProject[]>(...)` directly. No new client surface needed.
- `createServer(client, config, log)` is the registration point — Plan 02-03 adds `registerOrganisations`, `registerProjects`, `registerTasks` calls immediately below the existing `registerMe(server, client)` line.
- The tool-handler envelope (`try { ... } catch { toIsErrorContent(err) }`) is now established as Pattern B; Plan 02-03's three new tools follow it.

Plan 02-04 (entries-list + CI initialize smoke) is also unblocked from a contract standpoint — the manual smoke command verified in this plan is the byte-exact source for the CI YAML step. The fake-token leak check on stderr is the additional assertion the CI step must make.

No blockers, no carry-forward issues.

## Self-Check

- `src/keeping/client.ts` exists → FOUND
- `src/server.ts` exists → FOUND
- `src/tools/me.ts` exists → FOUND
- `test/keeping/client.test.ts` exists → FOUND
- `test/tools/me.test.ts` exists → FOUND
- `bin/keeping-mcp.ts` modified → confirmed via `git log --oneline -- bin/keeping-mcp.ts`
- Commit `6581217` exists → confirmed
- Commit `f8bb787` exists → confirmed
- Commit `92ca612` exists → confirmed
- Commit `4984317` exists → confirmed

## Self-Check: PASSED

---
*Phase: 02-read-tools-schema-discovery*
*Plan: 02-client-server-keeping-me*
*Completed: 2026-06-10*
