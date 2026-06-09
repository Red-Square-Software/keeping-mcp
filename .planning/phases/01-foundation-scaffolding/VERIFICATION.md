---
phase: 01-foundation-scaffolding
verified: 2026-06-09T17:42:00Z
status: gaps_found
score: 13/14 must-haves verified
overrides_applied: 0
gaps:
  - truth: "README badge URL points at the live GitHub repo so the public landing page reflects the actual CI status"
    status: failed
    reason: "README.md still references the old org slug `redsquare-nl` (not `red-square-software`). The badge URL returns HTTP 404, leaving a broken image on the public repo page even though CI itself is green. The org-rename commit (e462694) updated package.json and mcpName but missed README.md."
    artifacts:
      - path: "README.md"
        issue: "Line 5 references `https://github.com/redsquare-nl/keeping-mcp/...` instead of `https://github.com/red-square-software/keeping-mcp/...` — confirmed 404 via HTTP probe; canonical URL returns 200."
    missing:
      - "Replace `redsquare-nl` with `red-square-software` in the README.md badge URL"
human_verification:
  - test: "Visit https://github.com/red-square-software/keeping-mcp in a browser and confirm the README renders the CI badge image (not a broken image icon)"
    expected: "Green `CI passing` badge visible on the repo landing page; clicking it lands on the workflow runs page"
    why_human: "Visual rendering of the README on github.com cannot be asserted by grep/file checks; the fix may also need to be re-pushed before the badge image caches refresh on github.io"
  - test: "From a fresh shell on Windows 11 with no `KEEPING_TOKEN` set, run `node dist/bin/keeping-mcp.js` and verify the exit code, stdout emptiness, and stderr message"
    expected: "Exit code 1; stdout produces zero bytes; stderr contains exactly `[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty`"
    why_human: "Verifier ran this on Windows via Git Bash and confirmed PASS, but a cold-start native-CMD invocation in PowerShell is the canonical Windows user environment and the matrix CI run already exercises both — human can spot-check once more after pulling latest"
  - test: "From a fresh shell with `KEEPING_TOKEN=anything` set, run `node dist/bin/keeping-mcp.js` and confirm no stdout pollution"
    expected: "Exit code 0; stdout produces zero bytes; stderr contains exactly `[keeping-mcp] [INFO] config loaded, server boot deferred to Phase 2`"
    why_human: "Verifier confirmed locally — recording so the human can confirm at the same time as the missing-token case above"
---

# Phase 1: Foundation & Scaffolding — Verification Report

**Phase Goal:** The project compiles, passes CI, and the token guard works — even though no MCP tools exist yet.
**Verified:** 2026-06-09T17:42:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Summary

Phase 1 ships a working TypeScript build, a fail-fast config loader with the exact D-05 stderr message, a stderr-only logger with token-redaction proven by unit test, and a 4-job matrix CI pipeline (ubuntu × windows × node 22/24) that is green on every push to `main`. The GitHub repo is published under `Red-Square-Software/keeping-mcp` with MIT license, description, homepage, and branch protection requiring all four CI contexts.

One real gap was found: the README.md CI-status badge still points at the **old** org slug (`redsquare-nl`). HTTP probe confirms it returns 404, so the badge image on the public repo page is broken even though CI itself is healthy. Cosmetic, not blocking, but in scope per D-19 (placeholder README is part of Phase 1).

Phase 1's `bin/keeping-mcp.ts` is intentionally not yet wired to the MCP SDK per D-02 — that is Phase 2 work. The verifier did **not** flag the absence of `src/server.ts`, `src/keeping/`, or any tool implementations as gaps, because the bare-minimum rule in D-01 explicitly forbids empty stubs in Phase 1.

## Goal Achievement

### Observable Truths (mapped from ROADMAP Success Criteria + REQ-IDs Phase 1 owns)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm run build` produces `dist/bin/keeping-mcp.js` with a shebang-injected bin entry | VERIFIED | `npm run build` exit 0; `dist/bin/keeping-mcp.js` first line is `#!/usr/bin/env node` (tsup banner injection); file size 1.56 KB |
| 2 | Running the bin with `KEEPING_TOKEN` unset exits non-zero with the exact D-05 stderr message and zero stdout bytes | VERIFIED | Behavioral spot-check: `node dist/bin/keeping-mcp.js` (no env) → exit=1, stdout=0 bytes, stderr=`[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty\n`. Same for `KEEPING_TOKEN=""`. |
| 3 | Running the bin with a valid `KEEPING_TOKEN` succeeds and writes diagnostics only to stderr (no stdout pollution) | VERIFIED | Behavioral spot-check: `KEEPING_TOKEN=anything node dist/bin/keeping-mcp.js` → exit=0, stdout=0 bytes, stderr=`[keeping-mcp] [INFO] config loaded, server boot deferred to Phase 2\n`. Phase 1 SC2 (`stdout entirely valid JSON-RPC`) is satisfied trivially because no MCP server boots yet; the no-pollution invariant is enforced and CI smoke proves it on 4 OS/Node combos |
| 4 | `package.json` carries the registry-namespace metadata: `name=keeping-mcp`, `mcpName=io.github.red-square-software/keeping-mcp`, `bin={keeping-mcp: ./dist/bin/keeping-mcp.js}`, `engines.node=>=22.0.0`, MIT license, ESM type | VERIFIED | `node -e` programmatic readout returned all expected values verbatim; `files: ["dist", "README.md", "LICENSE"]` whitelist also present (sets Phase 4 precedent per RESEARCH PITFALLS §npm-publish-safety) |
| 5 | GitHub repo `red-square-software/keeping-mcp` exists, public, MIT licensed, with description, homepage, and 4-context branch protection on `main` | VERIFIED | `gh repo view` returns `visibility=PUBLIC`, `licenseInfo.key=mit`, `description="Open-source MCP server for the Keeping time-tracking API (api.keeping.nl)"`, `homepageUrl=https://api.keeping.nl`. `gh api ...branches/main/protection` confirms 4 required contexts (`CI (ubuntu/windows-latest, Node 22/24)`), `required_linear_history=true`, `allow_force_pushes=false`, `strict=true` |
| 6 | CI runs on every push to `main` and is currently green | VERIFIED | `gh run list` shows two consecutive runs on `main` (27216686652 + 27216408956) both `completed/success` for HEAD `88831b2` and `e462694` |
| 7 | A unit test asserts the fake test-token string is redacted (`***`) from logger output — proves AUTH-03 from day one | VERIFIED | `test/logger.test.ts` has 3 vitest cases (object args, string args, level gating). `npx vitest run` → 3/3 passed in 217ms. Fake token `kp_test_FAKE_token_value` is verified absent from captured stderr |
| 8 | Token is read from `KEEPING_TOKEN` env var only — no hardcoded fallback anywhere in source (AUTH-01) | VERIFIED | Grep across `{src,bin,test}/**/*.ts` shows `KEEPING_TOKEN` only in `src/config.ts` (Zod schema, error message) and `bin/keeping-mcp.ts` (`config.KEEPING_TOKEN` passed to logger). The only `process.env` access in source is `process.env` parsed by Zod in `loadConfig` |
| 9 | Token is never logged to stdout, never echoed in tool responses, never included in error messages (AUTH-03) | VERIFIED | `logger.ts` writes to `process.stderr.write` only; `replaceAll(token, "***")` runs at the emit step on every line. Biome rule `noConsole.allow=["error"]` + grep across source confirms no `console.log` / `process.stdout.write` calls. The single `process.stdout.write` mention in source is the rule-comment on line 1 of `logger.ts` |
| 10 | `KEEPING_REQUIRE_CONFIRM` dry-run toggle exists in the config layer and defaults to `true` (per task brief; AUTH-04 is formally Phase 2 but the toggle was wired in Phase 1) | VERIFIED | `src/config.ts` line 7: `KEEPING_REQUIRE_CONFIRM: z.stringbool().default(true)` — Zod 4 `z.stringbool()` handles `"true"/"false"/"1"/"0"` env-string coercion; default is the boolean `true`. No write surface exists yet (Phase 3), but the gate is in place |
| 11 | `KEEPING_ORG_ID` optional env var is recognised by the config loader (forward-compat for AUTH-05; safe to land in Phase 1) | VERIFIED | `src/config.ts` line 8: `KEEPING_ORG_ID: z.string().optional()` |
| 12 | CI workflow file exists at `.github/workflows/ci.yml` with the required matrix and step order (lint → typecheck → test → build → smoke) | VERIFIED | File present and committed at `bf74101`. Matrix `[ubuntu-latest, windows-latest] × [22, 24]` with `fail-fast: false`; concurrency `cancel-in-progress`; smoke step uses `shell: bash` (Git Bash on Windows) with `grep -qF` fixed-string assertion against the D-05 literal |
| 13 | MIT `LICENSE` committed at repo root (REL-01 + DIST-03 publish-readiness) | VERIFIED | `LICENSE` present, year `2026`, copyright `Bart Vanlier / RedSquare`, MIT body intact |
| 14 | README.md CI badge URL points at the live repo so the public landing page reflects CI status | FAILED | `README.md` line 5 references `https://github.com/redsquare-nl/keeping-mcp/...` (old org slug). HTTP probe: `redsquare-nl=404`, `red-square-software=200`. Badge appears broken on the public repo page even though CI is healthy |

**Score:** 13/14 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | ESM, Node>=22, bin, mcpName, files whitelist, MIT, Zod dep | VERIFIED | All fields exact match; Zod 4.4.3 installed (deviation from research's Zod ^3.25 documented in 01-01-SUMMARY decisions — Zod 4 is required for `z.stringbool()`) |
| `tsconfig.json` | Strict, Node16 module + moduleResolution, noEmit, ES2023 | VERIFIED | All required compilerOptions present; include extended with `*.ts` to avoid TS18003 on empty source dirs |
| `tsup.config.ts` | ESM, target node22, shebang banner, clean | VERIFIED | Banner injects `#!/usr/bin/env node`; entry produces `dist/bin/keeping-mcp.js`; no source maps |
| `biome.json` | noConsole rule allowing only `error`; recommended preset | VERIFIED | `noConsole.level=error, allow=["error"]`; `files.includes` excludes dist/node_modules/coverage/.planning |
| `vitest.config.ts` | node environment | VERIFIED | Minimal config; environment node |
| `src/logger.ts` | Bare stderr wrapper, token capture + replaceAll redaction, level gating | VERIFIED | 30 lines; factory captures `token` at construction; emit replaces token with `***` before write; LEVEL_ORDER gate |
| `src/config.ts` | Zod 4 ConfigSchema, exact D-05 message, KEEPING_REQUIRE_CONFIRM default true, KEEPING_ORG_ID optional, log level default info | VERIFIED | Schema correct; `error` option + `min(1)` together produce D-05 message for both undefined and empty cases (auto-fix documented in 01-02-SUMMARY) |
| `bin/keeping-mcp.ts` | loadConfig + createLogger + log.info + exit(0); NO MCP boot per D-02 | VERIFIED | 7 lines; imports use `.js` extension (Node16 module resolution requirement); no `connect(transport)` |
| `test/logger.test.ts` | Vitest test asserting fake token absent from output | VERIFIED | 3 tests, all pass; uses fake token `kp_test_FAKE_token_value` (SC5 spec is `kp_test_FAKE` substring — satisfied) |
| `.github/workflows/ci.yml` | Matrix CI per D-10/11/12 | VERIFIED | Triggers on push to all branches + PR to main; matrix correct; smoke step uses `grep -qF` and the D-05 literal |
| `LICENSE` | MIT | VERIFIED | Present, year 2026, MIT body |
| `README.md` | Placeholder per D-19: H1, CI badge slot, ROADMAP.md link | WIRED but badge URL broken (see truth #14) | H1 + badge slot + ROADMAP link all present; badge URL points at wrong org slug |
| `.gitignore` | node_modules/, dist/, coverage/, .env, .env.*, *.log per D-21 | VERIFIED | Plus `.tsbuildinfo` and `.idea/` (additions are safe) |
| `.gitattributes` | LF enforcement per D-21 implicit (prevents Windows CRLF shebang corruption) | VERIFIED | `* text=auto eol=lf` + explicit `*.sh/*.ts/*.js/*.json/*.yml eol=lf` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `bin/keeping-mcp.ts` | `src/config.ts` (`loadConfig`) | named import `../src/config.js` | WIRED | Import resolves; runtime spot-check confirms config is loaded |
| `bin/keeping-mcp.ts` | `src/logger.ts` (`createLogger`) | named import `../src/logger.js` | WIRED | Import resolves; runtime spot-check confirms logger emits `[keeping-mcp] [INFO] config loaded, server boot deferred to Phase 2` to stderr |
| `src/config.ts` | `process.env.KEEPING_TOKEN` | `ConfigSchema.safeParse(process.env)` | WIRED | No hardcoded fallback; missing/empty value produces exit 1 with D-05 message |
| `src/logger.ts` (`createLogger`) | `process.stderr.write` | direct call inside `emit` | WIRED | Behavioral check confirms output lands on stderr only; stdout stays empty |
| `src/logger.ts` (`createLogger`) | token-redaction at emit | `serialized.replaceAll(token, "***")` | WIRED | Unit test proves output never contains the literal fake token |
| `.github/workflows/ci.yml` smoke step | `dist/bin/keeping-mcp.js` D-05 message | `grep -qF "[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty"` | WIRED | CI run 27216686652 PASS on all 4 matrix jobs at HEAD `88831b2` |
| `package.json` `bin` | tsup entry output path | `./dist/bin/keeping-mcp.js` ↔ entry `{ "bin/keeping-mcp": "bin/keeping-mcp.ts" }` | WIRED | Build produces exactly the path the bin field declares |
| `package.json` `mcpName` | repository URL / org slug | both reference `red-square-software` | WIRED | mcpName, repository URL, homepage all use lowercase canonical slug |
| `README.md` badge URL | live GitHub workflow | `https://github.com/redsquare-nl/keeping-mcp/...badge.svg` | NOT_WIRED | Points at old org slug; HTTP 404. Should be `red-square-software` |

### Data-Flow Trace (Level 4)

Phase 1 does not render dynamic data — the bin produces a single static info message on the success path and a single static error message on the failure path. Level 4 is **N/A** for this phase. Re-evaluate at Phase 2 when tools start emitting tool-response payloads sourced from the Keeping API.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build produces a runnable shebang'd binary | `npm run build` | exit 0; `dist/bin/keeping-mcp.js` 1.56 KB; first line `#!/usr/bin/env node` | PASS |
| Missing token: exit non-zero, empty stdout, exact D-05 stderr | `node dist/bin/keeping-mcp.js` (env unset) | exit=1, stdout=0 bytes, stderr=`[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty` | PASS |
| Empty-string token: same outcome as missing | `KEEPING_TOKEN="" node dist/bin/keeping-mcp.js` | exit=1, stdout=0 bytes, stderr=D-05 message | PASS |
| Valid token: exits cleanly, only stderr diagnostic | `KEEPING_TOKEN=anything node dist/bin/keeping-mcp.js` | exit=0, stdout=0 bytes, stderr=`[keeping-mcp] [INFO] config loaded, server boot deferred to Phase 2` | PASS |
| Vitest suite (token-redaction contract) | `npx vitest run` | 3/3 pass in 217 ms | PASS |
| Typecheck | `npx tsc --noEmit` | exit 0 | PASS |
| GitHub repo metadata | `gh repo view red-square-software/keeping-mcp --json ...` | public, MIT, description + homepage set | PASS |
| Branch protection on main | `gh api .../branches/main/protection` | 4 required contexts, strict, linear, no force push, no deletion | PASS |
| CI runs on main | `gh run list --workflow=ci.yml` | 2 consecutive `success` runs (HEAD 88831b2, e462694) | PASS |
| README badge URL resolves | `curl -s -o /dev/null -w "%{http_code}"` | redsquare-nl=404, red-square-software=200 | FAIL — old slug 404s |

Local biome check reports one error on `.claude/settings.local.json` — but `.claude/` is untracked in git, did not exist at the time CI ran, and is not a Phase 1 deliverable. Not a phase gap.

### Probe Execution

No probe scripts declared by Phase 1 plans. Phase 1's "smoke test" lives inside the CI workflow itself (`grep -qF` against the D-05 literal after a `node dist/bin/keeping-mcp.js` invocation with unset token) and was re-executed by the verifier as a behavioral spot-check above. **N/A.**

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DIST-01 | 01-01-PLAN | Server installable/runnable via `npx keeping-mcp` | SATISFIED | `bin` field + tsup-injected shebang + Windows CI green — `npx` will resolve once published. Truth #4, #6 |
| DIST-02 | 01-01-PLAN | npm name + `mcpName` for MCP Registry | SATISFIED | `name=keeping-mcp`, `mcpName=io.github.red-square-software/keeping-mcp` (Truth #4) |
| DIST-03 | 01-01-PLAN | Shebang works cross-platform | SATISFIED | Banner injects `#!/usr/bin/env node`; `.gitattributes` enforces LF; Windows matrix job is green (Truth #6, #12) |
| AUTH-01 | 01-02-PLAN | Token from `KEEPING_TOKEN` env only | SATISFIED | Truth #8 |
| AUTH-02 | 01-02-PLAN | Missing token fails fast on stderr before transport | SATISFIED | Truth #2 (no MCP server boots at all in Phase 1 — fails earlier than spec requires) |
| AUTH-03 | 01-02-PLAN | Token never leaks at any level | SATISFIED | Truth #7 + #9; unit test enforces |
| SAFE-01 | 01-03-PLAN + 01-02-PLAN | All log output → stderr; CI smoke proves it | SATISFIED | Truth #3 + #9 + #12; biome `noConsole` lint guard; valid-token spot-check confirms only stderr emits |
| REL-01 | 01-03-PLAN | GitHub repo + MIT + CI on push | SATISFIED | Truths #5, #6, #13 |

**Orphaned requirements check:** REQUIREMENTS.md traceability table (lines 109–146) maps **exactly** DIST-01, DIST-02, DIST-03, AUTH-01, AUTH-02, AUTH-03, SAFE-01, REL-01 to Phase 1 — the same 8 IDs the Phase 1 plans claim. **No orphans.**

**Note on AUTH-04 / SAFE-01 toggle handling:** The task brief asked the verifier to confirm `KEEPING_REQUIRE_CONFIRM` exists and defaults to `true`. It does (Truth #10). REQUIREMENTS.md formally maps AUTH-04 to Phase 2, so it is *not* counted as a Phase 1 requirement here — but the toggle landed early in Phase 1's config layer, which is a clean head-start with no downside.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/logger.ts` | 1 | Comment string mentions `process.stdout.write` | Info | False positive — this is the rule-comment per RESEARCH.md Pitfall 5 guidance, not a call. Verified by code inspection: line 1 starts with `// RULE: never call ...` |
| `bin/keeping-mcp.ts` | 6 | `log.info("config loaded, server boot deferred to Phase 2")` | Info | Intentional placeholder per D-02 (no MCP server in Phase 1). Documented in 01-02-SUMMARY "Known Stubs" section. The message is informative, not a stub of unwired wiring |
| `README.md` | 5 | Badge URL references `redsquare-nl` (old org slug) | Warning | Returns HTTP 404; broken image on public repo page. See Truth #14 / Gap #1 |

No `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, `PLACEHOLDER`, `console.log`, or actual `process.stdout.write` calls anywhere in `{src,bin,test}/**/*.ts`. No debt-marker gate violation.

### Human Verification Required

See `human_verification` block in the frontmatter for the structured list. In narrative form:

1. **Visual check of the public repo landing page** — once the README badge URL is fixed (gap #1), confirm the CI badge actually renders as a green image on https://github.com/red-square-software/keeping-mcp. Browser cache + GitHub Camo proxy can take a few minutes to refresh.

2. **Cold-start Windows native shell smoke** — verifier ran the missing-token smoke via Git Bash on Windows and via the CI matrix (`windows-latest`). Spot-check by opening a fresh PowerShell or cmd.exe window, running `node dist/bin/keeping-mcp.js` with no env var, and confirming exit=1 + the D-05 message on stderr (use `2>` redirect to isolate from PowerShell's NativeCommandError wrapping).

3. **Valid-token success path** — same shell, with `KEEPING_TOKEN=anything`, confirm the info line lands on stderr only and stdout is empty.

### Gaps Summary

**One real gap (cosmetic but in-scope):** The README CI badge URL references the old org slug `redsquare-nl`. The org-rename commit (e462694) updated the namespace everywhere it mattered for registry/build correctness (package.json name+mcpName+repository+homepage, GitHub remote URL, branch protection) but the README badge URL was missed. The result is a broken-image badge on the public repo page even though every CI run on `main` is green. This is in-scope for Phase 1 because D-19 explicitly defines the placeholder README (including the badge slot) as a Phase 1 deliverable.

Everything else — config-loader fail-fast, exact D-05 stderr message, stdout cleanliness, token redaction with proof-by-test, ESM+Node22 build pipeline, matrix CI on Windows + Linux, MIT LICENSE, GitHub repo metadata, 4-context branch protection — is verified by file inspection plus behavioral spot-check plus live `gh api` queries. The MCP-SDK / tool surface absence is intentional per D-02 and is **not** flagged.

---

*Verified: 2026-06-09T17:42:00Z*
*Verifier: Claude (gsd-verifier)*
