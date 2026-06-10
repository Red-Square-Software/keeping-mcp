---
phase: 02-read-tools-schema-discovery
plan: 05
subsystem: probe-live-tooling
tags: [scripts, probe-live, anonymise, schema-discovery, timer-probe, q1-contingency, tdd]

# Dependency graph
requires:
  - phase: 02-read-tools-schema-discovery
    plan: 04
    provides: KeepingClient (resolveOrgId + get + throttle + retry + sanitisation), keeping_list_entries URL shape codified in src/tools/entries-list.ts so the probe reuses it verbatim, loadConfig fail-fast pattern + createLogger redaction, biome noConsole convention, vitest InMemoryTransport baseline (carry-forward only — this plan doesn't use it).
provides:
  - "scripts/probe-live.ts: one-shot live API probe — ANONYMISE_KEYS (size === 6), anonymise() walker (depth-first denylist redaction), main() flow capturing three timer probes in parallel + /v1/users/me path probe + one time_entries call + anonymised fixture writer + LIVE-API.md (7 sections) writer."
  - "test/scripts/anonymise.test.ts: 9-test suite covering top-level, nested, array, all-six-denylist, primitive-preservation, empty-container, root-primitive, and the ANONYMISE_KEYS.size === 6 drift guard."
  - "package.json scripts.probe-live: 'tsx --env-file-if-exists=.env scripts/probe-live.ts' (Pitfall D + H)."
affects: [02-06 (human-verify checkpoint; user runs `npm run probe-live` with real KEEPING_TOKEN, reviews .live-capture-raw.json vs the anonymised fixture, commits LIVE-API.md + the fixture, applies the REQUIREMENTS-update block, decides Q1 contingency code change in src/keeping/client.ts based on the /v1/users/me path probe section), 03 (TIMER-01/02 inclusion contingent on the LIVE-API.md Timer endpoint result section; KeepingClient.me() path commitment frozen after 02-06 reads /v1/users/me section)]

# Tech tracking
tech-stack:
  added: []   # zero new deps; uses node:fs/promises + node:path stdlib only
  patterns:
    - "Probe-script archetype: top-level script that reuses loadConfig + createLogger + KeepingClient verbatim, never spins up McpServer. Stderr-only progress via console.error (biome noConsole allowance). Strict isolation — bin/ and src/ untouched in this plan."
    - "Anonymisation walker (denylist): D-35 step 3 implemented as a Set<string> + depth-first map. Test 9 (ANONYMISE_KEYS.size === 6) is the drift guard for T-02-05-02 (Information Disclosure: denylist misses new field) — adding a key without revisiting CONTEXT.md trips the test."
    - "Q1 contingency evidence pattern: raw fetch (NOT client.me()) to /v1/users/me captures the status code without poisoning the KeepingClient cache or letting a 401 abort the rest of the probe. The captured status feeds the LIVE-API.md `## /v1/users/me path probe` section that Plan 02-06 Task 3 reads to decide whether to switch KeepingClient.me() to the org-scoped form."
    - "Pre-check + loadConfig() double layer: probe-specific stderr message fires BEFORE loadConfig, then loadConfig runs as the regular env validator. Both messages may appear in some edge cases — that's intentional; the probe-specific one is the user's primary cue and matches the success-criteria byte-identical wording."
    - "Entry-point guard via process.argv[1] containing 'probe-live': prevents main() from auto-firing when vitest imports the module to test the anonymise exports. Standard ESM 'main module' pattern without depending on import.meta.url which has TS verbatimModuleSyntax friction."
    - "TDD RED gate carry-forward: the test file imports `../../scripts/probe-live.js` before the source file exists. Vitest reports 'Cannot find module ../../scripts/probe-live.js' — same canonical RED gate seen across plans 02-01..02-04."

key-files:
  created:
    - "scripts/probe-live.ts"
    - "test/scripts/anonymise.test.ts"
    - ".planning/phases/02-read-tools-schema-discovery/02-05-SUMMARY.md"
  modified:
    - "package.json"
    - "tsconfig.json"

key-decisions:
  - "Anonymisation = denylist, not allowlist (T-02-05-02). RESEARCH §Anonymisation rejected the allowlist because it would silently drop new fields. Denylist surfaces unknowns to the developer's eyeballs at review time; Test 9 + the threat-model entry are the gates."
  - "Q1 contingency probe is a raw fetch, NOT client.me(). Reasoning: client.me() would (a) 401 the entire probe early on bad tokens, (b) poison the identity cache with whatever shape the org-scoped path returns, (c) hide the real status code behind KeepingAuthError. The raw fetch captures the verbatim HTTP status, which IS the evidence Plan 02-06 Task 3 needs."
  - "Pre-check + loadConfig() double layer for KEEPING_TOKEN. The plan's `<must_haves>` truth requires a probe-anchored fail-fast message ('[probe-live] KEEPING_TOKEN must be set...'). loadConfig() emits the project-standard generic message ('[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty'). The script does the probe-specific check first, then loadConfig. Both may appear in some edge cases — that was the planner's explicit guidance."
  - "Default last-week date uses `toISOString().slice(0, 10)`. The plan's <action> step 5d explicitly approved this for one-shot developer-run scripts (not server boundaries — Pitfall 5 still applies to tool handlers). Comment in the code memorialises why this is acceptable here."
  - "Entry-point guard pattern: `process.argv[1].includes('probe-live')`. Alternatives considered: `import.meta.url === pathToFileURL(process.argv[1]).href` (cleaner but adds an import + has Windows pathToFileURL friction), `require.main === module` (CJS, not ESM, doesn't work under tsx). The argv[1] substring check is the minimum-friction option that keeps vitest imports inert."
  - "tsconfig.json `include` extended with `scripts/**/*` so `npx tsc --noEmit` typechecks the probe alongside src/ and test/. Without it, the probe would only be checked by tsx at runtime — easier to drift. tsup config is untouched because the probe is NEVER bundled into dist/ (it's a developer-only npm script)."
  - "Strict source-isolation: bin/ and src/ untouched. The probe REUSES KeepingClient + loadConfig + createLogger by import, never modifies them. Plan 02-06 Task 3 may later modify src/keeping/client.ts based on the /v1/users/me path probe section — that's its plan, not this one."

patterns-established:
  - "Probe-script archetype reusable for future endpoint discovery (e.g., if Phase 4 needs a webhook-shape probe): top-level script under scripts/, reuses production loadConfig + createLogger + KeepingClient by import, never spawns a transport, writes raw to a gitignored path AND anonymised to a committed path."
  - "Denylist drift guard (Test 9 pattern): freeze the size of a Set<string> in a unit test. Adding/removing keys forces revisit of the CONTEXT/PROJECT doc that named them. Generalisable to any 'this list must stay locked' constraint."
  - "Q1 contingency probe-then-decide-later pattern: capture raw evidence (status code) into a structured LIVE-API.md section instead of branching code immediately. The next plan reads the section and makes the call. Keeps decision points explicit + reviewable."

requirements-completed: []
# Plan 02-05 ships TOOLING, not a new requirement satisfaction.
# READ-02 (raw-shape pass-through schema discovery) was marked Complete by Plan 02-04 (keeping_list_entries).
# This plan's `requirements: [READ-02]` field acknowledges the lineage but doesn't add new completion;
# the probe-live tool will be EXERCISED in Plan 02-06 against a real token, producing the LIVE-API.md
# that Phase 3 (write tools) consumes.
# TIMER-01 stays Pending — the probe ships, but won't be RUN until Plan 02-06.

# Metrics
duration: 4min
completed: 2026-06-10
---

# Phase 2 Plan 05: scripts/probe-live.ts + anonymise() walker Summary

**The one-shot live-API probe ships in tree: `scripts/probe-live.ts` (440 lines) bundles a fully-tested `anonymise()` denylist walker (9/9 tests, including the `ANONYMISE_KEYS.size === 6` drift guard) with the main flow that probes three timer endpoint paths in parallel via `Promise.allSettled` (D-31), runs a raw `/v1/users/me` GET to capture Q1 contingency evidence without poisoning the KeepingClient cache, captures one `time_entries` response for a configurable date range, writes a raw capture to the gitignored `.planning/research/.live-capture-raw.json`, writes an anonymised fixture to `test/fixtures/time-entry-response.sample.json` (D-35), and writes a human-readable `.planning/research/LIVE-API.md` with all seven mandated sections (Timer endpoint result, /v1/users/me path probe, Time entry response shape, Observed enum values, Pagination scheme observed, Error envelope observed, REQUIREMENTS update for Phase 3). `package.json` wires `npm run probe-live` to `tsx --env-file-if-exists=.env scripts/probe-live.ts` (Pitfall D + H). Strict source-isolation honored: bin/ and src/ are line-for-line untouched. The script + tested anonymiser are the deliverable for Plan 02-06's human-verify checkpoint; this plan ships the tool, Plan 02-06 ships the captured artefacts.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-10T11:45:49Z
- **Completed:** 2026-06-10T11:50:36Z (and SUMMARY shortly after)
- **Tasks:** 2 (Task 1 = anonymise() RED→GREEN with 9 tests; Task 2 = main flow + npm script wiring)
- **Files created/modified:** 3 new + 2 modified

## Accomplishments

### Task 1 — `anonymise()` walker + 9-test drift guard

- **`scripts/probe-live.ts` exports:**
  - `ANONYMISE_KEYS: ReadonlySet<string>` — the locked six: `description`, `project_name`, `task_name`, `client_name`, `user_name`, `user_email`.
  - `function anonymise(value: unknown): unknown` — depth-first walker; array → `value.map(anonymise)`; non-null object → key-by-key with `ANONYMISE_KEYS.has(k) ? "[REDACTED]" : anonymise(v)`; primitives/null pass through verbatim.
- **`test/scripts/anonymise.test.ts` (9 tests):**
  - Test 1: top-level denylisted key → "[REDACTED]"
  - Test 2: top-level non-denylisted key → verbatim
  - Test 3: nested object denylisted key → "[REDACTED]" at depth
  - Test 4: array of objects → element-wise redaction
  - Test 5: all six denylist keys at top level → all six "[REDACTED]"
  - Test 6: null + boolean + number preservation
  - Test 7: empty array / empty object → identity-equal
  - Test 8: primitives at root → identity-equal
  - Test 9: **drift guard** — `ANONYMISE_KEYS.size === 6` AND each of the six names present exactly once (T-02-05-02 mitigation)
- **RED → GREEN cycle:**
  - RED commit `8e7a886`: test file added; vitest failed with the canonical Phase 2 RED gate `Error: Cannot find module '../../scripts/probe-live.js'`.
  - GREEN commit `de0e9e9`: minimal scripts/probe-live.ts created with ONLY the anonymise exports + a `// TODO Task 2: main flow` comment. 9/9 tests pass; tsc + biome green; tsconfig.json extended to include `scripts/**/*`.

### Task 2 — Main flow + `npm run probe-live` wiring

- **`scripts/probe-live.ts` extended** to 440 lines total. Structure (top to bottom):
  1. File-header comment block — owns documentation for the entire D-30..D-37 + D-35 contract.
  2. Imports: `node:fs/promises` (mkdir, writeFile), `node:path` (dirname), `../src/config.js` (loadConfig), `../src/keeping/client.js` (KeepingClient), `../src/logger.js` (createLogger).
  3. Exports: `ANONYMISE_KEYS`, `anonymise` (preserved from Task 1).
  4. Helpers:
     - `KEEPING_BASE = "https://api.keeping.nl/v1"`, `TIMEOUT_MS = 10_000`.
     - `type TimerProbe = { path; ok; status?; body?; error? }` — per-path envelope per CONTEXT line 149.
     - `type MeProbe = { path; ok; status }` — Q1 contingency record.
     - `writeJson(path, value)` — mkdir -p, write pretty-printed JSON with trailing newline.
     - `defaultLastWeek()` — `toISOString().slice(0, 10)` of `now - 7d` (acceptable per plan §5d note).
     - `probeTimerPath(path, token)` — wraps a single fetch with full try/catch + 4xx body capture + token-scrub redaction. Returns a `TimerProbe`.
     - `buildLiveApiNotes(probes, meProbe, entries, from, to, orgId)` — emits the **seven mandated sections** as a single string.
  5. `main()`:
     - **a.** Pre-check `!process.env.KEEPING_TOKEN` → emits the byte-identical `[probe-live] KEEPING_TOKEN must be set in env or .env before running probe-live\n` to stderr + `process.exit(1)`.
     - **b.** `loadConfig()` runs as the regular validator for the rest of env.
     - **c.** `createLogger(token, level)` + `new KeepingClient(token, log)`.
     - **d.** `client.resolveOrgId()` (env / single-org / MultiOrgError).
     - **e.** `console.error("[probe-live] probing against organisation_id=${orgId}")`.
     - **f.** `Promise.allSettled` over `probeTimerPath` for the three D-31 paths: `/v1/organisations/${orgId}/timers`, `/v1/organisations/${orgId}/timers/current`, `/v1/organisations/${orgId}/time_entries?running=true`. Logs `[probe-live] timer probe ${i+1}/3: ${path} -> ${status}` for each.
     - **f-bis.** Raw `fetch` to `/v1/users/me` (NOT client.me()) — captures `meProbe = { path, ok, status }`. Logs `[probe-live] /v1/users/me path probe -> ${status}`. Q1 contingency evidence.
     - **g/h.** `from = process.env.PROBE_FROM ?? defaultLastWeek()`, `to = process.env.PROBE_TO ?? from`. Logs `[probe-live] capturing time_entries from=${from} to=${to}`. Calls `client.get("/organisations/${orgId}/time_entries?from=${from}&to=${to}")`.
     - **i.** `writeJson(".planning/research/.live-capture-raw.json", { captured_at, organisation_id, timers, users_me_probe, time_entries })` — gitignored per D-37.
     - **j.** `writeJson("test/fixtures/time-entry-response.sample.json", anonymise(entries))` — committed by Plan 02-06.
     - **k/l.** `writeFile(".planning/research/LIVE-API.md", buildLiveApiNotes(...))` — committed by Plan 02-06.
     - **m.** Final stderr progress lines matching the interfaces block.
  6. Entry-point guard: `process.argv[1].includes("probe-live")` → run `main()` with `.catch((err) => stderr + exit 1)`. Vitest imports stay inert.
- **LIVE-API.md sections written by `buildLiveApiNotes`:**
  1. `## Timer endpoint result` — per-path status; `**WINNING PATH**` annotation if any 200; `"All three timer paths returned 404. TIMER-01 is deferred from v1 per D-32."` if every probe was 404.
  2. `## /v1/users/me path probe` — `Status: N.` + decision line: 200 → no change; 404 → switch to org-scoped form; other → investigate. **This is the section Plan 02-06 Task 3 reads** to decide whether to apply the Q1 contingency code patch.
  3. `## Time entry response shape` — `Top-level shape: array of N items.` or `object with key 'entries' containing N items.`, then first-item keys with `typeof` each value.
  4. `## Observed enum values (purpose, timesheet_mode)` — distinct `purpose` values; timesheet_mode marked as manual-review (organisation cache not re-fetched in this plan to keep the script minimal).
  5. `## Pagination scheme observed` — searches top-level for `meta`, `pagination`, `next_cursor`, `links`, `page`, `total`; reports what was present.
  6. `## Error envelope observed` — lists each non-ok timer probe with path + status + sanitised error.
  7. `## REQUIREMENTS update for Phase 3` — code-fenced literal block telling Plan 02-06 exactly what line to substitute in REQUIREMENTS.md (`TIMER-01 | Phase 3 | verified — endpoint <path>` OR `TIMER-01 | Phase 3 | deferred — 404 on all probes`).
- **`package.json`:** new `scripts.probe-live` set to `"tsx --env-file-if-exists=.env scripts/probe-live.ts"` — exact value per Pitfall D + H.
- **No bin/ or src/ modifications.** Strict isolation per `<success_criteria>` last bullet.

## Task Commits

Task 1 follows the plan's `tdd="true"` directive (RED → GREEN):

1. **Task 1 (RED):** `test(02-05): add failing tests for anonymise walker` — `8e7a886`
2. **Task 1 (GREEN):** `feat(02-05): add anonymise walker for probe-live` — `de0e9e9`
3. **Task 2:** `feat(02-05): add probe-live script for timer endpoint + time-entry schema capture` — `f82365b`

RED gate output (canonical for Phase 2):

```
Error: Cannot find module '../../scripts/probe-live.js' imported from C:/Users/Bart/Source/keeping-mcp/test/scripts/anonymise.test.ts
```

Same gate convention carried forward from Plans 02-01, 02-02, 02-03, 02-04.

## Test Results

- **anonymise() (test/scripts/anonymise.test.ts):** 9/9 expected, **9/9 pass**.
- **Full project:** **59/59 tests across 9 files** (3 logger + 6 errors + 15 client + 4 me + 4 organisations + 5 projects + 5 tasks + 8 entries-list + 9 anonymise).

## Manual Fail-Fast Smoke Output

Ran `npm run probe-live` with `KEEPING_TOKEN` unset (Verification gate item 6). No real API call attempted — script aborts at the pre-check.

```
$ unset KEEPING_TOKEN; npm run probe-live > /tmp/probe_stdout 2>/tmp/probe_stderr; echo $?
1
---STDOUT (npm header only, no script output)---
> keeping-mcp@0.1.0 probe-live
> tsx --env-file-if-exists=.env scripts/probe-live.ts
---STDERR---
.env not found. Continuing without it.
.env not found. Continuing without it.
[probe-live] KEEPING_TOKEN must be set in env or .env before running probe-live
```

The probe-specific message is byte-identical to `<must_haves>` wording: `[probe-live] KEEPING_TOKEN must be set in env or .env before running probe-live`. Exit code is `1`. The two `.env not found. Continuing without it.` lines are emitted by `tsx --env-file-if-exists` itself — that's the friendly Pitfall D behavior; in production use (Plan 02-06 with a real `.env`) those lines disappear.

## Files Created/Modified

- `scripts/probe-live.ts` (**NEW, 440 lines**) — exports `ANONYMISE_KEYS` (size 6, frozen-via-Set) + `anonymise()` walker; main flow with three parallel timer probes + raw `/v1/users/me` Q1 probe + time_entries capture + raw/anonymised file writers + LIVE-API.md 7-section emitter; entry-point guard via `process.argv[1].includes("probe-live")` keeps vitest imports inert.
- `test/scripts/anonymise.test.ts` (**NEW, 91 lines**) — 9 vitest tests including the `ANONYMISE_KEYS.size === 6` drift guard (Test 9 — T-02-05-02 mitigation).
- `.planning/phases/02-read-tools-schema-discovery/02-05-SUMMARY.md` (**NEW** — this file).
- `package.json` (**MODIFIED**) — `scripts.probe-live` added: `"tsx --env-file-if-exists=.env scripts/probe-live.ts"`. No other changes.
- `tsconfig.json` (**MODIFIED**) — `include` extended with `scripts/**/*` so `npx tsc --noEmit` typechecks the probe; existing entries unchanged.

**Confirmation no bin/ or src/ was modified:**

```
$ git diff HEAD~3 HEAD -- bin/ src/
(empty)
$ git status --short -- bin/ src/
(empty)
```

## Decisions Made

### Denylist over allowlist (T-02-05-02)

RESEARCH §Anonymisation rejected the allowlist because it would silently drop fields the developer didn't know to allow. The denylist surfaces new fields — the developer SEES them in the anonymised fixture during Plan 02-06's eyeball review and decides whether to add them to `ANONYMISE_KEYS`. Test 9 is the size-lock gate: adding a key changes the test, which is the planner's nudge to revisit CONTEXT.md §Specific Ideas line 148 and the threat-model entry before merging.

### Q1 contingency: raw fetch over client.me()

The plan explicitly called for a raw `fetch` to `/v1/users/me`, not `client.me()`. Three reasons:
1. **Cache poisoning** — `client.me()` would store whatever the global path returns into `meCache`, regardless of whether the org-scoped path is the "real" one for this org. A subsequent `client.me()` in `resolveOrgId`'s callers would return stale shape.
2. **Auth-error masking** — a 401 from `client.me()` becomes `KeepingAuthError` ("Keeping rejected the token..."), losing the actual HTTP status code that Plan 02-06 Task 3 needs to read.
3. **Probe-aborting** — the probe must continue regardless of the Q1 result; throwing through `client.me()` would short-circuit the rest of `main()`.

The raw fetch captures the verbatim integer status (200, 404, 401, etc.) into `meProbe`, which lands in both `.live-capture-raw.json` (under `users_me_probe`) and the LIVE-API.md `## /v1/users/me path probe` section.

### Pre-check + loadConfig() double layer

The `<must_haves>` truth specifies the byte-identical `[probe-live] KEEPING_TOKEN must be set in env or .env before running probe-live` message. `loadConfig()` already emits `[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty` (D-05) but with a different prefix. The script does the probe-specific check first — the message the developer needs — then falls into `loadConfig()` for the regular env validation. Per the plan's `<action>` step 5a, both messages may appear in some edge cases; the probe-specific one is the primary cue and fires before loadConfig is reached.

### Entry-point guard via `process.argv[1].includes("probe-live")`

The anonymise unit tests import `ANONYMISE_KEYS` + `anonymise` from `scripts/probe-live.ts`. Without an entry-point guard, the bare `main().catch(...)` at the bottom of the file would fire during the import — vitest would attempt live HTTP calls. The guard checks `process.argv[1]` (the script being executed) for the substring `probe-live`; under vitest the argv[1] is the vitest runner binary, so the check returns false and `main()` stays inert.

Alternatives weighed:
- `import.meta.url === pathToFileURL(process.argv[1]).href` — cleanest ESM idiom but requires importing `pathToFileURL` and dealing with Windows path normalisation friction (drive letter case, forward vs back slashes).
- `require.main === module` — CJS-only, doesn't work under ESM / tsx.
- The argv[1] substring check has the lowest friction surface and is robust against both `npm run probe-live` and direct `tsx scripts/probe-live.ts` invocation.

### Default-last-week uses `toISOString().slice(0, 10)`

The plan's `<action>` step 5d explicitly approved this for one-shot scripts, with a comment in the code memorialising why. Pitfall 5 (Europe/Amsterdam timezone) applies to **tool handlers** that turn user intent into wire format — not to a developer-run probe whose date range the developer eyeballs in the stderr line before any capture is committed.

### `tsconfig.json` extended, `tsup.config.ts` untouched

`include` adds `scripts/**/*` so `npx tsc --noEmit` typechecks the probe at every CI run. `tsup.config.ts` is **not** changed because the probe is never bundled into `dist/` — it's a developer-only npm script that runs from source via `tsx`. The build artefact remains `dist/bin/keeping-mcp.js` and only that.

### Strict source-isolation

Per `<success_criteria>` last bullet: "No production code path (bin/, src/) is touched by this plan — strict isolation." The probe reuses `loadConfig`, `createLogger`, and `KeepingClient` by import only. Any code change to `src/keeping/client.ts` (the Q1 contingency switch) is Plan 02-06's responsibility, not this one. Verified via `git diff HEAD~3 HEAD -- bin/ src/` returning empty.

## Deviations from Plan

**None.** Plan executed as written. The two tasks landed on the exact wire shape, exact denylist, exact pre-check wording, exact `tsx --env-file-if-exists` flag, exact seven LIVE-API.md sections, and exact `Promise.allSettled` parallelism specified in `<must_haves>` and the `<acceptance_criteria>` sections.

One minor formatter pass: `npx biome check --write` made cosmetic line-break reformatting to a few `lines.push(...)` calls in `buildLiveApiNotes` (lines pushed at >100 char width). No semantic change. Folded into Task 2's GREEN commit.

One small TS-friendliness tweak: the `for (let i = 0; ...)` loop over `probes` casts `probes[i] as TimerProbe` because TS doesn't narrow `array[i]` to non-undefined under strict mode. The cast is sound — `probes.length === timerPaths.length === 3` by construction.

## Issues Encountered

None blocking. Biome flagged three `lines.push(...)` calls for line-width >100; auto-fixed by `biome check --write`. tsc green on first compile; vitest 9/9 on first run; build green; manual fail-fast smoke matches the byte-identical message on first try.

## User Setup Required

**None for THIS plan.** The plan ships the script, doesn't run it. The user setup (real `KEEPING_TOKEN`, optional `KEEPING_ORG_ID`, optional `PROBE_FROM` / `PROBE_TO`) is documented in the plan's `user_setup` frontmatter and is the gate for Plan 02-06 (the next plan).

## Verification Gate (Plan-Level)

All six checks pass simultaneously per the plan's `<verification>` block:

1. `npx vitest run` → **59 tests passed across 9 files** (50 pre-existing + 9 new anonymise).
2. `npx tsc --noEmit` → **0 errors** (with `scripts/**/*` now in `include`).
3. `npx biome check .` → **0 errors** (28 files checked, including the new `scripts/probe-live.ts` and `test/scripts/anonymise.test.ts`).
4. `npm run build` → **success**; `dist/bin/keeping-mcp.js` exists (15.42 KB) with shebang. `scripts/probe-live.ts` is **NOT** bundled (developer-only).
5. `node -e "require('./package.json').scripts['probe-live']"` returns `tsx --env-file-if-exists=.env scripts/probe-live.ts` — exact value, Pitfall D + H compliant.
6. Manual smoke: `KEEPING_TOKEN` unset + `npm run probe-live` → stderr line `[probe-live] KEEPING_TOKEN must be set in env or .env before running probe-live`, exit code `1`, no API call attempted.

Trust-but-verify grep:

```
$ grep "console\\.log" scripts/
(zero matches)
$ grep -c "Promise\\.allSettled" scripts/probe-live.ts
1
$ wc -l scripts/probe-live.ts test/scripts/anonymise.test.ts
  440 scripts/probe-live.ts
   91 test/scripts/anonymise.test.ts
```

`min_lines: 100` for scripts/probe-live.ts → 440 ✓.  
`min_lines: 40` for test/scripts/anonymise.test.ts → 91 ✓.  
`contains: "Promise.allSettled"` in scripts/probe-live.ts → matched ✓.  
`contains: "probe-live"` in package.json → matched ✓.

## Threat Model Verification

| Threat ID | Mitigation status |
|-----------|-------------------|
| T-02-05-01 (Information Disclosure: raw capture file committed accidentally) | **Mitigated.** `.gitignore` already blocks `.planning/research/.live-capture-raw.json` and `.planning/research/.probe-raw-*.json` (D-37, landed in Plan 02-01). The probe script writes the raw file at the gitignored path explicitly. `git status` after the plan run shows zero untracked files under `.planning/research/`. |
| T-02-05-02 (Information Disclosure: denylist misses a field) | **Mitigated.** `ANONYMISE_KEYS` is a `Set<string>` whose size is asserted `=== 6` by Test 9. Adding a key without updating CONTEXT.md trips the test. Plan 02-06's human-review step is the second gate — developer eyeballs the fixture before commit. |
| T-02-05-03 (Information Disclosure: KEEPING_TOKEN written into a log line) | **Mitigated.** All `console.error` calls in `scripts/probe-live.ts` are status-line strings that interpolate only `path`, `status`, `orgId`, `from`, `to` — never the token. Token-bearing fetch headers are constructed inline and never logged. `probeTimerPath` and the Q1 fetch both scrub the token from any captured error body via `.replaceAll(token, "***")` (Pitfall G defence-in-depth). |
| T-02-05-04 (Information Disclosure: LIVE-API.md includes raw field VALUES) | **Mitigated.** `buildLiveApiNotes` quotes `Object.keys(entries[0])` + `typeof` of each value, never the values themselves. The only value-level data in LIVE-API.md is (a) `meProbe.status` (an HTTP integer), (b) distinct `purpose` enum values (codes like `billable`, not PII), (c) a 1000-char preview of the FIRST 200 timer body (an internal Keeping resource, no time-entry PII). Plan 02-06's eyeball review is the backstop. |
| T-02-05-05 (Tampering: malicious `.env` supplies wrong KEEPING_TOKEN) | **Accepted** per plan's threat model. Developer would notice an unexpected `organisation_id` in the first stderr log line and abort. |
| T-02-05-06 (Information Disclosure: `--env-file-if-exists` reads unintended .env) | **Accepted** per plan's threat model. Standard Node.js behaviour; `.env` is in `.gitignore` (Phase 1 carry-forward). |

## Next Plan Readiness

Plan 02-06 (`autonomous: false` human-verify gate) is **unblocked**:

- `scripts/probe-live.ts` is in tree, typechecks, lints, and unit-tests pass. The user can run `KEEPING_TOKEN=... npm run probe-live` immediately.
- The `[probe-live]` fail-fast message is verified to fire when `KEEPING_TOKEN` is absent. The Plan 02-06 checkpoint instructions can assume the script will refuse to run with a missing token, so the user setup step (token + optional env vars) is mandatory.
- The seven LIVE-API.md sections are pre-defined by `buildLiveApiNotes`. Plan 02-06's reviewer task has a predictable shape to inspect.
- The Q1 contingency evidence section (`## /v1/users/me path probe`) tells Plan 02-06 Task 3 exactly which decision to make (no change / switch to org-scoped / investigate).
- The REQUIREMENTS-update copy-paste block at the bottom of LIVE-API.md gives the reviewer the exact line to substitute for the TIMER-01 row.

No blockers, no carry-forward issues.

## TDD Gate Compliance

Plan's `tdd="true"` directive applied to Task 1. Git log shows the cycle:

- Task 1 RED: `8e7a886 test(02-05): add failing tests for anonymise walker`
- Task 1 GREEN: `de0e9e9 feat(02-05): add anonymise walker for probe-live` (follows RED)
- Task 2 (no tdd directive on the main flow itself; the script's exported anonymise is the behavior-adding piece and is already covered): `f82365b feat(02-05): add probe-live script for timer endpoint + time-entry schema capture`

No REFACTOR commits needed — biome's auto-fix ran inside Task 2's session and was folded into the same GREEN commit, same convention as Plans 02-01..02-04.

## MVP+TDD Gate

`MVP_MODE=true`, `TDD_MODE=true` (orchestrator init). Task 1 is behavior-adding (`tdd="true"` + `<behavior>` block + non-test source file `scripts/probe-live.ts`); the gate was satisfied: the `test(02-05)` commit landed before `feat(02-05)`. Task 2 extends the same source file but the **net new behaviour is the live HTTP flow**, which has no unit test (it would require either live HTTP mocking — over-spec for a one-shot script — or running the script with a real token, which is Plan 02-06's job). This is consistent with the plan's design: Task 2's verification is structural (file exists, exports preserved, `npx tsc --noEmit` passes, fail-fast smoke fires) plus the regression check that the 9 anonymise tests still pass. No halt-and-report.

## Self-Check

- `scripts/probe-live.ts` exists → FOUND
- `test/scripts/anonymise.test.ts` exists → FOUND
- `.planning/phases/02-read-tools-schema-discovery/02-05-SUMMARY.md` exists → FOUND (this file)
- `package.json` modified → confirmed via `git log --oneline -- package.json` includes `f82365b`
- `tsconfig.json` modified → confirmed via `git log --oneline -- tsconfig.json` includes `de0e9e9`
- Commit `8e7a886` exists → confirmed via `git log --oneline | grep 8e7a886`
- Commit `de0e9e9` exists → confirmed via `git log --oneline | grep de0e9e9`
- Commit `f82365b` exists → confirmed via `git log --oneline | grep f82365b`
- `package.json` scripts.probe-live === "tsx --env-file-if-exists=.env scripts/probe-live.ts" → confirmed via node -e check
- `bin/` and `src/` unchanged in this plan → confirmed via `git diff HEAD~3 HEAD -- bin/ src/` returning empty

## Self-Check: PASSED

---
*Phase: 02-read-tools-schema-discovery*
*Plan: 02-05-probe-live-anonymise*
*Completed: 2026-06-10*
