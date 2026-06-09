---
phase: "01-foundation-scaffolding"
plan: "03"
subsystem: "ci-remote-branch-protection"
tags:
  - github-actions
  - ci
  - smoke-test
  - branch-protection
  - mcp
dependency_graph:
  requires:
    - "01-01: package.json bin path, .gitignore, .gitattributes"
    - "01-02: dist/bin/keeping-mcp.js built by npm run build; D-05 stderr message exact string"
  provides:
    - ".github/workflows/ci.yml: matrix CI lint+typecheck+test+build+smoke on every push and PR"
    - "GitHub remote Red-Square-Software/keeping-mcp with description + homepage set"
    - "Branch protection on main: 4 required status checks, linear history, no force push"
  affects:
    - "Phase 2: branch protection active; all Phase 2 work must use feature branches + PRs"
tech_stack:
  added:
    - "GitHub Actions CI workflow (matrix ubuntu-latest + windows-latest x Node 22 + 24)"
  patterns:
    - "Matrix CI with fail-fast: false for full regression coverage"
    - "grep -qF fixed-string smoke assertion ([ chars safe)"
    - "shell: bash on all OS rows via Git Bash on Windows (D-14)"
    - "concurrency cancel-in-progress to save CI minutes"
key_files:
  created:
    - path: ".github/workflows/ci.yml"
      description: "GitHub Actions CI — matrix [ubuntu-latest, windows-latest] x [22, 24]; steps: npm ci -> biome -> tsc -> vitest -> build -> smoke; smoke asserts D-05 exact message with grep -qF"
  modified: []
decisions:
  - "Used /tmp/smoke_stderr as primary temp path (Git Bash maps /tmp on windows-latest per RESEARCH Assumption A2)"
  - "Used actions/setup-node@v4 (v4 is widely-deployed stable; v6 exists but v4 has broadest doc coverage per RESEARCH Assumption A3)"
  - "Org slug uses lowercase red-square-software in package.json + mcpName; GitHub remote uses canonical Red-Square-Software casing (GitHub is case-insensitive on org slugs but registry namespace prefers lowercase)"
  - "Branch protection: required_linear_history=true, enforce_admins=false (D-20: allow admin override during early bootstrap), allow_force_pushes=false, allow_deletions=false, strict=true (require branch up-to-date before merge)"
metrics:
  duration: "single-session resumed after reboot"
  completed_date: "2026-06-09"
  tasks_completed: 4
  tasks_total: 4
  files_created: 1
  files_modified: 0
status: "complete"
---

# Phase 1 Plan 03: CI, Remote, and Branch Protection Summary

CI workflow added, repo created under `Red-Square-Software/keeping-mcp`, first push landed, all 4 matrix jobs green, branch protection applied.

## What Was Built

| Artifact | Description |
|----------|-------------|
| `.github/workflows/ci.yml` | Matrix CI: `[ubuntu-latest, windows-latest] × [22, 24]`; steps: npm ci → biome check → tsc --noEmit → vitest run → build → smoke test |
| GitHub repo `Red-Square-Software/keeping-mcp` | Public, MIT license, description + homepage set via `gh repo create` |
| Branch protection on `main` | 4 required CI checks + strict + linear history + no force push + no deletion |

## Task 1 — ci.yml

**Commit:** `bf74101` — `feat(01-03): add CI matrix workflow with D-13 smoke assertion`

| Check | Result |
|-------|--------|
| File exists | PASS |
| `ubuntu-latest` + `windows-latest` in matrix | PASS |
| `node: [22, 24]` in matrix | PASS |
| `biome check .` step | PASS |
| `tsc --noEmit` step | PASS |
| `vitest run` step | PASS |
| `npm run build` step | PASS |
| `shell: bash` on smoke step | PASS |
| `grep -qF` fixed-string assertion | PASS |
| D-05 literal string in file | PASS |
| No `macos-latest` | PASS |
| No `release`/`publish` references | PASS |

## Task 2 — gh auth + remote

- `gh auth status`: logged in as ElBart00 with `repo`, `workflow`, `read:org`, `gist` scopes
- Origin remote: `https://github.com/red-square-software/keeping-mcp.git` (GitHub redirects to canonical casing)
- Repo created via `gh repo create Red-Square-Software/keeping-mcp --public --description ... --homepage https://api.keeping.nl`

## Task 3 — First push + CI green

- `git push -u origin main` succeeded at HEAD `e462694`
- CI run 27216408956 — all 4 matrix jobs green:
  - CI (ubuntu-latest, Node 22): 18s
  - CI (ubuntu-latest, Node 24): 20s
  - CI (windows-latest, Node 22): 42s
  - CI (windows-latest, Node 24): green
- Smoke step PASS on all 4 (D-05 stderr assertion + empty stdout)

## Task 4 — Branch protection

Applied via `gh api -X PUT repos/Red-Square-Software/keeping-mcp/branches/main/protection`:

| Setting | Value |
|---------|-------|
| `required_status_checks.strict` | `true` |
| `required_status_checks.contexts` | `["CI (ubuntu-latest, Node 22)", "CI (ubuntu-latest, Node 24)", "CI (windows-latest, Node 22)", "CI (windows-latest, Node 24)"]` |
| `enforce_admins` | `false` |
| `required_linear_history` | `true` |
| `allow_force_pushes` | `false` |
| `allow_deletions` | `false` |
| `required_pull_request_reviews` | `null` (solo dev; revisit if contributors join) |

Description + homepage set at `gh repo create` time (folds D-18 into Task 2).

## Deviations from Plan

### Pre-existing remote URL mismatch (resolved)

Origin was `ElBart00/keeping-mcp` at session resume. Switched to `red-square-software/keeping-mcp`. After org casing was clarified, GitHub's redirect handled the lowercase URL transparently.

### Org name casing

Org slug in package.json + mcpName: lowercase `red-square-software` (MCP registry convention). GitHub canonical org name: `Red-Square-Software`. GitHub treats org slugs case-insensitively in URLs, so the lowercase remote URL works after redirect.

### D-18 description + homepage

Plan called for separate `gh repo edit` after first push. Folded into `gh repo create` since repo was created in this session, not pre-existing. Result is identical.

## Known Stubs

None.

## Threat Flags

- Branch protection lacks `required_pull_request_reviews` (solo dev acceptable; Phase 4 should add review requirement when collaborators join)
- `enforce_admins: false` — repo owner can override protection (D-20 intentional for early bootstrap)

## Self-Check

- `.github/workflows/ci.yml` present + committed at `bf74101`: FOUND
- Repo `Red-Square-Software/keeping-mcp` exists, public, description + homepage set: VERIFIED
- HEAD `e462694` pushed to `origin/main`: VERIFIED
- 4/4 matrix jobs green on CI run 27216408956: VERIFIED
- Branch protection PUT response shows 4 contexts + linear history + no force push: VERIFIED

**Self-Check: PASS** — all 4 tasks complete and verified.
