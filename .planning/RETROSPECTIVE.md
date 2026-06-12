# keeping-mcp Retrospective

## Milestone: v1.0 — MVP

**Shipped:** 2026-06-12
**Phases:** 5 | **Plans:** 25 | **Tasks:** 23 | **Timeline:** 2026-06-08 → 2026-06-12 (4 days)
**Tests:** 206/206 passing | **LOC:** ~6.7k TS (src + test) | **Commits:** 139

### What Was Built

- 12 MCP tools wired into stdio server: `keeping_me`, `keeping_organisations`, `keeping_projects`, `keeping_tasks`, `keeping_list_entries`, `keeping_timer_status` (reads); `keeping_add_entry`, `keeping_update_entry`, `keeping_delete_entry`, `keeping_start_timer`, `keeping_stop_timer`, `keeping_resume_timer` (writes).
- Dry-run-by-default writes via shared `previewOrCall` gate (`KEEPING_REQUIRE_CONFIRM=true`); ambiguous-failure envelope on timeout (`AbortError | TimeoutError`).
- Auth: token-as-non-enumerable defence in depth (`JSON.stringify(client)` regression test).
- Rate limit: client-side 120/min throttle + Retry-After-aware 429 backoff (GET-only).
- Europe/Amsterdam date defaults via `Intl.DateTimeFormat("en-CA")` — no `.toISOString()` anywhere.
- Strict 24-hour HH:mm validation on user-supplied start/end (CR-02 gap closure).
- Live OpenAPI mirror as ground truth; anonymised fixture from real probe.
- Distribution: `keeping-mcp@1.0.1` on npm with sigstore provenance attestations.
- MCP Registry: `io.github.Red-Square-Software/keeping-mcp@1.0.1` active.
- Release pipeline: `.github/workflows/release.yml` two-job (ci-gate matrix + publish ubuntu-only) with jq dual-field server.json injection, tag/version-match guard, `npm pack --dry-run` allowlist gate.

### What Worked

- **Vertical-slice MVP mode** — each plan shipped a complete user-observable tool, atomic commits per task. Phase 3's 8 write tools each fit one plan + summary.
- **Pattern-mapper before planning** — Phase 3 cross-tool patterns (preview/confirm, ambiguous classifier, X-Server-Time-Ms surfacing) lifted to shared modules before tool plans.
- **Verify → gap → close cycle** — Phase 3 verifier caught CR-01 + CR-02 (timeout classifier + loose HH:mm) that the green test suite hid. Two-plan gap closure (03-09 + 03-10) ran parallel in Wave 1.
- **Live probe in Phase 2.5** — `npm run probe-live` against real Keeping account discovered Phase 2 contract was wrong on 6 axes; D-32-R hotfix + D-34-R OpenAPI mirror corrected before Phase 3 wrote against it.
- **Cross-platform smoke in CI** — windows-latest + ubuntu-latest × Node 22 + 24 matrix caught Windows ENOENT issues before they reached users.

### What Was Inefficient

- **Phase 4 release plan assumed canonical OIDC trusted publishing** — RESEARCH.md cited the registry's verbatim workflow but did not verify the OIDC trusted-publisher UI is present on free npm accounts. Wasted ~1 hour debugging 404s; landed three deviations (NPM_TOKEN fallback, unscoped name, canonical org casing) that the planner could have surfaced as research open questions.
- **Org name casing discrepancy persisted across phases** — `redsquare-nl` (CLAUDE.md typo) → `red-square-software` (PROJECT/REQUIREMENTS lowercased) → `Red-Square-Software` (OIDC canonical). Caught only at Phase 4 publish step. Earlier doc-audit pass would have caught it.
- **`@red-square` scope rename misdirection** — user direction to publish under @red-square scope wasted one workflow run; the scope was not owned by the publisher's npm account. A pre-publish `curl -s registry.npmjs.org/@<scope>` would have detected ownership before the tag push.
- **Phase 1 + Phase 2 shipped pre-protocol** (no VERIFICATION.md). Audit had to rely on integration verification by later phases. Future milestones: enforce VERIFICATION.md on every phase regardless of phase number.

### Patterns Established

- **`previewOrCall` AND-gate**: every write tool routes user-supplied input through the same dry-run + confirm gate; no parallel write code path.
- **AMBIGUOUS_TEXT byte-exact**: tool description + error envelope text are byte-identical assertions (`toBe`) in tests; drift = test fail.
- **`X-Server-Time-Ms` header surfacing with fallback warn**: live header → number; missing → `Date.now()` + `log.warn`, never `isError`. D-3-19 contract.
- **Three-clause `Array.isArray` extractor guard**: `extractTimeEntry(result)` survives bare-array drift, scalar drift, and `null` drift identically.
- **`check-publish-shape` script as local + CI gate**: same 3 assertions (allowlist, mcpName binding, no .npmignore) run via `npm run check-publish-shape` on dev machines and inside the publish job.
- **Canonical GitHub org casing in OIDC-touched fields**: `mcpName`, `server.json.name`, `repository.url` must match the GitHub OIDC subject claim's canonical casing. Document this as a hard rule.

### Key Lessons

- **External integrations need ownership verification before publish path** — for npm + MCP Registry + GitHub Actions OIDC, do not assume scope/namespace/publisher is owned without a programmatic check.
- **Free-tier feature surface differs from docs** — npm Trusted Publishers UI is paid-tier (or at minimum unstable on free tier). Plan a documented fallback for any "OIDC-first" workflow.
- **Verifier human_needed status is real** — operator actions that cannot be automated (live API smoke, real-account probes) must be tracked as HUMAN-UAT.md and re-surfaced in /gsd:progress. Phase 3 closed with 3 such items carried forward to v1.0 milestone.
- **One MVP/phase scope worked in 4 days** — vertical slicing kept context per plan small enough that a single executor agent could finish in 3–6 min. Phase 3 (10 plans) shipped in one day.

### Cost Observations

- Model mix: opus (planner, complex revisions), sonnet (executor, verifier, checker, researcher).
- Notable: chunked parallel executor agents in Phase 3 Wave 2 (6 plans) executed in ~25 min wall-clock with zero file overlap.
- Plan revision loops stayed bounded (max 2 iterations across 25 plans). Plan-checker BLOCKER+WARNING tagging kept revisions targeted.

## Cross-Milestone Trends

(First milestone — populated from v1.1 onwards.)
