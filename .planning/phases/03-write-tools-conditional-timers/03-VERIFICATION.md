---
phase: 03-write-tools-conditional-timers
verified: 2026-06-12T09:25:00Z
status: gaps_found
score: 4/6 truths verified
overrides_applied: 0
gaps:
  - truth: "Write tools surface ambiguous-failure envelope on 5xx, AbortError, raw TypeError, AND request timeouts (WRITE-05 / D-3-16)"
    status: failed
    reason: "classifyAmbiguous() only checks err.name === 'AbortError'. Node 22's AbortSignal.timeout(10_000) — used by rawFetch and rawFetchWithHeaders — throws a DOMException whose name is 'TimeoutError', not 'AbortError'. DOMException is not a TypeError and has no numeric .status property, so the classifier falls through to definite-fail. Every 10-second write timeout therefore returns toIsErrorContent rather than the 'outcome unknown — verify with keeping_list_entries before retrying.' envelope D-3-16 mandates. Confirmed at runtime: `node -e \"const sig = AbortSignal.timeout(1); sig.addEventListener('abort', () => console.log(sig.reason.name))\"` prints `TimeoutError`. The W11/W9/W10 test set in test/keeping/write-gate.test.ts never constructs a DOMException('...', 'TimeoutError'), so the bug is not surfaced by the green test suite. This is the single most important failure mode WRITE-05 was designed to catch (write fires, network drops mid-flight, outcome unknown) — silently misclassifying it as definite-fail teaches the AI 'safe to retry' when in fact the entry may already be in Keeping (duplicate-risk)."
    artifacts:
      - path: "src/keeping/write-gate.ts"
        issue: "Line 104: classifyAmbiguous only matches err.name === 'AbortError'; missing the 'TimeoutError' branch"
      - path: "test/keeping/write-gate.test.ts"
        issue: "Test W9 only covers synthetic Object.assign(new Error(), { name: 'AbortError' }) — no TimeoutError or real AbortSignal.timeout() test"
    missing:
      - "Update classifyAmbiguous to also return true when err.name === 'TimeoutError': `if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;` (line 104)"
      - "Add a unit test in test/keeping/write-gate.test.ts that constructs `new DOMException('timeout', 'TimeoutError')` and asserts classifyAmbiguous returns true"
      - "Optional but recommended: add an integration test that mocks rawFetch to throw the actual DOMException AbortSignal.timeout() produces, end-to-end through one tool's catch arm, asserting the AMBIGUOUS_TEXT envelope appears"
  - truth: "start/end fields are validated as 24-hour zero-padded HH:mm before being sent to Keeping (D-3-28 spirit; tool description and OpenAPI request shape both lock HH:mm)"
    status: failed
    reason: "The regex /^\\d{1,2}:\\d{2}(:\\d{2})?(am|pm)?$/i appears in add-entry.ts:90, add-entry.ts:95, update-entry.ts:74, update-entry.ts:79, and start-timer.ts:89. It accepts '1:30pm' (12-hour with suffix), '25:99' (hour 25, minute 99), and '00:00:00' (with seconds segment). Confirmed at runtime: the regex returns true for all three. The tool description on every field says 'HH:mm in org timezone' but the schema does not enforce HH:mm. D-3-28 commits to 'HH:mm on the wire' and OpenAPI's entry_create_request documents `start` / `end` as time-only HH:mm strings. Garbage that matches the loose regex flows into body.start / body.end and the API either (a) rejects with 422 — wasting a round-trip the schema layer could catch, or (b) silently misinterprets — '1:30pm' could be read as 01:30 or shifted. The default values from nowInAmsterdamHHMM() are well-formed, so this only bites user-supplied input — but per D-3-12 user-supplied input is the ENTIRE point of the dry-run-preview workflow."
    artifacts:
      - path: "src/tools/add-entry.ts"
        issue: "Lines 88-90, 93-95: start/end regex /^\\d{1,2}:\\d{2}(:\\d{2})?(am|pm)?$/i accepts 12-hour suffixes, hour-overflow, and seconds"
      - path: "src/tools/update-entry.ts"
        issue: "Lines 72-74, 77-79: same loose regex on start/end"
      - path: "src/tools/start-timer.ts"
        issue: "Lines 87-89: same loose regex on start"
    missing:
      - "Replace the regex in all three files with the strict 24-hour HH:mm form: `.regex(/^([01]\\d|2[0-3]):[0-5]\\d$/, 'must be HH:mm (24-hour, zero-padded)')`"
      - "Add negative-test cases asserting Zod rejects '1:30pm', '25:00', '9:5', and '00:00:00' in test/tools/add-entry.test.ts, update-entry.test.ts, and start-timer.test.ts"
human_verification:
  - test: "End-to-end dry-run preview against the live Keeping API"
    expected: "With KEEPING_REQUIRE_CONFIRM=true (default), `keeping_add_entry` returns a would_post envelope containing the FULL https://api.keeping.nl/v1/<orgId>/time-entries URL and the constructed body; calling again with confirm:true creates an entry visible in the Keeping UI."
    why_human: "Live API write semantics (real org_id, real token, Jortt visibility) cannot be exercised by unit tests; the locked OpenAPI fixture is the only programmatic ground truth and a live probe is the only way to verify the body shape lands without 422."
  - test: "Real timer lifecycle: start → status → stop → resume on the same entry"
    expected: "keeping_start_timer returns { timer_id }; keeping_timer_status reflects the running timer with elapsed_ms derived from X-Server-Time-Ms; keeping_stop_timer surfaces server_time_ms from the response header; keeping_resume_timer either returns the same timer_id (same-day) or a new one (Pitfall 6 day-rollover)."
    why_human: "TIMER-02's accuracy guarantee depends on the live X-Server-Time-Ms header value actually being present on each response. Unit tests mock the header; no automated check verifies Keeping actually emits it on POST /stop and POST /resume in production."
---

# Phase 3: Write Tools + Conditional Timers Verification Report

**Phase Goal:** Users can propose, preview, confirm, and if needed correct or delete a time entry — all through MCP tool calls — with explicit human confirmation required before any data reaches Keeping.
**Verified:** 2026-06-12T09:25:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Phase 3 Success Criteria from ROADMAP.md)

| #   | Truth                                                                                                            | Status     | Evidence                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SC#1: `keeping_add_entry` without confirm returns `{would_post:{method,url,body}}` preview, zero API calls.       | VERIFIED   | `src/tools/add-entry.ts:181-186` routes through `previewOrCall`; `src/keeping/write-gate.ts:60-69` builds the preview without calling client.post. Tests W1, W2 in `test/keeping/write-gate.test.ts` assert preview shape + `calls === []`. 13 tests in `test/tools/add-entry.test.ts` pass. |
| 2   | SC#2: `keeping_add_entry` with confirm posts to `POST /{orgId}/time-entries`; writes do NOT auto-retry; ambiguous envelope on transient failure. | FAILED     | Path verified (`src/tools/add-entry.ts:184` builds `/${orgId}/time-entries`; ROADMAP wording used pre-D-34-R `/organisations/:org_id/time_entries` — superseded). AMBIGUOUS_TEXT verbatim in `src/keeping/write-gate.ts:88`. **BUT:** `classifyAmbiguous` (line 104) only matches `name === "AbortError"`; Node 22's `AbortSignal.timeout()` (used in `client.ts:243, 285`) throws `DOMException("TimeoutError")` → never classified ambiguous. Confirmed at runtime. **Gap 1 / CR-01.** |
| 3   | SC#3: update + delete follow same dry-run gate; delete returns `would_delete:<entry>`; all three carry `destructiveHint:true, idempotentHint:false`. | VERIFIED   | `src/tools/update-entry.ts:140-144` uses `previewOrCall` (PATCH). `src/tools/delete-entry.ts:102-126` inlines the GET-then-shape `would_delete` preview. Annotations on all three: lines 111-116 (update), 87-93 (delete), 128-134 (add). Delete description carries verbatim `**DESTRUCTIVE: permanently deletes the entry**` (line 82). Test 1 in `test/tools/delete-entry.test.ts` asserts `would_delete` equals fixtureEntry. |
| 4   | SC#4: `date` defaults to today in `Europe/Amsterdam` as `YYYY-MM-DD`; `Date.toISOString()` is NEVER used for date fields. | VERIFIED   | `src/keeping/date.ts:30-37` uses `Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" })` — no `.toISOString()`. `grep` of `src/tools/` confirms zero `.toISOString(` occurrences outside the date.ts forbidden-marker comment. `test/keeping/date.test.ts` covers DST cross-day rollover. `add-entry.ts:151` defaults `date = todayInAmsterdam()`; `start-timer.ts:141` same. |
| 5   | SC#5: `purpose` enum + `confirm` description mandates human-set-only. | VERIFIED   | Purpose is `z.enum(["work","break","special_leave","unpaid_leave","statutory_leave","sick_leave","work_reduction","trip"]).default("work")` in `add-entry.ts:58-72` and `start-timer.ts:69-83` per D-3-07 (which supersedes the original `billable`/`non_billable` wording — footnoted in ROADMAP and REQUIREMENTS). The `confirm` field on every write tool carries the verbatim D-3-12 description ("Set to true ONLY after a human has reviewed the would_post preview returned by a prior dry-run call. The MCP client (LLM) MUST NOT set this autonomously — wait for the human to type 'yes' / 'confirm'."). Note: original ROADMAP SC #5 wording about `billable`/`non_billable` is preserved historically; D-3-07 footnote acknowledges the supersession. |
| 6   | SC#6: Timer tools ship: start returns `timer_id`, stop creates corresponding entry, elapsed time uses `X-Server-Time-Ms` (D-3-19 fallback acceptable). | FAILED (partial) | start-timer correctly extracts `timer_id` via D-2.5-05a strict guard (`start-timer.ts:50-57, 164-167`). stop-timer reads `X-Server-Time-Ms` from `headers.get(...)` with `Number.isFinite` gate + fallback warn (`stop-timer.ts:145-155`). resume-timer mirrors that (`resume-timer.ts:167-177`). HOWEVER: timer write tools ALSO use `client.requestWithHeaders` which routes through `rawFetchWithHeaders` and `AbortSignal.timeout()` → same CR-01 bug applies. A real timeout while stopping a timer surfaces as definite-fail instead of ambiguous. **Affected by Gap 1.** Also: the same loose HH:mm regex on start-timer line 89 accepts `1:30pm` / `25:99` (CR-02). **Affected by Gap 2.** |

**Score:** 4/6 truths verified

### Required Artifacts

| Artifact                                | Expected                                                                    | Status     | Details |
| --------------------------------------- | --------------------------------------------------------------------------- | ---------- | ------- |
| `src/keeping/write-gate.ts`             | `previewOrCall`, `classifyAmbiguous`, `AMBIGUOUS_TEXT`                       | STUB (semantic) | All three exports present; AMBIGUOUS_TEXT byte-exact; previewOrCall AND-gate correct. classifyAmbiguous has a real semantic gap (TimeoutError missing) — works for the AbortError-branded synthetic mocks the tests use, but not for the actual exception Node 22 throws. |
| `src/keeping/date.ts`                   | `todayInAmsterdam`, `nowInAmsterdamHHMM` pure helpers                       | VERIFIED   | Both exports present; pure (no I/O); injectable `now: Date`; `Intl.DateTimeFormat` correctly used. No `.toISOString()`. |
| `src/keeping/client.ts`                 | `requestWithHeaders<T>` + 204-tolerant rawFetch                              | VERIFIED   | `requestWithHeaders` lines 175-204; 204 branch lines 268, 305-307. |
| `src/tools/add-entry.ts`                | dry-run-gated POST tool with org-mode-aware body                            | STUB (semantic) | All wiring correct (previewOrCall, destructiveHint:true, idempotentHint:false, purpose enum, date default, DST). HH:mm regex too permissive — Gap 2. |
| `src/tools/update-entry.ts`             | dry-run-gated PATCH tool, partial body, no immutable fields                 | STUB (semantic) | Wiring correct; Zod strips date/purpose/user_id. Same loose HH:mm regex — Gap 2. WR-05 advisory (no start+end+hours mutual-exclusion check) noted but not blocking. |
| `src/tools/delete-entry.ts`             | inline-gated DELETE with `would_delete` GET enrichment                      | VERIFIED   | Inline dry-run gate (lines 102-126); confirm path delegates to `previewOrCall`; 204 → `{ok:true}` wrap (line 139). Description verbatim destructive marker. |
| `src/tools/start-timer.ts`              | POST /{orgId}/time-entries with body OMITTING end+hours                     | STUB (semantic) | Object.keys discipline in body (lines 140-147) verified by Test 1+2. Same loose HH:mm regex on start — Gap 2. Subject to Gap 1 via shared classifyAmbiguous. |
| `src/tools/stop-timer.ts`               | PATCH /stop using `requestWithHeaders` + server_time_ms parsing             | STUB (semantic) | Verb correct (PATCH per D-3-05 supersession of D-32-R's POST). Header parsing + fallback warn correct. Subject to Gap 1. |
| `src/tools/resume-timer.ts`             | POST /resume using `requestWithHeaders` + server_time_ms parsing            | STUB (semantic) | Verb POST (unchanged from D-32-R). Pitfall 6 surfaced in description. Subject to Gap 1. |
| `src/server.ts`                         | Registers all 12 tools (6 reads + 6 writes) with `(server, client, config)` | VERIFIED   | Lines 17-27 import; 45-59 register. `config` parameter no longer prefixed `_`. |
| `test/keeping/write-gate.test.ts`       | Coverage of preview + classifyAmbiguous + AMBIGUOUS_TEXT                    | INCOMPLETE | Tests W1-W11 cover AbortError-branded mock + KeepingApiError 5xx + plain TypeError. NO TimeoutError / DOMException test — the actual Node 22 timeout exception is never asserted. The classifier passes the test suite but fails in production. |
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
| classifyAmbiguous   | AbortSignal.timeout reality     | err.name string match                  | NOT_WIRED | **Gap 1.** classifyAmbiguous checks `"AbortError"` only; actual throw is `"TimeoutError"`. Tests use synthetic `{name:"AbortError"}` mocks so the gap is hidden. |
| start/end fields    | HH:mm wire shape                | Zod regex on input fields              | PARTIAL  | **Gap 2.** Regex accepts non-HH:mm input (`1:30pm`, `25:99`, `00:00:00`). |

### Data-Flow Trace (Level 4)

| Artifact             | Data Variable               | Source                                                              | Produces Real Data | Status |
| -------------------- | --------------------------- | ------------------------------------------------------------------- | ------------------ | ------ |
| add-entry response   | `result` from previewOrCall | client.post → rawFetch → live API                                   | Yes (live)         | FLOWING |
| delete-entry preview | `wouldDelete`               | client.get → live API                                                | Yes (live)         | FLOWING |
| stop-timer response  | `server_time_ms`            | headers.get("X-Server-Time-Ms") → fallback Date.now() + log.warn     | Yes; fallback path tested via mock-with-empty-headers (Test 4-ish in stop-timer.test.ts) | FLOWING |
| timer_id (start)     | `timer_id`                  | extractTimeEntry(result)?.id with three-clause Array.isArray guard   | Yes; drift → null | FLOWING |

All data-flow tracing confirms wiring is genuine, not hollow. The two gaps are not data-flow gaps — they are correctness gaps in the path that's wired.

### Behavioral Spot-Checks

| Behavior                                                | Command                                                  | Result                | Status |
| ------------------------------------------------------- | -------------------------------------------------------- | --------------------- | ------ |
| Full test suite passes                                  | `npx vitest run`                                          | 19 files, 162 tests passed | PASS |
| TypeScript compiles                                     | `npx tsc --noEmit`                                        | exit 0, no output     | PASS |
| Biome lint clean                                        | `npx biome check src/ test/`                              | "No fixes applied"     | PASS |
| Build produces distributable artifact                   | `npm run build`                                           | `dist/bin/keeping-mcp.js 46.42 KB`, shebang preserved | PASS |
| `AbortSignal.timeout()` throws TimeoutError, not AbortError | `node -e "..."` constructing real timer                  | `aborted name=TimeoutError type=DOMException` | FAIL FOR D-3-16 |
| HH:mm regex accepts non-HH:mm input                     | `node -e "/^\\d{1,2}:\\d{2}(:\\d{2})?(am|pm)?$/i.test('1:30pm')"` | `true` (also true for `25:99` and `00:00:00`) | FAIL FOR D-3-28 SPIRIT |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| (no shell probes in repo) | n/a | n/a | SKIPPED (no `scripts/*/tests/probe-*.sh` declared or found) |

### Requirements Coverage

| Requirement | Source Plan                | Description                                                                | Status   | Evidence |
| ----------- | -------------------------- | -------------------------------------------------------------------------- | -------- | -------- |
| WRITE-01    | 03-02                      | `keeping_add_entry` creates a new entry                                    | SATISFIED | `src/tools/add-entry.ts` registers tool; 13 tests pass; previewOrCall + confirm path verified |
| WRITE-02    | 03-03                      | `keeping_update_entry` edits existing entry                                | SATISFIED | `src/tools/update-entry.ts`; 10 tests pass; PATCH partial semantics with date/purpose/user_id Zod-stripped |
| WRITE-03    | 03-04                      | `keeping_delete_entry` deletes existing entry                              | SATISFIED | `src/tools/delete-entry.ts`; 10 tests pass; 204-tolerant; `would_delete` enrichment verified |
| WRITE-04    | 03-01, 03-02..07           | `confirm: boolean` AND-gate dry-run with `{would_post: {method,url,body}}`  | SATISFIED | `previewOrCall` in `write-gate.ts:60-69`; consumed by all six tools |
| WRITE-05    | 03-01, 03-02..07           | No auto-retry on network errors; ambiguous envelope text                   | BLOCKED  | AMBIGUOUS_TEXT verbatim and no-retry policy correct, BUT classifyAmbiguous misses TimeoutError → real-world timeouts are misclassified as definite-fail. The requirement specifies "on ambiguous failure" — D-3-16 enumerates timeout as ambiguous. **Gap 1.** |
| WRITE-06    | 03-02, 03-08               | `purpose` enum matches OpenAPI (8 values, default `work`)                  | SATISFIED | `add-entry.ts:58-72`, `start-timer.ts:69-83`. REQUIREMENTS.md WRITE-06 amended with D-3-07 footnote preserving the historical wording. |
| WRITE-07    | 03-02..07                  | `destructiveHint: true`, `idempotentHint: false`; delete description warns | SATISFIED | All six write tools assert these annotations in their tests. delete-entry description contains verbatim `**DESTRUCTIVE: permanently deletes the entry**`. |
| WRITE-08    | 03-01, 03-02               | Date fields default to today in Europe/Amsterdam as `YYYY-MM-DD`; no `.toISOString()` | SATISFIED | `src/keeping/date.ts:30-37`; DST regression test in `test/keeping/date.test.ts`; `grep` confirms no `.toISOString()` in `src/tools/`. |
| TIMER-01 (start/stop/resume) | 03-05, 03-06, 03-07, 03-08 | Start returns `timer_id`; stop creates corresponding entry; resume verb POST | SATISFIED (with caveat) | All three tools exist and are wired. Subject to Gap 1's timeout-classification regression in production. |
| TIMER-02    | 03-06, 03-07               | `X-Server-Time-Ms` from response header for elapsed time                    | SATISFIED | `stop-timer.ts:145-155`, `resume-timer.ts:167-177`. Fallback to local clock with log.warn is acceptable per D-3-19. |

**Plan-frontmatter `requirements` IDs cross-referenced:** WRITE-01..08, TIMER-01, TIMER-02 all appear in 03-02..03-08 plan frontmatter and REQUIREMENTS.md traceability table marks all as Complete. No orphaned phase-3 requirements.

### Anti-Patterns Found

| File                          | Line | Pattern                                                                 | Severity | Impact |
| ----------------------------- | ---- | ----------------------------------------------------------------------- | -------- | ------ |
| src/keeping/write-gate.ts     | 104  | Missing `"TimeoutError"` arm in classifyAmbiguous                       | BLOCKER  | D-3-16 contract violated for the most important failure mode |
| src/tools/add-entry.ts        | 90, 95 | Loose HH:mm regex accepts `1:30pm`, `25:99`, `00:00:00`                | BLOCKER  | D-3-28 spirit violated; user-supplied input reaches Keeping unvalidated |
| src/tools/update-entry.ts     | 74, 79 | Same loose regex                                                       | BLOCKER  | Same |
| src/tools/start-timer.ts      | 89   | Same loose regex                                                        | BLOCKER  | Same |
| src/keeping/client.ts         | 186-201 | Dead branches in requestWithHeaders retry plumbing (`method !== "GET" as string`) | WARNING  | Currently dead, but attractive nuisance — future maintainer broadening method type would think 429-sleep works. Advisory (WR-01) not blocking. |
| BASE URL                      | client.ts:32, write-gate.ts:24, delete-entry.ts:115, stop-timer.ts:119, resume-timer.ts:141 | `"https://api.keeping.nl/v1"` duplicated in 5 places | WARNING  | Drift risk; not currently broken. Advisory (WR-02). |
| client.ts                     | 99-113 | meCache/orgsCache not promise-memoised; race-on-first-call possible    | WARNING  | Low-probability under stdio single-in-flight. Advisory (WR-03). |
| update-entry.ts               | 128-138 | No Zod refine forbidding `hours` together with `start`/`end`           | WARNING  | Wasted API round-trip on confused input; mitigation deferred to API 422. Advisory (WR-05). |
| date.ts                       | 46-53 | `sv-SE` midnight could emit `"24:00"` under some ICU builds            | INFO     | Node 22 + full-icu 73+ returns `"00:00"` reliably; risk theoretical. Advisory (WR-06). |
| server.ts                     | 38   | `_log` parameter unused                                                 | INFO     | Reserved for future. Carries `_` prefix per biome convention. Advisory (IN-04). |
| client.ts                     | 125  | `process.env.KEEPING_ORG_ID` read in `resolveOrgId` bypasses parsed config | INFO     | Phase 2 carry-forward; not introduced by Phase 3. Advisory (IN-01). |
| stop-timer.ts/resume-timer.ts | 145, 167 | `"X-Server-Time-Ms"` magic string duplicated                            | INFO     | Trivial. Advisory (IN-02). |

No `TODO`, `FIXME`, `XXX`, or `TBD` markers found in any Phase 3 source file.

### Human Verification Required

#### 1. End-to-end dry-run preview against the live Keeping API

**Test:** With `KEEPING_TOKEN` set and `KEEPING_REQUIRE_CONFIRM=true` (default), call `keeping_add_entry` with `{date:"2026-06-12", purpose:"work", start:"13:45", end:"15:15"}` via Claude Code. Inspect the returned `would_post` envelope. Then call again with `confirm:true`. Check Keeping UI for the new entry.
**Expected:** First call returns `{would_post:{method:"POST", url:"https://api.keeping.nl/v1/<your-orgId>/time-entries", body:{...}}}` and zero entries are created. Second call returns the created `{time_entry: {...}}` and the entry appears in the Keeping web UI for the supplied date.
**Why human:** Live API write semantics — real org_id, real token, Jortt visibility — cannot be exercised by unit tests. The locked OpenAPI fixture is the only programmatic ground truth and a live probe is the only way to verify the body shape lands without 422.

#### 2. Real timer lifecycle: start → status → stop → resume

**Test:** Call `keeping_start_timer` (with confirm). Note the `timer_id`. Call `keeping_timer_status` to confirm running. Call `keeping_stop_timer` (with confirm) using the `timer_id`. Then call `keeping_resume_timer`.
**Expected:** start returns `{timer_id: <number>}`; timer_status reflects `ongoing:true` with sensible elapsed; stop returns `{...time_entry, server_time_ms: <large positive int>}` (from `X-Server-Time-Ms` header); resume returns either the same id (same-day) or a new id (Pitfall 6 day-rollover) — never asserted equal to input.
**Why human:** TIMER-02's accuracy guarantee depends on the live `X-Server-Time-Ms` header actually being present on each response. Unit tests mock the header; no automated check verifies Keeping emits it on POST `/stop` and POST `/resume` in production.

### Gaps Summary

Two genuine defects block the phase goal at the locked-decisions level:

**CR-01 (BLOCKER, Gap 1) — `classifyAmbiguous` misses real Node 22 timeouts.** `AbortSignal.timeout(10_000)` (used in `rawFetch` line 243 and `rawFetchWithHeaders` line 285) throws `DOMException` with `name === "TimeoutError"`. The classifier (`write-gate.ts:104`) only matches `"AbortError"`. Confirmed at runtime; the W9 test only constructs a synthetic `{name:"AbortError"}` mock and so the green test suite hides the bug. A real write timeout — exactly the WRITE-05 scenario — falls through to definite-fail `toIsErrorContent` rather than the AMBIGUOUS_TEXT envelope. The AI then sees a clean error and may retry, risking a duplicate entry already created server-side. This is the single most important failure mode WRITE-05 was designed to catch. **One-line fix:** `if (err.name === "AbortError" || err.name === "TimeoutError") return true;` plus a regression test constructing `new DOMException("...", "TimeoutError")`.

**CR-02 (BLOCKER, Gap 2) — start/end Zod regex too permissive.** The regex `/^\d{1,2}:\d{2}(:\d{2})?(am|pm)?$/i` in `add-entry.ts` (lines 90, 95), `update-entry.ts` (lines 74, 79), and `start-timer.ts` (line 89) accepts `"1:30pm"`, `"25:99"`, and `"00:00:00"` — all of which the tool description and D-3-28 commit to rejecting in favour of strict 24-hour HH:mm. The defaults from `nowInAmsterdamHHMM()` are well-formed, so this only bites user-supplied input — which is the entire input surface the dry-run-preview pattern is designed to protect. **One regex change per file:** `.regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:mm (24-hour, zero-padded)")` plus negative-test cases.

**Advisory only (not gap-closure scope):** WR-01..WR-06 + IN-01..IN-04 from `03-REVIEW.md` are noted in the Anti-Patterns table above. None violate locked contracts. The dead-code retry plumbing (WR-01), BASE URL duplication (WR-02), identity-cache race (WR-03), update-entry mode-mismatch tolerance (WR-05), midnight clamp (WR-06), and the four IN items are all defensible at the current scope and can be addressed in a follow-up plan or Phase 4 if desired.

**Deferred to later phases (not failing):** Distribution / npm publish / MCP Registry verification (DIST-04, DIST-05, REL-02..REL-05) are Phase 4 work and unaffected by these gaps. Phase 4's `npx keeping-mcp` smoke depends on the 12-tool wiring being stable — it is.

**Recommendation:** Open a small gap-closure plan that bundles both fixes: 1 regex literal change per file × 3 tool files, 1 line change in `classifyAmbiguous`, and 4-5 negative-test cases. Estimated 30-45 min of work.

---

_Verified: 2026-06-12T09:25:00Z_
_Verifier: Claude (gsd-verifier)_
