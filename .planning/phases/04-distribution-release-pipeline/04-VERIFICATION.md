---
phase: 04-distribution-release-pipeline
verified: 2026-06-12T17:00:00Z
status: passed
score: 11/11 must-haves verified
overrides_applied: 0
overrides:
  - must_have: "ROADMAP SC #2 wording: 'npm publishes with OIDC (no NPM_TOKEN secret)'"
    reason: "Free-tier npm account does not expose the Trusted Publishers UI. Workflow uses NPM_TOKEN (granular Automation token) for npm auth; sigstore provenance attestation still works via GitHub Actions OIDC (verified — `predicateType: https://slsa.dev/provenance/v1`, transparency log entry published). Deviation documented in 04-04-SUMMARY Deviation 1. Provenance — the substantive intent of REL-02 — is fully achieved."
    accepted_by: "Bart Vanlier"
    accepted_at: "2026-06-12T16:14:14Z"
  - must_have: "ROADMAP SC #2/#3 wording: namespace 'io.github.red-square-software/keeping-mcp' (lowercase)"
    reason: "GitHub OIDC subject claim is case-sensitive against the canonical GitHub org name 'Red-Square-Software'. Lowercase namespace was rejected by mcp-publisher OIDC (403 'You have permission to publish: io.github.Red-Square-Software/*'). Canonical casing is now the published namespace. REQUIREMENTS.md DIST-02 and DIST-05 were amended on 2026-06-12 to reflect the canonical casing. Deviation 3 in 04-04-SUMMARY. ROADMAP.md wording is unchanged but the discovered/published namespace is what the user interacts with."
    accepted_by: "Bart Vanlier"
    accepted_at: "2026-06-12T16:14:14Z"
human_verification: []
---

# Phase 4: Distribution & Release Pipeline Verification Report

**Phase Goal:** Anyone can discover keeping-mcp in the MCP Registry, install it with a single `npx` command on Windows or macOS/Linux, and the project owner can publish a new version by pushing a `v*` tag — no long-lived secrets required.

**Verified:** 2026-06-12T17:00:00Z
**Status:** passed (with 2 documented overrides for external-constraint deviations)
**Re-verification:** No — initial verification

## Goal Achievement

The phase goal decomposes into three end-user outcomes:

1. **Discovery** — keeping-mcp findable in the MCP Registry
2. **Install** — single `npx` command works on Windows and macOS/Linux
3. **Release** — push `v*` tag → npm + MCP Registry without long-lived secrets

Each of the five ROADMAP Success Criteria maps to one or more of these outcomes. All five are observably true in the published state.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC #1: `npm pack --dry-run` ships exactly LICENSE, README.md, dist/bin/keeping-mcp.js, package.json — no `.npmignore`, no stray files | VERIFIED | `npm pack --dry-run --json` parsed locally; `files: ["LICENSE","README.md","dist/bin/keeping-mcp.js","package.json"]`. `npm run check-publish-shape` exits 0 with "tarball contents match allowlist (4 files)". No `.npmignore` in repo. |
| 2 | SC #2: Pushing `v1.0.1` triggered the workflow; npm published with provenance; mcp-publisher published to MCP Registry; server.json version derived from package.json | VERIFIED (with override on "no NPM_TOKEN" wording) | GitHub Actions run `27427989448` SUCCESS (completed 2026-06-12T16:14Z); workflow log shows "Provenance statement published to transparency log: https://search.sigstore.dev/?logIndex=1804070402"; "server.json version set to 1.0.1 (both fields)"; "Tag matches package.json: v1.0.1". npm uses NPM_TOKEN per Deviation 1 (override accepted — free-tier UI limitation; provenance still works via OIDC sigstore signing). |
| 3 | SC #3: MCP Registry entry discoverable at the published namespace; version 1.0.1 active | VERIFIED (with override on lowercase wording) | `GET https://registry.modelcontextprotocol.io/v0/servers?search=keeping-mcp` returns 1 server: `name: "io.github.Red-Square-Software/keeping-mcp"`, `version: "1.0.1"`, `status: "active"`, `isLatest: true`. Canonical casing per Deviation 3 (override accepted; REQUIREMENTS.md amended). |
| 4 | SC #4: README has Windows config block (`cmd /c npx -y keeping-mcp`), macOS/Linux block, 6-step token setup, env var reference, dry-run transcript | VERIFIED | README.md is 179 lines. Windows JSON block at lines 26-38 with `command: cmd, args: ["/c","npx","-y","keeping-mcp"]`. macOS/Linux JSON block at lines 46-58. Token setup (lines 64-71) has 6 numbered steps starting with sign-in and ending with token storage; "Show features for developers" string present. Configuration table at lines 77-82 lists 4 env vars. Dry-run transcript at lines 107-151 has two illustrative JSON blocks (preview + confirm). |
| 5 | SC #5: README front-and-centre warns `KEEPING_REQUIRE_CONFIRM=false` disables dry-run; cold-start `npx -y keeping-mcp` smoke passes (no ENOENT, no silent failure) | VERIFIED | `KEEPING_REQUIRE_CONFIRM=false` appears exactly 2x in README (top callout lines 7-18, in first 60 lines, AND Configuration section callout lines 84-95). Local cold-start verified (this machine): `KEEPING_TOKEN="" node dist/bin/keeping-mcp.js` exits 1 with `[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty` on stderr. 04-04-SUMMARY also documents `/tmp/smoke-cold` cold-start with the same outcome against the published `npx -y keeping-mcp@1.0.1`. |
| 6 | DIST-04: tarball-allowlist invariant guarded mechanically in CI | VERIFIED | `scripts/check-publish-shape.ts` Assertion 1 (`npm pack --dry-run --json` ↔ sorted allowlist exact-equality); workflow `Verify package shape` step runs `npm run check-publish-shape` AFTER `npm run build` and BEFORE `npm publish`. Workflow log confirms it ran and passed for v1.0.1. |
| 7 | DIST-05: namespace claimed in MCP Registry; mcpName↔server.json.name binding guarded | VERIFIED | MCP Registry shows entry under `io.github.Red-Square-Software/keeping-mcp`. `check-publish-shape` Assertion 2 enforces `package.json.mcpName === server.json.name` (both currently `io.github.Red-Square-Software/keeping-mcp`). |
| 8 | REL-02: workflow triggers on `v*` tag; npm publish with provenance; MCP Registry publish via OIDC | VERIFIED (with override) | `.github/workflows/release.yml` `on: push: tags: ["v*"]`; `npm publish --provenance --access public`; `./mcp-publisher login github-oidc && ./mcp-publisher publish`. JOB-LEVEL `permissions: { id-token: write, contents: read }` ONLY on publish job (ci-gate has no id-token write). npm auth uses NPM_TOKEN per Deviation 1; mcp-publisher uses OIDC. Sigstore provenance verified on npm. |
| 9 | REL-03: server.json version derived from package.json at release time (not hand-edited) | VERIFIED | Workflow jq step: `jq --arg v "$VERSION" '.version = $v \| .packages[0].version = $v' server.json`. Post-step assertion: `COUNT=$(jq -r ... '[.version, .packages[0].version] \| map(select(. == $v)) \| length')`; fails if COUNT != 2. Workflow log: "server.json version set to 1.0.1 (both fields)". server.json in repo still reads `0.0.0` (mutation is runner-only, never committed back). |
| 10 | REL-04: README documents token setup + Windows + macOS/Linux + env vars + dry-run transcript | VERIFIED | See Truth #4. |
| 11 | REL-05: README front-and-centre warning about KEEPING_REQUIRE_CONFIRM=false | VERIFIED | See Truth #5. Doubled callout pattern (top + Configuration section). |

**Score:** 11/11 must-haves verified (2 carry overrides for external-constraint deviations documented in 04-04-SUMMARY).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server.json` | MCP Registry manifest with $schema 2025-12-11, canonical-cased name, both version slots `"0.0.0"` placeholder | VERIFIED | 21 lines; `$schema` correct; `name: "io.github.Red-Square-Software/keeping-mcp"`; `version: "0.0.0"`; `packages[0].version: "0.0.0"`; `packages[0].registryType: "npm"`; `packages[0].identifier: "keeping-mcp"`; `packages[0].transport.type: "stdio"`. |
| `package.json` | mcpName canonical-cased, engines.node >=22, files[] whitelist, check-publish-shape script, bin.keeping-mcp | VERIFIED | `version: "1.0.1"`; `mcpName: "io.github.Red-Square-Software/keeping-mcp"`; `engines.node: ">=22.0.0"`; `files: ["dist","README.md","LICENSE"]`; `scripts.check-publish-shape: "tsx scripts/check-publish-shape.ts"`; `bin.keeping-mcp: "./dist/bin/keeping-mcp.js"`. |
| `scripts/check-publish-shape.ts` | Three-assertion pre-publish gate (allowlist + mcpName binding + no .npmignore) | VERIFIED | 87 lines; ALLOWLIST const (4 entries), spawnSync npm pack --dry-run, JSON parse, sorted-array equality, mcpName vs server.json.name, existsSync .npmignore check. Stderr-only output. `npm run check-publish-shape` exits 0 with all three OK lines. |
| `README.md` | Windows config block + macOS/Linux block + 6-step token setup + env var table + dry-run transcript + doubled KEEPING_REQUIRE_CONFIRM=false callout | VERIFIED | 179 lines; all sections present; all anchor strings present (counts: KEEPING_REQUIRE_CONFIRM=false ×2; "Show features for developers" ×1; canonical-cased namespace ×1; cmd /c block ×1 in JSON + 1 in note); both ```json``` blocks for Windows + Linux parse as strict JSON. |
| `.github/workflows/release.yml` | Tag-triggered two-job pipeline (ci-gate matrix + publish ubuntu); job-level OIDC; jq dual-field injection; COUNT==2 guard; tag-match guard; check-publish-shape step | VERIFIED | 131 lines; trigger `on: push: tags: ["v*"]`; ci-gate matrix `[ubuntu-latest, windows-latest] × [22, 24]` with cold-start smoke; publish needs ci-gate; JOB-LEVEL `permissions: { id-token: write, contents: read }` on publish only; all 7 publish steps in order; mcp-publisher pinned to v1.7.9 by exact GitHub releases URL; jq COUNT==2 desync guard; tag-vs-package.json version match guard. Workflow run `27427989448` for v1.0.1 SUCCESS. |
| LICENSE | MIT license file at repo root (DIST-04 requires it in allowlist) | VERIFIED | Present at repo root; included in npm tarball; "MIT License" header. |
| `dist/bin/keeping-mcp.js` | Built bin entry with shebang (DIST-03 / DIST-04) | VERIFIED | Present in dist/bin; included in npm tarball; npm `bin.keeping-mcp` points to it. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `package.json.mcpName` | `server.json.name` | `check-publish-shape` Assertion 2 equality | WIRED | Both fields read `io.github.Red-Square-Software/keeping-mcp`; gate script enforces equality and is called by the release workflow before npm publish. |
| `git push origin v*` (tag) | `.github/workflows/release.yml` (`on: push: tags: ["v*"]`) | GitHub Actions tag-push event | WIRED | v1.0.1 tag-push triggered run `27427989448`; v1.0.0 tag-push triggered earlier runs. Trigger pattern explicit in workflow. |
| Release workflow | npm publish (sigstore provenance attestation) | `npm publish --provenance --access public` + JOB-LEVEL `id-token: write` | WIRED (with override) | npm 1.0.1 published with attestation: `predicateType: https://slsa.dev/provenance/v1`, URL `https://registry.npmjs.org/-/npm/v1/attestations/keeping-mcp@1.0.1`. npm auth uses NPM_TOKEN (Deviation 1) but provenance signing uses OIDC sigstore (verified via transparency log entry `logIndex=1804070402`). |
| Release workflow | MCP Registry publish | `./mcp-publisher login github-oidc && ./mcp-publisher publish` | WIRED | MCP Registry shows entry under `io.github.Red-Square-Software/keeping-mcp` v1.0.1 status active; workflow log confirms login + publish steps succeeded for run `27427989448`. |
| Release workflow | `server.json` version mutation | `jq --arg v "$VERSION" '.version = $v \| .packages[0].version = $v' server.json` + COUNT==2 post-assertion | WIRED | jq expression updates both fields atomically; COUNT-must-be-2 assertion guards desync; workflow log shows "server.json version set to 1.0.1 (both fields)" for v1.0.1 run. |
| Release workflow | `scripts/check-publish-shape.ts` gate | `npm run check-publish-shape` step (AFTER `npm run build`, BEFORE `npm publish`) | WIRED | Step name in workflow: `Verify package shape (allowlist + mcpName binding + no npm ignore file)`; workflow log shows "tarball contents match allowlist (4 files)". |
| README Windows config block | User's claude_desktop_config.json on Windows 11 | Literal JSON snippet with `command: cmd, args: ["/c","npx","-y","keeping-mcp"]` | WIRED | Strict JSON; parses with JSON.parse; pasted verbatim into user config it will resolve npx.cmd via cmd wrapper. RESEARCH §Pitfall 2 addressed. |
| README cold-start dry-run warning | Phase 3 `KEEPING_REQUIRE_CONFIRM` runtime gate | Documented env-var name | WIRED | env var `KEEPING_REQUIRE_CONFIRM` is implemented in src/config.ts (Phase 1 + Phase 2) and consumed by write tools (Phase 3); README documents the disable-with-false semantics in both callouts. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `.github/workflows/release.yml` `$VERSION` | `VERSION="${GITHUB_REF#refs/tags/v}"` | `git push origin v1.0.1` → `GITHUB_REF=refs/tags/v1.0.1` → `VERSION=1.0.1` | Yes — workflow log shows VERSION = "1.0.1" used in tag-match guard AND jq inject | FLOWING |
| `server.json` version (registry) | jq mutation in runner | `jq --arg v "$VERSION"` from above | Yes — MCP Registry entry shows `version: "1.0.1"` AND `packages[0].version: "1.0.1"` (both fields the jq expression rewrote) | FLOWING |
| npm tarball contents | `npm pack --dry-run --json` files array | Repo `files[]` whitelist + dist/bin/keeping-mcp.js build output | Yes — published 1.0.1 tarball contains exactly the 4 allowlisted files (re-verified locally via `npm pack --dry-run`) | FLOWING |
| MCP Registry entry | `mcp-publisher publish` reading `server.json` | Mutated server.json (post-jq) | Yes — Registry GET returns canonical-cased name and version 1.0.1 | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Cold-start with no token exits non-zero with expected stderr (SC #5) | `KEEPING_TOKEN="" node dist/bin/keeping-mcp.js` | Exit code 1; stderr `[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty`; stdout empty | PASS |
| Pre-publish gate exits 0 with current repo state | `npm run check-publish-shape` | Exit 0; three "OK:" lines + "All three assertions passed." | PASS |
| Tarball contents match allowlist | `npm pack --dry-run --json` parsed | `["LICENSE","README.md","dist/bin/keeping-mcp.js","package.json"]` exactly | PASS |
| npm latest registry state | `curl -s https://registry.npmjs.org/keeping-mcp` parsed | `dist-tags.latest === "1.0.1"`; attestations URL + predicateType present | PASS |
| MCP Registry state | `curl -s https://registry.modelcontextprotocol.io/v0/servers?search=keeping-mcp` parsed | 1 server; `name === "io.github.Red-Square-Software/keeping-mcp"`; `version === "1.0.1"`; `status === "active"`; `isLatest === true` | PASS |
| GitHub workflow ran successfully for v1.0.1 | `gh run view 27427989448 --log` | All steps green; provenance statement published to sigstore; server.json mutation logged; mcp-publisher login + publish logged | PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| DIST-04 | 04-01, 04-03 | Published artifact uses files[] whitelist (no .npmignore) so secrets/fixtures/dotfiles cannot leak via npm publish | SATISFIED | `check-publish-shape` enforces it locally + in CI; v1.0.1 tarball verified to contain exactly the 4 allowlisted files via local `npm pack --dry-run` AND workflow log "tarball contents match allowlist (4 files)" |
| DIST-05 | 04-01, 04-04 | Server registered in official MCP Registry under canonical namespace (canonical GitHub org casing per amendment) | SATISFIED | MCP Registry GET confirms entry exists with `name: "io.github.Red-Square-Software/keeping-mcp"` and `status: "active"` |
| REL-02 | 04-03, 04-04 | GitHub Actions release workflow triggers on v* tags, publishes to npm with provenance via OIDC (no NPM_TOKEN secret) and to MCP Registry via mcp-publisher login github-oidc | SATISFIED (with override) | Workflow file shape + run 27427989448 confirm tag→OIDC→provenance→Registry flow. NPM_TOKEN used for npm auth per Deviation 1 (free-tier UI limitation); provenance still works via OIDC sigstore signing. Override accepted. |
| REL-03 | 04-01, 04-03 | server.json version is derived from package.json at release time (not hand-edited) | SATISFIED | jq dual-field expression + COUNT==2 assertion in workflow; server.json on main reads "0.0.0" placeholder (never committed back); MCP Registry shows mutated "1.0.1" — proves derivation path works end-to-end |
| REL-04 | 04-02 | README documents token setup + Windows + macOS/Linux config + env var reference + dry-run transcript | SATISFIED | All four content surfaces present in README; anchor strings verified |
| REL-05 | 04-02, 04-04 | README front-and-centre warns KEEPING_REQUIRE_CONFIRM=false disables dry-run | SATISFIED | Doubled callout pattern; first occurrence in first 60 lines (above-the-fold); literal string appears exactly 2× |

All 6 Phase 4 requirement IDs accounted for. No orphaned requirements detected — every ID declared in plan frontmatter has supporting evidence.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | No TBD/FIXME/XXX debt markers in any Phase 4 file (server.json, scripts/check-publish-shape.ts, README.md, .github/workflows/release.yml, package.json). No hardcoded empty data, no placeholder strings flowing to user output, no console.log. |

### Human Verification Required

None. The phase goal has external observable proof (npm registry state, MCP Registry GET response, GitHub Actions run status, local cold-start smoke). No visual UX, no real-time behavior, no manual interaction needed for the phase goal — installation testing on a fresh Windows machine was the only "human" item and was already completed by the developer per 04-04-SUMMARY (`/tmp/smoke-cold` outcome documented).

### Gaps Summary

No gaps. The phase goal is achieved end-to-end:

- **Discovery:** MCP Registry GET returns the active entry at the canonical namespace
- **Install:** `npx -y keeping-mcp` works on Windows and macOS/Linux (config blocks documented; cold-start failure mode verified)
- **Release:** v1.0.1 tag-push successfully produced the published artifact via the workflow; ci-gate matrix + publish job both passed; sigstore provenance attached; mcp-publisher OIDC succeeded

Two documented deviations from the ROADMAP literal wording are accepted as overrides:

1. **NPM_TOKEN fallback** (Deviation 1) — ROADMAP SC #2 says "no NPM_TOKEN secret"; free-tier npm UI does not expose Trusted Publishers configuration. Workflow uses NPM_TOKEN for npm auth. Sigstore provenance — the substantive REL-02 intent (no long-lived signing key, attestation linked to the commit) — is fully achieved via OIDC.
2. **Canonical casing in namespace** (Deviation 3) — ROADMAP SC #2/#3 write `io.github.red-square-software/keeping-mcp` (lowercase). GitHub OIDC subject claim is case-sensitive and required `Red-Square-Software`. REQUIREMENTS.md DIST-02 + DIST-05 were amended on 2026-06-12 to reflect this. The discovered/published namespace is what end users interact with.

Both deviations are documented in 04-04-SUMMARY, captured in REQUIREMENTS.md amendments, and do not impede the phase goal. They are recorded as `overrides:` in the frontmatter for traceability.

A minor doc-consistency follow-up exists outside the goal-achievement scope: ROADMAP.md SC #2 and SC #3 still write the lowercase namespace string. Not a verification blocker — REQUIREMENTS.md (the requirements contract) is the source of truth and was amended; ROADMAP.md sleep would be a doc-cleanup task.

---

*Verified: 2026-06-12T17:00:00Z*
*Verifier: Claude (gsd-verifier)*
