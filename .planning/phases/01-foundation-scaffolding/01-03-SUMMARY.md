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
  affects:
    - "Phase 2: branch protection active after Task 4; all Phase 2 work must use feature branches + PRs"
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
  - "Used /tmp/smoke_stderr as primary temp path (Git Bash maps /tmp on windows-latest per RESEARCH Assumption A2); RUNNER_TEMP fallback documented in workflow notes"
  - "Used actions/setup-node@v4 (v4 is widely-deployed stable; v6 exists but v4 has broadest doc coverage per RESEARCH Assumption A3)"
metrics:
  duration: "partial — stopped at checkpoint:human-verify (Task 2)"
  completed_date: "2026-06-09"
  tasks_completed: 1
  tasks_total: 4
  files_created: 1
  files_modified: 0
status: "CHECKPOINT — awaiting human verification before push"
---

# Phase 1 Plan 03: CI, Remote, and Branch Protection Summary

**STATUS: PAUSED AT CHECKPOINT (Task 2)**

CI workflow written and committed. Execution paused at the `checkpoint:human-verify` gate (Task 2) — requires human confirmation of `gh` auth, remote URL, and repo state before the first push.

## What Was Built

| File | Description |
|------|-------------|
| `.github/workflows/ci.yml` | Matrix CI: `[ubuntu-latest, windows-latest] × [22, 24]`; steps: npm ci → biome check → tsc --noEmit → vitest run → build → smoke test |

## Task 1 — ci.yml Verification

| Check | Expected | Result |
|-------|----------|--------|
| File exists | YES | PASS |
| `ubuntu-latest` in matrix | YES | PASS |
| `windows-latest` in matrix | YES | PASS |
| `node: [22, 24]` in matrix | YES | PASS |
| `biome check .` step | YES | PASS |
| `tsc --noEmit` step | YES | PASS |
| `vitest run` step | YES | PASS |
| `npm run build` step | YES | PASS |
| `shell: bash` on smoke step | YES | PASS |
| `grep -qF` fixed-string assertion | YES | PASS |
| D-05 literal string in file | YES | PASS |
| No `macos-latest` | YES (excluded) | PASS |
| No `release`/`publish` references | YES (excluded) | PASS |

**Commit:** `bf74101` — `feat(01-03): add CI matrix workflow with D-13 smoke assertion`

## Task 2 — Checkpoint State (BLOCKED)

Execution stopped at `checkpoint:human-verify` (Task 2). The following issues need human resolution before proceeding to Task 3 (push):

### Issue 1: `gh` CLI not available in executor environment

`gh` is not on the PATH in the Bash execution environment. The executor cannot run:
- `gh auth status`
- `gh repo view red-square-software/keeping-mcp --json viewerCanAdminister,viewerPermission`

The human must verify `gh` authentication manually.

### Issue 2: Remote URL mismatch

The current `origin` remote points to:
```
https://github.com/ElBart00/keeping-mcp.git
```

The plan (`01-03-PLAN.md`) specifies:
```
git@github.com:red-square-software/keeping-mcp.git
```
(or HTTPS: `https://github.com/red-square-software/keeping-mcp.git`)

**Human must confirm:** Is `red-square-software/keeping-mcp` the correct destination, or should this push to `ElBart00/keeping-mcp`? The remote must be updated (or confirmed correct) before the push.

## Pending Tasks

- **Task 3:** Stage all Phase 1 files, create first commit, push to remote, wait for CI green
- **Task 4:** `gh repo edit` (description + homepage per D-18), configure branch protection on `main` (D-20)

## Deviations from Plan

### Auto-fixed Issues

None.

### Pre-existing Deviation (not caused by this plan)

**Remote URL:** The repository already has `origin` set to `https://github.com/ElBart00/keeping-mcp.git`. The plan assumes `red-square-software/keeping-mcp`. Human must clarify the correct remote before Task 3 proceeds.

## Known Stubs

None — ci.yml is fully implemented per specification.

## Threat Flags

No new security-relevant surface beyond what was planned.

## Self-Check

- `.github/workflows/ci.yml` exists: FOUND
- Task 1 commit `bf74101`: FOUND
- Tasks 2–4: NOT YET EXECUTED (blocked at checkpoint)

**Self-Check: PARTIAL** — Task 1 complete and verified. Tasks 2–4 pending human verification.
