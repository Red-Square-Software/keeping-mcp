---
phase: 02-read-tools-schema-discovery
plan: 04
subsystem: mcp-server-tools
tags: [mcp-server, keeping-client, read-tools, schema-discovery, raw-pass-through, ci-smoke, initialize-handshake]

# Dependency graph
requires:
  - phase: 02-read-tools-schema-discovery
    plan: 03
    provides: createServer (registration seam now wires four read tools), KeepingClient (resolveOrgId + get), toIsErrorContent, KeepingApiError(status), KeepingAuthError, MultiOrgError, established Pattern B (try { resolveOrgId + client.get } catch { conditional + toIsErrorContent })
provides:
  - "src/tools/entries-list.ts: registerEntriesList(server, client) — keeping_list_entries tool with raw pass-through wire shape per D-34"
  - "src/server.ts: createServer now wires ALL FIVE Phase 2 read tools (me, organisations, projects, tasks, entries-list); the Phase 2 source-code surface is complete"
  - ".github/workflows/ci.yml: additive 'MCP initialize handshake' smoke step proves boot path + AUTH-03 token-redaction at CI time (D-15 carry-forward from Phase 1, finally satisfied)"
affects: [02-05 (scripts/probe-live.ts will reuse the same /organisations/:org_id/time_entries path + query params shape as keeping_list_entries — the URL is now codified in one place), 02-06 (LIVE-API.md human-verify step will compare the raw entries array against the field-name guesses in FEATURES.md), 03 (raw entries shape locked here is the ground truth Phase 3 write tools will encode in their Zod input schemas)]

# Tech tracking
tech-stack:
  added: []  # zero new dependencies; reuses everything from Plans 02-01 + 02-02
  patterns:
    - "Pattern B (tool handler) extended for schema discovery: keeping_list_entries' Zod input enforces shape (regex on dates, integer bounds on limit) but the OUTPUT does no field renaming — the whole point of this tool is to expose the wire format. outputSchema deliberately OMITTED per 02-CONTEXT.md Deferred Ideas."
    - "Top-level normalisation only (D-34 strict reading): `Array.isArray(raw) ? raw : (raw.entries ?? [])`. Wrapper fields like `meta` are dropped; inner array items pass through verbatim including any future custom_field_x."
    - "CI smoke pattern established for stdio MCP servers: pipe a single-line JSON-RPC initialize request → assert (a) every stdout line parses as JSON, (b) stderr does NOT contain the injected fake token, (c) first frame is a structurally valid initialize response. shell:bash works on windows-latest via Git Bash (Phase 1 D-14 carry-forward)."
    - "Carry-forward annotation block from registerMe verbatim: readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:true on the fifth and final read tool (READ-03 now complete across all five tools)."
    - "TDD discipline carried forward: RED commit precedes GREEN per Task 1; module-resolution failure is the canonical RED gate."

key-files:
  created:
    - "src/tools/entries-list.ts"
    - "test/tools/entries-list.test.ts"
    - ".planning/phases/02-read-tools-schema-discovery/02-04-SUMMARY.md"
  modified:
    - "src/server.ts"
    - ".github/workflows/ci.yml"

key-decisions:
  - "Raw pass-through scope locked at TOP LEVEL ONLY (D-34 strict reading). The unwrap `Array.isArray(raw) ? raw : (raw.entries ?? [])` discards wrapper fields like `meta` because (a) the plan's `<interfaces>` block specified exactly that code path verbatim and (b) the discriminator is array-shape, not body inspection — a future Keeping rename of the wrapper key wouldn't break the tool because we don't depend on it. Test 1 asserts custom_field_x survives the round trip; that's the IDENT of D-34 compliance."
  - "Limit hard-capped at 1000, default 200 (Pitfall E). Zod rejection on out-of-bounds limit is the gate — the mock client must never be touched, proving the input validator runs before any I/O. The tool description tells callers to narrow the date range for larger windows; no pagination shipped in Phase 2 (Open Question #2 deferred to Phase 3 once probe-live captures the pagination shape)."
  - "Date format enforced at the Zod boundary, not in the handler. Regex /^\\d{4}-\\d{2}-\\d{2}$/ on `from` and `to` rejects ISO timestamps, MM/DD/YYYY, etc. before URL construction. The `.describe()` text on `from` explicitly says 'Europe/Amsterdam timezone' — that's the doc surface AI clients read, Pitfall 5 surfaces there. T-02-04-01 (Tampering) mitigation."
  - "CI smoke step is ADDITIVE, not a replacement. The original Phase 1 missing-token smoke step is untouched (line-for-line); the new initialize-handshake smoke step appends after it. D-13 + D-15 both hold simultaneously across the [ubuntu, windows] × [22, 24] matrix."
  - "Fake token wording aligned with Plan 02-02's manual smoke contract: `kp_test_FAKE_token_value` matches the value already used in `test/logger.test.ts`. Using the same fixture token keeps the smoke and the unit test mutually consistent — any future code that accidentally logs `process.env.KEEPING_TOKEN` blows up BOTH gates."
  - "First stdout frame validation is structurally explicit, not regex-based: `r.jsonrpc === '2.0' && r.id === 1 && r.result.serverInfo.name === 'keeping-mcp' && r.result.protocolVersion`. A future schema change that adds/removes capability fields won't break the assertion; a regression that mutates serverInfo.name (e.g., npm package rename) will."

patterns-established:
  - "Schema-discovery tool pattern: Zod input validates SHAPE only, handler does top-level normalisation only, NO outputSchema. The 'documentation tool' archetype for any future endpoint where Phase 3 needs ground-truth field names."
  - "MCP boot-path CI gate: pipe single-line initialize request → triple assertion (stdout-only-JSON, no-token-on-stderr, valid-initialize-response). Generalisable to any stdio MCP server; the protocol version constant is the only project-specific value."

requirements-completed: [READ-01, READ-02]
# READ-03 was marked complete in Plan 02-03's traceability (the four prior tools had readOnlyHint:true);
# keeping_list_entries is the fifth and final read tool, so READ-03 is now exercised on the full set.
# IDENT-03 was partial in Plans 02-02 and 02-03; this plan extends the surface to a fifth tool path through resolveOrgId — same MultiOrgError envelope, byte-identical D-27 wording verified by Test 4.
# SAFE-04 was already complete (every tool handler uses toIsErrorContent); this plan reaffirms by exercising the envelope on the entries-list tool too.

# Metrics
duration: 3min
completed: 2026-06-10
---

# Phase 2 Plan 04: keeping_list_entries + CI initialize-handshake Summary

**The fifth and final Phase 2 read tool ships: `keeping_list_entries` returns time entries with the wire shape preserved exactly as the Keeping API returns it — `{ entries: <raw array>, count: <number> }` with zero field renaming inside the array — so it doubles as schema discovery for the Phase 3 write tools. The CI smoke step is extended to pipe a minimal MCP `initialize` JSON-RPC request into the built binary with a fake `KEEPING_TOKEN`, asserting (a) stdout contains only valid JSON-RPC frames, (b) stderr never echoes the fake token (AUTH-03 regression gate), (c) the first frame is a structurally valid initialize response with `serverInfo.name="keeping-mcp"` and `protocolVersion="2025-11-25"`. D-15, deferred since Phase 1, is finally satisfied.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-10T11:36:28Z
- **Completed:** 2026-06-10T11:39:49Z
- **Tasks:** 2 (Task 1 = entries-list tool + 8 tests; Task 2 = CI smoke step)
- **Files created/modified:** 2 new + 2 modified

## Accomplishments

### keeping_list_entries (Task 1 — `src/tools/entries-list.ts`)

- **Inputs** (Zod 4, `z.object({...})` per Pitfall B):
  - `organisation_id?: string` with `.describe("Override KEEPING_ORG_ID; required for multi-org tokens.")`
  - `from: string` with regex `^\d{4}-\d{2}-\d{2}$` and `.describe("Inclusive start date. Calendar date in YYYY-MM-DD; Europe/Amsterdam timezone.")` — the timezone note is mandatory per Pitfall 5; that string is the doc surface AI clients read at `tools/list` time
  - `to?: string` with the same regex and `.describe("Inclusive end date; defaults to \`from\` (single day).")`
  - `user_id?: string` with `.describe("Defaults to the authenticated user.")`
  - `limit: number` integer 1–1000, default 200 (Pitfall E)
- **Title:** `"List time entries"`
- **Description:** mentions wire-shape preservation and the calendar-date / no-UTC-timestamps note; the description is what `tools/list` exposes to clients alongside the schema.
- **Annotations:** `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` — verbatim from `me.ts`.
- **No outputSchema** (deferred per `02-CONTEXT.md` Deferred Ideas — the entire point of this tool's response is to expose the raw wire format).
- **Handler:** `resolveOrgId → URLSearchParams → client.get<{entries?: unknown[]} | unknown[]>(\`/organisations/${orgId}/time_entries?${params}\`)`. The shape union mirrors the two response variants Keeping might return.
- **Top-level normalisation only** (D-34): `const entries = Array.isArray(raw) ? raw : (raw.entries ?? [])`. The result is wrapped as `{ entries, count: entries.length }` and stringified into the text content. Wrapper fields (`meta`, etc.) are dropped; inner array items pass through verbatim — Test 1 asserts custom_field_x survives.

### createServer wiring (`src/server.ts`)

- New import: `import { registerEntriesList } from "./tools/entries-list.js";`
- New call: `registerEntriesList(server, client);` appended after `registerTasks(server, client);`.
- Final order (source-code source of truth): `registerMe`, `registerOrganisations`, `registerProjects`, `registerTasks`, `registerEntriesList`.
- Trailing comment updated to reflect that Phase 2's source-code surface is now complete; Phase 3 will append write tools here.
- `grep -c "^  register" src/server.ts` → **5** (acceptance criterion met).

### CI initialize-handshake smoke (Task 2 — `.github/workflows/ci.yml`)

- New step appended after the existing missing-token smoke step (no modification of the Phase 1 D-13 step — line-for-line preserved).
- Step name: `"Smoke test — MCP initialize handshake produces only valid JSON-RPC on stdout"`.
- Uses `shell: bash` so it runs identically on `ubuntu-latest` and `windows-latest` (Git Bash).
- Sets `KEEPING_TOKEN: kp_test_FAKE_token_value` (same fixture token as `test/logger.test.ts`).
- Pipes the canonical initialize request:
  ```
  {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"ci-smoke","version":"1.0.0"}}}
  ```
- Three assertions in order:
  1. Every non-empty stdout line parses as JSON via `node -e "JSON.parse(...)"`. Empty stdout fails the step.
  2. Stderr does NOT contain `kp_test_FAKE_token_value` (AUTH-03 regression gate; T-02-04-03 mitigation).
  3. First stdout line is a structurally valid initialize response: `jsonrpc === "2.0"`, `id === 1`, `result.serverInfo.name === "keeping-mcp"`, non-empty `result.protocolVersion`.
- Runs across the matrix `[ubuntu-latest, windows-latest] × [22, 24]` — four runner combinations.

## Task Commits

Task 1 split into RED → GREEN per `tdd="true"`:

1. **Task 1 (RED):** `test(02-04): add failing tests for keeping_list_entries` — `0d51025`
2. **Task 1 (GREEN):** `feat(02-04): add keeping_list_entries tool with raw pass-through wire shape` — `ad46059`
3. **Task 2:** `ci(02-04): assert MCP initialize handshake produces only valid JSON-RPC on stdout (D-15)` — `699f836`

_TDD: the RED commit added the test file but no `src/tools/entries-list.ts`. Vitest failed at module-resolution time:_

```
Error: Cannot find module '../../src/tools/entries-list.js' imported from .../test/tools/entries-list.test.ts
```

_Same RED gate convention carried forward from Plans 02-01, 02-02, and 02-03._

## Test Results

- **keeping_list_entries (test/tools/entries-list.test.ts):** 8/8 expected, **8/8 pass**.
  - T1: Happy path with `custom_field_x: 42` in the response — assertion `parsed.entries[0]?.custom_field_x === 42` proves D-34 raw pass-through.
  - T2: Top-level wrapped shape `{ entries: [...], meta: {...} }` → tool extracts entries, drops `meta`, returns `{ entries, count: 1 }`.
  - T3: Date regex rejection — `from: "06/09/2026"` fails before `resolveOrgId` or `get` are called. Test accepts either thrown error or `isError:true` (SDK's exact failure mode for invalid input is implementation detail; the contract is "mock untouched"). On this run the SDK threw `McpError: Invalid arguments`.
  - T4: `MultiOrgError` from `resolveOrgId` → `isError:true` with byte-identical D-27 wording on the fifth tool path.
  - T5: `KeepingAuthError` from `get` → `isError:true` with byte-identical D-25 wording.
  - T6: limit default — URL contains `limit=200`, `from=2026-06-09`, `to=2026-06-09` (to defaults to from per spec).
  - T7: limit cap — `limit: 5000` rejected by Zod (`max: 1000`); mock client never called.
  - T8: `tools/list` reports `annotations.readOnlyHint === true` plus the other three flags (READ-03 universal coverage across all five tools).

**Total project test results:** 50/50 across 8 files (3 Phase 1 logger + 6 Plan 02-01 errors + 15 Plan 02-02 client + 4 Plan 02-02 me + 4 Plan 02-03 organisations + 5 Plan 02-03 projects + 5 Plan 02-03 tasks + 8 Plan 02-04 entries-list).

## Local Smoke Simulation (pre-CI verification)

Ran the new smoke step end-to-end on the developer machine (Windows 11, bash via Git Bash, Node 22):

```
---- STDOUT ----
{"result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"keeping-mcp","version":"0.1.0"}},"jsonrpc":"2.0","id":1}
---- STDERR ----

---- EXIT 0 ----
---- PARSE FIRST FRAME ----
OK: serverInfo.name= keeping-mcp protocolVersion= 2025-11-25
Initialize smoke PASSED (local simulation)
```

All three CI assertions hold:
1. **Stdout is exactly one valid JSON-RPC frame** (jsonrpc=2.0, id=1, result populated).
2. **Stderr is empty** — the fake token never leaks (AUTH-03 holds).
3. **First frame is a valid initialize response** with `serverInfo.name="keeping-mcp"` and `protocolVersion="2025-11-25"`.

The exact "Initialize smoke PASSED" wording from a green CI run will be appended to STATE.md after the next push (verifier note: this is a run-time gate, not a build-time gate; the CI matrix is the witness).

## Files Created/Modified

- `src/tools/entries-list.ts` (NEW, 88 lines) — `registerEntriesList(server, client): void`. Zod input with regex-validated dates + integer-bounded limit; handler does resolveOrgId → URLSearchParams → client.get → top-level normalisation → JSON.stringify; SAFE-04 envelope via `toIsErrorContent` in catch.
- `test/tools/entries-list.test.ts` (NEW, 225 lines) — 8 InMemoryTransport tests; T1 specifically encodes the D-34 raw pass-through invariant via custom_field_x.
- `src/server.ts` (MODIFIED) — new import `registerEntriesList` (alphabetically sorted as first import to satisfy biome's organize-imports default); new `registerEntriesList(server, client);` call after `registerTasks(server, client);`; trailing comment updated to reflect Phase 2 source-code surface is now complete.
- `.github/workflows/ci.yml` (MODIFIED) — appended a new smoke step named "Smoke test — MCP initialize handshake produces only valid JSON-RPC on stdout" with `shell: bash`, fake token `kp_test_FAKE_token_value`, protocolVersion `2025-11-25`, and three structural assertions.

## Decisions Made

### D-34 strict reading: top-level normalisation only

The plan's `<interfaces>` block was explicit: `const entries = Array.isArray(raw) ? raw : (raw.entries ?? []);` followed by `const payload = { entries, count: entries.length };`. That code path discards wrapper fields like `meta` — which IS a form of pass-through-loss at the outer envelope. The justification is in the plan's Test 2 spec: *"We're not asserting `meta` preservation; we're asserting the inner items pass through unchanged."* The discriminator is array-shape, not body inspection. If Phase 3 later wants to expose `meta` (e.g., for pagination), it can extend the wire shape without breaking D-34's promise about the inner items.

### Test 3 (date regex rejection) accepts either failure mode

The MCP SDK validates tool arguments against the Zod input schema at the protocol layer. Different SDK versions surface the rejection differently — some throw a protocol-level error from `client.callTool`, others return `{ isError: true, content: [...] }`. The test accepts either: a try/catch wrapping the call plus an `isError` check. The contract is "the mock client must never be called" — that's the real invariant (input validation runs BEFORE the handler does any I/O). On the SDK version in this project (1.29.0), the call throws `McpError: Invalid arguments`. Test 3 captures this without coupling to the exact SDK behaviour.

### Import order in src/server.ts

Biome's organize-imports default sorts named imports alphabetically. `registerEntriesList` sorts before `registerMe`, so the import block now reads:

```typescript
import { registerEntriesList } from "./tools/entries-list.js";
import { registerMe } from "./tools/me.js";
import { registerOrganisations } from "./tools/organisations.js";
import { registerProjects } from "./tools/projects.js";
import { registerTasks } from "./tools/tasks.js";
```

The CALL order inside `createServer` remains the natural execution order (me → organisations → projects → tasks → entries-list), which matches how tools are introduced through the codebase and matches the plan's stated "Final order".

### CI step structural-assertion vs regex-assertion

Assertion 3 in the new smoke step inspects parsed JSON fields (`r.jsonrpc`, `r.id`, `r.result.serverInfo.name`, `r.result.protocolVersion`) rather than greps the stringified response. This survives capability-block changes that don't affect the boot contract (e.g., when Phase 3 declares additional capabilities). The only field that's checked for exact equality is `serverInfo.name === "keeping-mcp"` — that's the package-identity check; if the package is ever renamed, the smoke is supposed to catch it.

## Deviations from Plan

**None.** Plan executed as written. Both tasks landed on the exact wire shape, exact Zod schema, exact CI assertions, and exact byte-identical wordings specified.

Minor formatting note: biome's organize-imports rearranged the import order in `src/server.ts` (alphabetical), but the plan did not specify a particular import order — only the call order. The biome rearrangement was applied transparently during `npx biome check .` and folded into the same GREEN commit.

## Issues Encountered

None. The RED commit failed at module-resolution exactly as expected; the GREEN commit passed all 8 tests on first run; tsc/biome/vitest all green on first run; local smoke simulation matched all three CI assertions on first run.

## User Setup Required

None — no external service configuration. The Phase 1 `KEEPING_TOKEN` env var requirement remains the only user-facing setup, already documented in `CLAUDE.md`.

## Verification Gate (Plan-Level)

All five checks pass simultaneously:

1. `npx vitest run` → **50 tests passed across 8 files** (3 logger + 6 errors + 15 client + 4 me + 4 organisations + 5 projects + 5 tasks + 8 entries-list)
2. `npx tsc --noEmit` → **0 errors**
3. `npx biome check .` → **0 errors** (26 files checked)
4. `npm run build` → **success**; `dist/bin/keeping-mcp.js` exists (15.42 KB) with shebang
5. Local smoke simulation: stdout is exactly one valid JSON-RPC frame, stderr is empty, first frame has `serverInfo.name="keeping-mcp"` + `protocolVersion="2025-11-25"`
6. CI workflow YAML structural validation: `node -e` line-extraction reports 9 steps in correct order; no tab characters; required substrings `MCP initialize handshake`, `2025-11-25`, `kp_test_FAKE_token_value` all present

Trust-but-verify grep:
```
grep -rn "process.stdout.write\|console.log" src/ bin/
```
Returns zero matches (biome `noConsole` enforces, but spot-checked).

```
grep -c "^  register" src/server.ts
```
Returns `5` — all five Phase 2 read tools registered (acceptance criterion).

## Threat Model Verification

| Threat ID | Mitigation status |
|-----------|-------------------|
| T-02-04-01 (Tampering: dates → URL) | **Mitigated.** Zod regex on `from`/`to` rejects any non-YYYY-MM-DD string before URL construction; `URLSearchParams.set()` handles encoding for `user_id`. Test 3 proves the regex gate fires before any I/O. |
| T-02-04-02 (Info Disclosure: dep prints to stdout at import time) | **Mitigated.** New CI smoke Assertion 1 catches non-JSON on stdout immediately across [ubuntu, windows] × [22, 24]. Local simulation already confirms zero stdout pollution from the current dep set. |
| T-02-04-03 (Info Disclosure: future code logs KEEPING_TOKEN) | **Mitigated.** New CI smoke Assertion 2 greps stderr for the fake token and fails CI if found. AUTH-03 regression gate now codified at the CI layer (was previously only an in-process unit test). |
| T-02-04-04 (DoS: year-long range returns 5-10 MB JSON) | **Mitigated.** Default limit 200, hard cap 1000 via Zod. Test 7 proves the cap fires. Tool description tells callers to narrow date range. Pagination deferred to Phase 3. |
| T-02-04-05 (Spoofing: malicious user_id) | **Accepted.** Token is scoped server-side; Keeping API enforces access control. v1 explicitly does not support admin-on-behalf-of writes (REQUIREMENTS.md Out of Scope). |

## Next Plan Readiness

Plan 02-05 (`scripts/probe-live.ts`) is unblocked:

- The exact URL `/organisations/${orgId}/time_entries?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=N` is now codified in `src/tools/entries-list.ts` — the probe script will use the same path verbatim so `LIVE-API.md` documents the URL the production tool actually hits.
- The wire-shape contract is locked: `Array.isArray(raw) ? raw : (raw.entries ?? [])`. Probe-live can capture both variants; whichever Keeping actually returns, the tool already handles it.
- `KeepingClient` (Plan 02-02) is fully exercised: identity cache, throttle, retry, resolveOrgId, error sanitisation. Probe-live can construct one directly.

Plan 02-06 (autonomous:false human-verify gate) inherits the open question recorded in Plan 02-03's "Note for LIVE-API.md" section — whether 404 truly distinguishes feature-disabled from `{ projects: [] }` empty success. The new `keeping_list_entries` tool does NOT have a graceful-empty branch (entries-list is per-request, not per-feature-flag), so this caveat doesn't extend to it.

No blockers, no carry-forward issues.

## TDD Gate Compliance

Plan's `tdd="true"` directive applied to Task 1. Git log shows the cycle:

- Task 1 RED: `0d51025 test(02-04): add failing tests for keeping_list_entries`
- Task 1 GREEN: `ad46059 feat(02-04): add keeping_list_entries tool with raw pass-through wire shape` (follows RED)
- Task 2 (no tdd directive, infra-only): `699f836 ci(02-04): assert MCP initialize handshake produces only valid JSON-RPC on stdout (D-15)`

No REFACTOR commits needed — biome's import-sort ran inside Task 1's GREEN step and was folded in, same convention as Plans 02-01 through 02-03.

## MVP+TDD Gate

MVP_MODE=true, TDD_MODE=true (per orchestrator init). Task 1 was behavior-adding (tdd="true" + `<behavior>` block + non-test source files: `src/tools/entries-list.ts`, `src/server.ts`). The gate was satisfied: the `test(02-04)` commit landed before `feat(02-04)`. Task 2 is CI-config-only (no source files, no `<behavior>` block, no tdd directive) and is exempt from the gate per the centralized behavior-adding predicate. No halt-and-report.

## Self-Check

- `src/tools/entries-list.ts` exists → FOUND
- `test/tools/entries-list.test.ts` exists → FOUND
- `src/server.ts` modified → confirmed via `git log --oneline -- src/server.ts`
- `.github/workflows/ci.yml` modified → confirmed via `git log --oneline -- .github/workflows/ci.yml`
- Commit `0d51025` exists → confirmed
- Commit `ad46059` exists → confirmed
- Commit `699f836` exists → confirmed
- `grep -c "^  register" src/server.ts` returns `5` → confirmed
- CI YAML contains "MCP initialize handshake" → confirmed
- CI YAML contains "2025-11-25" → confirmed
- CI YAML contains "kp_test_FAKE_token_value" → confirmed

## Self-Check: PASSED

---
*Phase: 02-read-tools-schema-discovery*
*Plan: 02-04-entries-list-ci-initialize-smoke*
*Completed: 2026-06-10*
