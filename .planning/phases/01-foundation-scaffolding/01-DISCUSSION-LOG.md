# Phase 1: Foundation & Scaffolding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-09
**Phase:** 1-Foundation & Scaffolding
**Areas discussed:** Source layout, Logger implementation, CI matrix, GitHub repo setup

---

## Source Layout

### Layout shape

| Option | Description | Selected |
|--------|-------------|----------|
| Per research (Recommended) | src/config.ts, src/logger.ts, src/keeping/client.ts (stub), src/server.ts (stub), src/tools/ (empty); bin/keeping-mcp.ts loads config, calls die() if missing token, no server yet | ✓ |
| Flat src/ | Everything in src/ root | |
| Domain-first | src/domain/keeping/, src/infra/logger/, etc. | |

**User's choice:** Per research
**Notes:** Locks the 5-layer split that the architecture research recommended.

### Phase 1 vs Phase 2 inside src/

| Option | Description | Selected |
|--------|-------------|----------|
| Bare minimum (Recommended) | Only config + logger + bin entry implemented in Phase 1. KeepingClient and server.ts stay unwritten until Phase 2 | ✓ |
| Stubs everywhere | All files exist with empty exports so imports line up | |
| Skip stubs | Only create files when implementing | |

**User's choice:** Bare minimum
**Notes:** No empty stubs in Phase 1. KeepingClient/server.ts files appear only when implemented.

---

## Logger Implementation

### Implementation choice

| Option | Description | Selected |
|--------|-------------|----------|
| Bare stderr wrapper (Recommended) | ~15 LOC, log.debug/info/warn/error → process.stderr.write, levels gated by KEEPING_LOG_LEVEL | ✓ |
| pino over stderr | Structured JSON logs to stderr, ~50KB deps + config knob | |
| console.error directly | No wrapper, simplest, no redaction hook | |

**User's choice:** Bare stderr wrapper
**Notes:** Zero deps, levels via env var.

### Token-leak protection

| Option | Description | Selected |
|--------|-------------|----------|
| String-replace KEEPING_TOKEN value (Recommended) | Logger emit step replaces live token with `***` before write | ✓ |
| Trust callers | Documentation-only rule, no runtime guard | |
| Full PII redaction lib | pino-redact / similar | |

**User's choice:** String-replace KEEPING_TOKEN value
**Notes:** Catches accidental object dumps with Authorization headers cheaply.

---

## CI Matrix

### OS matrix

| Option | Description | Selected |
|--------|-------------|----------|
| Ubuntu + Windows (Recommended) | Both run lint+typecheck+test+build+smoke. Catches Windows-npx pitfall (#2) from Phase 1 forward | ✓ |
| Ubuntu only | Single OS; Windows verified manually at Phase 5 | |
| Ubuntu + Windows + macOS | All three, 3x cost | |

**User's choice:** Ubuntu + Windows
**Notes:** Pitfall #2 (Windows `cmd /c npx`) is the regression worth catching early.

### Node version matrix

| Option | Description | Selected |
|--------|-------------|----------|
| 22 only (Recommended) | Active LTS only | |
| 22 + 24 | 22 (LTS) + 24 (current). Catches breakage on next LTS | ✓ |
| 20 + 22 | Skip — Node 20 EOL | |

**User's choice:** 22 + 24
**Notes:** Adds early signal on the next LTS without dragging in EOL Node 20.

### Phase 1 CI smoke test mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: assert empty-stdout on missing token (Recommended) | Run with KEEPING_TOKEN unset, assert exit≠0 + matching stderr + empty stdout. No JSON-RPC yet | ✓ |
| Full initialize handshake | Pipe MCP initialize request, parse JSON-RPC response. Requires booting an empty MCP server in Phase 1 (extra scope) | |
| Both | Belt + suspenders | |

**User's choice:** Minimal: assert empty-stdout on missing token
**Notes:** Defer full handshake smoke to Phase 2 when server.ts exists.

---

## GitHub Repo Setup

### Remote status

| Option | Description | Selected |
|--------|-------------|----------|
| Exists empty — I push | Repo already created, add remote and push | |
| Need to create (Recommended) | Run `gh repo create redsquare-nl/keeping-mcp --public --license MIT` | |
| Create later | Skip until Phase 4 | |
| **User freeform** | **"Bestaat al maar voeg eventueel omschrijving licentie readme etc toe."** | ✓ |

**User's choice:** Remote already exists; Phase 1 fills in description, MIT license file, placeholder README.
**Notes:** Translates to: add `origin`, push, run `gh repo edit` to set description/homepage, add LICENSE + README at repo root.

### Branch protection

| Option | Description | Selected |
|--------|-------------|----------|
| Protect after first push (Recommended) | Require CI green + PR for main once CI exists | ✓ |
| Skip protection | Push directly to main | |
| Protect + require review | Self-approve PRs | |

**User's choice:** Protect after first push
**Notes:** Apply branch protection once first CI run is green so it does not block the initial bootstrap.

### Initial README scope

| Option | Description | Selected |
|--------|-------------|----------|
| Placeholder + status (Recommended) | Name, one-liner, "work in progress, see ROADMAP.md" | ✓ |
| Minimal install + token setup | Add token-setup walkthrough now | |
| Skip README | Empty file or none | |

**User's choice:** Placeholder + status
**Notes:** Full install README is REL-04 in Phase 4. Placeholder prevents the bare-repo look.

---

## Claude's Discretion

- Exact tsup config (target, format, dts, sourcemap) — pick standard ESM bundle defaults.
- biome.json rule set — start from `recommended`; tune as friction appears.
- Vitest config — defaults; no coverage threshold in Phase 1.
- Pre-commit hooks — none in Phase 1.

## Deferred Ideas

- Pre-commit hooks (lefthook/husky) — reconsider at Phase 4.
- `outputSchema` on tools — Phase 2+ once wire format known.
- Provenance / SLSA badge — DISTv2-01.
- Source maps in dist — defer until a consumer asks.
- macOS CI job — defer; add if a macOS-only failure surfaces.
- Required PR reviewers / CODEOWNERS — defer until contributors join.
