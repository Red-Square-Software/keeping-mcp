---
phase: 04-distribution-release-pipeline
plan: 01
subsystem: distribution
tags: [mcp-registry, npm-publish, server-json, ci-gate, tsx, allowlist]

# Dependency graph
requires:
  - phase: 01-foundation-scaffolding
    provides: "package.json mcpName field (DIST-02), files[] whitelist (DIST-04 foundation), tsx devDep"
provides:
  - "server.json MCP Registry manifest with placeholder version 0.0.0 in two slots (top-level + packages[0])"
  - "scripts/check-publish-shape.ts — three-assertion pre-publish gate"
  - "npm script check-publish-shape wired via tsx (no new dependencies)"
  - "Locked DIST-05 namespace binding via mcpName === server.json.name equality assertion"
  - "Locked DIST-04 tarball-allowlist invariant via npm pack --dry-run --json exact-set match"
affects: [04-02-readme, 04-03-release-workflow, 04-04-tag-publish]

# Tech tracking
tech-stack:
  added: []  # No new npm dependencies (reused existing tsx@4.22.4 devDep)
  patterns:
    - "Stderr-only logging in scripts/ (sibling pattern to scripts/probe-live.ts)"
    - "shell:process.platform===win32 for cross-platform npm.cmd invocation in spawnSync"
    - "Exact-set sorted-array equality for allowlist guards"
    - "import.meta.url + fileURLToPath + resolve(.. , '..') for ESM repo-root anchoring"

key-files:
  created:
    - "server.json"
    - "scripts/check-publish-shape.ts"
    - ".planning/phases/04-distribution-release-pipeline/04-01-SUMMARY.md"
  modified:
    - "package.json (added check-publish-shape npm script)"

key-decisions:
  - "server.json version field holds literal 0.0.0 in BOTH top-level and packages[0] slots; Plan 04-04 tag push is the only legitimate writer via Plan 04-03's jq step"
  - "Allowlist uses exact-set match (length + sorted-array compare) not subset match; DIST-04 mandates zero-drift, not minimum-coverage"
  - "Assertion 3 refuses to run if .npmignore exists — belt-and-suspenders for Assertion 1, since .npmignore silently overrides files[]"
  - "spawnSync shell flag set conditionally on process.platform===win32 (not unconditionally true) — minimises shell-escape attack surface on Linux/macOS while still resolving npm.cmd on Windows runners"
  - "server.json.repository.url has NO trailing .git (schema convention); package.json.repository.url keeps .git (npm convention) — the asymmetry is intentional"
  - "Script writes ONLY to process.stderr (no console.log) — preserves the stdio-discipline rule from CLAUDE.md even though this script is not an MCP server itself"

patterns-established:
  - "Pre-publish CI gate pattern: single npm script (`npm run check-publish-shape`) that bundles file-shape + namespace-binding + anti-pattern checks behind one exit code"
  - "Sorted-array exact-set comparison: `actual.length !== expected.length || actual.some((p,i) => p !== expected[i])` — order-insensitive but drift-sensitive"
  - "Placeholder version 0.0.0 signal: 0.0.0 in a manifest version field documents `do not hand-edit; CI rewrites at publish time` without requiring a comment in a strict-JSON file"

requirements-completed: [DIST-04, DIST-05, REL-03]

# Metrics
duration: ~5min
completed: 2026-06-12
---

# Phase 04 Plan 01: server.json + Pre-Publish Gate Summary

**MCP Registry manifest committed with placeholder versions and a three-assertion `npm run check-publish-shape` gate that defends DIST-04 tarball-allowlist + DIST-05 namespace binding before any tag push reaches the registries.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-12T08:45:00Z (after STATE.md tail read)
- **Completed:** 2026-06-12T08:48:55Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `server.json` shipped at repo root with locked shape: `$schema=2025-12-11`, `name=io.github.red-square-software/keeping-mcp`, `version="0.0.0"` (both top-level and `packages[0].version`), `registryType=npm`, `identifier=keeping-mcp`, `transport.type=stdio`. Both `0.0.0` slots are the substrate Plan 04-03's `jq` step rewrites at publish time.
- `scripts/check-publish-shape.ts` ships three assertions, each with a single-line stderr OK/FAIL surface:
  1. `npm pack --dry-run --json` files-array sorted-equals the 4-item ALLOWLIST (LICENSE, README.md, dist/bin/keeping-mcp.js, package.json) — DIST-04 / ROADMAP SC #1
  2. `package.json.mcpName === server.json.name` (currently both `io.github.red-square-software/keeping-mcp`) — DIST-05 / RESEARCH §Pitfall 6
  3. `.npmignore` does NOT exist in repo root — DIST-04 sole-filter mandate
- Wired `npm run check-publish-shape` via tsx (already a devDependency; zero new packages added).
- Verified the script catches drift: added `"test"` to `package.json.files[]`, observed `[check-publish-shape] FAIL: tarball contents drift` with expected/actual diff listing 21 stray test files; reverted the change and re-verified exit 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create server.json with locked MCP Registry shape** — `1ef8a87` (feat)
2. **Task 2: Author scripts/check-publish-shape.ts and wire npm script** — `27ebcee` (feat)

_No TDD multi-commit phases — this plan ships infra config + a guard script, not behaviour._

## Files Created/Modified

- `server.json` (created) — MCP Registry manifest. 21 lines, strict JSON, LF line endings. Two version slots both at `0.0.0`. Repository URL without `.git` per schema convention. `websiteUrl` mirrors `repository.url` (no separate marketing site).
- `scripts/check-publish-shape.ts` (created) — 79 lines. Three sequential assertions, fail-fast via `process.exit(1)` on first mismatch. Stderr-only output. Anchored to repo root via `fileURLToPath(import.meta.url)` so it works regardless of cwd. Cross-platform npm spawn via `shell: process.platform === "win32"`.
- `package.json` (modified) — added single line: `"check-publish-shape": "tsx scripts/check-publish-shape.ts"` between `dev` and `probe-live` entries in the `scripts` block. No other changes; `files[]`, `engines.node`, `mcpName`, `repository.url` all preserved from Phase 1.

## Verification Commands Run + Outputs

All commands run from repo root after both task commits landed.

```
$ npm run build
> tsup
ESM dist\bin\keeping-mcp.js 46.61 KB
ESM Build success in 37ms
```

```
$ npx tsc --noEmit
(exit 0, no output)
```

```
$ npm run check-publish-shape
[check-publish-shape] OK: tarball contents match allowlist (4 files)
[check-publish-shape] OK: mcpName <-> server.json.name bound to io.github.red-square-software/keeping-mcp
[check-publish-shape] OK: no .npmignore present — files[] whitelist is the sole filter
[check-publish-shape] All three assertions passed.
(exit 0)
```

```
$ node -e "const fs=require('fs'); const s=JSON.parse(fs.readFileSync('./server.json','utf8')); const p=JSON.parse(fs.readFileSync('./package.json','utf8')); if (p.mcpName !== s.name) process.exit(1)"
(exit 0)
```

```
$ npm pack --dry-run --json | node -e "const d = JSON.parse(require('fs').readFileSync(0,'utf8')); const paths = d[0].files.map(f => f.path).sort(); const expected = ['LICENSE','README.md','dist/bin/keeping-mcp.js','package.json'].sort(); if (JSON.stringify(paths) !== JSON.stringify(expected)) { console.error('drift', paths); process.exit(1); } else { console.error('paths match'); }"
paths match
(exit 0)
```

Negative-test sanity check (performed once, reverted before commit):

```
$ # added "test" to package.json.files[]
$ npm run check-publish-shape
[check-publish-shape] FAIL: tarball contents drift
  expected: ["LICENSE","README.md","dist/bin/keeping-mcp.js","package.json"]
  actual:   ["LICENSE","README.md","dist/bin/keeping-mcp.js","package.json","test/fixtures/...","test/keeping/..." (21 files total)]
(exit 1)
$ # reverted package.json.files[] to original 3-entry array
$ npm run check-publish-shape
(exit 0, all three OK lines as above)
```

## Decisions Made

- **server.json placeholder versions**: Both `version` and `packages[0].version` use the literal string `"0.0.0"`, not the current `0.1.0` from package.json. The `0.0.0` value is a semantic signal: "do not hand-edit; CI rewrites at publish time". This is the substrate for Plan 04-03's `jq --arg v X '.version = $v | .packages[0].version = $v' server.json` step, and Plan 04-04's tag-push contract assumes both slots read `0.0.0` on the trunk branch between releases.
- **No new npm dependencies**: Reused existing `tsx@4.22.4` devDependency rather than adding `tsx` to scripts manually or pulling in a JSON validator. The script runs with `tsx scripts/check-publish-shape.ts` — same idiom as `scripts/probe-live.ts` established in Phase 2.
- **Cross-platform npm spawn**: Used `shell: process.platform === "win32"` rather than `shell: true` unconditionally. The Windows-only shell flag resolves `npm.cmd` correctly on Windows runners (mandatory) while avoiding shell-escape surface on Linux/macOS runners (minor security hardening). GitHub Actions Windows runners use `npm.cmd`; Linux/macOS use the binary `npm` directly.
- **Stderr-only output**: The script writes ONLY to `process.stderr` (no `console.log`) — preserves the stdio-discipline rule from CLAUDE.md so the script is safe to compose with any future stdout-reading workflow without parser pollution.

## Deviations from Plan

None - plan executed exactly as written.

Plan task verification commands occasionally used CommonJS `require()` syntax (e.g., `node -e "const s = require('./server.json')"`) which would fail in this ESM project (`"type": "module"`). Adapted to `JSON.parse(readFileSync(...))` inline for the equivalent assertion — same semantics, ESM-safe. No file content changed; this only affected the verification invocation form, not the plan's deliverables or success criteria.

## Issues Encountered

None.

## Notes for Plan 04-03 (release workflow)

- The release workflow MUST invoke `npm run check-publish-shape` as a CI step **after `npm run build`** (so `dist/bin/keeping-mcp.js` exists for Assertion 1's `npm pack --dry-run`) and **before `npm publish` / `mcp-publisher publish`**.
- The script exits non-zero on any drift; failing the publish job before secrets leak is the entire point of the gate. Do NOT wrap it in `continue-on-error: true`.
- The script runs on both `ubuntu-latest` and `windows-latest` — the conditional `shell: process.platform === "win32"` flag is the cross-platform glue. Plan 04-03 can call it identically on either runner.
- The `jq` step in Plan 04-03 must rewrite **both** version slots in `server.json` (top-level `.version` AND `.packages[0].version`). A single jq expression handles this: `jq --arg v "$VERSION" '.version = $v | .packages[0].version = $v' server.json > server.json.tmp && mv server.json.tmp server.json`.
- After the `jq` rewrite, run `npm run check-publish-shape` AGAIN before `npm publish` — the rewritten file should still pass all three assertions (mcpName-binding is independent of version; allowlist is independent of version; .npmignore-absence is independent of version).

## Notes for Plan 04-04 (tag push)

- `server.json.version` and `server.json.packages[0].version` BOTH read `"0.0.0"` on `main` between releases. Plan 04-04 must NOT commit a non-`0.0.0` value to either field on `main`; the `jq` rewrite happens in the release workflow's ephemeral runner and is published, not committed back.
- After Plan 04-04 runs `npm version <vX.Y.Z>` (which bumps `package.json.version` and creates a git tag), the only file changed on `main` is `package.json`. `server.json` stays at `0.0.0` because the tag-push triggers Plan 04-03's workflow, which does the jq rewrite in the runner only.
- `package.json.mcpName === server.json.name` must remain `io.github.red-square-software/keeping-mcp` across the tag push. Plan 04-04's `npm version` does NOT touch `mcpName`; this is a stable invariant.
- If a future plan ever needs to rename the namespace (e.g., org rebrand), it must change BOTH `package.json.mcpName` AND `server.json.name` in the SAME commit, or `npm run check-publish-shape` will fail in the next CI run. The gate is the intentional speed bump.

## Next Phase Readiness

- ROADMAP SC #1 substrate locked: `npm run check-publish-shape` exists and defends the 4-file whitelist.
- ROADMAP SC #2 substrate locked: `server.json` exists at repo root with the schema, name, registryType, identifier, and transport fields the MCP Registry validates.
- DIST-05 namespace binding asserted locally — `mcp-publisher publish` will not see drift at registry publish time.
- REL-03 substrate ready: both `server.json` version fields hold the placeholder `0.0.0` that Plan 04-03's jq step targets.
- No new runtime npm dependencies were introduced (per Phase 4 §Package Legitimacy Audit "Not applicable"). The script reuses `tsx@4.22.4` already pinned in devDependencies since Plan 02-01.
- Plan 04-02 (README.md) can now reference `server.json` as the MCP Registry contract surface when documenting the install/distribute story.
- Plan 04-03 (.github/workflows/release.yml) can call `npm run check-publish-shape` directly without bash heredoc gymnastics.

## Self-Check: PASSED

Files verified to exist on disk:
- `server.json` — FOUND
- `scripts/check-publish-shape.ts` — FOUND
- `package.json` — FOUND (modified, contains `check-publish-shape` script entry)

Commits verified in `git log`:
- `1ef8a87` — FOUND (Task 1: feat(04-01): add server.json MCP Registry manifest)
- `27ebcee` — FOUND (Task 2: feat(04-01): add check-publish-shape pre-publish gate)

---
*Phase: 04-distribution-release-pipeline*
*Completed: 2026-06-12*
