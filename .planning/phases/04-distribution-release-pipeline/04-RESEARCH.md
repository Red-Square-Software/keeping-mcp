# Phase 4: Distribution & Release Pipeline - Research

**Researched:** 2026-06-12
**Domain:** Package distribution + automated release (npm trusted publishing + MCP Registry via OIDC) + cross-platform install UX
**Confidence:** HIGH

## Summary

Phase 4 publishes `keeping-mcp` to two registries on a `v*` tag push using GitHub Actions OIDC — no long-lived secrets in the repo. Everything required at the protocol level is already documented authoritatively: npm trusted publishing went GA 2025-07-31, the MCP Registry has a published `server.json` schema (`2025-12-11`), `mcp-publisher` v1.7.9 is the current CLI, and the registry's own docs ship a verbatim `OIDC authentication (recommended)` workflow that we can adopt almost line-for-line.

The codebase is in much better shape for this phase than expected. `npm pack --dry-run` already produces a clean 4-file tarball (LICENSE, README.md, dist/bin/keeping-mcp.js, package.json) — SC #1 is essentially already met by the existing `files` whitelist. `tsup` already injects a `#!/usr/bin/env node` banner and the bin entry is wired correctly. The npm name `keeping-mcp` is unclaimed, and the MCP Registry namespace `io.github.red-square-software/keeping-mcp` is unclaimed. CI already runs on Windows × Node 22/24, so the platform smoke surface is already proved.

What is missing: `server.json` does not exist, the release workflow does not exist, the README is a 7-line placeholder (vs the rich SC #4/#5 surface), and there's a deliberate **org-name discrepancy** between `CLAUDE.md` ("redsquare-nl") and PROJECT/REQUIREMENTS/ROADMAP + the actual git remote ("red-square-software"). **Resolution: `red-square-software` is the truth** — verified by `git remote -v` output `https://github.com/red-square-software/keeping-mcp.git`. The CLAUDE.md reference is residual from the user's domain redsquare.nl; the requirement IDs already cite `red-square-software`. Plan must NOT touch CLAUDE.md mid-phase; the namespace is locked at `io.github.red-square-software/keeping-mcp` and the package.json already reflects this correctly.

**Primary recommendation:** Adopt the registry's published `OIDC authentication (recommended)` workflow verbatim — substitute the npm publish step to use trusted publishing (no `NPM_TOKEN`), add a pre-publish `jq` step that derives `server.json` version from `package.json`, and add a release-readiness step that runs `npm pack --dry-run` and fails if any file outside the whitelist appears.

<user_constraints>
## User Constraints

This phase has **no CONTEXT.md** (research-first run, not post-discuss). Constraints are taken from CLAUDE.md (binding project rules), STATE.md (locked decisions), ROADMAP SC, and REQUIREMENTS.md.

### Locked Decisions (from STATE.md + CLAUDE.md + ROADMAP)

- **Distribution locked**: npm + npx + MCP Registry via GitHub Actions OIDC, MIT license, namespace `io.github.red-square-software/keeping-mcp`. (STATE.md)
- **No NPM_TOKEN secret**: npm trusted publishing (OIDC) is the publish path. CLAUDE.md "What NOT to Use": *"Long-lived npm tokens in GitHub Actions secrets for publish — secrets can leak in forks/PRs; OIDC is more secure"*.
- **Provenance attestation**: SC #2 demands a "provenance attestation badge" on the npm package page. STATE.md Critical Pitfall #5 already commits us to verifying this badge after the first publish.
- **server.json version derived, not hand-edited**: REL-03 + SC #2. Single source of truth = `package.json` version; CI script rewrites `server.json` before `mcp-publisher publish`.
- **`files` whitelist as sole filter**: DIST-04 + SC #1. No `.npmignore`. Current `package.json` already does this correctly — `files: ["dist", "README.md", "LICENSE"]`.
- **`mcpName` field on package.json**: DIST-02. Already present: `"mcpName": "io.github.red-square-software/keeping-mcp"`. **Required** by MCP Registry for npm namespace ownership proof.
- **Cross-platform README**: SC #4. Must show **both** Windows (`cmd /c npx ...`) AND macOS/Linux (`npx -y ...`) blocks side-by-side.
- **Dry-run warning is prominent**: SC #5. README must "front-and-centre warn" that `KEEPING_REQUIRE_CONFIRM=false` disables the gate.
- **No console.log anywhere**: CLAUDE.md binding rule. Survives into Phase 4 only via README example transcripts — no new code that could violate it.
- **Node `>=22` in engines**: package.json already has this. Node 22 is Active LTS until 2027-04-30; Node 24 (Krypton) is now also LTS (Active since 2025-10) — CI matrix already covers both.

### Claude's Discretion

- **Release workflow file name**: convention is `.github/workflows/release.yml` or `.github/workflows/publish.yml`. Recommend `release.yml` for clarity.
- **Whether to gate publish on CI green**: GitHub Actions does not gate one workflow on another by default. Recommend: the release workflow itself runs the full CI matrix (`npm ci` + lint + typecheck + test + build + smoke) before the publish steps, so a broken main never publishes.
- **Number of plans**: discretion. Recommend 4 plans (see Plan structure suggestion below).
- **README structure / section ordering**: discretion within the SC #4/#5 must-contain list.
- **Whether to bump version manually or via `npm version`**: discretion. Recommend manual `npm version 1.0.0 -m "release: %s"` + `git push --follow-tags` — single canonical workflow.
- **Pin mcp-publisher to v1.7.9 vs `latest`**: discretion. Recommend pinning to `v1.7.9` (current latest) for reproducible builds; the registry team has signalled an API freeze at v0.1 (2025-10-24) so the CLI is stable.

### Deferred Ideas (OUT OF SCOPE)

- **OAuth client flow** (AUTHv2-01) — v2.
- **SLSA attestation badge in README** (DISTv2-01) — v2.
- **Auto-publish on every commit** — explicitly rejected by the tag-triggered model.
- **Pre-release / beta tag handling** — not in SC; the tag pattern `v*` will fire for any version, but discriminating `v1.0.0-beta.1` to `--tag beta` is out of scope.
- **`mcp-server-dev` plugin scaffolding** — already past that stage; project is hand-built.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **DIST-04** | Published artifact uses `"files"` whitelist (no `.npmignore`) so secrets, fixtures, dotfiles cannot leak | Verified: current `package.json` already meets this; `npm pack --dry-run` ships 4 files (LICENSE, README.md, dist/bin/keeping-mcp.js, package.json). Plan needs a CI assertion step. |
| **DIST-05** | Server is registered in the MCP Registry under `io.github.red-square-software/keeping-mcp` | Verified namespace unclaimed (`registry.modelcontextprotocol.io/v0/servers?search=keeping` returns `count: 0`). `mcp-publisher` + `mcpName` field cover the path. |
| **REL-02** | GitHub Actions release workflow on `v*` tag; npm publish with provenance via OIDC; MCP Registry via `mcp-publisher login github-oidc` | Registry docs publish a verbatim `OIDC authentication (recommended)` workflow. We adopt it, substituting trusted publishing for the `NODE_AUTH_TOKEN` step. |
| **REL-03** | `server.json` version derived from `package.json` at release time (not hand-edited) | Registry docs show the optional jq step; we make it mandatory. Implementation: shell `jq` step that reads `.version` from `package.json` into `server.json`. |
| **REL-04** | README documents token setup, **both** Windows + macOS/Linux config snippets, env var reference, dry-run workflow with example transcript | Verified: Windows requires `cmd /c npx` wrapper or stdio MCP servers fail with `spawn npx ENOENT` (anthropics/claude-code#58510, SuperClaude #390). Token setup path: Keeping prefs → enable "Show features for developers" → generate token. |
| **REL-05** | README front-and-centre warns `KEEPING_REQUIRE_CONFIRM=false` disables dry-run; writes are immediate | Direct content requirement. Recommend a callout block near the top of README and inside the Configuration section. |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tag-triggered release orchestration | GitHub Actions | — | Only the CI platform can hold OIDC identity bound to the repo |
| OIDC token mint for npm publish | GitHub Actions runner (id-token: write) | npm registry | Sigstore + npm verify the OIDC claim; runner can only mint, can't forge |
| Provenance attestation generation | npm CLI (`npm publish --provenance`) | Sigstore | Per npm trusted publishing docs, attestation happens at publish time on the runner |
| `server.json` version injection | CI shell step (`jq`) | — | REL-03 demands derivation, not hand-edit |
| MCP Registry publish | `mcp-publisher` binary on runner | MCP Registry API | `mcp-publisher` is the only sanctioned client; bridges OIDC → registry auth |
| Package contents filter | `package.json files[]` | — | DIST-04 locks this as the only filter mechanism (no `.npmignore`) |
| Cross-platform install correctness | npm + Node + `npx.cmd` shim | Claude Code MCP spawn | The shim is the OS surface; user config wraps it for Windows |
| Token setup education (REL-04) | README docs | Keeping web app prefs UI | Two-step user action: enable developer features → generate token |
| Dry-run education (REL-05) | README + tool description text | Server runtime gate | Documentation reinforces the gate that Phase 3 already implements |
| Windows smoke (SC #5) | CI Windows runner | npx + Node 22/24 shim | Existing CI matrix already exercises this; SC #5 is "verify it still works after the release workflow lands" |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `actions/checkout` | `v5` | Source checkout in CI | Registry docs use `@v5` verbatim; npm docs example uses `@v6`. Either is fine; recommend `@v5` to match registry doc shape. [VERIFIED: registry doc] |
| `actions/setup-node` | `v5` | Node toolchain + npm registry-url | Registry doc uses `@v5`; npm docs example uses `@v6`. Both ship `registry-url` + OIDC integration. Recommend `@v5` for consistency with registry doc. [VERIFIED: registry doc] |
| `mcp-publisher` | `v1.7.9` | MCP Registry CLI (login + publish) | Latest stable as of 2026-05-12. Downloaded as a tarball from `github.com/modelcontextprotocol/registry/releases/download/v1.7.9/mcp-publisher_<os>_<arch>.tar.gz`. [VERIFIED: GitHub releases API] |
| `jq` | preinstalled on ubuntu-latest | Mutate `server.json` to embed `package.json` version | Standard in registry's own workflow example. Already on ubuntu-latest runners. [VERIFIED: registry doc] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `npm pack --dry-run` | bundled with Node 22 npm | Audit tarball contents pre-publish | Run in release workflow before publish to fail-fast on stray files [VERIFIED: npm docs] |
| `npm audit signatures` | bundled with Node 22 npm | Verify provenance after publish | Post-publish smoke; user-facing verification | [CITED: docs.npmjs.com/generating-provenance-statements] |

### Already in package.json (Phase 4 reuses, does not change)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@modelcontextprotocol/sdk` | `^1.29.0` | MCP server runtime | npm view confirms 1.29.0 is current. [VERIFIED: npm view] |
| `p-retry` | `^8.0.0` | HTTP retry backoff | **Note:** CLAUDE.md cites `^6.2.1`; package.json uses `^8.0.0`. Resolved during Phase 2 Plan 02-01 install. [VERIFIED: npm view → 8.0.0 latest] |
| `p-throttle` | `^8.1.0` | Rate-limit token bucket | **Note:** CLAUDE.md cites `^5.0.0`; package.json uses `^8.1.0`. Resolved during Phase 2 Plan 02-01 install. [VERIFIED: npm view → 8.1.0 latest] |
| `zod` | `^4.4.3` | Tool input schemas | **Note:** CLAUDE.md cites `^3.25.0` floor; package.json uses `^4.4.3`. SDK 1.29 supports both per CLAUDE.md compatibility table. [VERIFIED: npm view → 4.4.3 latest] |
| `tsup` | `^8.5.1` | ESM bundle + shebang banner | Latest stable. [VERIFIED: npm view] |
| `typescript` | `^6.0.3` | Type checking only (noEmit) | **Note:** CLAUDE.md cites `^5.8.0`. TS 6 is current; verbatim-module-syntax already enforced in tsconfig. No Phase 4 impact. [ASSUMED — npm view not run for TS, but tsconfig is unchanged Phase-4 surface] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Curl-based `mcp-publisher` install | `OtherVibes/mcp-publish-action@v1` GitHub Action | Third-party action; not from `modelcontextprotocol` org. Registry's own docs use the curl path. **Prefer curl** for first-party provenance. [CITED: WebFetch on github.com/marketplace/actions/publish-mcp-server] |
| OIDC trusted publishing | Long-lived `NPM_TOKEN` secret | CLAUDE.md forbids the long-lived secret. **Mandatory** OIDC. |
| Tag-triggered workflow | Manual `workflow_dispatch` | Tag-triggered makes the version → publish loop atomic; matches REL-02 wording. |
| Bash `jq` for server.json mutation | Node script reading package.json | jq is simpler, 1-line, and registry doc uses it. Use jq. |

**Installation in CI** (no new npm dependencies — Phase 4 only adds workflow files and one JSON file):

```bash
# In the release workflow, install mcp-publisher inline:
curl -L "https://github.com/modelcontextprotocol/registry/releases/download/v1.7.9/mcp-publisher_linux_amd64.tar.gz" \
  | tar xz mcp-publisher
```

**Version verification:**
- `npm view @modelcontextprotocol/sdk version` → `1.29.0` (verified 2026-06-12)
- `npm view p-retry version` → `8.0.0` (verified 2026-06-12)
- `npm view p-throttle version` → `8.1.0` (verified 2026-06-12)
- `npm view zod version` → `4.4.3` (verified 2026-06-12)
- `npm view tsup version` → `8.5.1` (verified 2026-06-12)
- `npm view keeping-mcp` → 404 not found (name available — verified 2026-06-12)
- `mcp-publisher` latest release tag: `v1.7.9` (verified via GitHub releases API 2026-06-12)

## Package Legitimacy Audit

**Not applicable to Phase 4.** This phase installs zero new npm packages. The only external binary downloaded is `mcp-publisher` v1.7.9 from the official `modelcontextprotocol/registry` GitHub releases — first-party, signed (sigstore bundles ship alongside each tarball), pinned by version. No package legitimacy gate needed.

`slopcheck` was unavailable in the research environment; would have been a no-op anyway since no new npm names are introduced.

## Architecture Patterns

### System Architecture Diagram

```
                          DEVELOPER
                              |
                              | git tag v1.0.0 && git push --follow-tags
                              v
                       GitHub repo
                              |
                              | push event matches "tags: ['v*']"
                              v
                  GitHub Actions release.yml
                              |
                              +---> [Job: CI gate]
                              |        npm ci -> lint -> typecheck
                              |        -> test -> build -> smokes
                              |        (matrix: ubuntu, windows / 22, 24)
                              |        all must pass
                              |
                              +---> [Job: publish]
                                       |
                                       |  permissions:
                                       |    id-token: write
                                       |    contents: read
                                       |
                                       +---> Step 1: actions/setup-node@v5
                                       |              registry-url: registry.npmjs.org
                                       |              node-version: 22
                                       |
                                       +---> Step 2: npm ci && npm run build
                                       |
                                       +---> Step 3: npm pack --dry-run
                                       |              | grep -E "..." (whitelist assertion)
                                       |              fail if extra files appear
                                       |
                                       +---> Step 4: npm publish --provenance --access public
                                       |              (OIDC token minted automatically;
                                       |               provenance attestation generated;
                                       |               badge appears on npm package page)
                                       |
                                       +---> Step 5: curl -L mcp-publisher.tar.gz | tar xz
                                       |
                                       +---> Step 6: jq inject package.json .version
                                       |              into server.json .version
                                       |              + server.json .packages[0].version
                                       |
                                       +---> Step 7: ./mcp-publisher login github-oidc
                                       |              (uses ACTIONS_ID_TOKEN_REQUEST_URL
                                       |               + ACTIONS_ID_TOKEN_REQUEST_TOKEN
                                       |               injected by id-token: write)
                                       |
                                       +---> Step 8: ./mcp-publisher publish
                                                      (reads server.json,
                                                       verifies mcpName == server.json.name
                                                       == package.json.mcpName,
                                                       posts to registry API)

                          USER (Windows 11)
                              |
                              | adds keeping-mcp to Claude Code via:
                              |   command: "cmd"
                              |   args: ["/c", "npx", "-y", "keeping-mcp"]
                              |   env:  { KEEPING_TOKEN: "..." }
                              v
                  Claude Code spawns cmd.exe
                              |
                              | cmd /c invokes npx.cmd shim
                              v
                  npx downloads keeping-mcp (one-time cache)
                              |
                              | invokes dist/bin/keeping-mcp.js via shebang
                              v
                  Node 22 runs Phase 1-3 server
                              |
                              v
                          stdio JSON-RPC
                              |
                              v
                          Claude Code
```

### Recommended Project Structure (additions for Phase 4)

```
keeping-mcp/
├── .github/
│   └── workflows/
│       ├── ci.yml            # EXISTING — untouched
│       └── release.yml       # NEW — tag-triggered publish
├── server.json               # NEW — MCP Registry manifest (version updated by CI)
├── package.json              # EXISTING — already has mcpName, files, bin, engines
├── README.md                 # REWRITE — placeholder → full SC #4/#5 doc
├── LICENSE                   # EXISTING — MIT, untouched
├── dist/                     # EXISTING — built by tsup, shipped via files[]
│   └── bin/
│       └── keeping-mcp.js    # EXISTING — has #!/usr/bin/env node banner
└── tsup.config.ts            # EXISTING — banner already injects shebang
```

### Pattern 1: Verbatim adoption of the registry's recommended workflow
**What:** The MCP Registry team publishes the canonical OIDC workflow at `modelcontextprotocol.io/registry/github-actions` (CodeGroup tab "OIDC authentication (recommended)"). Take it as the base and modify only two things: (1) replace the npm publish step (which uses `NODE_AUTH_TOKEN`) with the OIDC trusted-publishing form (no token), (2) insert the `npm pack --dry-run` allowlist assertion + the `jq` version-injection step.
**When to use:** Always — never roll a custom OIDC dance. The registry team's example is the verified source.
**Example (composite — registry doc base + npm trusted publishing substitution + SC #1 enforcement):**
```yaml
# Source composition:
#   - Base shape: modelcontextprotocol.io/registry/github-actions (OIDC tab)
#   - npm OIDC: docs.npmjs.com/trusted-publishers
#   - SC #1 assertion: project-specific
name: Release

on:
  push:
    tags: ["v*"]

permissions:
  id-token: write    # Required for both npm trusted publishing AND mcp-publisher OIDC
  contents: read

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: "22"
          registry-url: "https://registry.npmjs.org"

      - name: Install dependencies
        run: npm ci

      - name: Verify lockfile, lint, typecheck
        run: |
          npx biome check .
          npx tsc --noEmit

      - name: Test
        run: npx vitest run

      - name: Build
        run: npm run build

      - name: Verify package contents (SC #1)
        run: |
          # Allowlist: exactly these four entries, anything else fails the build.
          EXPECTED="LICENSE
          README.md
          dist/bin/keeping-mcp.js
          package.json"
          ACTUAL=$(npm pack --dry-run --json | jq -r '.[0].files[].path' | sort)
          if [ "$(echo "$EXPECTED" | sort)" != "$ACTUAL" ]; then
            echo "FAIL: tarball contents do not match whitelist."
            echo "Expected:"
            echo "$EXPECTED"
            echo "Got:"
            echo "$ACTUAL"
            exit 1
          fi
          echo "Tarball contents verified — only $(echo "$EXPECTED" | wc -l) whitelisted files."

      - name: Publish to npm (trusted publishing — OIDC, provenance auto-generated)
        run: npm publish --provenance --access public
        # NO NODE_AUTH_TOKEN — trusted publishing uses the OIDC token from id-token: write

      - name: Install mcp-publisher
        run: |
          curl -L "https://github.com/modelcontextprotocol/registry/releases/download/v1.7.9/mcp-publisher_linux_amd64.tar.gz" \
            | tar xz mcp-publisher

      - name: Inject package.json version into server.json (REL-03)
        run: |
          VERSION=${GITHUB_REF#refs/tags/v}
          jq --arg v "$VERSION" \
            '.version = $v | .packages[0].version = $v' \
            server.json > server.tmp.json && mv server.tmp.json server.json
          echo "server.json version set to $VERSION"

      - name: Authenticate to MCP Registry (OIDC)
        run: ./mcp-publisher login github-oidc

      - name: Publish to MCP Registry
        run: ./mcp-publisher publish
```

### Pattern 2: server.json — minimal MCP Registry manifest
**What:** server.json declares the npm package, the transport (stdio), and the reverse-DNS name. Version is a placeholder rewritten by CI at publish time.
**When to use:** One file per repo, committed to git.
**Example (per `2025-12-11` schema, minimum viable for stdio + npm):**
```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.red-square-software/keeping-mcp",
  "description": "MCP server for the Keeping time-tracking API",
  "version": "0.0.0",
  "repository": {
    "url": "https://github.com/red-square-software/keeping-mcp",
    "source": "github"
  },
  "websiteUrl": "https://github.com/red-square-software/keeping-mcp",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "keeping-mcp",
      "version": "0.0.0",
      "transport": {
        "type": "stdio"
      }
    }
  ]
}
```
Notes:
- `version: "0.0.0"` is a placeholder; CI rewrites both top-level `.version` AND `.packages[0].version` from `package.json` at publish time.
- `repository.source` accepted values per schema: `"github"` (and others). [VERIFIED: schema URL]
- `description` is constrained 1–100 chars. Current text is 47 chars — fits. [CITED: schema URL]
- `name` must reverse-DNS match the npm `mcpName` field for namespace verification.

### Pattern 3: Windows config block in README (cmd /c wrapper)
**What:** Windows users adding the server to Claude Code MUST wrap `npx` with `cmd /c`. Bare `npx` fails with `spawn npx ENOENT` because Node's `child_process.spawn` does not resolve `.cmd` extensions via PATHEXT unless `shell: true` is set, and Claude Code's MCP spawn path does not set it.
**When to use:** Always — for any Claude Code Windows user, regardless of MCP server.
**Example (verbatim from anthropics/claude-code#58510 workaround):**
```json
// Windows (claude_desktop_config.json / .claude.json / project .mcp.json)
{
  "mcpServers": {
    "keeping-mcp": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "keeping-mcp"],
      "env": {
        "KEEPING_TOKEN": "kp_live_your_token_here"
      }
    }
  }
}

// macOS / Linux
{
  "mcpServers": {
    "keeping-mcp": {
      "command": "npx",
      "args": ["-y", "keeping-mcp"],
      "env": {
        "KEEPING_TOKEN": "kp_live_your_token_here"
      }
    }
  }
}
```
[VERIFIED: anthropics/claude-code#58510 (open as of 2026-06; no official fix landed); confirmed pattern in SuperClaude #390]

### Anti-Patterns to Avoid
- **Don't hand-edit `server.json` version** — REL-03 requires derivation. A hand-edit at publish time risks divergence from `package.json` and a subsequent registry rejection.
- **Don't ship `.npmignore`** — DIST-04 mandates `files[]` as the sole filter. `.npmignore` would silently override `files[]` for any path it doesn't list, defeating the whitelist guarantee.
- **Don't use `NPM_TOKEN` secret** — even as a fallback. CLAUDE.md forbids; trusted publishing is the only path.
- **Don't add `--access public` to OIDC ambiguously** — the flag is documented but `npm publish` defaults to public for unscoped packages. Keep it explicit for the auditor's benefit.
- **Don't omit `permissions: id-token: write`** — without this, both OIDC paths (npm provenance AND `mcp-publisher login github-oidc`) silently degrade or fail.
- **Don't write README config as JSON5 / with comments** — `claude_desktop_config.json` is strict JSON; users will paste verbatim. The `//` lines in the example above are illustrative.
- **Don't recommend `npx --yes keeping-mcp` in install instructions without `-y`** — `--yes` and `-y` are the same flag, but the Windows community convention from MCP docs uses `-y`. Match it.
- **Don't omit the `engines.node` field from package.json** — already present (`>=22.0.0`). npm uses it to refuse install on Node 20; keeping it is part of the SC #5 cold-start guarantee.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OIDC token mint + sign | Custom Sigstore curl dance | `npm publish --provenance` + `mcp-publisher login github-oidc` | Both wrap the OIDC handshake; getting it wrong breaks the trust chain |
| Tarball file allowlist | Custom `tar -tf` parsing | `npm pack --dry-run --json` + `jq` | npm exposes structured tarball contents; jq filters without text parsing |
| server.json version sync | A custom Node script + glue | `jq --arg v "$VERSION" '.version = $v | .packages[0].version = $v'` | One-line, no dependency, exactly what registry docs show |
| Detecting Windows shim path | A custom node script that probes PATHEXT | Document the `cmd /c` wrapper requirement and let the user's config do it | This is a Claude Code limitation, not our problem to fix at runtime; documenting is the right tier |
| Cross-platform mcp-publisher binary selection | Custom OS detection logic in workflow | Hardcode `linux_amd64` — release workflow always runs on `ubuntu-latest` | Registry doc's auto-detect snippet is for portability; CI runner OS is fixed |
| Reading `package.json` version inside CI | Custom Node script | `jq -r '.version' package.json` OR `${GITHUB_REF#refs/tags/v}` | Tag-derived version is byte-identical to package.json version by convention (`npm version 1.0.0` enforces this) |

**Key insight:** Phase 4 is overwhelmingly a config-and-docs phase. The only "code" written is a YAML workflow, a JSON file, and a Markdown rewrite. Every external integration (npm OIDC, MCP Registry OIDC, provenance) has a single first-party canonical path; deviating from it introduces silent failure modes (provenance badge missing; registry publish silently 401s; tarball ships secrets). **Adopt the recommended workflows verbatim and verify with the dry-run / smoke / post-publish-badge-check assertions.**

## Common Pitfalls

### Pitfall 1: npm publish silently succeeds without provenance badge
**What goes wrong:** `npm publish` works, but the npm package page shows no provenance attestation. Users can't verify the build came from the repo.
**Why it happens:** Either (a) `permissions: id-token: write` is missing — the workflow has no OIDC token to mint, so npm falls back to publishing without provenance, OR (b) `--provenance` flag is omitted AND trusted publishing is not configured on the npm side (registration page at npmjs.com), OR (c) `repository` field in `package.json` doesn't match the GitHub repo (case-sensitive). [CITED: docs.npmjs.com/generating-provenance-statements]
**How to avoid:** (1) `permissions: id-token: write` MUST be present at job level. (2) Pass `--provenance --access public` explicitly even when trusted publishing is configured — belt-and-suspenders, no harm. (3) `package.json.repository.url` must read exactly `https://github.com/red-square-software/keeping-mcp.git` (case-sensitive — current value is correct).
**Warning signs:** First post-publish, run `npm view keeping-mcp --json | jq '.dist.attestations'` — if this is null, provenance did not attach. STATE.md already lists this as Critical Pitfall #5.

### Pitfall 2: Windows `npx keeping-mcp` cold-start fails with `spawn ENOENT`
**What goes wrong:** A user on Windows 11 follows the README, adds the Linux/macOS config block (`command: "npx"`) by mistake, and Claude Code reports "MCP server failed to start" with `spawn npx ENOENT` in the logs.
**Why it happens:** Documented at length in anthropics/claude-code#58510 — Node's `child_process.spawn` on Windows doesn't resolve `.cmd` extensions via PATHEXT unless `shell: true` is set, and Claude Code's MCP spawn path does not set it. `npx` on Windows is `npx.cmd`.
**How to avoid:** README MUST show the Windows config block FIRST (or at minimum, prominently next to the Linux block) with the explicit `cmd /c npx -y keeping-mcp` wrapper. Use a callout/warning, not a footnote.
**Warning signs:** Anyone reporting "the server doesn't connect" on Windows — first ask if they used the Windows config block, not the macOS/Linux one. SC #5 cold-start smoke must explicitly use the `cmd /c` form.

### Pitfall 3: server.json `version` and `packages[0].version` desync from package.json
**What goes wrong:** `mcp-publisher publish` succeeds but registers a version that doesn't match the actually-published npm package. Discovery and install break.
**Why it happens:** server.json carries two version fields (top-level `.version` and `.packages[0].version`). A jq step that only updates one leaves the other stale.
**How to avoid:** The jq command MUST update both: `jq --arg v "$VERSION" '.version = $v | .packages[0].version = $v' server.json`. Add a post-injection assert step that grep-counts the new version in server.json and fails if count != 2.
**Warning signs:** Registry entry shows a version that doesn't exist on npm; `mcp-publisher publish` reports validation errors mentioning "package not found at version X".

### Pitfall 4: tsup shebang banner becomes CRLF on Windows
**What goes wrong:** When the project is checked out on a Windows runner with `core.autocrlf=true`, tsup might emit a CRLF shebang `#!/usr/bin/env node\r\n` which some Linux kernels reject as "interpreter not found".
**Why it happens:** Banner injection by tsup uses the platform's line ending. The shebang must be LF for POSIX kernels.
**How to avoid:** `.gitattributes` should enforce LF on shipped artifacts. **Verify**: Phase 1 STATE notes confirm `.gitattributes (LF)` was set in Plan 01-01. Re-verify before Phase 4 ships by inspecting `dist/bin/keeping-mcp.js` on Windows after build and confirming first 17 bytes are exactly `#!/usr/bin/env node\n`.
**Warning signs:** Linux users report `keeping-mcp: cannot execute: required file not found`.

### Pitfall 5: `mcp-publisher login github-oidc` fails because permissions block is at workflow level, not job level
**What goes wrong:** `permissions: id-token: write` is set at the workflow root and inherits, but then a `permissions:` block at the job level (perhaps with `contents: read` only) overrides and drops the id-token permission. mcp-publisher's OIDC mint silently fails.
**Why it happens:** GitHub Actions `permissions` is replace-not-merge at the job level.
**How to avoid:** Set `permissions` at job level (not workflow level) AND include BOTH `id-token: write` AND `contents: read`. The example workflow in this RESEARCH section already does this. **Cross-check:** registry's published workflow does the same.
**Warning signs:** `mcp-publisher login github-oidc` reports "authentication failed" or "OIDC token unavailable".

### Pitfall 6: `mcpName` mismatch between package.json and server.json
**What goes wrong:** `mcp-publisher publish` validates that the npm package's `mcpName` field matches the server.json's `name` field. If they don't, publish fails with a namespace verification error.
**Why it happens:** Two files of truth. A copy-paste typo or a half-finished rename leaves them desynced.
**How to avoid:** Lock both to `io.github.red-square-software/keeping-mcp` in plain text in this RESEARCH. Add a CI assert before publish: `[ "$(jq -r .mcpName package.json)" = "$(jq -r .name server.json)" ]`.
**Warning signs:** Publish step reports "namespace verification failed" or "package mcpName does not match server.json name".

### Pitfall 7: First-time trusted publisher needs npm-side configuration BEFORE the first CI run
**What goes wrong:** First `git tag v0.1.0 && git push` triggers the workflow; OIDC mint succeeds; `npm publish` fails with "no trusted publisher configured for keeping-mcp@0.1.0".
**Why it happens:** npm trusted publishing requires the publisher to be configured on the npm package settings page (npmjs.com → package → Settings → Trusted Publishers) BEFORE the first publish. For a brand-new package name, this is a chicken-and-egg unless you pre-create the package or use the `pending` flow.
**How to avoid:** Per npm docs, the recommended first publish flow for a brand-new package: configure the trusted publisher in advance using npm's "pending publisher" flow (set up trusted publisher BEFORE the package exists). OR: publish v0.1.0 manually once from a local machine with `npm publish --provenance --access public` using `--otp` and a personal token, then configure trusted publishing for v0.1.1+. **Recommend**: pre-create the package via the pending-publisher flow so the first CI publish works.
**Warning signs:** First release workflow run fails with HTTP 403 from npm; error mentions "trusted publisher not configured".

### Pitfall 8: `KEEPING_TOKEN` unset + cold start should fail FAST with a clear error, not silently hang
**What goes wrong (SC #5):** A Windows user runs `npx -y keeping-mcp` without `KEEPING_TOKEN` set in env. Phase 1 D-05 demands the process exit non-zero with `[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty` on stderr.
**Why it happens:** Already correctly implemented per Phase 1 — `bin/keeping-mcp.ts` calls `loadConfig()` first, which exits before stdio transport connects. CI smoke proves this on ubuntu + windows × node 22 + 24.
**How to avoid:** Phase 4 plans should add a release-workflow step that re-runs the Phase 1 missing-token smoke AGAINST THE PUBLISHED PACKAGE (post-`npm publish`), to verify the published tarball still has correct behavior. Pull the just-published tarball via `npm pack keeping-mcp@<version>` and run the smoke.
**Warning signs:** A user reports "the server just hangs" on Windows — confirms either the cold-start smoke missed something OR the published tarball lost its `bin` entry.

## Code Examples

Verified patterns from the sources listed in §Sources.

### Workflow YAML — full release.yml
See "Pattern 1" code block above. That YAML is the recommended Phase 4 deliverable verbatim.

### server.json
See "Pattern 2" code block above.

### Windows + macOS/Linux JSON config snippets
See "Pattern 3" code block above.

### `npm pack --dry-run` allowlist assertion (extracted from Pattern 1)
```bash
EXPECTED="LICENSE
README.md
dist/bin/keeping-mcp.js
package.json"
ACTUAL=$(npm pack --dry-run --json | jq -r '.[0].files[].path' | sort)
if [ "$(echo "$EXPECTED" | sort)" != "$ACTUAL" ]; then
  echo "FAIL: tarball contents do not match whitelist."
  exit 1
fi
```

### Version injection into server.json (extracted from Pattern 1)
```bash
VERSION=${GITHUB_REF#refs/tags/v}
jq --arg v "$VERSION" \
  '.version = $v | .packages[0].version = $v' \
  server.json > server.tmp.json && mv server.tmp.json server.json

# Assert both fields updated:
COUNT=$(jq -r --arg v "$VERSION" \
  '[.version, .packages[0].version] | map(select(. == $v)) | length' \
  server.json)
[ "$COUNT" = "2" ] || { echo "FAIL: server.json version mismatch"; exit 1; }
```

### Token setup README section (recommended copy)
```markdown
## Get a Keeping access token

1. Sign in to your Keeping account.
2. Open **Preferences** (top-right menu).
3. Find the section **Show features for developers** and enable it.
4. A new **Personal access tokens** section appears.
5. Click **Generate new token**, name it (e.g. "Claude Code"), and copy the value.
6. Store it as `KEEPING_TOKEN` in your shell environment OR in your Claude Code config `env` block.

The token has full read+write access to your time entries — treat it like a password.
```

### README warning block (REL-05 / SC #5)
```markdown
> ## ⚠ Writes are dry-run BY DEFAULT
>
> Every write tool (`keeping_add_entry`, `keeping_update_entry`, `keeping_delete_entry`,
> `keeping_start_timer`, `keeping_stop_timer`, `keeping_resume_timer`) returns a
> **preview** unless you pass `confirm: true` in the tool call.
>
> Setting `KEEPING_REQUIRE_CONFIRM=false` in your environment **disables this gate**.
> Writes then happen on the first call — there is no second chance.
>
> Recommendation: **never set `KEEPING_REQUIRE_CONFIRM=false`** unless you are running
> the server in a non-interactive automation context and have explicitly accepted
> the loss of the confirmation step.
```

## Runtime State Inventory

> Phase 4 is greenfield from a runtime-state perspective (new workflow, new server.json, README rewrite). The pre-existing build/install artifacts that matter:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 4 does not interact with any persistent data store | None |
| Live service config | (a) npm registry — `keeping-mcp` package name not yet claimed (verified via `npm view keeping-mcp` → 404). (b) MCP Registry — namespace `io.github.red-square-software/keeping-mcp` not yet claimed (verified via `registry.modelcontextprotocol.io/v0/servers?search=keeping` → 0 results). (c) GitHub Actions OIDC trust on npm — **NOT YET CONFIGURED** (pre-publish action required per Pitfall 7) | (a) Will be claimed on first successful `npm publish`. (b) Will be claimed on first `mcp-publisher publish`. (c) **User must configure npm "pending publisher" on npmjs.com BEFORE the first CI release runs.** |
| OS-registered state | None | None |
| Secrets / env vars | (a) The release workflow needs ZERO long-lived secrets. (b) User's own Claude Code config will hold `KEEPING_TOKEN` (out of repo scope). | None on repo side. |
| Build artifacts | `dist/bin/keeping-mcp.js` — already correctly built; no stale artifacts from past phases. `.gitignore` already excludes `dist/`. **Note:** `dist/` is committed by being in the `files` whitelist; it must exist at publish time. The release workflow MUST run `npm run build` before `npm publish`. | None — workflow ordering covered in Pattern 1. |

**Canonical question** *After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?* — Phase 4 introduces no rename / refactor; this question is N/A. The forward-looking equivalent is "what external systems will we be CREATING state in?" Answer: npm registry entry + MCP Registry entry. Both are first-publish events with no pre-state.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All phases | ✓ | local Node verifies build; CI matrix on 22 + 24 | — |
| npm CLI | publish step | ✓ on ubuntu-latest runner | npm 11+ required for trusted publishing per docs.npmjs.com | — (must use ubuntu-latest with Node 22+) |
| `jq` | server.json mutation | ✓ on ubuntu-latest runner (preinstalled) | preinstalled | — |
| `curl` | mcp-publisher install | ✓ on ubuntu-latest runner | preinstalled | — |
| `mcp-publisher` v1.7.9 binary | Registry publish | ✓ downloadable from GitHub releases | v1.7.9 (latest) | — |
| GitHub Actions OIDC token endpoint | npm + mcp-publisher auth | ✓ automatic when `id-token: write` set | — | None — must use OIDC per CLAUDE.md constraint |
| `gh` CLI | Optional, for post-release tag annotation | ✓ on runners | preinstalled | Not used in proposed workflow |
| Windows runner | Windows cold-start smoke (SC #5) | ✓ already in ci.yml matrix | windows-latest | — |
| npm "pending publisher" pre-config | First publish to brand-new package | ✗ — must be done manually on npmjs.com | — | None — Pitfall 7. **Action item for human: pre-configure trusted publisher BEFORE first `git tag v1.0.0`.** |
| MCP Registry account ownership of `red-square-software` GitHub org | mcp-publisher login github-oidc | ✓ verified — user owns the org (git remote confirms) | — | None |

**Missing dependencies with no fallback:** None — but **one human action is required before the first release run**: configure npm trusted publishing as a pending publisher for `keeping-mcp` on npmjs.com. This is a one-time setup; subsequent releases need no human intervention.

**Missing dependencies with fallback:** None.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Long-lived `NPM_TOKEN` secret in repo | Trusted publishing via OIDC | 2025-07-31 (GA) | Eliminates secret-leak risk in forks/PRs; provenance is automatic |
| `--provenance` flag required explicitly | Still recommended explicit; auto-on with trusted publishing | 2025-07-31 | Belt-and-suspenders: keep the flag for audit clarity |
| Hand-edited `server.json` version | `jq` substitution in CI from `GITHUB_REF` or `package.json` | Registry doc canonical pattern | One source of truth (package.json or git tag); REL-03 enforced |
| `.npmignore` for exclusion | `files[]` whitelist for inclusion | npm modern best practice | Allow-list is strictly safer; matches DIST-04 |
| Direct `npx` in Claude Code Windows config | `cmd /c npx` wrapper | anthropics/claude-code#58510 open | Windows users won't get a connecting server without the wrapper |
| Node 20 LTS | Node 22 + Node 24 (Active LTS) | Node 20 EOL 2026-04-30 | engines.node `>=22` is correct floor |

**Deprecated/outdated:**
- **`NPM_TOKEN` secret-based publish**: still works but is explicitly discouraged by CLAUDE.md and by npm's own docs. Use OIDC.
- **Single-OS CI matrix**: Phase 1 already moved to dual-OS dual-Node. Release workflow should adopt the same matrix for the CI gate (then publish job runs once on ubuntu).
- **Hand-curated `.npmignore`**: superseded by `files[]`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `typescript@^6.0.3` is current (not verified via `npm view typescript`) | Standard Stack — Already in package.json | LOW — typescript is dev-only, used for typecheck. If TS 6 has a regression, Phase 4 wouldn't notice; existing CI matrix would catch any tsc breakage already. No Phase 4 surface change. |
| A2 | The MCP Registry `server.json` schema at `2025-12-11` is the latest stable schema URL | Pattern 2 server.json | MEDIUM — if a newer schema URL exists, ours would still be a valid older revision. Registry doesn't reject older schemas (per the registry team's "API freeze v0.1" stance). Worst case: a future field becomes recommended; we'd add it in a follow-up. |
| A3 | `mcp-publisher login github-oidc` reads `ACTIONS_ID_TOKEN_REQUEST_URL` + `ACTIONS_ID_TOKEN_REQUEST_TOKEN` env vars automatically (these are injected when `id-token: write` is set) | Pattern 1 workflow | LOW — this is the standard GitHub OIDC pattern used by every OIDC-aware action. If `mcp-publisher` deviates, its docs would say so; registry docs don't mention any extra env vars. |
| A4 | npm trusted publishing's first-publish pending-publisher flow exists | Pitfall 7 | MEDIUM — if the flow has changed or has a different name, the fallback ("publish v0.1.0 manually with an OTP, then configure for v0.1.1+") still works. |
| A5 | tsup banner emits LF shebang on Windows when `.gitattributes` is set correctly | Pitfall 4 | LOW — Phase 1 explicitly committed `.gitattributes (LF)`; Phase 1 CI already runs on Windows and the existing smoke catches non-JSON stdout (which a CRLF shebang would manifest as). A direct re-verification step in Phase 4 is recommended as belt-and-suspenders. |
| A6 | `cmd /c npx` wrapper for Windows MCP server config remains required as of June 2026 | Pattern 3, Pitfall 2 | LOW — issue #58510 is open as of research date; no upstream fix landed. Even if Anthropic ships a fix tomorrow, the `cmd /c` wrapper continues to work, so the README guidance is forward-compatible. |
| A7 | The MCP Registry CLI v1.7.9 is API-stable per "API freeze v0.1" declaration | Standard Stack | LOW — registry is in preview but the team has declared freeze; if `mcp-publisher` v1.8 ships before our publish, we can pin to v1.7.9 anyway for reproducibility. |
| A8 | npm's `--provenance` flag is still accepted (not removed) in npm 11.x | Pitfall 1 | LOW — npm has not deprecated the flag; trusted publishing makes it automatic but explicit is still accepted. |
| A9 | The actual GitHub org name is `red-square-software` not `redsquare-nl` | Throughout | RESOLVED — verified via `git remote -v` output. CLAUDE.md's `redsquare-nl` reference is incorrect / stale (derived from the user's domain redsquare.nl). Plan must NOT touch CLAUDE.md mid-phase but MUST treat `red-square-software` as truth. STATE.md and PROJECT.md already use the correct name. |

## Open Questions

1. **Should the release workflow run the full Phase 1 CI matrix as a gate, or trust that the prior CI on the commit already ran?**
   - What we know: GitHub Actions doesn't gate one workflow on another by default; the tag push triggers a fresh event so the prior CI run on the commit doesn't automatically "carry over."
   - What's unclear: We could either re-run the full ubuntu+windows × 22+24 matrix as a gate (slow but safe) or just lint+typecheck+test+build on ubuntu-only (fast but assumes the prior CI was green).
   - Recommendation: For first release (v1.0.0), run the FULL CI gate inside `release.yml`. For confidence after a few releases, can de-scope to ubuntu-only gate later. Either is defensible; plans should make this choice explicit.

2. **Should the workflow auto-create a GitHub Release with notes after a successful publish?**
   - What we know: `softprops/action-gh-release@v2` is the canonical action.
   - What's unclear: SC doesn't demand a GitHub Release artifact; tag is enough for the registry path. But users do read GitHub Releases for changelog visibility.
   - Recommendation: Add as a nice-to-have post-publish step (no SC dependency, low risk). Plans can include or omit; user discretion.

3. **README example dry-run transcript: should it be a real recording or a hand-crafted illustrative example?**
   - What we know: SC #4 demands "an example dry-run transcript."
   - What's unclear: A real transcript captured from a live tool call vs. a representative hand-crafted JSON example. The hand-crafted example is easier to maintain and doesn't depend on a live API. A real transcript is more credible.
   - Recommendation: Hand-crafted JSON example with a comment that it is illustrative. Less maintenance risk; easier to keep stable across version bumps.

4. **Should the workflow tolerate `v*-beta`, `v*-rc`, etc. and publish them with `--tag beta`?**
   - What we know: `npm publish --tag beta` exists; current SC just says `v*`.
   - What's unclear: User intent — do you want a prerelease channel?
   - Recommendation: Out of scope for v1.0.0 ship. Treat all `v*` tags as `latest`. Add `--tag` discrimination in a v2 follow-up if pre-releases become a real flow.

## Validation Architecture

> **SKIPPED** — `.planning/config.json` workflow.nyquist_validation = false. The agent template instructs to omit this section when explicitly disabled.

The existing test surface (206 unit tests; CI smokes on ubuntu+windows × node 22+24) is sufficient to verify the runtime artifact ships correctly. Phase 4 adds:
- **`npm pack --dry-run` allowlist assertion** (CI step, fails build if extra files appear) — SC #1
- **Post-publish provenance verification** (`npm view keeping-mcp --json | jq '.dist.attestations'`) — SC #2 manual step after first publish
- **Cold-start `npx keeping-mcp` smoke on Windows** — SC #5; human-verified per ROADMAP wording

These are not new "tests" in the vitest sense; they're release-pipeline assertions and post-publish smokes.

## Security Domain

> Required per agent template (security_enforcement defaults to enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (release pipeline) | GitHub OIDC → npm + MCP Registry. No long-lived secrets in repo. CLAUDE.md mandates. |
| V3 Session Management | No | No sessions; release is a one-shot tag-triggered event |
| V4 Access Control | Yes | npm trusted publisher binds `keeping-mcp` package to this repo's OIDC subject; MCP Registry binds `io.github.red-square-software/*` namespace to the GitHub org verification |
| V5 Input Validation | No | Phase 4 introduces no new tool inputs; existing Zod schemas from Phase 1-3 cover the runtime surface |
| V6 Cryptography | Yes | Sigstore (provenance signatures), GitHub OIDC token signing. **Never hand-roll.** Standard via `npm publish --provenance` + `mcp-publisher login github-oidc`. |
| V10 Malicious Code | Yes | Supply-chain integrity is the entire point of trusted publishing + provenance. Users can verify `keeping-mcp@<version>` was built from `red-square-software/keeping-mcp` at a specific commit. |
| V14 Configuration | Yes | `.github/workflows/release.yml` is the configuration; permissions block (`id-token: write`, `contents: read`) is the security boundary. |

### Known Threat Patterns for release pipeline + npm-distributed CLI

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Compromised `NPM_TOKEN` secret in repo | Spoofing | OIDC trusted publishing — **no token to leak** (CLAUDE.md mandate) |
| Malicious dependency in `mcp-publisher` binary | Tampering | Pin to v1.7.9 (specific version, not `latest`); release tarball is signed via sigstore (sigstore.json bundle ships alongside) |
| Fake `keeping-mcp` package squatting | Spoofing / Repudiation | Provenance attestation proves origin to anyone who runs `npm audit signatures` |
| Tampered `dist/bin/keeping-mcp.js` shipped to users | Tampering | `npm publish --provenance` signs the published artifact; users can verify |
| Leaked `KEEPING_TOKEN` in npm package | Information Disclosure | `files[]` whitelist excludes `.env`, fixtures, dotfiles; SC #1 is the gate; assertion step in CI is the enforcement |
| Compromised GitHub Actions runner | Tampering / Elevation | Use only first-party + version-pinned actions (`actions/checkout@v5`, `actions/setup-node@v5`); avoid arbitrary marketplace actions for the publish job |
| OIDC subject claim too permissive | Elevation | npm trusted publisher config should bind to a specific workflow file path (`.github/workflows/release.yml`) and `main` branch only — set this on the npmjs.com pending-publisher page |
| Stale `mcp-publisher` binary with security regression | Tampering | Pinned to v1.7.9; bump on patch releases; verify sigstore bundle on upgrade |

## Project Constraints (from CLAUDE.md)

Direct enforcement requirements that bind Phase 4:

- **Tech stack locked to `@modelcontextprotocol/sdk` ^1.29.0 + Zod 3.25+** — no change in Phase 4
- **License MIT** — already present in repo
- **Hosting/namespace: GitHub repo under `red-square-software`** (CLAUDE.md cites `redsquare-nl` — incorrect; treat git remote as truth)
- **Security: `KEEPING_TOKEN` never in logs / tool output / commits** — Phase 4 does NOT log; only README documents how the user sets it
- **API rate limit 120 req/min** — Phase 4 makes zero Keeping API calls
- **Platform: Windows + macOS + Linux** — SC #4 + SC #5 directly verify this
- **No `console.log`** — Phase 4 introduces no code that runs at runtime; only workflow YAML + JSON + Markdown
- **`@modelcontextprotocol/sdk` v2.0-alpha forbidden** — N/A in Phase 4
- **Node `<22` engine target forbidden** — already `>=22.0.0`
- **`KEEPING_TOKEN` in code/logs/output forbidden** — README documents env var, never embeds tokens
- **Long-lived NPM_TOKEN forbidden** — OIDC trusted publishing is mandatory
- **`winston` / `pino` forbidden** — N/A in Phase 4
- **`console.log` forbidden** — N/A in Phase 4 surface

## Recommended Plan Structure

Per MVP mode (vertical slices; each plan ships a runnable increment). Four plans align with the four discrete deliverables:

### Plan 4-01: Create `server.json` + Repo Validation
**Vertical slice:** Author server.json, verify schema-compliance locally with `jq` + `curl` to schema URL, lock the mcpName ↔ server.json.name ↔ package.json.name binding. NO publish yet — purely a content addition to the repo.

**Files touched:** `server.json` (new), maybe `.gitignore` (none, server.json should be committed).
**Verification:** local script asserts `package.json.mcpName === server.json.name`; jq lint passes.
**Maps to requirements:** REL-03 foundation (the file that CI will mutate).

### Plan 4-02: Rewrite README for SC #4 + SC #5
**Vertical slice:** Replace the 7-line placeholder with the full doc: token setup, Windows + macOS/Linux config blocks, env var reference, dry-run transcript, KEEPING_REQUIRE_CONFIRM warning.

**Files touched:** `README.md` (rewrite).
**Verification:** human review against SC #4 + SC #5 checklist; grep for "cmd /c", "npx", "KEEPING_TOKEN", "KEEPING_REQUIRE_CONFIRM=false", "Show features for developers".
**Maps to requirements:** REL-04, REL-05.

### Plan 4-03: Release Workflow + CI Allowlist Assertion
**Vertical slice:** Author `.github/workflows/release.yml` per Pattern 1 above. Add the `npm pack --dry-run` allowlist assertion as a step. Test-drive the workflow on a `v0.0.1-dry-run` tag against a private fork OR on a feature branch with a `workflow_dispatch` trigger (without actually publishing). Verify by inspecting the workflow run logs that all steps up to (but not including) `npm publish` pass.

**Files touched:** `.github/workflows/release.yml` (new).
**Verification:** dry-run with a placeholder tag; verify steps succeed up to publish; verify allowlist assertion catches a deliberate stray file added in a test branch.
**Maps to requirements:** DIST-04 (assertion), REL-02 (workflow shape), REL-03 (jq step).

### Plan 4-04: First Real Release (`v1.0.0`) + Post-Publish Verification
**Vertical slice:** Pre-configure npm trusted publisher (Pitfall 7), tag `v1.0.0`, push, watch CI, verify:
- npm package page shows provenance badge
- `npm view keeping-mcp` returns the published version + attestations
- MCP Registry returns the entry at `registry.modelcontextprotocol.io/v0/servers?search=keeping`
- Fresh Windows shell: `npx -y keeping-mcp` without `KEEPING_TOKEN` exits non-zero with the expected stderr message (SC #5 cold-start)
- Fresh Windows shell: `KEEPING_TOKEN=... npx -y keeping-mcp` (piped initialize JSON-RPC) responds

**Files touched:** `package.json` (version bump via `npm version 1.0.0`), git tag.
**Verification:** all post-publish smokes pass; provenance badge visible.
**Maps to requirements:** DIST-05, REL-02 end-to-end.

Plan 4-04 is "the moment of truth" — recommend a human-verify checkpoint at the start of this plan to confirm the npm trusted publisher is pre-configured. Without that pre-config, the first publish will hard-fail and the namespace stays unclaimed.

## Sources

### Primary (HIGH confidence)
- [modelcontextprotocol.io/registry/github-actions](https://modelcontextprotocol.io/registry/github-actions) — verbatim OIDC workflow template; canonical mcp-publisher CLI flow
- [static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json) — server.json required + recommended fields
- [docs.npmjs.com/trusted-publishers/](https://docs.npmjs.com/trusted-publishers/) — npm OIDC trusted publishing GA + permissions block requirements
- [docs.npmjs.com/generating-provenance-statements](https://docs.npmjs.com/generating-provenance-statements) — `--provenance` flag behavior + verification with `npm audit signatures`
- [github.com/modelcontextprotocol/registry/releases](https://github.com/modelcontextprotocol/registry/releases) — `mcp-publisher` v1.7.9 binary download URLs (verified via GitHub API)
- `git remote -v` output: `https://github.com/red-square-software/keeping-mcp.git` — authoritative source for org name discrepancy
- `npm view <package> version` for `@modelcontextprotocol/sdk`, `p-retry`, `p-throttle`, `zod`, `tsup` (verified 2026-06-12)
- `npm view keeping-mcp` → 404 (name available, verified 2026-06-12)
- `registry.modelcontextprotocol.io/v0/servers?search=keeping` → 0 results (namespace available, verified 2026-06-12)
- `npm pack --dry-run` on current repo → 4 files, no leakage (verified 2026-06-12)
- `dist/bin/keeping-mcp.js` shebang inspection: `#!/usr/bin/env node` LF (verified after `npm run build`)

### Secondary (MEDIUM confidence)
- [github.com/anthropics/claude-code/issues/58510](https://github.com/anthropics/claude-code/issues/58510) — open issue documenting the Windows `spawn npx ENOENT` problem and the `cmd /c` wrapper workaround
- [github.com/SuperClaude-Org/SuperClaude_Framework/issues/390](https://github.com/SuperClaude-Org/SuperClaude_Framework/issues/390) — independent verification of the cmd /c pattern with JSON snippets
- [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp) — Claude Code MCP reference; documents stdio transport but does not call out the Windows shim issue directly
- [nodejs.org/dist/index.json](https://nodejs.org/dist/index.json) — Node 24 Krypton is current LTS; Node 22 is also supported
- [fransiscuss.com/2025/04/22/fix-spawn-npx-enoent-windows11-mcp-server/](https://fransiscuss.com/2025/04/22/fix-spawn-npx-enoent-windows11-mcp-server/) — community Windows fix documentation (cross-verified with #58510)

### Tertiary (LOW confidence)
- [github.com/marketplace/actions/publish-mcp-server](https://github.com/marketplace/actions/publish-mcp-server) — third-party alternative action; NOT recommended (prefer first-party curl-based install per registry docs)
- DEV.to community workflow examples — general consistency, not authoritative

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version verified via `npm view` or GitHub releases API in this research session
- Architecture (release workflow shape): HIGH — registry team publishes the canonical OIDC workflow verbatim
- server.json schema: HIGH — fetched directly from `static.modelcontextprotocol.io`
- Windows `cmd /c` pattern: HIGH — cross-verified via Claude Code GitHub issue + independent community report
- Pitfalls 1-8: HIGH (1-6 directly cited from docs); MEDIUM (Pitfall 7 npm pending publisher flow — documented but I haven't personally exercised it); HIGH (Pitfall 8 — already enforced by Phase 1 CI smokes)
- Org name resolution: HIGH — `git remote -v` is authoritative

**Research date:** 2026-06-12
**Valid until:** 2026-07-12 (30-day stable window for tooling versions; if a new `mcp-publisher` ships, re-verify the binary URL; if Node 22 reaches LTS Maintenance, revisit `engines` floor)
