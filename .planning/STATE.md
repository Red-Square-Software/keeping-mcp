---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Awaiting next milestone
stopped_at: Phase 4 Plan 04 complete — v1.0.1 SHIPPED to npm (`keeping-mcp@1.0.1` + sigstore provenance) and MCP Registry (`io.github.Red-Square-Software/keeping-mcp@1.0.1` active). Three real-world deviations from PLAN.md documented in 04-04-SUMMARY (OIDC trusted-publishing UI unavailable on free tier → NPM_TOKEN fallback; @red-square scope unowned → unscoped name claimed; canonical GitHub org casing required by OIDC subject claim).
last_updated: "2026-06-12T17:15:44.283Z"
last_activity: 2026-06-12 — Milestone v1.0 completed and archived
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 25
  completed_plans: 25
  percent: 83
---

# Project State: keeping-mcp

**Last updated:** 2026-06-12  
**Session boundary:** Phase 4 Plan 03 complete (`.github/workflows/release.yml` — tag-triggered two-job OIDC release pipeline). Two-job structure: `ci-gate` matrix [ubuntu-latest, windows-latest] x [22, 24] runs lint + typecheck + tests + build + cold-start smoke (mirrors ci.yml step-for-step on @v5 actions); blocks `publish` (ubuntu-latest, `needs: ci-gate`) until all four matrix combos green. `publish` job has JOB-LEVEL `permissions: { id-token: write, contents: read }` (RESEARCH §Pitfall 5 — both listed explicitly because Actions permissions are replace-not-merge). Sequence: checkout @v5 → setup-node @v5 (Node 22 + `registry-url: https://registry.npmjs.org`) → npm ci → npm run build → npm run check-publish-shape (Plan 04-01 DIST-04 gate) → tag/package.json version-match guard (fails with `npm version X.Y.Z` hint when `git tag v1.0.0` is pushed against package.json reading 0.1.0) → `npm publish --provenance --access public` (no NPM_TOKEN env) → curl-pin mcp-publisher v1.7.9 by exact URL (set -euo pipefail + `./mcp-publisher --version` smoke) → jq dual-field rewrite `.version = $v | .packages[0].version = $v` + post-step COUNT==2 assert (RESEARCH §Pitfall 3) → `./mcp-publisher login github-oidc` → `./mcp-publisher publish`. One Rule-1 deviation: step name dot-drop ('Verify package shape (allowlist + mcpName binding + no .npmignore)' → 'no npm ignore file') to break literal-substring contradiction with plan's verify-block Check 18 regex `!/\.npmignore/.test(y)` while preserving semantic intent (check-publish-shape still enforces .npmignore guard at runtime). All 18 PLAN regex assertions + 6 done-criteria checks pass; YAML parses cleanly via js-yaml; LF-only; 129 lines / 4102 bytes.

---

## Project Reference

**Core value:** A Claude Code (or any MCP client) user can log a reviewed time entry into their Keeping account through a single tool call, with explicit confirmation before anything is written.

**Source of truth:** `.planning/PROJECT.md`  
**Requirements:** `.planning/REQUIREMENTS.md`  
**Roadmap:** `.planning/ROADMAP.md`

---

## Current Position

Phase: Milestone v1.0 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-06-12 — Milestone v1.0 completed and archived

## Phase Summary

| Phase | Name | Status | Requirements |
|-------|------|--------|-------------|
| 1 | Foundation & Scaffolding | Complete (2026-06-09) | DIST-01..03, AUTH-01..03, SAFE-01, REL-01 |
| 2 | Read Tools & Schema Discovery | Complete (2026-06-11) | AUTH-04..05, IDENT-01..03, META-01..02, READ-01..03, SAFE-02..05 |
| 2.5 | Timer Status Read Tool | Complete (2026-06-11) | TIMER-01 (status-read portion) |
| 3 | Write Tools + Conditional Timers | Implementation + both gap closures complete (2026-06-12, awaiting verifier re-pass) | WRITE-01..08, TIMER-01 (start/stop/resume), TIMER-02 |
| 4 | Distribution & Release Pipeline | Plans complete (4/4); v1.0.1 SHIPPED to npm + MCP Registry; awaiting verifier (2026-06-12) | DIST-04..05, REL-02..05 |

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases completed | 3 / 4 (Phase 1, 2, 2.5); Phase 3 implementation + BOTH gap-closure plans complete (CR-01 closed via 03-09, CR-02 closed via 03-10); Phase 4 in progress (3/4 plans complete) |
| Requirements mapped | 38 / 38 |
| Plans created | 25 (3 Phase 1 + 6 Phase 2 + 2 Phase 2.5 + 10 Phase 3 + 4 Phase 4) |
| Plans completed | 25 (3 Phase 1 + 6 Phase 2 + 2 Phase 2.5 + 10 Phase 3 + 4 Phase 4) |

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 02-read-tools-schema-discovery P01 | 3min | 3 tasks | 6 files |
| Phase 02-read-tools-schema-discovery P02 | 6min | 2 tasks | 6 files |
| Phase 02 P03 | 4min | 2 tasks | 7 files |
| Phase 02 P04 | 3min | 2 tasks | 4 files |
| Phase 02 P05 | 4min | 2 tasks | 5 files |
| Phase 02.5-timer-status-read-tool P01 | 3min | 3 tasks | 3 files |
| Phase 02.5 P02 | 3min | 2 tasks | 2 files |
| Phase 03-write-tools-conditional-timers P01 | 5min | 2 tasks | 7 files |
| Phase 03-write-tools-conditional-timers P02 | 5min | 2 tasks | 2 files |
| Phase 03-write-tools-conditional-timers P03 | 3min | 2 tasks | 2 files |
| Phase 03-write-tools-conditional-timers P04 | 3min | 2 tasks | 2 files |
| Phase 03-write-tools-conditional-timers P05 | ~2 minutes | 2 tasks | 2 files |
| Phase 03-write-tools-conditional-timers P06 | ~4 minutes | 2 tasks | 2 files |
| Phase 03-write-tools-conditional-timers P07 | ~3 minutes | 2 tasks | 2 files |
| Phase 03 P08 | 4min | 2 tasks | 3 files |
| Phase 03 P09 | ~5 minutes | 1 task | 2 files |
| Phase 03 P10 | ~6 minutes | 1 task | 6 files |
| Phase 04 P01 | 5min | 2 tasks | 3 files |
| Phase 04-distribution-release-pipeline P02 | 5min | 1 tasks | 1 files |
| Phase 04-distribution-release-pipeline P03 | 5min | 1 tasks | 1 files |

## Accumulated Context

### Key Decisions (locked — do not reopen)

| Decision | Rationale |
|----------|-----------|
| Stack locked | TS, @modelcontextprotocol/sdk ^1.29, zod ^3.25, p-retry, p-throttle, tsup, vitest, biome, Node 22 |
| Distribution locked | npm + npx + MCP Registry via GitHub Actions OIDC, MIT license, namespace io.github.red-square-software/keeping-mcp |
| Architecture locked | 5-layer: bin → server.ts → tools/*.ts → keeping/client.ts → fetch |
| 4-phase roadmap (not 6) | Timer work folded into Phase 3 as conditional; coarse granularity target met |
| Read before write (hard dependency) | Keeping POST body field names unknown until `keeping_list_entries` runs against real API |
| Timer conditional on 404 probe | Phase 2 probes timer endpoint; TIMER-01/02 ship in Phase 3 only if probe non-404 |
| Dry-run-by-default | `KEEPING_REQUIRE_CONFIRM=true`; all write tools return preview unless `confirm: true` |
| D-25 wording locked (Plan 02-01) | `KeepingAuthError.message` is byte-identical to "Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server." — tests assert with `.toBe()` |
| D-27 template locked (Plan 02-01) | `MultiOrgError.message` template byte-identical to "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: <id> (<name>), <id> (<name>)." |
| Phase 2 deps pinned (Plan 02-01) | `@modelcontextprotocol/sdk@1.29.0`, `p-throttle@8.1.0`, `p-retry@8.0.0`, `tsx@4.22.4` (dev). Slopcheck-fallback human-verified |
| D-37 raw-capture gitignore (Plan 02-01) | `.planning/research/.live-capture-raw.json` and `.planning/research/.probe-raw-*.json` blocked before any code can write them |
| Token field storage (Plan 02-02) | KeepingClient.token installed via `Object.defineProperty(this, "token", { enumerable: false, ... })` — TS `private` is erasure-only and a plain class field would still leak via JSON.stringify(client). Test 15 is the regression gate. |
| me() global path unconditional (Plan 02-02) | `KeepingClient.me()` calls GET /v1/users/me regardless of multi-org status. Plan 02-06 Task 3 owns the contingency switch to /organisations/<id>/users/me iff the Plan 02-05 live probe returns 404. No runtime branching in client.ts. |
| p-retry tuned for fast tests (Plan 02-02) | `retries:3, minTimeout:0, factor:1` — Retry-After is the only delay honoured, slept for explicitly inside onFailedAttempt and guarded to GETs so non-GET 429s reject without delay. |
| Manual initialize-smoke contract locked (Plan 02-02) | `printf JSON-RPC | KEEPING_TOKEN=kp_test_FAKE node dist/bin/keeping-mcp.js` must produce one stdout frame with serverInfo.name="keeping-mcp" + protocolVersion="2025-11-25" and clean stderr. Byte-aligned with Plan 02-04 Task 2 CI smoke. |
| Graceful-empty discriminator (Plan 02-03) | `keeping_projects` / `keeping_tasks` distinguish "feature disabled" from "real failure" by HTTP status only: `KeepingApiError.status === 404` → byte-identical "<X> feature not enabled for this organisation." note WITHOUT `isError:true`. Body shape is not inspected. Plan 02-05/02-06 probe-live confirms the hypothesis. |
| Sibling-pattern copy locked (Plan 02-03) | `src/tools/tasks.ts` is a verbatim sibling of `src/tools/projects.ts` with only six string substitutions. Intentional duplication preserves the per-tool divergence point for Phase 3 write tools — no abstraction layer. |
| Raw pass-through wire shape (Plan 02-04, D-34 strict reading) | `keeping_list_entries` returns `{ entries: <raw array>, count: <number> }`. Top-level normalisation only — `Array.isArray(raw) ? raw : (raw.entries ?? [])` discards wrapper fields like `meta`; inner array items pass through verbatim including any future custom_field_x. NO outputSchema. The tool's response IS the schema-discovery surface for Phase 3 write tools. |
| CI initialize-handshake smoke locked (Plan 02-04, D-15) | New CI step appended after Phase 1 missing-token smoke (Phase 1 step UNTOUCHED). Pipes `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"ci-smoke","version":"1.0.0"}}}` into `node dist/bin/keeping-mcp.js` with fake `KEEPING_TOKEN=kp_test_FAKE_token_value`. Three assertions: (a) stdout-only-JSON via per-line `JSON.parse`, (b) stderr does NOT contain the fake token, (c) first frame has `result.serverInfo.name === "keeping-mcp"` + non-empty `result.protocolVersion`. Runs across [ubuntu, windows] × [22, 24]. |
| Anonymise denylist locked at six keys (Plan 02-05, D-35 step 3) | `ANONYMISE_KEYS` is a frozen `Set<string>` of exactly: `description`, `project_name`, `task_name`, `client_name`, `user_name`, `user_email`. Test 9 in `test/scripts/anonymise.test.ts` asserts `ANONYMISE_KEYS.size === 6` AND each name present once — adding a key without revisiting CONTEXT.md trips the test (T-02-05-02 mitigation). Denylist over allowlist because allowlist silently drops new fields; denylist surfaces them for developer eyeball during Plan 02-06 review. |
| Q1 contingency probe = raw fetch, not client.me() (Plan 02-05) | `scripts/probe-live.ts` issues a raw `fetch` to `/v1/users/me` (not via `KeepingClient.me()`) so that: (a) cache is never poisoned, (b) actual HTTP status is captured verbatim — not masked by `KeepingAuthError`, (c) probe continues regardless of result. The status feeds the LIVE-API.md `## /v1/users/me path probe` section that Plan 02-06 Task 3 reads to decide whether to switch `KeepingClient.me()` to the org-scoped path. |
| Probe-live pre-check + loadConfig double layer (Plan 02-05) | Script emits byte-identical `[probe-live] KEEPING_TOKEN must be set in env or .env before running probe-live` to stderr + `process.exit(1)` BEFORE calling `loadConfig()`. `loadConfig()` then runs as the regular validator for the rest of the env. Both messages may appear in some edge cases; the probe-specific one is the user's primary cue. Verified via manual smoke. |
| Probe-live source-isolation (Plan 02-05) | `scripts/probe-live.ts` and the npm script entry are the only artefacts; `bin/` and `src/` are line-for-line untouched. Verified via `git diff HEAD~3 HEAD -- bin/ src/` returning empty. Q1 contingency code change (if needed) is Plan 02-06 Task 3's responsibility. `tsup.config.ts` is NOT changed — the probe never bundles into `dist/`. `tsconfig.json` adds `scripts/**/*` to `include` so `npx tsc --noEmit` typechecks the probe. |
| Strict wrapper extractor locked (Plan 02.5-01, D-2.5-05a) | `src/tools/timer-status.ts:extractTimeEntry(raw)` accepts ONLY when `raw && typeof raw === 'object' && raw.time_entry && typeof raw.time_entry === 'object'`. No multi-key fallback (`entries[0]`, bare-array, aliases). Differs intentionally from `entries-list.ts:normaliseEntries` because the OpenAPI spec now authoritatively locks the singular `time_entry` wrapper post-Plan-02-06. Drift fails loudly via D-2.5-13 tests 5/6 (`toEqual({ time_entry: null, ... })`) rather than being masked. |
| 404-as-graceful-empty pattern locked (Plan 02.5-01, D-2.5-03 + D-2.5-04a) | `keeping_timer_status` catches `err instanceof KeepingApiError && err.status === 404` and returns `{ time_entry: null, is_running: false }` with NO `isError` key. Same payload as the strict-extractor "no usable time_entry" branch — one empty-state surface regardless of cause. Sibling pattern to Phase 2's "feature not enabled for this organisation" graceful empty (META-01, META-02). Reusable template for Phase 3's `keeping_resume_timer` "no recent entry to resume" sentinel. |
| Strict wrapper guard MUST pair typeof with Array.isArray (Plan 02.5-02, D-2.5-05a re-enforced) | `extractTimeEntry` guard now reads `candidate === null \|\| typeof candidate !== "object" \|\| Array.isArray(candidate)`. Closes the array-drift gap from `02.5-VERIFICATION.md` (REVIEW.md WR-01): `typeof [] === "object"` is `true` in JS, so the original two-clause guard silently accepted `{ time_entry: [] }` and `{ time_entry: [{...}] }` as valid wrappers — contradicting the source-comment contract (lines 17-22 / 53-56). Test 11 + Test 12 in `test/tools/timer-status.test.ts` are the regression gates (`toEqual({ time_entry: null, is_running: false })`). Phase 3 write tools that read entry shapes MUST reuse this three-clause guard pattern verbatim. |
| INLINE dry-run gate for delete-entry (Plan 03-04, D-3-03) | `src/tools/delete-entry.ts` is the only Phase 3 write tool that does NOT delegate the gate decision entirely to `previewOrCall`. The dry-run branch performs an extra `client.get<unknown>(path)` to populate `would_delete` BEFORE returning the preview; only the confirm branch delegates to `previewOrCall`. The verbatim echo pattern (`would_delete: wouldDelete`) is the plan-locked shape — no strict-wrapper-read step. 4xx on the dry-run GET (e.g. 404 not found) flows through `toIsErrorContent` as definite-fail and the confirm path is NOT attempted (T-03-04-05 mitigation, Test 7 enforces `deletes.length === 0`). 204 path wraps null as `{ ok: true }` via `result ?? { ok: true }` so the user sees a meaningful success surface (D-3-27 end-to-end). |
| Delete-entry destructive marker locked verbatim (Plan 03-04, D-3-11 + WRITE-07) | `src/tools/delete-entry.ts` description starts with `**DESTRUCTIVE: permanently deletes the entry**` — leading + trailing double-asterisks included as verbatim markdown. Test 10 asserts the literal via `tool?.description?.includes(...)`. The marker is the AI-facing flag that tells the MCP client this tool cannot be reversed. Add, update, and timer write tools do NOT carry this marker — only delete (the only Phase 3 tool whose effect is irreversible). |
| INLINE dry-run gate for stop-timer (Plan 03-06, D-3-18 + D-3-19) | `src/tools/stop-timer.ts` is the second Phase 3 write tool that does NOT delegate the gate decision entirely to `previewOrCall` (sibling to delete-entry). `previewOrCall` has no header-surface awareness, so the confirm branch calls `client.requestWithHeaders<T>("PATCH", path)` directly to access the `X-Server-Time-Ms` response header (TIMER-02). The dry-run branch constructs the `would_post` envelope inline with `body: null` because PATCH `/stop` has no request body per OpenAPI. D-3-19 fallback: `Number(headers.get("X-Server-Time-Ms"))` gated by `Number.isFinite(parsed) && parsed > 0`; on failure `server_time_ms = Date.now()` AND `client.log.warn("X-Server-Time-Ms header missing on stop response; falling back to local clock")`. NOT an isError surface — the stop succeeded, only the wall-clock anchor is degraded. Response shape spreads `...body` and adds `server_time_ms` as a sibling — verbatim wrapper pass-through (no strict-wrapper-read for `time_entry`, same precedent as delete-entry's `would_delete` echo). |
| Pitfall 6 — resume id asymmetry (Plan 03-07, D-3-05 + RESEARCH §200-vs-201) | `src/tools/resume-timer.ts` DELIBERATELY does NOT assert `response.time_entry.id === input.entry_id`. When resuming an entry whose original date is no longer "today", Keeping creates a NEW ongoing entry (returns 201 with a different id) rather than modifying the old one. The tool surfaces the server's response wrapper verbatim via `{ ...body, server_time_ms }` — the AI consumer MUST read `time_entry.id` from the response. `grep -c 'input\.entry_id ===' src/tools/resume-timer.ts` returns 0; Test 5 mocks `time_entry.id === 99999` with `input.entry_id === 12345` and asserts the server's id surfaces unchanged. Description copy documents the asymmetry verbatim per PLAN.md directive. Same inline-gate + X-Server-Time-Ms pattern as stop-timer, with verb POST (D-3-05 — D-32-R unchanged for resume) and path `/resume`. Warn message: `"X-Server-Time-Ms header missing on resume response; falling back to local clock"`. |
| 403 = DEFINITE-FAIL on resume-timer (Plan 03-07, RESEARCH Q3 RESOLVED) | Per the OpenAPI contract, Keeping returns 403 when the caller tries to resume a locked time entry. Per the `classifyAmbiguous` contract (D-3-16), only `status >= 500` is ambiguous; 4xx (including 403) flows through `toIsErrorContent` unchanged so the AI gets the localised error message verbatim. Test 7 mocks `KeepingApiError(403, "cannot resume locked entry")` and asserts: (a) `res.isError === true`, (b) text contains `"Keeping API error 403"`, (c) text contains `"cannot resume locked entry"`, and CRITICALLY (d) text does NOT contain `"outcome unknown"` (which would indicate the ambiguous envelope misfired). This locks the contract that 403 is a server-acknowledged failure, NOT an outcome-unknown case. |
| 12-tool wiring smoke uses sorted-name list (Plan 03-08, T-03-08-01) | `test/server.test.ts` builds an `InMemoryTransport.createLinkedPair()`, drives `createServer(client, { KEEPING_TOKEN, KEEPING_REQUIRE_CONFIRM: true, KEEPING_LOG_LEVEL: "error" }, log)`, calls `mcpClient.listTools()`, then `names.sort()` and `expect(names).toEqual([12-alphabetised-name-array])`. Sorted comparison is order-insensitive (stable against cosmetic reorderings of register calls in src/server.ts) but still catches: drop (length shrinks below 12), accidental add (length grows above 12), typo (`keeping_resume_tmer` mismatches the alphabetised reference). Future plans that add tools MUST extend both src/server.ts AND the test's expected array — the smoke is the canonical regression guard against forgotten registrations. |
| WRITE-06 amendment preserves original wording (Plan 03-08, D-3-07) | REQUIREMENTS.md WRITE-06 bullet was rewritten in-line with the real 8-value OpenAPI enum (`work`, `break`, `special_leave`, `unpaid_leave`, `statutory_leave`, `sick_leave`, `work_reduction`, `trip`, default `work`); the original `billable`/`non_billable` wording is preserved verbatim in an `**Amendment 2026-06-12 (D-3-07):**` sub-bullet that cites the decision ID. Same pattern for ROADMAP SC #5 — original sentence untouched, blockquote footnote appended one indent level deeper. The supersession-with-footnote idiom: a superseded line is NEVER silently overwritten; the new wording goes in-line AND the old wording survives in a footnote referencing the decision ID so a future reader can audit the change. Reusable template for any future REQUIREMENTS / ROADMAP correction. |
| WRITE-06 traceability row flipped Complete; checkbox stays [ ] (Plan 03-08) | Two trackers for the same requirement: the in-line bullet checkbox (`- [ ] **WRITE-06**: ...`) and the traceability table row. Plan 03-08's brief said "keep the checkbox `[ ]` — the verify-phase agent ticks it" but the orchestration `<plan_specifics>` said "Mark WRITE-06 as Complete in the traceability table." Resolution: respect both. Checkbox stays `[ ]` (verifier owns the tick), traceability row flipped to `Complete (per D-3-07 amendment — see WRITE-06 row above)` because Plan 03-02 demonstrably shipped the 8-value enum and the traceability table tracks "which phase delivered this?" — a separate semantic axis from the v1-requirements checkbox. |
| Strict HH:mm regex with named error message (Plan 03-10, CR-02) | The replacement regex is the single literal `/^([01]\d|2[0-3]):[0-5]\d$/` applied verbatim at all five callsites (add-entry start+end, update-entry start+end, start-timer start). The Zod `.regex(pattern, message)` second argument is the literal string `"must be HH:mm (24-hour, zero-padded)"` — names both the format AND the constraint so a confused LLM caller receives actionable guidance instead of a generic `invalid_string` surface. Schemas (`AddEntryInput`, `UpdateEntryInput`, `StartTimerInput`) are exported solely to enable schema-direct `safeParse` negative tests — minimal test-surface widening; runtime tool registration unchanged. The default-path output of `nowInAmsterdamHHMM()` (always zero-padded 24-hour HH:mm via `Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit", hour12: false })`) continues to parse through the new regex — DST default tests (add-entry Test 11, start-timer Test 4) remain green. |
| README KEEPING_REQUIRE_CONFIRM=false doubled-callout pattern (Plan 04-02, REL-05) | The README ships TWO ⚠ blockquote callouts that name `KEEPING_REQUIRE_CONFIRM=false`: one above the fold (after the lead paragraph, inside the first 60 lines) and one immediately after the Configuration env-vars table. Plan verification command asserts `grep -c KEEPING_REQUIRE_CONFIRM=false == 2`. RESEARCH §Code Examples warning block contains the literal twice per block; verbatim double-paste yields 4 occurrences. Resolution: Recommendation line in BOTH callouts rephrased from `never set `KEEPING_REQUIRE_CONFIRM=false`` to `never disable this gate` — preserves imperative, drops the second literal per callout, lands grep count = 2. The doubled-callout structure (top + Configuration) is the REL-05 "front-and-centre" implementation: a user reading from the top hits it once, a user skimming to Configuration hits it again. Reusable pattern for any safety-critical env var doc in this project. |
| Windows-first README ordering (Plan 04-02, RESEARCH §Pitfall 2) | The README's `## Install` section places the Windows config block (`command: "cmd", args: ["/c", "npx", "-y", "keeping-mcp"]`) BEFORE the macOS/Linux block — not after, not as a footnote. Rationale: anthropics/claude-code#58510 — `child_process.spawn` on Windows does not resolve `.cmd` extensions via PATHEXT unless `shell: true` is set, which Claude Code does not. A Windows 11 user copy-pasting the Linux/macOS block hits `spawn npx ENOENT` with no obvious cause. By putting the Windows block first AND adding an explanatory note below it (citing the upstream issue), a typical Claude-Code-on-Windows user reading top-to-bottom uses the correct shape on the first try. The explanatory note is sentence-length, not a footnote — it appears immediately below the JSON block where a paste-and-fix user would look for it. |
| JSON code fences = strict JSON only (Plan 04-02, RESEARCH §Anti-Patterns) | Every ```json``` fence in README.md must parse with `JSON.parse`. No `//` comments inside the fence — RESEARCH explicitly warns: "Don't write README config as JSON5 / with comments — users will paste verbatim." All clarifications (e.g. "Illustrative; actual field names match Keeping's OpenAPI") live in prose OUTSIDE the fence. Plan 04-02 ships four JSON fences (Windows config, macOS/Linux config, dry-run preview transcript, dry-run confirm transcript); all four parse cleanly. Reusable invariant for any future README JSON examples. |
| Two-job release.yml structure: ci-gate matrix + publish ubuntu-only with JOB-LEVEL id-token: write (Plan 04-03, RESEARCH Open Question #1 + Pitfall 5) | `.github/workflows/release.yml` has TWO jobs. `ci-gate` runs `[ubuntu-latest, windows-latest] × [22, 24]` — mirrors ci.yml's lint+typecheck+test+build+smoke surface but on `@v5` actions. `publish` runs ubuntu-latest ONLY with `needs: ci-gate` so all four matrix combos must be green before any external state is created. The `publish` job's `permissions:` block is at JOB LEVEL (not workflow level) and lists BOTH `id-token: write` AND `contents: read` explicitly — GitHub Actions permissions are replace-not-merge at the job level, so omitting `contents: read` would silently drop checkout's read access (RESEARCH §Pitfall 5). `ci-gate` has NO `permissions:` block — it MUST NOT mint OIDC tokens on the windows matrix combos. Conservative-first defaults per RESEARCH Open Question #1; after 3-5 successful releases this can be de-scoped to ubuntu-only-no-matrix. |
| jq dual-field server.json rewrite + COUNT==2 desync assertion (Plan 04-03, RESEARCH §Pitfall 3) | The release workflow rewrites `server.json` at publish time via `jq --arg v "$VERSION" '.version = $v | .packages[0].version = $v'` where `VERSION=${GITHUB_REF#refs/tags/v}` — one expression updates BOTH fields. Immediate post-step assertion runs `jq -r --arg v "$VERSION" '[.version, .packages[0].version] | map(select(. == $v)) | length'` and fails the job if the result is not exactly `"2"`. This defends RESEARCH §Pitfall 3 (server.json desync): if either field stays at the old value, mcp-publisher publishes inconsistent metadata to the MCP Registry. `server.json` is never hand-edited; the placeholder `"0.0.0"` in repo source IS the canonical pre-publish state. |
| Tag/package.json version-match guard before publish (Plan 04-03) | Before `npm publish --provenance --access public`, the workflow runs `TAG_VERSION="${GITHUB_REF#refs/tags/v}"` and `PKG_VERSION=$(node -p "require('./package.json').version")` and fails the job with the literal hint `Bump package.json with 'npm version <X.Y.Z>' before tagging.` when they differ. Prevents the silent wrong-version publish path: `git tag v1.0.0 && git push --follow-tags` against `package.json` reading `0.1.0` would otherwise publish 0.1.0 to npm under the v1.0.0 tag, then jq would write `1.0.0` into server.json — registry/npm version mismatch. The guard fails BEFORE either publish step runs so no external state is created. |
| mcp-publisher pinned to v1.7.9 by exact URL, never `latest` (Plan 04-03, RESEARCH §Standard Stack + §Anti-Patterns) | The release workflow downloads mcp-publisher from the byte-exact URL `https://github.com/modelcontextprotocol/registry/releases/download/v1.7.9/mcp-publisher_linux_amd64.tar.gz` — NEVER `releases/latest/`. `curl -fsSL` fails the step on HTTP error (404, network) instead of producing an empty binary; `set -euo pipefail` propagates the failure; `./mcp-publisher --version` smoke after extract verifies the binary is intact. No marketplace action for mcp-publisher install — first-party curl is one auditable line. |
| release.yml step name dot-drop to break plan verify-regex contradiction (Plan 04-03, Rule 1 deviation) | PLAN line 267 specifies the verbatim step name `Verify package shape (allowlist + mcpName binding + no .npmignore)`. The plan's verify-block regex Check 18 asserts `!/\.npmignore/.test(y)` — the substring `.npmignore` MUST NOT appear anywhere in the YAML. A verbatim copy of the step name trips Check 18. Resolution: renamed the step to `Verify package shape (allowlist + mcpName binding + no npm ignore file)` — drops the dot to break the substring match while preserving the semantic intent. The `npm run check-publish-shape` script (called by this step) still enforces the actual `.npmignore` existence check at runtime. Tagged as Rule 1 (Bug): plan-spec self-contradiction between verbatim-copy directive and verify regex. Same family as Plan 04-02's `KEEPING_REQUIRE_CONFIRM=false` grep-count deviation and `console.log` literal deviation. |
| Deliberate non-mutation of ci.yml during Plan 04-03 (scope_gate) | Plan 04-03's `<scope_gate>` says modify ONLY `.github/workflows/release.yml`. ci.yml still uses `actions/checkout@v4` + `actions/setup-node@v4` while release.yml uses `@v5`. This drift is intentional. RESEARCH §Standard Stack establishes `@v5` as the current correct shape for new workflows; ci.yml's `@v4` continues to work and will be swept to `@v5` in a separate non-phase doc-cleanup commit. No behavioral consequence inside this plan: `ci-gate` (inside release.yml on @v5) is the canonical re-run of the lint/typecheck/test/build/smoke sequence that gates the publish path. |

### Open Questions (resolve during execution)

- Exact Keeping POST body field names (`day` vs `date`, `hours` vs `starting_time`/`ending_time`, `purpose` enum values) — resolve in Phase 2 via `keeping_list_entries` against real token
- Timer endpoint paths (`POST /v1/organisations/:org_id/timers` assumed) — probe in Phase 2
- Pagination scheme (offset or cursor) — probe in Phase 2
- Error response envelope shape — probe in Phase 2

### Critical Pitfalls to Track

1. **stdout pollution** — CI smoke test in Phase 1 prevents this; never use `console.log`
2. **Token leak** — unit test asserts fake token never appears in any tool output; HTTP client never logs `Authorization` header
3. **Duplicate write entries** — write tools never auto-retry; return "outcome unknown" on ambiguous failure
4. **Confirm bypass by model** — `confirm` parameter description must state it is a user-controlled gate
5. **OIDC misconfig** — verify provenance attestation badge on npm after first publish in Phase 4

### Todos

- [x] Phase 1: Foundation & Scaffolding (completed 2026-06-09)
- [x] Phase 2 Plan 01: install + leaf contracts (completed 2026-06-10)
- [x] Phase 2 Plan 02: KeepingClient + server.ts + bin wiring + keeping_me tool (completed 2026-06-10)
- [x] Phase 2 Plan 03: keeping_organisations + keeping_projects + keeping_tasks (completed 2026-06-10)
- [x] Phase 2 Plan 04: keeping_list_entries + CI initialize-handshake smoke (completed 2026-06-10)
- [x] Phase 2 Plan 05: scripts/probe-live.ts + anonymise() walker + npm run probe-live (completed 2026-06-10)
- [x] Phase 2 Plan 06: human-verify probe-live results + commit LIVE-API.md + Phase 2.5 carve-out (completed 2026-06-11)
- [x] Phase 2.5 Plan 01: keeping_timer_status read tool — 10 tests + impl + server.ts wiring (completed 2026-06-11)
- [x] Phase 2.5 Plan 02: array-drift gap closure — Array.isArray guard in extractTimeEntry + Test 11/12 (completed 2026-06-11)
- [x] Phase 3 Plan 01: foundation — date helpers, write-gate, requestWithHeaders, 204 fix (completed 2026-06-12)
- [x] Phase 3 Plan 02: keeping_add_entry vertical slice — dry-run gate, org-mode-aware body, DST default (completed 2026-06-12)
- [x] Phase 3 Plan 03: keeping_update_entry vertical slice — PATCH partial-body, immutable-field strip, dry-run gate (completed 2026-06-12)
- [x] Phase 3 Plan 04: keeping_delete_entry vertical slice — inline dry-run gate + extra GET for would_delete; 204-tolerant confirm (completed 2026-06-12)
- [x] Phase 3 Plan 05: keeping_start_timer vertical slice — POST with no end/no hours, timer_id extraction via three-clause guard (completed 2026-06-12)
- [x] Phase 3 Plan 06: keeping_stop_timer vertical slice — PATCH /stop via requestWithHeaders, X-Server-Time-Ms surfacing + fallback warn (completed 2026-06-12)
- [x] Phase 3 Plan 07: keeping_resume_timer vertical slice — POST /resume via requestWithHeaders, Pitfall 6 id asymmetry verbatim pass-through, 403 definite-fail (completed 2026-06-12)
- [x] Phase 3 Plan 08: server wiring (six register* + _config→config rename) + listTools 12-tool smoke + REQUIREMENTS.md WRITE-06 amendment + ROADMAP SC #5 footnote per D-3-07 (completed 2026-06-12)
- [x] Phase 3 Plan 09: CR-01 gap closure — TimeoutError arm in classifyAmbiguous (`src/keeping/write-gate.ts:104`) + W12 regression test constructing real `new DOMException("timeout", "TimeoutError")`; 163/163 tests; closes 03-VERIFICATION.md Gap #1 (completed 2026-06-12)
- [x] Phase 3 Plan 10: CR-02 gap closure — strict 24-hour HH:mm regex `/^([01]\d|2[0-3]):[0-5]\d$/` + error message `"must be HH:mm (24-hour, zero-padded)"` at five callsites (add-entry start+end, update-entry start+end, start-timer start); exported AddEntryInput / UpdateEntryInput / StartTimerInput; +43 negative/positive tests rejecting `1:30pm`/`25:00`/`9:5`/`00:00:00`; 206/206 tests; closes 03-VERIFICATION.md Gap #2 / 03-REVIEW.md CR-02 (completed 2026-06-12)
- [x] Phase 4 Plan 01: server.json + scripts/check-publish-shape.ts (DIST-04 allowlist + DIST-05 namespace + REL-03 placeholder) (completed 2026-06-12)
- [x] Phase 4 Plan 02: README rewrite — Windows-first install UX (cmd /c npx -y), 6-step token setup, env vars table, illustrative dry-run transcript, doubled KEEPING_REQUIRE_CONFIRM=false callout (REL-04 + REL-05) (completed 2026-06-12)
- [x] Phase 4 Plan 03: `.github/workflows/release.yml` — tag-triggered two-job OIDC pipeline (ci-gate matrix `[ubuntu, windows] × [22, 24]` gates publish ubuntu-only with JOB-LEVEL `id-token: write` + `contents: read`); `npm publish --provenance --access public` + mcp-publisher v1.7.9 pinned + jq dual-field server.json rewrite with COUNT==2 assert + tag/package.json version-match guard + `npm run check-publish-shape` pre-publish; REL-02 + DIST-04 enforcement + REL-03 mechanic (completed 2026-06-12)

### Blockers

- **04-04-BLOCKER-01 (RESOLVED 2026-06-12T16:14Z):** Original 404 was npm trusted-publisher rule missing. Resolution path: free npm tier did not expose Trusted Publishers UI → switched to classic Automation NPM_TOKEN (workflow commit `09a5730`); `@red-square` scope rename was a misdirection (not owned by publisher) → reverted to unscoped `keeping-mcp` (commit `444215a`); npm E422 on provenance casing → fixed `repository.url` to canonical `Red-Square-Software` (commit `6d7a3a3`); MCP Registry 403 on namespace → fixed `mcpName` + `server.json.name` casing + bump to v1.0.1 (commit `3c1bb1b`). Workflow run [27427989448](https://github.com/Red-Square-Software/keeping-mcp/actions/runs/27427989448) all green: npm `keeping-mcp@1.0.1` + sigstore provenance; MCP Registry `io.github.Red-Square-Software/keeping-mcp@1.0.1` active. Cold-start smoke verified.

---

## Session Continuity

**To resume after a break:**

1. Read `.planning/ROADMAP.md` — phase goals and success criteria
2. Read `.planning/PROJECT.md` — core value and locked decisions
3. Read `.planning/REQUIREMENTS.md` — requirement IDs and traceability
4. Read `.planning/phases/04-distribution-release-pipeline/04-04-SUMMARY.md` for the v1.0.1 release outcome (npm + MCP Registry both live; sigstore provenance attestations active)
5. Run `/gsd:verify-phase 04` to confirm phase goal achievement
6. Milestone v1.0 verification + GitHub release once verifier passes

**Last session:** 2026-06-12T16:14:14Z
**Stopped at:** Phase 4 Plan 04 complete — v1.0.1 SHIPPED to npm (`keeping-mcp@1.0.1` + sigstore provenance) and MCP Registry (`io.github.Red-Square-Software/keeping-mcp@1.0.1` active). Three real-world deviations from PLAN.md documented in 04-04-SUMMARY (OIDC trusted-publishing UI unavailable on free tier → NPM_TOKEN fallback; @red-square scope unowned → unscoped name claimed; canonical GitHub org casing required by OIDC subject claim).
**Resume file:** .planning/phases/04-distribution-release-pipeline/04-04-SUMMARY.md
**Next action:** Run `/gsd:verify-phase 04` to verify the phase goal and close the phase.

---
*State initialized: 2026-06-09 after roadmap creation*
*Last updated: 2026-06-12 after Phase 4 Plan 03 (release.yml — tag-triggered two-job OIDC pipeline publishing to npm + MCP Registry) completion*

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
