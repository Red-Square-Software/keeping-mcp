---
phase: 02-read-tools-schema-discovery
plan: 03
subsystem: mcp-server-tools
tags: [mcp-server, keeping-client, tool-registration, graceful-empty, feature-flags, identity, metadata, read-tools]

# Dependency graph
requires:
  - phase: 02-read-tools-schema-discovery
    plan: 02
    provides: KeepingClient (organisations cache, resolveOrgId, get<T>), createServer (registration seam), registerMe pattern, toIsErrorContent, KeepingApiError(status), MultiOrgError, KeepingAuthError
provides:
  - "src/tools/organisations.ts: registerOrganisations(server, client) — keeping_organisations tool, raw org list pass-through (IDENT-02)"
  - "src/tools/projects.ts: registerProjects(server, client) — keeping_projects tool with 404 graceful-empty (META-01)"
  - "src/tools/tasks.ts: registerTasks(server, client) — keeping_tasks tool with 404 graceful-empty (META-02)"
  - "src/server.ts createServer: now wires four read tools (me, organisations, projects, tasks) — only keeping_list_entries remains for Plan 02-04"
affects: [02-04 (entries-list tool drops into the same registration seam; CI initialize-smoke can assert four-tool listing too), 02-05 (probe-live script will hit the same /projects + /tasks endpoints and confirm whether 404 truly distinguishes feature-disabled from empty), 02-06 (LIVE-API.md note about graceful-empty trigger condition)]

# Tech tracking
tech-stack:
  added: []  # zero new dependencies; reuses everything from 02-01 + 02-02
  patterns:
    - "Pattern B (tool handler) extended: registerProjects / registerTasks demonstrate the conditional graceful-empty envelope — `if (err instanceof KeepingApiError && err.status === 404) return { content: [...] }` BEFORE the generic toIsErrorContent fallback. Status code is the discriminator, not body inspection."
    - "Sibling-pattern copy: src/tools/tasks.ts is a verbatim sibling of src/tools/projects.ts with only 'projects' → 'tasks' substitutions (URL path, tool name, title, feature-disabled message, description fragment, register function name)."
    - "Raw pass-through preserved: keeping_organisations returns the org list verbatim (including feature flags as raw fields per IDENT-02). No wrapper object, no field renaming."
    - "Annotation block carried forward from registerMe verbatim: readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:true on all three tools (READ-03 universal coverage)."
    - "TDD discipline carried forward: RED commit precedes GREEN per task; module-resolution failure is the canonical RED gate."

key-files:
  created:
    - "src/tools/organisations.ts"
    - "src/tools/projects.ts"
    - "src/tools/tasks.ts"
    - "test/tools/organisations.test.ts"
    - "test/tools/projects.test.ts"
    - "test/tools/tasks.test.ts"
  modified:
    - "src/server.ts"

key-decisions:
  - "Graceful-empty discriminator is HTTP status (404), not response body (META-01/02). The plan explicitly distinguished a feature-disabled 404 from a `{ projects: [] }` empty success — body inspection would conflate them. Status-only check keeps the discriminator deterministic and matches the plan's `<interfaces>` block."
  - "404 graceful-empty branch lives INSIDE the catch block, not as a separate try/catch. Pattern: catch (err) { if (err instanceof KeepingApiError && err.status === 404) return graceful-empty; return toIsErrorContent(err); }. Keeps the resolveOrgId path's MultiOrgError + KeepingAuthError handling identical across all four tools."
  - "Feature-disabled wording is byte-identical per plan: `Projects feature not enabled for this organisation.` / `Tasks feature not enabled for this organisation.`. Tests use `.toBe(...)` for exact match."
  - "Multi-org error test on keeping_organisations is a pass-through assertion: the tool does NOT itself call resolveOrgId, but the test simulates an upstream failure (organisations() throws MultiOrgError) to prove the same envelope reaches the in-memory client byte-identical to D-27 (IDENT-03 user-facing surface, mirroring Plan 02-02 Test 2)."

patterns-established:
  - "Three new sibling tools register inside createServer in source order immediately after registerMe; same try/catch + toIsErrorContent envelope; status-code-conditional graceful-empty in projects + tasks."

requirements-completed: [IDENT-02, META-01, META-02]
# IDENT-03 partial in 02-02 (keeping_me carries the multi-org error surface); now exercised on a second tool path (keeping_projects + keeping_tasks via resolveOrgId, and keeping_organisations via direct pass-through).
# READ-03 partial in 02-02 (keeping_me annotations); now extended to all four read tools — completion deferred until 02-04 ships keeping_list_entries.

# Metrics
duration: 4min
completed: 2026-06-10
---

# Phase 2 Plan 03: organisations-projects-tasks Summary

**Three more read tools ship as thin siblings of `keeping_me`, plugging into the same `createServer` seam: `keeping_organisations` pass-through the cached org list with feature flags raw, and `keeping_projects` + `keeping_tasks` resolve the org → GET `/organisations/:id/{projects,tasks}` → render JSON, with a status-code-conditional graceful-empty branch that returns a byte-identical "feature not enabled" note WITHOUT setting `isError` when the API returns 404.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-10T11:17:17Z
- **Completed:** 2026-06-10T11:21:30Z
- **Tasks:** 2 (Task 1 = organisations + 4 tests; Task 2 = projects + tasks + 10 tests)
- **Files created/modified:** 6 new + 1 modified

## Accomplishments

### keeping_organisations (Task 1 — `src/tools/organisations.ts`)

- `inputSchema: z.object({})` — zero inputs, Pitfall B compliance (empty wrapped object, not raw shape).
- Title: `"List organisations"`. Description names the feature flags explicitly (`projects, tasks, timesheet_mode`) so an MCP client can advertise capability discovery without needing to call `keeping_me`.
- Annotation block verbatim from `me.ts`: `readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:true`.
- Handler: single line — `const orgs = await client.organisations(); return { content: [{ type: "text", text: JSON.stringify(orgs, null, 2) }] };` inside the standard try/catch.
- Raw pass-through: no field renaming, no wrapper object. Feature flags (`projects`, `tasks`, `timesheet_mode`) survive verbatim per IDENT-02. Test 1 asserts `JSON.parse(content[0].text).toEqual(orgs)` exactly.

### keeping_projects (Task 2 — `src/tools/projects.ts`)

- `inputSchema: z.object({ organisation_id: z.string().optional() })` — same `.describe(...)` text as `me.ts` ("Override KEEPING_ORG_ID; required for multi-org tokens.").
- Handler: `await client.resolveOrgId(input.organisation_id)` → `await client.get<unknown>(\`/organisations/${orgId}/projects\`)` → render JSON.
- **Graceful-empty branch (META-01):** when the catch sees a `KeepingApiError` with `status === 404`, returns:
  ```typescript
  { content: [{ type: "text", text: "Projects feature not enabled for this organisation." }] }
  ```
  **WITHOUT** `isError: true`. All other errors (including 500s) fall through to `toIsErrorContent(err)`. Status code is the discriminator; body is not inspected.
- Not cached — fresh per call (D-23). Documented in the tool description.

### keeping_tasks (Task 2 — `src/tools/tasks.ts`)

- Verbatim sibling of `projects.ts`. Substitutions only:
  - URL path: `/organisations/${orgId}/tasks`
  - Tool name: `keeping_tasks`
  - Title: `"List tasks"`
  - Feature-disabled message: `"Tasks feature not enabled for this organisation."`
  - Description text: `"tasks feature is disabled"`
  - Function name: `registerTasks`
- Same status-code-conditional graceful-empty pattern (META-02).
- Same annotation block.

### createServer wiring (`src/server.ts`)

- Added two new imports: `registerOrganisations` (Task 1), then `registerProjects` + `registerTasks` (Task 2).
- Four `register*` calls in source order: `registerMe`, `registerOrganisations`, `registerProjects`, `registerTasks`. The trailing comment now reads "Plan 02-04 appends more register* calls here (keeping_list_entries)." reflecting the single remaining tool.

## Task Commits

Each task split into RED → GREEN per `tdd="true"`:

1. **Task 1 (RED):** `test(02-03): add failing tests for keeping_organisations` — `f865b44`
2. **Task 1 (GREEN):** `feat(02-03): add keeping_organisations tool` — `b14d3b2`
3. **Task 2 (RED):** `test(02-03): add failing tests for keeping_projects and keeping_tasks` — `44a5ec1`
4. **Task 2 (GREEN):** `feat(02-03): add keeping_projects and keeping_tasks tools with graceful-empty for feature-disabled orgs` — `4e7e806`

_TDD: each RED commit had its test file import from a module that did not exist yet — vitest failed at module-resolution time before any test body ran, per the RED gate convention carried forward from Plans 02-01 and 02-02._

## Test Results

- **keeping_organisations (test/tools/organisations.test.ts):** 4/4 expected, 4/4 pass.
  - T1: Happy path — `organisations()` returns `[{id:"org_abc", name:"Acme Studio", projects:true, tasks:false, timesheet_mode:"approval"}]`; `JSON.parse(content[0].text).toEqual(orgs)`. Feature flags preserved verbatim (IDENT-02 acceptance).
  - T2: `organisations()` throws `MultiOrgError([{id:"org_abc",name:"Acme"},{id:"org_xyz",name:"Beta"}])` → `isError:true` with byte-identical D-27 wording (IDENT-03 surface, mirroring Plan 02-02 Test 2 on `keeping_me`).
  - T3: `organisations()` throws `KeepingAuthError` → `isError:true` with byte-identical D-25 wording.
  - T4: `tools/list` reports `annotations.readOnlyHint === true` + all three other flags (READ-03).

- **keeping_projects (test/tools/projects.test.ts):** 5/5 expected, 5/5 pass.
  - T1: Happy path — `resolveOrgId` returns `"org_abc"`; `get("/organisations/org_abc/projects")` returns `[{id:"p-1",name:"Website"}]`; `isError` falsy; path-call recorded matches exactly `/organisations/org_abc/projects` (single call, no double-fetch).
  - T2 (META-01): `get` throws `new KeepingApiError(404, "Not Found")` → `isError` **falsy**, content text byte-identical to `"Projects feature not enabled for this organisation."`.
  - T3: `get` throws `new KeepingApiError(500, "boom")` → `isError:true`, message contains `"Keeping API error 500"`.
  - T4: `resolveOrgId` throws `MultiOrgError` → byte-identical D-27 wording (proves the resolveOrgId path's MultiOrgError reaches the InMemoryTransport client through projects.ts's catch).
  - T5: `tools/list` annotations check.

- **keeping_tasks (test/tools/tasks.test.ts):** 5/5 expected, 5/5 pass. Same five-test pattern as projects, substituting `tasks` everywhere. T2 asserts `"Tasks feature not enabled for this organisation."` byte-identical.

**Total project test results:** 42/42 across 7 files (3 Phase 1 logger + 6 Plan 02-01 errors + 15 Plan 02-02 client + 4 Plan 02-02 me tool + 4 Plan 02-03 organisations + 5 Plan 02-03 projects + 5 Plan 02-03 tasks).

## Files Created/Modified

- `src/tools/organisations.ts` (NEW, 46 lines) — `registerOrganisations(server, client): void`. Empty Zod input; pass-through handler.
- `src/tools/projects.ts` (NEW, 67 lines) — `registerProjects(server, client): void`. `organisation_id` Zod input; resolveOrgId → get → JSON; 404 graceful-empty branch inside catch.
- `src/tools/tasks.ts` (NEW, 67 lines) — `registerTasks(server, client): void`. Verbatim sibling of projects.ts.
- `src/server.ts` (MODIFIED) — three new imports, three new `register*` calls. Body grows from one register to four; the trailing comment updates to mention only `keeping_list_entries` as the remaining tool.
- `test/tools/organisations.test.ts` (NEW, 99 lines) — 4 InMemoryTransport tests.
- `test/tools/projects.test.ts` (NEW, 110 lines) — 5 InMemoryTransport tests.
- `test/tools/tasks.test.ts` (NEW, 110 lines) — 5 InMemoryTransport tests.

## Decisions Made

### Status-code-only discriminator for graceful-empty

The plan's `<interfaces>` block said explicitly: *"If the API instead returns `{ projects: [] }` (empty success), surface as a normal empty array inside the payload, NOT as a feature-disabled message. Distinguish by HTTP status, not body."* I implemented exactly that — the catch checks `err.status === 404`, never inspects the response body. An empty-success body never enters the catch (it's a 2xx response that goes through the happy path and renders as `[]` in the JSON payload). This keeps the discriminator deterministic across whatever shape Keeping eventually settles on — a future probe-live run could return `[]`, `null`, `{}`, `{ projects: [] }`, or `{ items: [] }` for an enabled-but-empty org and the tool's behaviour is identical: render whatever came back, raw. Only a 404 trips the feature-disabled note.

### Graceful-empty branch lives INSIDE the catch

Two structural shapes considered:

1. **Pre-emptive try/catch** around just `client.get`, with the 404 branch inside that inner catch, separate from the outer catch around `resolveOrgId`. Cleaner separation of concerns but doubles the try/catch surface in every tool.
2. **Single try/catch with conditional re-route inside** (chosen). One try wraps both `resolveOrgId` and `get`; the catch first checks the specific 404+KeepingApiError pattern, then falls through to the generic `toIsErrorContent` envelope. `MultiOrgError` thrown by `resolveOrgId` doesn't match the 404 condition so it routes correctly to the generic envelope.

Chose (2) for symmetry with `registerMe`. The structural cost of separate try/catches isn't worth the clarity gain when the catch is six lines and the discriminator is a single `instanceof + ===` check.

### Sibling-pattern copy for tasks.ts

The plan explicitly asked: *"copy `projects.ts` verbatim and substitute every occurrence."* I followed that literally — `tasks.ts` is structurally identical to `projects.ts` with six substitutions (URL path, tool name, title, feature-disabled message, description fragment, register function name). No abstraction layer was introduced. The duplication is intentional: it keeps each tool file self-contained and self-documenting, and the two tools' contracts may diverge in Phase 3 (e.g., if Keeping adds a `task` POST body with fields that `project` doesn't have). Premature abstraction would obscure that divergence point.

## Deviations from Plan

**Rule 3 (auto-fix blocking issue):** Test 5 in both `projects.test.ts` and `tasks.test.ts` used `get: async () => []` as a placeholder mock, which TypeScript correctly rejected: the `KeepingClient.get` signature is `<T>(path: string): Promise<T>`, and a literal `[]` widens to `never[]`, which is not assignable to a caller-chosen `T`. Both me.test.ts and the happy-path tests above used `get: async <T>(path: string): Promise<T> => returnValue as T;` to satisfy the generic. The fix was the same pattern in Test 5: `get: async <T>(): Promise<T> => [] as T`. Caught by `npx tsc --noEmit` before commit; fixed inside the same GREEN step.

**Biome auto-format (whitespace):** `src/tools/tasks.ts` had one nested content array (the 404 graceful-empty return) that biome's formatter compacted onto a single line (Plan 02-02 had the same pattern apply to `src/tools/me.ts`). `npx biome check --write` applied the fix; folded into the GREEN commit.

Neither is a deviation from the plan's intent — both are mechanical fixes inside the GREEN step, same convention as Plans 02-01 and 02-02.

## Issues Encountered

**Initial mock signature mismatch in Test 5** — see "Rule 3" entry above. Resolved by mirroring the generic-friendly pattern already used in Test 1 of each file.

No other issues. All four verification gates (vitest, tsc, biome, build) pass simultaneously after the GREEN commit.

## User Setup Required

None — no external service configuration. The Phase 1 `KEEPING_TOKEN` env var requirement remains the only user-facing setup, already documented in `CLAUDE.md`.

## Verification Gate (Plan-Level)

All five checks pass simultaneously:

1. `npx vitest run` → **42 tests passed across 7 files** (3 logger + 6 errors + 15 client + 4 me + 4 organisations + 5 projects + 5 tasks)
2. `npx tsc --noEmit` → **0 errors**
3. `npx biome check .` → **0 errors**
4. `npm run build` → **success**; `dist/bin/keeping-mcp.js` exists (12.85 KB) with shebang.
5. `src/server.ts` `createServer` body now contains four `register*` lines in source order: `registerMe`, `registerOrganisations`, `registerProjects`, `registerTasks`.

Trust-but-verify grep:
```
grep -rn "process.stdout.write\|console.log" src/ bin/
```
returns zero matches (biome `noConsole` enforces, but spot-checked).

## Note for LIVE-API.md (Plan 02-05/02-06 to confirm)

The 404-vs-`{ projects: [] }` distinction is a planning assumption that needs live verification:

- **Hypothesis:** A Keeping org with the projects feature disabled returns HTTP 404 on `/v1/organisations/:org_id/projects`.
- **Alternative behaviours the probe-live script should explicitly distinguish:**
  - 200 + `{ projects: [] }` from a feature-disabled org → our 404 branch would NOT fire; the tool would render `{"projects": []}` raw. This is technically not wrong (Plan's `<interfaces>` block says "empty success" should pass through), but it loses the user-friendly "feature not enabled" message.
  - 403 from a feature-disabled org → would fall through to `toIsErrorContent` as a real error. We'd want to handle this too.
  - 404 with a body that contains `feature_not_enabled` or similar — our status-only check works correctly; body shape doesn't matter.
- **Action for Plan 02-05/02-06:** When the probe-live script runs, capture the status code AND body for each of `/projects` and `/tasks` against an org known to have the feature disabled. If the body-shape result differs from a 404, decide whether to extend the discriminator (add a 200+empty-array → "feature not enabled" branch) or leave the current behaviour. Record the observation in `LIVE-API.md` under a new section: "Graceful-empty trigger condition (META-01/META-02)."

The same caveat applies to `keeping_tasks`.

## Next Plan Readiness

Plan 02-04 (keeping_list_entries + CI initialize smoke) is unblocked:

- `createServer` already has the registration seam; Plan 02-04 adds one more `register*` call below `registerTasks`.
- The tool-handler pattern (try { resolveOrgId + client.get } catch { conditional graceful-empty or toIsErrorContent }) is now an established Pattern B variant — Plan 02-04 can choose the projects/tasks shape or the me shape depending on whether entries-list has a feature-disabled state.
- CI initialize-smoke can now assert the `tools/list` returns four named tools (`keeping_me`, `keeping_organisations`, `keeping_projects`, `keeping_tasks`) before Plan 02-04 adds the fifth.

Plans 02-05 and 02-06 (probe-live + human-verify) inherit the question recorded in "Note for LIVE-API.md" above.

No blockers, no carry-forward issues.

## TDD Gate Compliance

Plan's `tdd="true"` directive applied to both tasks. Git log shows the cycle:

- Task 1 RED: `f865b44 test(02-03): add failing tests for keeping_organisations`
- Task 1 GREEN: `b14d3b2 feat(02-03): add keeping_organisations tool` (follows RED)
- Task 2 RED: `44a5ec1 test(02-03): add failing tests for keeping_projects and keeping_tasks`
- Task 2 GREEN: `4e7e806 feat(02-03): add keeping_projects and keeping_tasks tools with graceful-empty for feature-disabled orgs` (follows RED)

No REFACTOR commits needed — biome auto-format ran inside Task 2's GREEN step (whitespace) and the TS mock fix was folded in too, same convention as Plans 02-01 and 02-02.

## MVP+TDD Gate

MVP_MODE=true, TDD_MODE=true (per orchestrator init). Both tasks were behavior-adding (tdd="true" + `<behavior>` block + non-test source files). The plan-level gate was satisfied: both tasks have a `test(...)` commit landing before the corresponding `feat(...)` commit. No gate trips. No halt-and-report.

## Self-Check

- `src/tools/organisations.ts` exists → FOUND
- `src/tools/projects.ts` exists → FOUND
- `src/tools/tasks.ts` exists → FOUND
- `test/tools/organisations.test.ts` exists → FOUND
- `test/tools/projects.test.ts` exists → FOUND
- `test/tools/tasks.test.ts` exists → FOUND
- `src/server.ts` modified → confirmed via `git log --oneline -- src/server.ts`
- Commit `f865b44` exists → confirmed
- Commit `b14d3b2` exists → confirmed
- Commit `44a5ec1` exists → confirmed
- Commit `4e7e806` exists → confirmed

## Self-Check: PASSED

---
*Phase: 02-read-tools-schema-discovery*
*Plan: 02-03-organisations-projects-tasks*
*Completed: 2026-06-10*
