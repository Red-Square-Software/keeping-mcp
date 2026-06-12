---
phase: 03-write-tools-conditional-timers
verified: 2026-06-12T10:00:00Z
status: human_needed
score: 6/6 truths verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/6
  gaps_closed:
    - "CR-01: classifyAmbiguous() missed Node 22 TimeoutError (write-gate.ts:104) — fixed by adding `err.name === \"TimeoutError\"` OR-arm; regression test W12 constructs real DOMException(\"timeout\", \"TimeoutError\")"
    - "CR-02: loose HH:mm regex /^\\d{1,2}:\\d{2}(:\\d{2})?(am|pm)?$/i in add-entry.ts (start+end), update-entry.ts (start+end), start-timer.ts (start) — replaced with strict /^([01]\\d|2[0-3]):[0-5]\\d$/ at all five callsites; negative-test cases for '1:30pm', '25:00', '9:5', '00:00:00' added in all three test files"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "End-to-end dry-run preview against the live Keeping API"
    expected: "With KEEPING_TOKEN set and KEEPING_REQUIRE_CONFIRM=true (default), keeping_add_entry returns a would_post envelope containing the FULL https://api.keeping.nl/v1/<orgId>/time-entries URL and the constructed body; calling again with confirm:true creates an entry visible in the Keeping UI."
    why_human: "Live API write semantics (real org_id, real token, Jortt visibility) cannot be exercised by unit tests; the locked OpenAPI fixture is the only programmatic ground truth and a live probe is the only way to verify the body shape lands without 422."
  - test: "Real timer lifecycle: start → status → stop → resume on the same entry"
    expected: "keeping_start_timer returns { timer_id }; keeping_timer_status reflects the running timer with elapsed_ms derived from X-Server-Time-Ms; keeping_stop_timer surfaces server_time_ms from the response header; keeping_resume_timer either returns the same timer_id (same-day) or a new one (Pitfall 6 day-rollover)."
    why_human: "TIMER-02's accuracy guarantee depends on the live X-Server-Time-Ms header value actually being present on each response. Unit tests mock the header; no automated check verifies Keeping actually emits it on POST /stop and POST /resume in production."
  - test: "Real ambiguous-timeout envelope under a forced network drop"
    expected: "Inducing a 10-second AbortSignal.timeout() on a real outbound call (e.g., by routing through a stalled proxy or unreachable host) yields the AMBIGUOUS_TEXT envelope `outcome unknown — verify with keeping_list_entries before retrying. (<err.message>)` — not the toIsErrorContent definite-fail shape."
    why_human: "W12 proves the classifier accepts DOMException(name=TimeoutError); only a live run proves the timeout actually exits the catch arm through the AMBIGUOUS_TEXT branch end-to-end through one of the six write tools."
---

# Phase 3: Write Tools + Conditional Timers Verification Report

**Phase Goal:** Users can propose, preview, confirm, and if needed correct or delete a time entry — all through MCP tool calls — with explicit human confirmation required before any data reaches Keeping.
**Verified:** 2026-06-12T10:00:00Z
**Status:** human_needed
**Re-verification:** Yes — after CR-01 (Plan 03-09) and CR-02 (Plan 03-10) gap closures

## Re-verification Delta

Prior VERIFICATION.md (2026-06-12T09:25Z) reported `gaps_found 4/6` with two BLOCKER gaps:

1. **CR-01 (Gap #1, Truth #2 / SC #2):** `classifyAmbiguous` at `src/keeping/write-gate.ts:104` only matched `err.name === "AbortError"`. Node 22's `AbortSignal.timeout()` throws `DOMException(name="TimeoutError")`, so real 10-second write timeouts fell through to definite-fail rather than the byte-locked `AMBIGUOUS_TEXT` envelope — exactly the WRITE-05 / D-3-16 scenario that mandates ambiguous classification.
2. **CR-02 (Gap #2, Truth #6 / SC #6 + Truths covering WRITE-01/02 + TIMER-01):** The regex `/^\d{1,2}:\d{2}(:\d{2})?(am|pm)?$/i` at five callsites in `add-entry.ts`, `update-entry.ts`, and `start-timer.ts` accepted `"1:30pm"`, `"25:00"`, `"9:5"`, and `"00:00:00"` — violating the D-3-28 strict 24-hour zero-padded HH:mm wire contract.

Both have been fixed and re-verified in the codebase:

| Gap | Fix Location | Verified Evidence |
| --- | ------------ | ----------------- |
| CR-01 | `src/keeping/write-gate.ts:104` | Line reads `if (err.name === "AbortError" \|\| err.name === "TimeoutError") return true;` (verified by Read). JSDoc updated. Regression test W12 in `test/keeping/write-gate.test.ts:199-208` constructs `new DOMException("timeout", "TimeoutError")` (the real Node 22 shape — not a synthetic `Object.assign` mock) and asserts `classifyAmbiguous(err) === true`. |
| CR-02 | `src/tools/add-entry.ts:90,95`; `src/tools/update-entry.ts:74,79`; `src/tools/start-timer.ts:89` | All five callsites now use `.regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:mm (24-hour, zero-padded)")` (verified by Read). Runtime regex check confirms `1:30pm`, `25:00`, `9:5`, `00:00:00` all return `false`; `00:00`, `13:45`, `23:59` all return `true`. Negative-test cases for all four rejection inputs present in `test/tools/add-entry.test.ts:414`, `test/tools/update-entry.test.ts:319`, `test/tools/start-timer.test.ts:316`. |

No regressions detected — all prior VERIFIED truths (1, 3, 4, 5) still hold; full test suite expanded from 162 → 206 tests and remains green.

## Goal Achievement

### Observable Truths (Phase 3 Success Criteria from ROADMAP.md)

| #   | Truth                                                                                                            | Status     | Evidence                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SC#1: `keeping_add_entry` without confirm returns `{would_post:{method,url,body}}` preview, zero API calls.       | VERIFIED   | `src/tools/add-entry.ts` routes through `previewOrCall`; `src/keeping/write-gate.ts:60-69` builds the preview without calling client.post. Tests W1, W2 in `test/keeping/write-gate.test.ts` assert preview shape + `calls === []`. 13 tests in `test/tools/add-entry.test.ts` pass. |
| 2   | SC#2: `keeping_add_entry` with confirm posts to `POST /{orgId}/time-entries`; writes do NOT auto-retry; ambiguous envelope on transient failure. | VERIFIED   | Path verified (`src/tools/add-entry.ts:184` builds `/${orgId}/time-entries`; ROADMAP wording `/v1/organisations/:org_id/time_entries` was pre-D-34-R nominal — superseded by the live OpenAPI mirror). `AMBIGUOUS_TEXT` byte-exact in `src/keeping/write-gate.ts:88`. **CR-01 closed:** `classifyAmbiguous` (`write-gate.ts:104`) now covers BOTH `AbortError` (manual cancel) AND `TimeoutError` (Node 22 `AbortSignal.timeout`). W12 regression test pins the real `DOMException(name="TimeoutError")` shape. |
| 3   | SC#3: update + delete follow same dry-run gate; delete returns `would_delete:<entry>`; all three carry `destructiveHint:true, idempotentHint:false`. | VERIFIED   | `src/tools/update-entry.ts:140-144` uses `previewOrCall` (PATCH). `src/tools/delete-entry.ts:102-126` inlines the GET-then-shape `would_delete` preview. Annotations on all three: lines 111-116 (update), 87-93 (delete), 128-134 (add). Delete description carries verbatim `**DESTRUCTIVE: permanently deletes the entry**` (line 82). Test 1 in `test/tools/delete-entry.test.ts` asserts `would_delete` equals fixtureEntry. |
| 4   | SC#4: `date` defaults to today in `Europe/Amsterdam` as `YYYY-MM-DD`; `Date.toISOString()` is NEVER used for date fields. | VERIFIED   | `src/keeping/date.ts:30-37` uses `Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" })` — no `.toISOString()`. Grep of `src/` finds two `toISOString` matches; both are forbidden-marker comments (`date.ts:18`, `add-entry.ts:10`) — zero runtime calls. `test/keeping/date.test.ts` covers DST cross-day rollover. `add-entry.ts:151` defaults `date = todayInAmsterdam()`; `start-timer.ts:141` same. |
| 5   | SC#5: `purpose` enum + `confirm` description mandates human-set-only. | VERIFIED   | Purpose is `z.enum(["work","break","special_leave","unpaid_leave","statutory_leave","sick_leave","work_reduction","trip"]).default("work")` in `add-entry.ts:58-72` and `start-timer.ts:69-83` per D-3-07 (which supersedes the original `billable`/`non_billable` wording — footnoted in ROADMAP line 110 and REQUIREMENTS WRITE-06). The `confirm` field on every write tool carries the verbatim D-3-12 description ("Set to true ONLY after a human has reviewed the would_post preview returned by a prior dry-run call. The MCP client (LLM) MUST NOT set this autonomously — wait for the human to type 'yes' / 'confirm'."). |
| 6   | SC#6: Timer tools ship: start returns `timer_id`, stop creates corresponding entry, elapsed time uses `X-Server-Time-Ms` (D-3-19 fallback acceptable). | VERIFIED   | start-timer correctly extracts `timer_id` via D-2.5-05a strict guard (`start-timer.ts:50-57, 164-167`). stop-timer reads `X-Server-Time-Ms` from `headers.get(...)` with `Number.isFinite` gate + fallback warn (`stop-timer.ts:145-155`). resume-timer mirrors that (`resume-timer.ts:167-177`). **CR-01 closed:** real write timeouts during timer operations now surface as AMBIGUOUS_TEXT (shared classifier). **CR-02 closed:** `start-timer.ts:89` HH:mm regex is now strict 24-hour zero-padded. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact                                | Expected                                                                    | Status     | Details |
| --------------------------------------- | --------------------------------------------------------------------------- | ---------- | ------- |
| `src/keeping/write-gate.ts`             | `previewOrCall`, `classifyAmbiguous`, `AMBIGUOUS_TEXT`                       | VERIFIED   | All three exports present; `AMBIGUOUS_TEXT` byte-exact; `previewOrCall` AND-gate correct; `classifyAmbiguous` now covers AbortError + TimeoutError + TypeError + 5xx (CR-01 closed). |
| `src/keeping/date.ts`                   | `todayInAmsterdam`, `nowInAmsterdamHHMM` pure helpers                       | VERIFIED   | Both exports present; pure (no I/O); injectable `now: Date`; `Intl.DateTimeFormat` correctly used. No `.toISOString()`. |
| `src/keeping/client.ts`                 | `requestWithHeaders<T>` + 204-tolerant rawFetch                              | VERIFIED   | `requestWithHeaders` lines 175-204; 204 branch lines 268, 305-307. |
| `src/tools/add-entry.ts`                | dry-run-gated POST tool with org-mode-aware body                            | VERIFIED   | All wiring correct (previewOrCall, destructiveHint:true, idempotentHint:false, purpose enum, date default, DST). HH:mm regex strict (CR-02 closed). |
| `src/tools/update-entry.ts`             | dry-run-gated PATCH tool, partial body, no immutable fields                 | VERIFIED   | Wiring correct; Zod strips date/purpose/user_id. HH:mm regex strict on both start+end (CR-02 closed). WR-05 advisory (no start+end+hours mutual-exclusion check) deferred to a follow-up plan; not blocking. |
| `src/tools/delete-entry.ts`             | inline-gated DELETE with `would_delete` GET enrichment                      | VERIFIED   | Inline dry-run gate (lines 102-126); confirm path delegates to `previewOrCall`; 204 → `{ok:true}` wrap (line 139). Description verbatim destructive marker. |
| `src/tools/start-timer.ts`              | POST /{orgId}/time-entries with body OMITTING end+hours                     | VERIFIED   | Object.keys discipline in body (lines 140-147) verified by Test 1+2. HH:mm regex strict on start (CR-02 closed). Ambiguous classifier now covers TimeoutError (CR-01 closed). |
| `src/tools/stop-timer.ts`               | PATCH /stop using `requestWithHeaders` + server_time_ms parsing             | VERIFIED   | Verb correct (PATCH per D-3-05 supersession of D-32-R's POST). Header parsing + fallback warn correct. Ambiguous classifier now covers TimeoutError (CR-01 closed). |
| `src/tools/resume-timer.ts`             | POST /resume using `requestWithHeaders` + server_time_ms parsing            | VERIFIED   | Verb POST (unchanged from D-32-R). Pitfall 6 surfaced in description. Ambiguous classifier now covers TimeoutError (CR-01 closed). |
| `src/server.ts`                         | Registers all 12 tools (6 reads + 6 writes) with `(server, client, config)` | VERIFIED   | Imports + register calls present. `config` parameter no longer prefixed `_`. |
| `test/keeping/write-gate.test.ts`       | Coverage of preview + classifyAmbiguous + AMBIGUOUS_TEXT                    | VERIFIED   | Tests W1-W11 unchanged; new W12 covers `new DOMException("timeout", "TimeoutError")` (Node 22 timeout shape). 12 tests in file. |
| `test/tools/add-entry.test.ts`          | Coverage including HH:mm negative cases                                     | VERIFIED   | REJECT_CASES `["1:30pm","25:00","9:5","00:00:00"]` applied to both `start` AND `end` (line 414). ACCEPT_CASES `["00:00","09:05","13:45","23:59"]` confirm strict regex passes valid inputs. Error message asserted to contain "HH:mm" and "24-hour". |
| `test/tools/update-entry.test.ts`       | Coverage including HH:mm negative cases                                     | VERIFIED   | Same REJECT/ACCEPT pattern (line 319), asserting Zod rejects all four bad cases on both start and end with entry_id present. |
| `test/tools/start-timer.test.ts`        | Coverage including HH:mm negative cases                                     | VERIFIED   | REJECT_CASES applied to `start` only (line 316) — start-timer has no end field. |
| `test/server.test.ts`                   | 12-tool sorted-name listTools smoke                                         | VERIFIED   | Asserts alphabetised 12-name list including all 6 writes. |

### Key Link Verification

| From                | To                              | Via                                    | Status   | Details |
| ------------------- | ------------------------------- | -------------------------------------- | -------- | ------- |
| add-entry tool      | KeepingClient.post              | previewOrCall (write-gate.ts)          | WIRED    | `src/tools/add-entry.ts:181` invokes `previewOrCall`; the gate routes to `client.post` on confirm. Test 1+2 in add-entry.test.ts assert path `/${orgId}/time-entries`. |
| update-entry tool   | KeepingClient.patch             | previewOrCall                          | WIRED    | Same pattern; PATCH path includes `/{entry_id}`. |
| delete-entry tool   | KeepingClient.get + .delete     | inline GET + previewOrCall             | WIRED    | Dry-run branch calls `client.get`; confirm branch routes through `previewOrCall` → `client.delete`. |
| start-timer tool    | KeepingClient.post              | previewOrCall                          | WIRED    | POST /{orgId}/time-entries; body strictly omits end+hours per D-3-06. |
| stop-timer tool     | KeepingClient.requestWithHeaders | inline gate + direct call              | WIRED    | PATCH /{orgId}/time-entries/{id}/stop; X-Server-Time-Ms read from returned Headers. |
| resume-timer tool   | KeepingClient.requestWithHeaders | inline gate + direct call              | WIRED    | POST /{orgId}/time-entries/{id}/resume; same header surfacing. |
| server.ts           | all 6 register* exports         | named imports + register calls          | WIRED    | listTools smoke pins all 12 names. |
| classifyAmbiguous   | AbortSignal.timeout reality     | err.name string match                  | WIRED    | **CR-01 closed.** Line 104 now checks `name === "AbortError" \|\| name === "TimeoutError"`. W12 constructs the real `DOMException(name="TimeoutError")` and asserts true. |
| start/end fields    | HH:mm wire shape                | Zod regex on input fields              | WIRED    | **CR-02 closed.** Five callsites now use strict `/^([01]\d|2[0-3]):[0-5]\d$/`. Negative tests reject `1:30pm`/`25:00`/`9:5`/`00:00:00`; positive tests accept `00:00`/`09:05`/`13:45`/`23:59`. |

### Data-Flow Trace (Level 4)

| Artifact             | Data Variable               | Source                                                              | Produces Real Data | Status |
| -------------------- | --------------------------- | ------------------------------------------------------------------- | ------------------ | ------ |
| add-entry response   | `result` from previewOrCall | client.post → rawFetch → live API                                   | Yes (live)         | FLOWING |
| delete-entry preview | `wouldDelete`               | client.get → live API                                                | Yes (live)         | FLOWING |
| stop-timer response  | `server_time_ms`            | headers.get("X-Server-Time-Ms") → fallback Date.now() + log.warn     | Yes; fallback path tested via mock-with-empty-headers | FLOWING |
| timer_id (start)     | `timer_id`                  | extractTimeEntry(result)?.id with three-clause Array.isArray guard   | Yes; drift → null | FLOWING |
| AMBIGUOUS_TEXT envelope | err.name routing        | classifyAmbiguous over real `DOMException(name="TimeoutError")`      | Yes (W12 regression) | FLOWING |

All data-flow tracing confirms wiring is genuine. The two gaps from the prior verification are now both closed at the wired-correctness level.

### Behavioral Spot-Checks

| Behavior                                                | Command                                                  | Result                | Status |
| ------------------------------------------------------- | -------------------------------------------------------- | --------------------- | ------ |
| Full test suite passes                                  | `npx vitest run`                                          | 19 files, 206 tests passed (3.05s) | PASS |
| TypeScript compiles                                     | `npx tsc --noEmit`                                        | exit 0, no output     | PASS |
| Biome lint clean                                        | `npx biome check src/ test/`                              | "Checked 40 files in 34ms. No fixes applied." | PASS |
| Build produces distributable artifact                   | `npm run build`                                           | `dist/bin/keeping-mcp.js 46.61 KB`, shebang `#!/usr/bin/env node` preserved | PASS |
| Strict HH:mm regex rejects all four CR-02 bad cases     | `node -e "/^([01]\d\|2[0-3]):[0-5]\d$/.test(...)"`        | `1:30pm:false`, `25:00:false`, `9:5:false`, `00:00:00:false`; valid `13:45/00:00/23:59:true` | PASS |
| Node 22 timeout DOMException is instanceof Error        | `node -e "const e=new DOMException('timeout','TimeoutError');console.log(e.name, e instanceof Error)"` | `name=TimeoutError instanceof Error=true` → matches the W12-tested code path | PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| (no shell probes in repo) | n/a | n/a | SKIPPED (no `scripts/*/tests/probe-*.sh` declared or found) |

### Requirements Coverage

| Requirement | Source Plan                | Description                                                                | Status   | Evidence |
| ----------- | -------------------------- | -------------------------------------------------------------------------- | -------- | -------- |
| WRITE-01    | 03-02, 03-08, 03-10        | `keeping_add_entry` creates a new entry                                    | SATISFIED | `src/tools/add-entry.ts` registers tool; tests pass; previewOrCall + confirm path verified; HH:mm validation tight (CR-02 closed). |
| WRITE-02    | 03-03, 03-08, 03-10        | `keeping_update_entry` edits existing entry                                | SATISFIED | `src/tools/update-entry.ts`; tests pass; PATCH partial semantics with date/purpose/user_id Zod-stripped; HH:mm validation tight (CR-02 closed). |
| WRITE-03    | 03-04, 03-08               | `keeping_delete_entry` deletes existing entry                              | SATISFIED | `src/tools/delete-entry.ts`; tests pass; 204-tolerant; `would_delete` enrichment verified. |
| WRITE-04    | 03-01, 03-02..05, 03-08    | `confirm: boolean` AND-gate dry-run with `{would_post: {method,url,body}}`  | SATISFIED | `previewOrCall` in `write-gate.ts:60-69`; consumed by all six tools. |
| WRITE-05    | 03-01, 03-02..08, 03-09    | No auto-retry on network errors; ambiguous envelope text                   | SATISFIED | AMBIGUOUS_TEXT verbatim. `classifyAmbiguous` now covers `AbortError`, `TimeoutError` (CR-01 closed via Plan 03-09), `TypeError`, and 5xx. W12 pins the Node 22 timeout shape. |
| WRITE-06    | 03-02, 03-03, 03-08        | `purpose` enum matches OpenAPI (8 values, default `work`)                  | SATISFIED | `add-entry.ts:58-72`, `start-timer.ts:69-83`. REQUIREMENTS.md WRITE-06 amended with D-3-07 footnote preserving historical wording. |
| WRITE-07    | 03-02..07, 03-08           | `destructiveHint: true`, `idempotentHint: false`; delete description warns | SATISFIED | All six write tools assert these annotations in their tests. delete-entry description contains verbatim `**DESTRUCTIVE: permanently deletes the entry**`. |
| WRITE-08    | 03-01, 03-02               | Date fields default to today in Europe/Amsterdam as `YYYY-MM-DD`; no `.toISOString()` | SATISFIED | `src/keeping/date.ts:30-37`; DST regression test in `test/keeping/date.test.ts`; grep confirms no runtime `.toISOString()` in `src/tools/`. |
| TIMER-01    | 03-05..09, 03-10           | Start returns `timer_id`; stop creates corresponding entry; resume verb POST | SATISFIED | All three tools exist and are wired. Ambiguous classifier covers timeouts (Plan 03-09); HH:mm regex strict on start (Plan 03-10). |
| TIMER-02    | 03-06, 03-07, 03-09        | `X-Server-Time-Ms` from response header for elapsed time                    | SATISFIED | `stop-timer.ts:145-155`, `resume-timer.ts:167-177`. Fallback to local clock with log.warn is acceptable per D-3-19. |

**Plan-frontmatter `requirements` IDs cross-referenced:** WRITE-01..08, TIMER-01, TIMER-02 all appear in 03-01..03-10 plan frontmatter and REQUIREMENTS.md traceability table marks all as Complete. No orphaned phase-3 requirements.

### Anti-Patterns Found

| File                          | Line | Pattern                                                                 | Severity | Impact |
| ----------------------------- | ---- | ----------------------------------------------------------------------- | -------- | ------ |
| src/keeping/client.ts         | 186-201 | Dead branches in requestWithHeaders retry plumbing (`method !== "GET" as string`) | WARNING  | Currently dead, but attractive nuisance — future maintainer broadening method type would think 429-sleep works. Advisory (WR-01) carried forward. |
| BASE URL                      | client.ts:32, write-gate.ts:24, delete-entry.ts:115, stop-timer.ts:119, resume-timer.ts:141 | `"https://api.keeping.nl/v1"` duplicated in 5 places | WARNING  | Drift risk; not currently broken. Advisory (WR-02) carried forward. |
| client.ts                     | 99-113 | meCache/orgsCache not promise-memoised; race-on-first-call possible    | WARNING  | Low-probability under stdio single-in-flight. Advisory (WR-03) carried forward. |
| update-entry.ts               | 128-138 | No Zod refine forbidding `hours` together with `start`/`end`           | WARNING  | Wasted API round-trip on confused input; mitigation deferred to API 422. Advisory (WR-05) carried forward. |
| date.ts                       | 46-53 | `sv-SE` midnight could emit `"24:00"` under some ICU builds            | INFO     | Node 22 + full-icu 73+ returns `"00:00"` reliably; risk theoretical. Advisory (WR-06) carried forward. |
| server.ts                     | 38   | `_log` parameter unused                                                 | INFO     | Reserved for future. Carries `_` prefix per biome convention. Advisory (IN-04) carried forward. |
| client.ts                     | 125  | `process.env.KEEPING_ORG_ID` read in `resolveOrgId` bypasses parsed config | INFO     | Phase 2 carry-forward; not introduced by Phase 3. Advisory (IN-01) carried forward. |
| stop-timer.ts/resume-timer.ts | 145, 167 | `"X-Server-Time-Ms"` magic string duplicated                            | INFO     | Trivial. Advisory (IN-02) carried forward. |

No `TODO`, `FIXME`, `XXX`, or `TBD` markers found in any Phase 3 source file. (Grep of `src/` returns zero matches.)

The two prior BLOCKER anti-patterns (`classifyAmbiguous` missing TimeoutError branch; loose HH:mm regex) are now removed from the codebase per Plans 03-09 and 03-10.

### Human Verification Required

Three live-API spot-checks remain — pure unit-test verification cannot exercise these end-to-end:

#### 1. End-to-end dry-run preview against the live Keeping API

**Test:** With `KEEPING_TOKEN` set and `KEEPING_REQUIRE_CONFIRM=true` (default), call `keeping_add_entry` with `{date:"2026-06-12", purpose:"work", start:"13:45", end:"15:15"}` via Claude Code. Inspect the returned `would_post` envelope. Then call again with `confirm:true`. Check Keeping UI for the new entry.
**Expected:** First call returns `{would_post:{method:"POST", url:"https://api.keeping.nl/v1/<your-orgId>/time-entries", body:{...}}}` and zero entries are created. Second call returns the created `{time_entry: {...}}` and the entry appears in the Keeping web UI for the supplied date.
**Why human:** Live API write semantics — real org_id, real token, Jortt visibility — cannot be exercised by unit tests. The locked OpenAPI fixture is the only programmatic ground truth and a live probe is the only way to verify the body shape lands without 422.

#### 2. Real timer lifecycle: start → status → stop → resume

**Test:** Call `keeping_start_timer` (with confirm). Note the `timer_id`. Call `keeping_timer_status` to confirm running. Call `keeping_stop_timer` (with confirm) using the `timer_id`. Then call `keeping_resume_timer`.
**Expected:** start returns `{timer_id: <number>}`; timer_status reflects `ongoing:true` with sensible elapsed; stop returns `{...time_entry, server_time_ms: <large positive int>}` (from `X-Server-Time-Ms` header); resume returns either the same id (same-day) or a new id (Pitfall 6 day-rollover) — never asserted equal to input.
**Why human:** TIMER-02's accuracy guarantee depends on the live `X-Server-Time-Ms` header actually being present on each response. Unit tests mock the header; no automated check verifies Keeping emits it on POST `/stop` and POST `/resume` in production.

#### 3. Real ambiguous-timeout envelope under a forced network drop

**Test:** Induce a 10-second `AbortSignal.timeout()` on a real outbound write call — e.g., point `KEEPING_BASE_URL` (if supported) or `/etc/hosts` at an unreachable IP, or set up a stalled-response proxy in front of `api.keeping.nl`. Call any of the six write tools with `confirm: true` and wait out the timeout.
**Expected:** The tool returns `isError: true` with text `outcome unknown — verify with keeping_list_entries before retrying. (<original err.message>)` — the WRITE-05 / D-3-16 byte-locked envelope. NOT the toIsErrorContent definite-fail shape.
**Why human:** W12 proves the classifier accepts `DOMException(name=TimeoutError)`; only a live run proves the timeout exits the catch arm through the AMBIGUOUS_TEXT branch end-to-end through one of the six write tools' isError envelope path. This is the regression that exercises the entire CR-01 fix in production conditions.

### Gaps Summary

**No code-level gaps remain.** Both BLOCKER gaps from the prior verification are closed:

- **CR-01 (Plan 03-09)** — `classifyAmbiguous` at `src/keeping/write-gate.ts:104` now reads `if (err.name === "AbortError" || err.name === "TimeoutError") return true;`. The W12 regression test constructs the real `new DOMException("timeout", "TimeoutError")` shape (not a synthetic `Object.assign` mock) and asserts the classifier returns true. Real Node 22 `AbortSignal.timeout()` exceptions will now surface as `AMBIGUOUS_TEXT` through every Phase 3 write tool.
- **CR-02 (Plan 03-10)** — The loose regex `/^\d{1,2}:\d{2}(:\d{2})?(am|pm)?$/i` is replaced at all five callsites by `/^([01]\d|2[0-3]):[0-5]\d$/` with the error message `"must be HH:mm (24-hour, zero-padded)"`. 43 new tests (across the three test files) negatively reject `1:30pm`/`25:00`/`9:5`/`00:00:00` and positively accept `00:00`/`09:05`/`13:45`/`23:59`. The D-3-28 wire contract is now enforced at the Zod layer before any value reaches Keeping.

The full 206-test suite is green, TypeScript compiles, Biome lint is clean, and `npm run build` produces a 46.61 KB ESM bundle at `dist/bin/keeping-mcp.js` with the `#!/usr/bin/env node` shebang preserved.

**Advisory (not phase-3-closure scope):** WR-01..WR-06 + IN-01..IN-04 from `03-REVIEW.md` are noted in the Anti-Patterns table above. None violate locked contracts. The dead-code retry plumbing (WR-01), BASE URL duplication (WR-02), identity-cache race (WR-03), update-entry mode-mismatch tolerance (WR-05), midnight clamp (WR-06), and the four IN items are defensible at the current scope and can be addressed in a follow-up plan or a Phase 4 cleanup pass.

**Deferred to later phases (not failing):** Distribution / npm publish / MCP Registry verification (DIST-04, DIST-05, REL-02..REL-05) is Phase 4 work and is unaffected by these fixes. Phase 4's `npx keeping-mcp` smoke depends on the 12-tool wiring being stable — it is.

**Why `human_needed` rather than `passed`:** All six observable truths are VERIFIED in the codebase, but three live-API behaviors (write end-to-end, timer lifecycle, ambiguous-timeout envelope under real network failure) cannot be exercised by unit tests against the locked OpenAPI fixture. These belong on the user's plate before declaring Phase 3 fully shipped — they gate Phase 4's release pipeline assumption that the 12-tool surface works against the live Keeping API.

---

_Verified: 2026-06-12T10:00:00Z_
_Verifier: Claude (gsd-verifier)_
