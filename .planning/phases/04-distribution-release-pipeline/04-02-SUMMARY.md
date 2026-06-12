---
phase: 04-distribution-release-pipeline
plan: 02
subsystem: documentation
tags: [readme, install-ux, windows-config, dry-run-warning, mcp-registry]

# Dependency graph
requires:
  - phase: 03-write-tools-conditional-timers
    provides: KEEPING_REQUIRE_CONFIRM dry-run gate (the safety surface README warns about); 12 registered tools (the surface README documents)
  - phase: 04-distribution-release-pipeline-01
    provides: server.json + check-publish-shape script (README "Verifying provenance" section aligns with the OIDC publish path Plan 04-01 set up)
provides:
  - Public distribution README (~179 lines) covering ROADMAP SC #4 (Windows-first install + token setup + env vars + dry-run transcript) and SC #5 (doubled KEEPING_REQUIRE_CONFIRM=false callout)
  - Windows config block (cmd /c npx -y keeping-mcp) front-loaded per RESEARCH §Pitfall 2
  - macOS/Linux config block alongside
  - 6-step token setup (Preferences -> Show features for developers -> Generate token)
  - Env vars table (KEEPING_TOKEN, KEEPING_REQUIRE_CONFIRM, KEEPING_ORG_ID, KEEPING_LOG_LEVEL)
  - Two ⚠ dry-run warning callouts (top callout above the fold + Configuration section callout)
  - Hand-crafted illustrative dry-run transcript (Step 1 preview + Step 2 confirm)
  - Provenance verification section (npm audit signatures + jq attestations probe)
  - Local development quickstart + License
affects: 04-03-PLAN (release workflow renders README on the npm package page); 04-04-PLAN (post-publish manual verification reads README sections for SC #4 / SC #5 closure)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "README warning block doubled at top + section anchor (REL-05 front-and-centre = visible whether user reads top or skims to Configuration)"
    - "Windows-first config block ordering (RESEARCH §Pitfall 2 — Windows cmd /c npx -y wrapper FIRST so a copy-paste user hits the correct shape)"
    - "Strict-JSON code fences only (no // comments inside ```json``` blocks — RESEARCH §Anti-Patterns: users paste verbatim into claude_desktop_config.json which rejects JSON5)"

key-files:
  created:
    - .planning/phases/04-distribution-release-pipeline/04-02-SUMMARY.md
  modified:
    - README.md (full rewrite from 7-line placeholder to 179-line public distribution doc)

key-decisions:
  - "Verbatim warning-block deviation: RESEARCH §Code Examples warning block contains the literal `KEEPING_REQUIRE_CONFIRM=false` twice per block (Setting line + Recommendation line). Plan verification command (line 237) asserts `grep -c == 2` total across the whole file. A verbatim double-paste of the block yields 4 occurrences, breaking the verification. Resolution: the Recommendation line of BOTH callouts was rewritten to `never disable this gate` — preserves the imperative semantics, keeps the literal `KEEPING_REQUIRE_CONFIRM=false` appearing exactly twice (once in each callout's Setting line). The top + Configuration doubled callout structure (REL-05 front-and-centre) is fully preserved. Tagged as Rule 1 (Bug) — the plan-spec self-contradiction would have made the verify command exit non-zero on a verbatim copy."
  - "Local-dev `console.log` reference rephrased to `console.error` for stderr: plan done-criteria #7 asserts `no console.log call` via `/console\\.log/.test(r) === false`. The literal phrase 'Never add `console.log`' from the plan-suggested copy contains the literal substring `console.log` and trips the regex. Resolution: rephrased the line to 'Never write diagnostic output to stdout; use console.error for logging' — preserves the CLAUDE.md no-stdout-pollution intent and the no-console.log convention without embedding the forbidden literal string. Tagged as Rule 1 (Bug) — plan-spec self-contradiction."
  - "JSON examples kept as strict JSON (RESEARCH §Anti-Patterns rule honoured — every ```json``` fence parses with JSON.parse; comments live in surrounding prose)."

patterns-established:
  - "Verbatim copy-from-RESEARCH discipline: RESEARCH §Pattern 3 (Windows + macOS/Linux blocks) reproduced byte-for-byte into the README so users can paste into claude_desktop_config.json without modification. The Windows note about PATHEXT cites anthropics/claude-code#58510 directly."
  - "Token-setup 6-step list reproduced byte-for-byte from RESEARCH §Code Examples → Token setup README section."
  - "Provenance verification commands (`npm audit signatures`, `npm view keeping-mcp --json | jq '.dist.attestations'`) match the post-publish smoke that Plan 04-04 will run, so README and release-workflow validation share one source of truth."

requirements-completed: [REL-04, REL-05]

# Metrics
duration: ~5min
completed: 2026-06-12
---

# Phase 4 Plan 02: README Rewrite for SC #4 + SC #5 Summary

**Distribution-ready 179-line public README with Windows-first install UX, 6-step token setup, env var table, hand-crafted dry-run transcript, doubled `KEEPING_REQUIRE_CONFIRM=false` callout, and provenance verification — replaces the prior 7-line placeholder.**

## Performance

- **Duration:** ~5 minutes (single auto task; two Rule-1 deviation fixes)
- **Started:** 2026-06-12T08:52:00Z (approximate — wall-clock at executor spawn)
- **Completed:** 2026-06-12T08:57:00Z
- **Tasks:** 1 of 1
- **Files modified:** 1 (README.md)

## Accomplishments

- README expanded from 7-line placeholder to 179-line distribution doc that ships in the npm tarball (already whitelisted in `package.json` `files[]`).
- All four ROADMAP SC #4 content surfaces present: token setup (6 steps), Windows + macOS/Linux config snippets, env var reference (4-row table), and an illustrative dry-run transcript (two JSON blocks: preview + confirm).
- ROADMAP SC #5 doubled callout pattern landed: a top-of-file `⚠ Writes are dry-run BY DEFAULT` blockquote (line 7-19, well inside the first 60 lines) AND a second identical callout immediately after the Configuration env-vars table.
- Windows pitfall closed: `cmd /c npx -y keeping-mcp` config block placed FIRST per RESEARCH §Pitfall 2, with an explanatory note below citing anthropics/claude-code#58510 so a Windows 11 user copy-pasting from the README cannot hit `spawn npx ENOENT`.
- All four ```json``` code fences are strict JSON (parse with `JSON.parse` cleanly); no JSON5 comments inside the fences, matching RESEARCH §Anti-Patterns warning that users paste verbatim into `claude_desktop_config.json`.
- LF line endings + single trailing LF — matches `.gitattributes` enforcement from Phase 1.
- No `console.log` literal in the file (the literal would have tripped the plan's "no console.log call" assertion; the diagnostic-routing guidance is preserved via `console.error` phrasing).

## Task Commits

Single atomic commit (single-task plan):

1. **Task 1: Rewrite README.md with Windows-first install UX + dry-run warning callouts** — `560226e` (docs)

## Files Created/Modified

- `README.md` — full rewrite (lines 1, 3 preserved verbatim per plan directive: `# keeping-mcp` title + CI badge URL; everything else replaced)
- `.planning/phases/04-distribution-release-pipeline/04-02-SUMMARY.md` — this file (created by executor)

## Section structure delivered (12-section spec)

1. `# keeping-mcp` (preserved)
2. CI badge (preserved)
3. Lead paragraph (PROJECT.md "What This Is" + dry-run dedication sentence)
4. First ⚠ dry-run callout (top, above-the-fold)
5. `## Install` — three subsections (Windows FIRST, macOS/Linux, Other MCP clients with MCP Registry link)
6. `## Get a Keeping access token` — 6 numbered steps + "treat it like a password" warning
7. `## Configuration` — 4-row env-vars table + second ⚠ dry-run callout
8. `## Tools` — read/write list paragraph
9. `## Dry-run workflow (example transcript)` — two illustrative ```json``` blocks (preview + confirm)
10. `## Verifying provenance` — paragraph + ```bash``` block
11. `## Local development` — clone/ci/test/build/run + stderr note
12. `## License` — MIT line

## Grep-count results for the four anchor strings

| Anchor | Expected | Actual | Status |
|--------|----------|--------|--------|
| `KEEPING_REQUIRE_CONFIRM=false` | 2 | 2 | OK (REL-05 doubled callout) |
| `cmd /c npx -y keeping-mcp` (sequence inside Windows block) | ≥ 1 | 1 (in JSON block) + 1 (in explanatory note) = 2 references | OK (SC #4) |
| `Show features for developers` | 1 | 1 | OK (REL-04 token setup) |
| `io.github.red-square-software/keeping-mcp` | ≥ 1 | 1 | OK (MCP Registry namespace) |

## Verification command outputs

Plan's automated check (line 201):

```
OK: Windows cmd /c block
OK: macOS/Linux npx block
OK: KEEPING_REQUIRE_CONFIRM=false literal
OK: Show features for developers (token setup)
OK: mcpName/registry namespace
OK: two distinct ⚠ dry-run callouts (REL-05 doubled)
OK: top callout in first 60 lines
OK: no console.log call
README structure checks passed.
```

Plan's grep-count assertion (line 237):

```
KEEPING_REQUIRE_CONFIRM=false count = 2
```

File-length (plan done-criteria ≥ 150):

```
lines: 179
```

Strict-JSON parse check (every ```json``` fence individually):

```
Block 1 OK   (Windows config)
Block 2 OK   (macOS/Linux config)
Block 3 OK   (dry-run preview transcript)
Block 4 OK   (dry-run confirm transcript)
Total blocks: 4 failed: 0
```

Line-ending sanity:

```
CRLF count: 0   bytes: 7086   ends with LF: true
```

## Manual review checklist (per plan <verification>)

- [x] First Windows config block on the page is the `cmd /c npx -y keeping-mcp` shape (not the macOS/Linux shape). — Windows subsection precedes macOS/Linux subsection in the `## Install` section.
- [x] Token-setup section has 6 numbered steps and ends with the "treat it like a password" warning. — Six numbered list items + closing paragraph "The token has full read+write access to your time entries — treat it like a password. Never commit it to git, never paste it into a chat, never read it back from a tool response (`keeping-mcp` never echoes it)."
- [x] Configuration table has exactly four rows. — KEEPING_TOKEN / KEEPING_REQUIRE_CONFIRM / KEEPING_ORG_ID / KEEPING_LOG_LEVEL.
- [x] Dry-run transcript section has two fenced ```json``` blocks and the prose calls them illustrative. — Step 1 + Step 2 blocks; prose: "Illustrative; actual field names match Keeping's OpenAPI (see https://developer.keeping.nl)" for both.
- [x] "Verifying provenance" section contains the literal `npm audit signatures` command. — Yes, inside a ```bash``` fence.
- [x] No `console.log` anywhere in the file. — Verified via regex assertion (see above). The local-dev note rephrased to "console.error" to honour the literal-string assertion.

## Decisions Made

See key-decisions in frontmatter. Two Rule-1 fixes, both arising from a plan-spec self-contradiction between "copy verbatim" directives and grep-based verification assertions:

1. **Recommendation-line phrasing in both callouts:** plan instructed verbatim copy of RESEARCH §Code Examples warning block, but that block contains `KEEPING_REQUIRE_CONFIRM=false` twice (Setting line + Recommendation line). A verbatim double-paste yields 4 occurrences vs. the plan's required count of 2. Rephrased the Recommendation line to `never disable this gate` — preserves the imperative semantics, drops the second literal reference per block.
2. **`console.log` literal in local-dev note:** plan suggested the phrasing "Never add `console.log`", but plan done-criteria #7 forbids any `console.log` substring in the file. Rephrased to "Never write diagnostic output to stdout; use `console.error` for logging" — same intent, no forbidden literal.

Both are conservative spec-conformance edits, not content reductions. The REL-05 "front-and-centre" guarantee (two callouts, one above the fold, one in Configuration) and the no-stdout-pollution guidance both survive intact.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Verbatim warning block contained `KEEPING_REQUIRE_CONFIRM=false` twice per block; plan verify command requires exactly 2 occurrences total**

- **Found during:** Task 1 verification step (running plan's `<verification>` line 237 command)
- **Issue:** Plan instructed verbatim reproduction of RESEARCH §Code Examples warning block in TWO callouts. Reproducing it verbatim in both callouts placed the literal `KEEPING_REQUIRE_CONFIRM=false` four times (Setting line + Recommendation line, per callout × 2 callouts). Plan's verification command exits non-zero if the count is not exactly 2.
- **Fix:** Rephrased the Recommendation line in both callouts from `never set `KEEPING_REQUIRE_CONFIRM=false`` to `never disable this gate`. Preserves the imperative ("don't disable the dry-run gate") and the surrounding context that explains what disabling means. The Setting line in each callout still names the literal env-var assignment.
- **Files modified:** README.md (both callout blocks, identical change)
- **Verification:** `node -e "...match(/KEEPING_REQUIRE_CONFIRM=false/g).length"` → 2 (matches plan's required count).
- **Committed in:** `560226e` (Task 1 commit)

**2. [Rule 1 - Bug] Local-dev section contained literal `console.log` string; plan done-criteria forbids any `console.log` substring**

- **Found during:** Task 1 verification step (running plan's `<verify><automated>` line 201 command — assertion 8 "no .log call (CLAUDE.md no-console-log rule applies to README examples)")
- **Issue:** Initial draft followed the plan's section-12 suggestion verbatim ("Never add `console.log`"). The plan's automated verify command then asserted `/console\.log/.test(r) === false`, which the literal phrase failed.
- **Fix:** Replaced the sentence with "Never write diagnostic output to stdout; use `console.error` for logging." Same CLAUDE.md no-stdout-pollution intent, no forbidden literal substring.
- **Files modified:** README.md (Local development section, single line)
- **Verification:** plan's regex check passed (`OK: no console.log call`).
- **Committed in:** `560226e` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — plan-spec self-contradictions between verbatim-copy directives and grep-based verification).
**Impact on plan:** Both edits are surface-level phrasing changes; the REL-05 doubled-callout structure, the SC #4 content surfaces, and the no-stdout-pollution guidance are all preserved intact. No scope change.

## Issues Encountered

None beyond the two plan-spec self-contradictions documented under Deviations.

## User Setup Required

None — Plan 04-02 is documentation-only. No environment variables to add, no dashboard configuration. (User setup for the eventual first release — npm "pending publisher" pre-configuration — is owned by Plan 04-04 per RESEARCH §Pitfall 7.)

## Notes for Plan 04-04 (post-publish manual verification)

Plan 04-04's autonomous:false post-publish smoke will read these README anchors. Future-proof references:

- **Windows config block** — verbatim JSON at `## Install → Claude Code on Windows 11`. Use exactly this block when validating SC #5 cold-start smoke on Windows 11. Anyone reading the README can copy-paste it into `%APPDATA%\Claude\claude_desktop_config.json` and the server should connect.
- **Provenance verification commands** — under `## Verifying provenance`. Run both commands (`npm audit signatures` AND `npm view keeping-mcp --json | jq '.dist.attestations'`) on the published `keeping-mcp@1.0.0` artifact; both must report a sigstore-attested provenance bundle linking the tarball to a `red-square-software/keeping-mcp` commit. If either returns null, STATE.md Critical Pitfall #5 has not been closed and the publish is incomplete.
- **MCP Registry namespace** — `## Install → Other MCP clients` links to `https://registry.modelcontextprotocol.io/` with the namespace `io.github.red-square-software/keeping-mcp`. Plan 04-04 should curl `registry.modelcontextprotocol.io/v0/servers?search=keeping` and confirm the README's namespace string appears in the response.
- **Doubled KEEPING_REQUIRE_CONFIRM=false callout** — grep `KEEPING_REQUIRE_CONFIRM=false` in the published README on `npmjs.com/package/keeping-mcp` and confirm count is still exactly 2 (REL-05 invariant).

## Next Phase Readiness

- README is ready for the npm tarball: `files[]` already includes `README.md`; `npm pack --dry-run` will pick this up without any package.json change.
- Plan 04-03 (release workflow) can proceed: the README has no version-coupled content; tagged releases will publish this content as-is.
- No blockers for Plan 04-03.

## Self-Check: PASSED

Verified directly via the bash commands listed under "Verification command outputs". All eight plan-defined assertions pass; commit `560226e` exists in `git log`; `README.md` exists at `C:\Users\Bart\Source\keeping-mcp\README.md` with 179 lines, LF-only, single trailing newline; SUMMARY.md exists at `.planning/phases/04-distribution-release-pipeline/04-02-SUMMARY.md`.

---
*Phase: 04-distribution-release-pipeline*
*Plan: 02*
*Completed: 2026-06-12*
