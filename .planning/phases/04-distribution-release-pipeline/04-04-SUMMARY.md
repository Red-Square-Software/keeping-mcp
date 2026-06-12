---
phase: 04-distribution-release-pipeline
plan: 04
subsystem: release-pipeline
tags: [release, npm, mcp-registry, sigstore-provenance, classic-token-fallback]
status: SHIPPED
requires: [04-01, 04-02, 04-03]
provides: [public-distribution, mcp-registry-listing, sigstore-provenance]
affects: [package.json, server.json, README.md, .github/workflows/release.yml]
---

# Plan 04-04 — v1.0.0 → v1.0.1 release (SHIPPED)

## Outcome

Public release shipped end-to-end through `.github/workflows/release.yml`:

- **npm**: `keeping-mcp@1.0.1` published with sigstore provenance attestations (visible at `https://www.npmjs.com/package/keeping-mcp`). v1.0.0 also present as a no-op artifact from an earlier attempt before the MCP Registry casing fix.
- **MCP Registry**: `io.github.Red-Square-Software/keeping-mcp@1.0.1` active, status `active`, `isLatest: true` (visible at `https://registry.modelcontextprotocol.io/v0/servers?search=keeping-mcp`).
- **Provenance**: sigstore transparency log entry linked from the npm package page (run id `27427989448`).
- **Cold-start smoke**: `npx -y keeping-mcp@1.0.1` in a clean dir prints `[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty` to stderr and exits 1 — no ENOENT, no hang.

## Tasks Completed

| # | Task | Status | Evidence |
|---|------|--------|----------|
| 1 | Pending-publisher pre-config (checkpoint) | Done via fallback | OIDC trusted-publisher UI unavailable on free npm account → switched to NPM_TOKEN classic Automation token (commit `09a5730`) |
| 2 | Version decision (checkpoint) | 1.0.0 → 1.0.1 | 1.0.0 went out to npm successfully; 1.0.1 was needed only because of the MCP Registry namespace-casing fix |
| 3 | npm version bump + tag push | Done | tag `v1.0.1` on commit `3c1bb1b`; tag `v1.0.0` retained on `6d7a3a3` for history |
| 4 | Post-publish verification (auto) | Done | `npm view keeping-mcp` shows `1.0.1` `dist.attestations` populated; MCP Registry returns the entry with version 1.0.1 |
| 5 | Cold-start smoke (checkpoint:human-verify) | Done | Cold-start in `/tmp/smoke-cold`: `npx -y keeping-mcp@1.0.1` exits 1, stderr `[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty` |

## Deviations from Plan

The plan assumed the canonical OIDC trusted-publishing path from `04-RESEARCH.md` §Pattern 1. Reality required three deviations:

1. **OIDC trusted publishing unavailable on free npm tier.** The Trusted Publishers UI is not exposed for free accounts. Switched to classic Automation Token authentication (commit `09a5730`). `--provenance` flag still signs via GitHub OIDC → sigstore, so attestations are intact. CLAUDE.md guidance ("Avoid long-lived npm tokens") was knowingly deviated from with a documented trade-off; mitigated by token scope minimization (Automation-only) and finite expiry.

2. **`@red-square` scope was not owned by the publisher's npm account.** Initially attempted to publish under that scope on user direction (commit `2b1cfbf`); npm returned 404 because the scope had no claim. Reverted to unscoped `keeping-mcp` (commit `444215a`), which was unclaimed and successfully registered on first publish.

3. **GitHub OIDC subject claim uses canonical casing `Red-Square-Software`.** `package.json.repository.url` was lowercased and the `mcpName` / `server.json.name` namespace was lowercased; npm provenance check failed E422, then MCP Registry returned 403 with `You have permission to publish: io.github.Red-Square-Software/*`. Fixed in commits `6d7a3a3` (repository.url casing) and `3c1bb1b` (mcpName + server.json.name casing + version bump to 1.0.1).

## Locked Decisions (for future releases)

- **npm auth**: classic Automation token via `NPM_TOKEN` GitHub secret. OIDC trusted publishing remains the preferred path; revisit if user upgrades to a paid npm tier or if npm exposes the UI on free accounts.
- **npm package name**: unscoped `keeping-mcp` (now claimed).
- **MCP Registry namespace**: `io.github.Red-Square-Software/keeping-mcp` — exact canonical GitHub org casing required by the OIDC subject claim.
- **Provenance**: enforced. Every release must carry sigstore attestations; remove the `--provenance` flag only with a documented downgrade decision.

## Commits

| Commit | Purpose |
|--------|---------|
| `7991df7` | release: 1.0.0 (initial version bump) |
| `0a8703a` | fix(04-04): biome formatter violations in check-publish-shape.ts (unblock ci-gate) |
| `2b1cfbf` | build(04-04): publish under @red-square scope (later reverted) |
| `09a5730` | build(04-04): switch npm publish to granular token auth |
| `444215a` | revert(04-04): publish unscoped keeping-mcp instead of @red-square scope |
| `6d7a3a3` | fix(04-04): repository.url casing matches GitHub OIDC subject |
| `3c1bb1b` | release: 1.0.1 (mcpName + server.json.name canonical casing) |

## Verification

- `https://registry.npmjs.org/keeping-mcp` → `latest: 1.0.1`, both `1.0.0` and `1.0.1` present, `1.0.1.dist.attestations` populated.
- `https://registry.modelcontextprotocol.io/v0/servers?search=keeping-mcp` → 1 server, `version: 1.0.1`, `status: active`.
- GitHub Actions run `27427989448` — all jobs green (ci-gate ubuntu+windows × node 22+24, publish ubuntu).
- Cold-start `npx -y keeping-mcp@1.0.1` in `/tmp/smoke-cold` → exit 1, `[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty` to stderr.

## Phase 4 Success Criteria Coverage

| SC | Coverage |
|----|----------|
| #1 (allowlist) | Verified by `check-publish-shape` in ci-gate + publish jobs (Plan 04-01) |
| #2 (tag → OIDC publish + provenance + Registry) | Verified — provenance present, Registry publish via OIDC. npm auth via classic NPM_TOKEN per Deviation 1. |
| #3 (Registry discoverability) | Verified — entry active under `io.github.Red-Square-Software/keeping-mcp` |
| #4 (README Windows + macOS/Linux config blocks) | Covered by Plan 04-02 |
| #5 (REQUIRE_CONFIRM=false warning + cold-start smoke) | Covered by Plan 04-02 + cold-start smoke this plan |

Phase 4 ships.
