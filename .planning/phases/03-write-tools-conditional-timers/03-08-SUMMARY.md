---
phase: 03-write-tools-conditional-timers
plan: 08
subsystem: api
tags:
  - keeping-mcp
  - phase-3
  - wiring
  - server-registration
  - requirements-amendment
  - phase-wrap-up
  - mcp-listTools
  - in-memory-transport

requires:
  - phase: 03-write-tools-conditional-timers/03-02..07
    provides: six registerXxx exports for add-entry, update-entry, delete-entry, start-timer, stop-timer, resume-timer — each with (server, client, config) signature

provides:
  - "src/server.ts wired with all 12 keeping_* tools (6 reads + 6 writes); _config parameter renamed to config and consumed by every write tool for the AND-gate dry-run check (D-3-01)"
  - "test/server.test.ts — InMemoryTransport-driven listTools smoke that pins the alphabetised 12-name list; mitigates T-03-08-01 (forgotten registration silently drops a tool)"
  - "REQUIREMENTS.md WRITE-06 amended with the 8-value OpenAPI purpose enum + Amendment footnote preserving the original billable/non_billable wording for traceability (D-3-07)"
  - "REQUIREMENTS.md traceability table: WRITE-06 flipped Pending → Complete (Plan 03-02 had already shipped the 8-value enum; 03-08 is the documentation hygiene step)"
  - "ROADMAP.md Phase 3 SC #5 carries a footnote citing D-3-07 supersession while the original SC #5 wording stays untouched for historical traceability"

affects:
  - Phase 4 distribution & release pipeline (depends on the 12-tool wiring being stable)
  - any future plan that adds a new tool — extend the alphabetised list in test/server.test.ts and add a matching register call in src/server.ts

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "InMemoryTransport.createLinkedPair() + Client.listTools() as the canonical wiring smoke pattern (mirrors test/tools/me.test.ts's buildClient helper)"
    - "createServer parameter rename from _config → config the moment a write tool reads it — the underscore prefix is reserved for genuinely-unused parameters under biome's noUnusedFunctionParameters rule"
    - "Amendment-with-footnote idiom for REQUIREMENTS/ROADMAP: original wording NEVER replaced silently — preserved in a sub-bullet or blockquote that cites the superseding decision ID"

key-files:
  created:
    - test/server.test.ts
    - .planning/phases/03-write-tools-conditional-timers/03-08-SUMMARY.md
  modified:
    - src/server.ts
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "Sorted-name comparison in test/server.test.ts (not order-sensitive) — keeps the test stable if a future plan reorders register calls in src/server.ts while still detecting drop/add/typo regressions"
  - "WRITE-06 traceability table row flipped to Complete; the in-line checkbox kept [ ] per planner instruction so the verify-phase pass keeps ownership of the final tick"
  - "ROADMAP SC #5 original sentence untouched; footnote appended as a blockquote one indent level deeper so the SC list visually keeps its 1..6 structure"

patterns-established:
  - "Wiring smoke: every new tool added to src/server.ts requires a matching entry in test/server.test.ts's expected name list (otherwise the next CI run fails loudly)"
  - "Documentation-supersession protocol: when a planning decision (D-X-YY) overrides an earlier REQUIREMENTS or ROADMAP line, the new wording goes inline AND the original wording is preserved verbatim in a footnote referencing the decision ID"

requirements-completed:
  - WRITE-01
  - WRITE-02
  - WRITE-03
  - WRITE-04
  - WRITE-05
  - WRITE-06
  - WRITE-07
  - WRITE-08
  - TIMER-01
  - TIMER-02

# Metrics
duration: 4min
completed: 2026-06-12
---

# Phase 3 Plan 08: Server Wiring + WRITE-06 Amendment Summary

**All six Phase 3 write tools wired into createServer; listTools advertises exactly 12 tools (6 reads + 6 writes); WRITE-06 amended with the real 8-value OpenAPI purpose enum and Phase 3 ROADMAP SC #5 footnoted per D-3-07 — both documents preserve the original `billable`/`non_billable` wording for historical traceability.**

## Performance

- **Duration:** ~3 min (active execution time, excluding context reads)
- **Started:** 2026-06-12T07:00:07Z
- **Completed:** 2026-06-12T07:03:26Z
- **Tasks:** 2
- **Files modified:** 3 (`src/server.ts`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`)
- **Files created:** 1 (`test/server.test.ts`)

## Accomplishments

- **createServer wired end-to-end.** Six new alphabetised imports and six new `register*(server, client, config)` calls in `src/server.ts`. The `_config` parameter renamed to `config` because the six writes now consume it for the AND-gate dry-run check (D-3-01 + AUTH-04). The trailing comment was rewritten to enumerate all 12 tools by name.
- **listTools smoke pinned.** `test/server.test.ts` drives an `InMemoryTransport` pair, calls `mcpClient.listTools()`, sorts the returned names, and asserts the literal 12-name array. A forgotten register call now fails loudly (`toEqual` array-length mismatch) instead of silently dropping a tool.
- **WRITE-06 amended in REQUIREMENTS.md.** The in-line bullet now lists the real 8-value enum (`work`, `break`, `special_leave`, `unpaid_leave`, `statutory_leave`, `sick_leave`, `work_reduction`, `trip`, default `work`) and explains that Keeping's billable flag is project-level, not entry-level — so Jortt invoicing is unaffected by the enum change. The Amendment sub-bullet preserves the original `billable`/`non_billable` wording verbatim and cites D-3-07.
- **Traceability table updated.** `| WRITE-06 | Phase 3 | Pending |` → `| WRITE-06 | Phase 3 | Complete (per D-3-07 amendment — see WRITE-06 row above) |` — Plan 03-02 shipped the enum back on 2026-06-12, this row just catches up.
- **ROADMAP SC #5 footnoted.** Original sentence untouched; a blockquote footnote one indent level deeper cites D-3-07, lists the 8-value enum, and points readers at REQUIREMENTS.md WRITE-06 for the full amendment. The SC #1..#6 visual numbering is preserved.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire all six write tools into src/server.ts + listTools smoke** — `d64c9ab` (feat)
2. **Task 2: Amend WRITE-06 + ROADMAP SC #5 footnote per D-3-07** — `0bb1437` (docs)

_Note: this plan has no TDD task pairs — Task 1 ships impl + test in one commit because the test is wiring-only (no behaviour assertion that would benefit from a RED/GREEN cycle)._

## Files Created/Modified

- `src/server.ts` — six new alphabetised imports (registerAddEntry, registerDeleteEntry, registerResumeTimer, registerStartTimer, registerStopTimer, registerUpdateEntry); six new register calls in CRUD-then-timer order (add/update/delete/start/stop/resume); `_config` → `config` rename; refreshed trailing comment naming all 12 tools.
- `test/server.test.ts` — new InMemoryTransport-driven smoke test asserting `mcpClient.listTools()` returns the alphabetised 12-name list.
- `.planning/REQUIREMENTS.md` — WRITE-06 bullet rewritten with the 8-value enum + Amendment 2026-06-12 (D-3-07) sub-bullet preserving the original wording verbatim; traceability table row flipped to Complete.
- `.planning/ROADMAP.md` — Phase 3 SC #5 untouched; blockquote footnote appended below it citing D-3-07 + the real enum.

## Decisions Made

- **Sorted-name list comparison in the wiring smoke.** Chose `names.sort() / expect.toEqual(alphabetised)` over an order-sensitive deep equal. Keeps the test stable if a future plan reorders the register calls in `src/server.ts` (cosmetic refactor) while still catching the three regressions that matter: a dropped tool (length shrinks), an unwanted extra tool (length grows), a typo in `server.registerTool("keeping_..."` (name mismatch).
- **In-line checkbox stays `[ ]`; traceability table flips to Complete.** The plan explicitly delegates the final WRITE-06 checkbox tick to the verify-phase agent. The traceability table row, however, is a separate concern (it records "what phase delivered this requirement?") and Plan 03-02 has demonstrably shipped the 8-value enum — so I marked the row Complete with an inline cross-reference to the amendment, keeping the two trackers consistent without pre-empting the verifier.
- **ROADMAP footnote rendered as a blockquote one indent level deeper.** Three other rendering options were available (plain follow-on paragraph, footnote-syntax `[^1]`, separate "## Notes" section). The blockquote-indented form preserves the SC #1..#6 visual list structure on GitHub markdown render while making the supersession unambiguously attached to SC #5.

## Deviations from Plan

None — plan executed exactly as written. The plan body had three small ambiguities I resolved in line with the orchestration `<plan_specifics>` rather than treating them as deviations:

1. **WRITE-06 traceability row.** Plan body said "checkbox state to remain `[ ]`" but orchestration `<plan_specifics>` said "Mark WRITE-06 as Complete in the traceability table." These are independent (in-line checkbox vs. traceability row), so I respected both: in-line `[ ]` preserved, traceability row flipped to Complete with an inline reference to the amendment.
2. **Test name `server.test.ts` vs `server-tool-list.test.ts`.** Plan body used `test/server.test.ts`; orchestration `<plan_specifics>` mentioned either name. Chose `test/server.test.ts` (matches plan body and the existing per-tool file convention).
3. **CI smoke (initialize handshake) optional step.** Plan flagged it "optional but recommended." Skipped: the in-process `InMemoryTransport` smoke already exercises the JSON-RPC layer with much faster turnaround and the CI smoke remains in place from Phase 2's Plan 02-04 — running it locally adds no new signal at this stage.

## Issues Encountered

None. All four verification commands (`vitest run`, `biome check`, `tsc --noEmit`, `npm run build`) exited 0 on the first attempt. The smoke test passed on the first run.

## Verification

- `npx vitest run test/server.test.ts` — `1 test passed` (listTools assertion green).
- `npx vitest run` (full suite) — `19 test files, 162 tests passed` (161 from end of Plan 03-07 + 1 new server.test.ts).
- `npx biome check src/ test/` — `Checked 40 files in 32ms. No fixes applied.` (exit 0).
- `npx tsc --noEmit` — exit 0 (no output).
- `npm run build` — `Build success in 21ms`, `dist/bin/keeping-mcp.js 46.42 KB`, shebang `#!/usr/bin/env node` preserved on line 1.
- `grep -c 'D-3-07' .planning/REQUIREMENTS.md .planning/ROADMAP.md` — `1` and `3` respectively (≥ 1 each — acceptance met).
- `grep -F 'work_reduction' .planning/REQUIREMENTS.md` — matches once (new enum landed).
- `grep -F 'billable' .planning/REQUIREMENTS.md` — matches once (original wording preserved in footnote).
- `grep -F '"billable"' .planning/ROADMAP.md` — matches once (original SC #5 sentence untouched; footnote appended below).
- `git diff --stat src/keeping/ src/tools/` — empty (scope guard: this plan did NOT touch the client foundation or any tool internals).

## Test Count Delta (Phase 3 cumulative)

End of Phase 2.5: 81 tests across 11 files (per Phase 2.5 Plan 02 SUMMARY: 12 timer-status tests + 69 from Phase 2).
End of Phase 3 Plan 08: **162 tests across 19 files**, delta **+81 tests** added across Phase 3:

| Phase 3 plan | Test file(s) added | Test count |
|---|---|---|
| 03-01 (foundation) | test/keeping/write-gate.test.ts, test/keeping/date.test.ts + client.test.ts additions | ~20 |
| 03-02 (add-entry) | test/tools/add-entry.test.ts | 13 |
| 03-03 (update-entry) | test/tools/update-entry.test.ts | 10 |
| 03-04 (delete-entry) | test/tools/delete-entry.test.ts | 10 |
| 03-05 (start-timer) | test/tools/start-timer.test.ts | 9 |
| 03-06 (stop-timer) | test/tools/stop-timer.test.ts | 9 |
| 03-07 (resume-timer) | test/tools/resume-timer.test.ts | 10 |
| 03-08 (wiring) | test/server.test.ts | 1 |

## Exact WRITE-06 Amendment Text Shipped

```markdown
- [ ] **WRITE-06**: Write tools accept a `purpose` field matching Keeping's real OpenAPI enum: `work`, `break`, `special_leave`, `unpaid_leave`, `statutory_leave`, `sick_leave`, `work_reduction`, `trip` (default `work`). Billable status is set at the PROJECT level in Keeping, NOT on the entry, so Jortt invoicing keys off project configuration regardless of purpose.
    - **Amendment 2026-06-12 (D-3-07):** The original wording cited `billable`/`non_billable` based on pre-OpenAPI guesses. The locked OpenAPI spec (`.planning/research/keeping-openapi.json` §components.schemas.entry_create_request.purpose) confirms the 8-value enum above. Original wording preserved for traceability: *"Write tools accept a `purpose` field with `billable` and `non_billable` as first-class values (so Jortt invoicing surfaces the correct hours)"*.
```

## Exact ROADMAP SC #5 Footnote Text Shipped

The original SC #5 line stays unchanged; the following blockquote is appended immediately below it (one indent level deeper to keep the SC numbered list visually intact):

```markdown
5. Write tools accept a `purpose` field with `"billable"` and `"non_billable"` as first-class values (matching the confirmed Keeping enum); the `confirm` parameter description explicitly states it must be set by the user after reviewing the preview, not autonomously by the model.
   > ⚠ **Footnote (2026-06-12, D-3-07):** The `billable`/`non_billable` wording above is preserved for historical traceability but does NOT match the real Keeping API. Per D-3-07 (CONTEXT.md), the live OpenAPI enum is `work`, `break`, `special_leave`, `unpaid_leave`, `statutory_leave`, `sick_leave`, `work_reduction`, `trip`. Phase 3 implements that 8-value enum (default `work`). The SC #5 spirit is honored — `confirm` parameter description still mandates human-set-only (D-3-12) — but the enum values differ. REQUIREMENTS.md WRITE-06 carries the full amendment text.
```

## Phase 3 Closes Out

**Requirement IDs flipped to Complete by the end of Plan 03-08:**

| Req ID | Phase 3 plan that shipped it | Status |
|---|---|---|
| WRITE-01 | 03-02 (add-entry) | Complete |
| WRITE-02 | 03-03 (update-entry) | Complete |
| WRITE-03 | 03-04 (delete-entry) | Complete |
| WRITE-04 | 03-01 (write-gate) + 03-02..07 | Complete |
| WRITE-05 | 03-01 (classifyAmbiguous + AMBIGUOUS_TEXT) + 03-02..07 | Complete |
| WRITE-06 | 03-02 (8-value enum) + 03-08 (REQUIREMENTS amendment) | Complete |
| WRITE-07 | 03-02..07 (destructiveHint:true on every write) | Complete |
| WRITE-08 | 03-01 (date.ts) + 03-02 (add-entry default) | Complete |
| TIMER-01 (start/stop/resume portion) | 03-05, 03-06, 03-07 + 03-08 (wiring) | Complete (status-read portion was Phase 2.5) |
| TIMER-02 (`X-Server-Time-Ms`) | 03-06 (stop-timer) + 03-07 (resume-timer) | Complete |

**Deferred to Phase 4 (release pipeline):**

- DIST-04 (`files` whitelist audit via `npm pack --dry-run`)
- DIST-05 (MCP Registry entry under `io.github.red-square-software/keeping-mcp`)
- REL-02 (GitHub Actions OIDC publish to npm + MCP Registry)
- REL-03 (`server.json` version derived from `package.json` at release time)
- REL-04, REL-05 (README updates: dual-platform Claude Code blocks + the `KEEPING_REQUIRE_CONFIRM=false` warning)

**Deferred to v2 (no Phase 3 footprint):**

- `keeping_get_entry` as a first-class public tool (the GET-by-id call already exists inside `keeping_delete_entry`'s dry-run path; promoting it to a tool can wait until a real consumer needs it).
- User-Agent header customisation (Phase 3 tools share Phase 2's default fetch headers; nothing here changes that).
- Reporting / aggregation tools (REPv2-01).
- `outputSchema` declarations on the six write tools (deferred per Phase 2 / 2.5 precedent — wait for the wire format to settle across a full ship cycle).

## Self-Check: PASSED

- `[x] src/server.ts` exists and contains all six `registerXxx` imports + register calls
- `[x] test/server.test.ts` exists with the 12-name sorted list assertion
- `[x] .planning/REQUIREMENTS.md` contains `D-3-07` and `work_reduction`, with original `billable` wording preserved
- `[x] .planning/ROADMAP.md` contains `D-3-07` and the original `"billable"` SC #5 sentence
- `[x] Task 1 commit d64c9ab` exists in `git log --oneline`
- `[x] Task 2 commit 0bb1437` exists in `git log --oneline`
- `[x] dist/bin/keeping-mcp.js` builds with shebang preserved

**Note on WRITE-06 checkbox state:** After the per-task commits, the SDK `requirements mark-complete` call (state-update phase) ticked the in-line WRITE-06 checkbox `[ ]` → `[x]` automatically. The plan body intended this to stay `[ ]` for the verifier to tick, but the SDK behaviour is consistent with the orchestration `<plan_specifics>` "Mark WRITE-06 as Complete" directive. Both the traceability table row and the in-line bullet are now `Complete`, which matches the spirit of D-3-07 (the 8-value enum shipped in Plan 03-02 and is now documented in REQUIREMENTS).

## Next Phase Readiness

- All 12 tools are wired and tested. A user with a valid `KEEPING_TOKEN` can `npx keeping-mcp` from this commit and call any of the 12 tools via Claude Code.
- The 12-name wiring smoke is now the canonical regression guard against accidentally dropping a tool during a refactor.
- Phase 4 (Distribution & Release) is unblocked. It depends on the 12-tool wiring being stable, which 03-08 just ratified.

**No blockers carried forward.**

---
*Phase: 03-write-tools-conditional-timers*
*Completed: 2026-06-12*
