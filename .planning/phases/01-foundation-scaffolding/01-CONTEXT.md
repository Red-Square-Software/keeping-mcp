# Phase 1: Foundation & Scaffolding - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up the TypeScript project skeleton, fail-fast configuration loader, stderr-only logger, and CI pipeline. The built binary runs end-to-end via `node dist/...` (or `npx keeping-mcp` after `npm link`) and exits cleanly with a clear stderr error when `KEEPING_TOKEN` is missing. No MCP server boot, no tools, no HTTP yet — those land in Phase 2.

Requirements covered: DIST-01, DIST-02, DIST-03, AUTH-01, AUTH-02, AUTH-03, SAFE-01, REL-01.

</domain>

<decisions>
## Implementation Decisions

### Source Layout
- **D-01:** Use the research-recommended `src/` shape: `bin/keeping-mcp.ts` (entrypoint), `src/config.ts` (env validation + types), `src/logger.ts` (stderr wrapper). `src/keeping/client.ts`, `src/server.ts`, `src/tools/` are NOT created in Phase 1 — they appear when implemented in Phase 2/3 (bare-minimum rule, no empty stubs).
- **D-02:** `bin/keeping-mcp.ts` is the only published bin entry. Its job in Phase 1: call `loadConfig()` from `src/config.ts`; on validation failure, write the error to stderr and `process.exit(1)` before any further imports. Do NOT call `connect(transport)` yet — the MCP server doesn't exist in Phase 1.
- **D-03:** `package.json` ships ESM only (`"type": "module"`), `"engines": { "node": ">=22.0.0" }`, `"bin": { "keeping-mcp": "./dist/bin/keeping-mcp.js" }`, `"mcpName": "io.github.red-square-software/keeping-mcp"`, MIT license declared.

### Config Loader
- **D-04:** `src/config.ts` reads `process.env.KEEPING_TOKEN` (required), `process.env.KEEPING_REQUIRE_CONFIRM` (default `"true"`), `process.env.KEEPING_ORG_ID` (optional). Validation via Zod (already in dep tree for Phase 2 tool schemas — no extra dep cost).
- **D-05:** Missing/empty `KEEPING_TOKEN` throws a typed error with the exact message `[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty`. Entrypoint catches and exits non-zero. No stack trace to stderr (clean UX); stack only shown when `KEEPING_LOG_LEVEL=debug`.

### Logger
- **D-06:** Bare `process.stderr.write` wrapper, ~15 LOC, in `src/logger.ts`. Exports `log.debug/info/warn/error`. Output format: `[keeping-mcp] [LEVEL] message`. No JSON, no library.
- **D-07:** Level gated by `KEEPING_LOG_LEVEL` env (default `info`; accepts `debug|info|warn|error`).
- **D-08:** Token redaction at the emit step: logger captures the `KEEPING_TOKEN` value at construction time and string-replaces it with `***` in every log line before write. Cheap protection against accidental object dumps that include Authorization headers (Phase 2 risk).
- **D-09:** Nothing in the codebase may use `console.log` — biome rule `noConsole` configured to allow only `console.error`. `process.stdout.write` is also forbidden by lint. CI smoke test verifies this empirically (see D-13).

### CI Matrix
- **D-10:** GitHub Actions workflow runs on every push and PR. Matrix: OS `[ubuntu-latest, windows-latest]` × Node `[22, 24]`. Four jobs. Skipping macOS to stay budget-conscious; Windows is the regression risk that matters (research pitfall #2 — `npx.cmd` shebang/path handling).
- **D-11:** Job steps: `npm ci` → `biome check .` (lint+format) → `tsc --noEmit` (typecheck) → `vitest run` (unit tests) → `npm run build` (tsup bundle) → smoke test (D-13).
- **D-12:** Workflow file lives at `.github/workflows/ci.yml`. Required to merge.

### Smoke Test
- **D-13:** Phase 1 smoke test mechanic: run the built bin with `KEEPING_TOKEN` unset; assert (a) exit code ≠ 0, (b) stderr contains the literal config-error message from D-05, (c) stdout is exactly empty bytes. Runs on both OS rows of the matrix.
- **D-14:** Implemented as a shell-portable script. On Linux/macOS use a bash one-liner; on Windows use a PowerShell equivalent in the same step. No need for cross-platform Node helper script in Phase 1.
- **D-15:** Full MCP `initialize` handshake smoke is deferred to Phase 2 once `src/server.ts` exists.

### Token-Leak Unit Test
- **D-16:** Test in `test/logger.test.ts` (vitest): construct logger with fake token `"kp_test_FAKE_token_value"`; call `log.error({ headers: { Authorization: 'Bearer kp_test_FAKE_token_value' } })`; assert captured stderr output does NOT contain the literal `kp_test_FAKE_token_value` substring.
- **D-17:** Same test runs `npm pack --dry-run` parse stub later in Phase 4; in Phase 1 just the logger contract is enforced.

### GitHub Repo & Branch Protection
- **D-18:** Remote `red-square-software/keeping-mcp` already exists but is empty. Phase 1 tasks: (a) add as `origin`, (b) push current local commits, (c) `gh repo edit` to set description "Open-source MCP server for the Keeping time-tracking API" and homepage. (d) write `LICENSE` (MIT, copyright Bart Vanlier / RedSquare) and placeholder `README.md` to root.
- **D-19:** Placeholder `README.md` scope: project name as H1, one-line description, badge slot (CI), "Status: work in progress — see [.planning/ROADMAP.md](.planning/ROADMAP.md) for current phase". The full install/usage README is REL-04 in Phase 4.
- **D-20:** Branch protection on `main` configured AFTER first successful CI run on the remote: require `ci` workflow status check + require linear history. No required reviewers (solo dev). Direct push to `main` blocked once protection active — Phase 2+ uses feature branches and self-merged PRs.
- **D-21:** `.gitignore` augmented in Phase 1 with `node_modules/`, `dist/`, `coverage/`, `.env`, `.env.*`, `*.log`. `.idea/` is already untracked.

### Claude's Discretion
- Exact tsup config knobs (target, format, dts, sourcemap on/off) — pick standard ESM bundle defaults; no source maps in dist to keep package small.
- biome.json rule set — start from the recommended preset; customize only when a rule clashes with the codebase style.
- Vitest config — defaults; no coverage threshold gating in Phase 1.
- Lefthook/husky vs none — skip pre-commit hooks entirely in Phase 1; rely on CI. Reconsider in Phase 4 if accidental bad commits become a pattern.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Scope
- `.planning/PROJECT.md` — Project context, locked decisions, Core Value
- `.planning/REQUIREMENTS.md` — All v1 REQ-IDs with traceability table; Phase 1 covers DIST-01/02/03, AUTH-01/02/03, SAFE-01, REL-01
- `.planning/ROADMAP.md` §Phase 1 — Phase goal, success criteria, dependencies

### Research (locked stack and pitfalls)
- `.planning/research/STACK.md` — `@modelcontextprotocol/sdk ^1.29`, Zod ^3.25, tsup, vitest, biome, Node ≥22; npm `mcpName` requirement
- `.planning/research/ARCHITECTURE.md` §"Component structure" — 5-layer module split, `bin/keeping-mcp.ts` shape, `loadConfig` shape, fail-fast policy
- `.planning/research/PITFALLS.md` §1 — stdout pollution corrupts JSON-RPC stream; stderr-only logging rule
- `.planning/research/PITFALLS.md` §2 — Windows `npx.cmd` failure; reason for `windows-latest` in matrix
- `.planning/research/PITFALLS.md` §"npm publish safety" — `files` whitelist over `.npmignore`; Phase 4 enforces, Phase 1 sets the precedent in `package.json`
- `.planning/research/SUMMARY.md` — Executive summary, build-order constraints

### External (verify versions at planning time)
- https://www.npmjs.com/package/@modelcontextprotocol/sdk — confirm current `^1.29` minor
- https://biomejs.dev/recipes/git-hooks/ — biome CI invocation patterns
- https://nodejs.org/en/about/previous-releases — confirm Node 22 LTS still active, Node 24 status

### No project-local ADRs or external specs exist yet — this is the first phase. The PROJECT.md / REQUIREMENTS.md / research suite is the sole source of truth.

</canonical_refs>

<code_context>
## Existing Code Insights

Greenfield repository. Only `CLAUDE.md` (auto-generated GSD project guide) and `.planning/` artifacts exist in the working tree.

### Reusable Assets
- None — no prior code to reuse.

### Established Patterns
- None in code. Patterns from research/STACK.md and research/ARCHITECTURE.md apply as forward-looking rules.

### Integration Points
- The MIT `LICENSE` and placeholder `README.md` must land at the repo root, not under `.planning/`, so npm and the MCP Registry can pick them up at publish time.
- `CLAUDE.md` already exists at the root and was generated by `gsd-sdk` — do not overwrite. Augment with project-specific sections during Phase 4 docs work if needed.

</code_context>

<specifics>
## Specific Ideas

- Stderr message wording is exact: `[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty` — used both as the user-facing string and as the literal CI smoke test assertion target.
- Description for `gh repo edit`: "Open-source MCP server for the Keeping time-tracking API (api.keeping.nl)".
- Placeholder README must point at `.planning/ROADMAP.md` so visitors landing on the repo before v1 know the project is actively planned, not abandoned.

</specifics>

<deferred>
## Deferred Ideas

- Pre-commit hooks (lefthook/husky) — defer; reconsider at Phase 4 if needed.
- `outputSchema` on tools — Phase 2+ once wire format known.
- Provenance / SLSA badge in README — DISTv2-01 (v2).
- Source maps in dist — defer until a real consumer asks.
- macOS CI job — defer; reconsider if a macOS-only failure surfaces post-release.
- Required PR reviewers / CODEOWNERS — defer until contributors join.

</deferred>

---

*Phase: 1-Foundation & Scaffolding*
*Context gathered: 2026-06-09*
