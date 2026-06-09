# Phase 1: Foundation & Scaffolding - Research

**Researched:** 2026-06-09
**Domain:** TypeScript npm package skeleton, Zod env validation, tsup ESM build, Biome 2.x lint, Vitest, GitHub Actions CI matrix, branch protection
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Source layout: `bin/keeping-mcp.ts` (entrypoint), `src/config.ts` (env validation + types), `src/logger.ts` (stderr wrapper). `src/keeping/client.ts`, `src/server.ts`, `src/tools/` are NOT created in Phase 1.

**D-02:** `bin/keeping-mcp.ts` job in Phase 1: call `loadConfig()` from `src/config.ts`; on validation failure write error to stderr and `process.exit(1)`. Do NOT call `connect(transport)` — no MCP server in Phase 1.

**D-03:** `package.json` ships ESM only (`"type": "module"`), `"engines": { "node": ">=22.0.0" }`, `"bin": { "keeping-mcp": "./dist/bin/keeping-mcp.js" }`, `"mcpName": "io.github.red-square-software/keeping-mcp"`, MIT license.

**D-04:** `src/config.ts` reads `KEEPING_TOKEN` (required), `KEEPING_REQUIRE_CONFIRM` (default `"true"`), `KEEPING_ORG_ID` (optional). Validation via Zod.

**D-05:** Missing/empty `KEEPING_TOKEN` throws with exact message `[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty`. No stack trace to stderr (clean UX); stack only shown when `KEEPING_LOG_LEVEL=debug`.

**D-06:** `src/logger.ts` ~15 LOC bare `process.stderr.write` wrapper. Exports `log.debug/info/warn/error`. Format: `[keeping-mcp] [LEVEL] message`.

**D-07:** Level gated by `KEEPING_LOG_LEVEL` env (default `info`; accepts `debug|info|warn|error`).

**D-08:** Token redaction at emit: logger captures `KEEPING_TOKEN` at construction time and string-replaces it with `***` in every log line before write.

**D-09:** Nothing may use `console.log` — biome rule `noConsole` configured to allow only `console.error`. `process.stdout.write` is also forbidden. CI smoke test verifies empirically.

**D-10:** GitHub Actions matrix: OS `[ubuntu-latest, windows-latest]` × Node `[22, 24]`. Four jobs.

**D-11:** Job steps: `npm ci` → `biome check .` → `tsc --noEmit` → `vitest run` → `npm run build` → smoke test.

**D-12:** Workflow at `.github/workflows/ci.yml`.

**D-13:** Smoke test: run built bin with `KEEPING_TOKEN` unset; assert (a) exit code ≠ 0, (b) stderr contains the literal config-error message, (c) stdout is exactly empty.

**D-14:** Shell-portable smoke test script (bash on all OSes via `shell: bash` Git Bash on Windows).

**D-15:** Full MCP `initialize` handshake smoke deferred to Phase 2.

**D-16:** `test/logger.test.ts`: construct logger with fake token `"kp_test_FAKE_token_value"`; call `log.error({ headers: { Authorization: 'Bearer kp_test_FAKE_token_value' } })`; assert captured stderr does NOT contain the literal fake token substring.

**D-17:** Phase 1 enforces logger contract only.

**D-18:** Remote `red-square-software/keeping-mcp` already exists empty. Phase 1: add as origin, push, `gh repo edit` for description and homepage, write `LICENSE` and `README.md`.

**D-19:** Placeholder `README.md`: H1, one-line description, badge slot, "Status: work in progress — see .planning/ROADMAP.md".

**D-20:** Branch protection on `main` AFTER first successful CI run: require `ci` status check + require linear history. No required reviewers.

**D-21:** `.gitignore` additions: `node_modules/`, `dist/`, `coverage/`, `.env`, `.env.*`, `*.log`.

### Claude's Discretion

- Exact tsup config knobs (target, format, dts, sourcemap on/off) — pick standard ESM bundle defaults; no source maps in dist.
- biome.json rule set — start from recommended preset; customize only when a rule clashes.
- Vitest config — defaults; no coverage threshold gating in Phase 1.
- Lefthook/husky vs none — skip pre-commit hooks entirely in Phase 1.

### Deferred Ideas (OUT OF SCOPE)

- Pre-commit hooks (lefthook/husky)
- `outputSchema` on tools
- Provenance / SLSA badge in README
- Source maps in dist
- macOS CI job
- Required PR reviewers / CODEOWNERS
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIST-01 | Server installable and runnable via `npx keeping-mcp` with no prior global install | `package.json` `"bin"` + `"files"` whitelist + tsup bundle to `dist/bin/keeping-mcp.js` |
| DIST-02 | npm package name `keeping-mcp` + `"mcpName": "io.github.red-square-software/keeping-mcp"` | `package.json` shape with `mcpName` field — required for MCP Registry namespace verification |
| DIST-03 | Bin entry has shebang, works cross-platform | tsup `banner: { js: "#!/usr/bin/env node" }` injects shebang; npm wraps in `.cmd` for Windows |
| AUTH-01 | Server reads token from `KEEPING_TOKEN` env var | `src/config.ts` Zod schema reads `process.env.KEEPING_TOKEN` |
| AUTH-02 | Missing/empty `KEEPING_TOKEN` fails fast with clear stderr message | `loadConfig()` calls `schema.safeParse`, writes exact D-05 message to stderr, `process.exit(1)` |
| AUTH-03 | Token never written to stdout, never echoed in tool responses, never logged | Token redaction in `src/logger.ts` + biome `noConsole` rule + CI smoke verifies stdout empty |
| SAFE-01 | All log output to stderr; no `console.log` or library write to stdout; verified by CI smoke | biome `noConsole` allow `["error"]` + smoke test asserts stdout empty bytes on binary run |
| REL-01 | GitHub repo at `red-square-software/keeping-mcp` with MIT license file | `LICENSE` file at repo root + `gh repo edit` to configure description + branch protection after CI green |
</phase_requirements>

---

## Summary

Phase 1 is entirely greenfield file creation — no existing code to modify. The deliverables are configuration files and two small TypeScript source files. The main risks are: (1) Biome 2.x `noConsole` rule syntax has changed from prior research knowledge (verified below — it uses an `allow` list inside `options`); (2) `z.coerce.boolean()` in Zod v3 does NOT correctly parse the string `"false"` as `false` (it returns `true` because `Boolean("false") === true`), so the config loader must use a manual transform; (3) `actions/setup-node` has advanced to v4 in active use (v6 exists but v4 remains broadly documented — use v4 for stability, confirmed from GitHub docs); and (4) tsup's shebang injection uses `banner: { js: "#!/usr/bin/env node" }` (not auto-detected from the source file's shebang comment).

The entire phase produces no runtime behavior beyond "load config → exit 1 with message if token missing, exit 0 if present". Every file is independently verifiable before integration. The build dependency order is strict: config files first, then source files, then install, then build, then CI.

**Primary recommendation:** Write the files in dependency order (package.json → tsconfig.json → tsup.config.ts → biome.json → vitest.config.ts → src/config.ts → src/logger.ts → bin/keeping-mcp.ts → test/logger.test.ts → .github/workflows/ci.yml → LICENSE → README.md → .gitignore → .gitattributes), then `npm install`, build, smoke test locally, commit, push, wire remote.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Env var validation | Config (src/config.ts) | — | Zod schema owns all env parsing; entrypoint only calls `loadConfig()` |
| Fail-fast startup error | Entrypoint (bin/keeping-mcp.ts) | Config (src/config.ts) | Config returns typed error; entrypoint decides to exit |
| Token redaction | Logger (src/logger.ts) | — | Redaction at emit point; logger owns all stderr writes |
| Log level gating | Logger (src/logger.ts) | Config (src/config.ts) | Logger reads `KEEPING_LOG_LEVEL` from env directly (Phase 1 simplicity) |
| Stdout hygiene | Linter (biome.json) | CI smoke test | Rule catches accidental `console.log`; smoke test catches runtime regressions |
| ESM bundle output | Build tool (tsup) | — | tsup handles shebang injection + ESM-only output |
| CI matrix | GitHub Actions (ci.yml) | — | 4-job matrix owns lint/typecheck/test/build/smoke |
| npm publish readiness | package.json `"files"` | — | Whitelist established in Phase 1 even though publish is Phase 4 |

---

## Standard Stack

### Core (Phase 1 only — no SDK in this phase)

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| `typescript` | `^6.0.3` | Type-safe compilation + `tsc --noEmit` typecheck | [VERIFIED: npm registry] |
| `zod` | `^4.4.3` | Env var validation in `src/config.ts` | [VERIFIED: npm registry] |
| `tsup` | `^8.5.1` | ESM bundle with shebang injection | [VERIFIED: npm registry] |
| `vitest` | `^4.1.8` | Unit tests including token-leak test | [VERIFIED: npm registry] |
| `@biomejs/biome` | `^2.4.16` | Lint + format in one binary | [VERIFIED: npm registry] |
| `@types/node` | `^22.0.0` | Node.js type definitions for `process.env`, `process.stderr` etc. | [VERIFIED: npm registry — latest is 25.9.2 but pin to 22.x to match engine] |

**`@types/node` version note:** Latest published is `25.9.2`. For a project targeting Node `>=22`, pin to `^22.15.0` (latest 22.x series) to avoid phantom type differences from newer Node APIs not present at runtime. [ASSUMED — confirm by checking `npm view @types/node versions` for 22.x latest].

**Zod version note:** Zod 4 is now the `latest` tag (4.4.3). The locked stack says `^3.25.0`. CONTEXT.md D-04 says "Zod (already in dep tree for Phase 2 tool schemas — no extra dep cost)". The STACK.md documents that `zod/v4` features are accessible from v3.25+ via `import * as z from "zod/v4"`. However, since Zod 4 is now `latest`, installing `zod@^4.4.3` and importing from `"zod"` directly is simpler and has first-class SDK 1.29+ support. Use Zod 4 (`^4.4.3`) throughout. The `z.stringbool()` method (needed for `KEEPING_REQUIRE_CONFIRM`) lives in Zod 4 and is NOT available in Zod v3's main entry point.

### Supporting (Phase 1, dev only)

All packages are `devDependencies` in Phase 1. There are zero runtime dependencies in Phase 1 — `zod` is the only runtime dep, and it is used in `src/config.ts`.

```
dependencies:
  zod: ^4.4.3

devDependencies:
  typescript: ^6.0.3
  tsup: ^8.5.1
  vitest: ^4.1.8
  @biomejs/biome: ^2.4.16
  @types/node: ^22.15.0
```

**Installation:**
```bash
npm install zod
npm install -D typescript tsup vitest @biomejs/biome @types/node
```

---

## Package Legitimacy Audit

> slopcheck was unavailable at research time (pip install failed). All packages below are tagged `[ASSUMED]` for existence/legitimacy. However, all packages were verified on the npm registry via `npm view <pkg> version` during research.

| Package | Registry | npm view confirmed | Downloads context | Source Repo | slopcheck | Disposition |
|---------|----------|--------------------|-------------------|-------------|-----------|-------------|
| `zod` | npm | 4.4.3 [VERIFIED: npm registry] | Tens of millions/week, core ecosystem | github.com/colinhacks/zod | N/A — not run | Approved [ASSUMED] |
| `typescript` | npm | 6.0.3 [VERIFIED: npm registry] | Hundreds of millions/week | github.com/microsoft/TypeScript | N/A — not run | Approved [ASSUMED] |
| `tsup` | npm | 8.5.1 [VERIFIED: npm registry] | Millions/week | github.com/egoist/tsup | N/A — not run | Approved [ASSUMED] |
| `vitest` | npm | 4.1.8 [VERIFIED: npm registry] | Tens of millions/week | github.com/vitest-dev/vitest | N/A — not run | Approved [ASSUMED] |
| `@biomejs/biome` | npm | 2.4.16 [VERIFIED: npm registry] | Millions/week | github.com/biomejs/biome | N/A — not run | Approved [ASSUMED] |
| `@types/node` | npm | 25.9.2 [VERIFIED: npm registry] | Hundreds of millions/week | github.com/DefinitelyTyped/DefinitelyTyped | N/A — not run | Approved [ASSUMED] |

**Packages removed due to slopcheck [SLOP] verdict:** none

**Packages flagged as suspicious [SUS]:** none

*slopcheck was unavailable at research time — the planner must gate each `npm install` step behind a `checkpoint:human-verify` if concerned, or accept these well-known packages as safe given their provenance.*

---

## Architecture Patterns

### System Architecture Diagram (Phase 1 only)

```
process.env
    │
    ▼
src/config.ts (Zod schema parse)
    │  success → KeepingConfig
    │  failure → ZodError
    │
    ▼
bin/keeping-mcp.ts (entrypoint)
    │  on ZodError → process.stderr.write(message) → process.exit(1)
    │  on success  → process.stderr.write("[info] config loaded") → process.exit(0)
    │
    └─── src/logger.ts (token-redacting stderr wrapper)
              │ writes to process.stderr only
              │ never touches process.stdout
              ▼
           stderr (host process captures)
           stdout (EMPTY — verified by CI smoke)
```

### Recommended Project Structure (Phase 1 only)

```
keeping-mcp/
├── bin/
│   └── keeping-mcp.ts        # CLI entrypoint (#!/usr/bin/env node shebang in source)
├── src/
│   ├── config.ts             # Zod env validation, KeepingConfig type, loadConfig()
│   └── logger.ts             # Token-redacting stderr wrapper
├── test/
│   └── logger.test.ts        # Token-leak unit test (Vitest)
├── .github/
│   └── workflows/
│       └── ci.yml            # Matrix CI: lint → typecheck → test → build → smoke
├── dist/                     # Generated by tsup (gitignored)
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── biome.json
├── vitest.config.ts
├── .gitignore
├── .gitattributes            # * text=auto eol=lf (line ending safety)
├── LICENSE                   # MIT
└── README.md                 # Placeholder
```

### Pattern 1: Zod Env Schema with `stringbool` for Boolean Env Vars

**What:** Zod 4 provides `z.stringbool()` for env var boolean parsing. It correctly treats `"false"`, `"0"`, `"no"`, `"off"`, `"n"`, `"disabled"` as `false` and `"true"`, `"1"`, `"yes"`, `"on"`, `"y"`, `"enabled"` as `true`. This is critical: `z.coerce.boolean()` in both Zod v3 and v4 uses `Boolean(value)` which returns `true` for ANY non-empty string including `"false"`.

**When to use:** Every env var that accepts `"true"` / `"false"` string values.

```typescript
// Source: https://zod.dev/api?id=booleans (Zod 4 official docs)
import { z } from "zod";

const ConfigSchema = z.object({
  KEEPING_TOKEN: z.string().min(1, "KEEPING_TOKEN must not be empty"),
  KEEPING_REQUIRE_CONFIRM: z.stringbool().default(true),
  KEEPING_ORG_ID: z.string().optional(),
  KEEPING_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type KeepingConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): KeepingConfig {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => i.message)
      .join("; ");
    process.stderr.write(
      `[keeping-mcp] Configuration error: ${msg}\n`,
    );
    process.exit(1);
  }
  return result.data;
}
```

**Important:** `z.stringbool()` is Zod 4 only. It is available via `import { z } from "zod"` when `zod@^4.x` is installed. [VERIFIED: zod.dev/api docs + npm registry confirms zod 4.4.3 is latest]

**KEEPING_TOKEN error message (D-05):** The exact required message is `[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty`. Achieve this by setting the Zod `.min(1, "KEEPING_TOKEN must not be empty")` — the issue message becomes the user-visible part after the prefix. Format: the `loadConfig()` function writes `[keeping-mcp] Configuration error: ` + the Zod issue messages joined by `"; "`.

### Pattern 2: Token-Redacting Logger Factory

**What:** Factory function (not module singleton) because the token is not available until `loadConfig()` returns.

```typescript
// src/logger.ts — ~20 LOC
// Source: D-06 through D-09 in CONTEXT.md; pattern verified against ARCHITECTURE.md

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

export function createLogger(token: string, level: LogLevel = "info") {
  const minLevel = LEVELS[level];

  function emit(lvl: LogLevel, ...args: unknown[]): void {
    if (LEVELS[lvl] < minLevel) return;
    const raw = args
      .map((a) =>
        typeof a === "string" ? a : JSON.stringify(a),
      )
      .join(" ");
    const redacted = raw.replaceAll(token, "***");
    process.stderr.write(`[keeping-mcp] [${lvl.toUpperCase()}] ${redacted}\n`);
  }

  return {
    debug: (...args: unknown[]) => emit("debug", ...args),
    info:  (...args: unknown[]) => emit("info", ...args),
    warn:  (...args: unknown[]) => emit("warn", ...args),
    error: (...args: unknown[]) => emit("error", ...args),
  };
}
```

**Token redaction note:** `String.prototype.replaceAll` is available natively in Node 22 (ES2021+). Using `JSON.stringify` for objects ensures nested `Authorization` header values are captured. The factory pattern means there is no module-level singleton — the logger is created in `bin/keeping-mcp.ts` after `loadConfig()` returns the token. [ASSUMED — replaceAll availability on Node 22 is standard JS, not library-specific]

### Pattern 3: Entrypoint (Phase 1 minimum)

```typescript
// bin/keeping-mcp.ts
#!/usr/bin/env node
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";

const config = loadConfig(); // exits on missing token
const log = createLogger(config.KEEPING_TOKEN, config.KEEPING_LOG_LEVEL);
log.info("config loaded, server boot deferred to Phase 2");
process.exit(0);
```

**Note:** The shebang comment in the source file is cosmetic (TypeScript strips it). The actual shebang in `dist/bin/keeping-mcp.js` is injected by tsup's `banner` option. The source shebang is included anyway for IDE clarity and to preserve editor handling.

**ESM import paths:** All relative imports MUST use `.js` extension (TypeScript `"module": "Node16"` requirement). `../src/config.js` refers to `../src/config.ts` in source — TypeScript resolves this correctly with `"moduleResolution": "Node16"`. [CITED: STACK.md § tsconfig; official TS docs on Node16 module resolution]

### Anti-Patterns to Avoid

- **`z.coerce.boolean()`:** Returns `true` for the string `"false"`. Use `z.stringbool()` (Zod 4) instead.
- **Module-level logger singleton:** Token is unknown at module load time. Always use the factory pattern.
- **`console.log` in any source file:** Biome `noConsole` rule will fail the lint step; CI smoke will catch any that slip through.
- **`process.stdout.write` in any source file:** No Biome rule currently exists for this (Biome does not have `noProcessStdoutWrite`). Add a comment in CLAUDE.md or project conventions explicitly banning it. The CI smoke test is the runtime enforcement.
- **`.npmignore` file:** Never create one. The `"files"` whitelist in `package.json` is the only allowlisted approach (per PITFALLS.md Pitfall 9).
- **CJS output:** `"type": "module"` + tsup `format: ["esm"]` + `target: "node22"`. Never add CJS format in Phase 1.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Env var validation + types | Custom `process.env` reader | Zod schema + `safeParse` | Zod gives compile-time types, runtime validation, human-readable errors, and `z.infer<>` type export in one step |
| Boolean env var parsing | `=== 'true'` string compare | `z.stringbool()` (Zod 4) | Handles `"1"`, `"yes"`, `"on"` etc.; case-insensitive; throws on invalid values |
| TypeScript bundling | `tsc` + manual chmod + shebang sed | tsup with `banner` | tsup handles shebang injection, ESM output, clean output dir, single config |
| Lint + format config | eslint.config.js + .prettierrc | biome.json | Single binary, single config, 20x faster on this codebase size |

**Key insight:** Every tool in the Phase 1 stack exists specifically because its hand-rolled equivalent has a known failure mode at production scale (Zod's coerce gotcha is a perfect example — the "obvious" approach is wrong).

---

## Common Pitfalls

### Pitfall 1: `z.coerce.boolean()` Returns `true` for `"false"`
**What goes wrong:** `z.coerce.boolean().parse("false")` returns `true` because `Boolean("false") === true` in JavaScript. A user setting `KEEPING_REQUIRE_CONFIRM=false` expects writes to skip confirmation, but the server would silently keep confirmation enabled.
**Why it happens:** Zod's `coerce.*` uses the native JavaScript constructor, not semantic string parsing.
**How to avoid:** Use `z.stringbool()` from Zod 4. Never use `z.coerce.boolean()` for env vars.
**Warning signs:** Any test with `process.env.KEEPING_REQUIRE_CONFIRM = "false"` and `config.KEEPING_REQUIRE_CONFIRM` expected to be `false`.

### Pitfall 2: tsup Does NOT Auto-Detect Shebang from Source File
**What goes wrong:** If `#!/usr/bin/env node` appears only in the source `.ts` file's first line, TypeScript treats it as a syntax error or strips it. The bundled output will NOT have a shebang unless `banner` is configured.
**Why it happens:** TypeScript does handle shebang lines in `.ts` files (it strips them) — but tsup needs the explicit `banner` config to prepend the shebang to the output.
**How to avoid:** Always set `banner: { js: "#!/usr/bin/env node" }` in `tsup.config.ts`. The source file shebang is optional (for IDE tooling) — the output shebang is what matters.
**Confirmed:** Multiple tsup issues and examples confirm `banner` is the canonical approach. [CITED: tsup README, GitHub issue #719, multiple blog examples]

### Pitfall 3: `.js` Extensions Required in ESM Imports
**What goes wrong:** Import like `import { loadConfig } from "../src/config"` fails at runtime in Node.js ESM mode with `ERR_MODULE_NOT_FOUND`.
**Why it happens:** ESM requires explicit file extensions. `"moduleResolution": "Node16"` in tsconfig enforces this at compile time.
**How to avoid:** All relative imports use `.js` extension even when the source file is `.ts`. TypeScript resolves correctly. `import { loadConfig } from "../src/config.js"` is correct.

### Pitfall 4: Windows Line Endings Break Shebang
**What goes wrong:** If the built `dist/bin/keeping-mcp.js` has CRLF line endings on Windows, the shebang `#!/usr/bin/env node\r` fails on Linux/macOS with "bad interpreter" error.
**Why it happens:** Git on Windows may convert LF to CRLF; tsup's banner output is string-based and may not force LF.
**How to avoid:** Add a `.gitattributes` file with `* text=auto eol=lf`. This forces LF in the repo and output regardless of OS. tsup's banner option outputs a plain string — the bundler (esbuild under the hood) outputs LF on all platforms, but `.gitattributes` is the safety net.

### Pitfall 5: `process.stdout.write` Has No Biome Rule
**What goes wrong:** Biome `noConsole` blocks `console.log`, `console.warn`, `console.info` etc., but `process.stdout.write` has no equivalent lint rule in Biome 2.x. A developer could accidentally call `process.stdout.write(...)` and neither the lint step nor TypeScript will catch it.
**Why it happens:** Biome does not have a `noProcessStdoutWrite` rule as of 2.4.16. [VERIFIED: biomejs.dev/linter/javascript/rules — no such rule exists]
**How to avoid:** The CI smoke test is the empirical safety net (D-13 asserts stdout is empty bytes). Additionally, add a comment in `src/logger.ts` and `src/config.ts` headers: `// RULE: never call process.stdout.write — stdout is reserved for MCP JSON-RPC`. Considered sufficient for a 2-person codebase.

### Pitfall 6: Biome 2.x Uses `files.includes` Not `files.ignore`
**What goes wrong:** Biome 1.x used `"files": { "ignore": [...] }`. Biome 2.x changed this to negated patterns in `files.includes`. Using the old `"ignore"` key silently has no effect.
**Why it happens:** Breaking change in Biome 2.0.
**How to avoid:** Use `"files": { "includes": ["**", "!dist", "!node_modules", "!coverage", "!.planning"] }`. [VERIFIED: biomejs.dev/reference/configuration/]

---

## File Content Specifications

### `package.json` (complete)

```json
{
  "name": "keeping-mcp",
  "version": "0.1.0",
  "description": "MCP server for the Keeping time-tracking API",
  "type": "module",
  "engines": {
    "node": ">=22.0.0"
  },
  "bin": {
    "keeping-mcp": "./dist/bin/keeping-mcp.js"
  },
  "exports": {
    ".": "./dist/bin/keeping-mcp.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "test": "vitest run",
    "dev": "node dist/bin/keeping-mcp.js"
  },
  "keywords": [
    "mcp",
    "keeping",
    "time-tracking",
    "model-context-protocol"
  ],
  "author": "Bart Vanlier <bart@redsquare.nl>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/red-square-software/keeping-mcp.git"
  },
  "homepage": "https://github.com/red-square-software/keeping-mcp",
  "mcpName": "io.github.red-square-software/keeping-mcp",
  "dependencies": {
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.16",
    "@types/node": "^22.15.0",
    "tsup": "^8.5.1",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  }
}
```

**Notes:**
- `"exports"` field: for Phase 1 (no library consumers), points to the bin. Phase 4 may restructure if library exports are needed.
- `"files"` whitelist is set now per D-03 and PITFALLS.md §9. Only `dist/`, `README.md`, `LICENSE` ship. No `.env`, no `test/`, no `.github/`, no `.planning/`.
- `"version": "0.1.0"` — use `0.x.y` until first public release per PITFALLS.md §10.
- `"mcpName"` is required for MCP Registry namespace verification. [CITED: STACK.md §mcpName requirement]

### `tsconfig.json` (complete)

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "resolveJsonModule": false,
    "noEmit": true,
    "outDir": "dist",
    "declaration": false,
    "lib": ["ES2023"]
  },
  "include": ["bin/**/*", "src/**/*", "test/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

**Notes:**
- `"noEmit": true` — tsup handles emit; `tsc --noEmit` is typecheck-only in CI.
- `"verbatimModuleSyntax": true` — enforces `import type` for type-only imports; improves tree-shaking and is a TypeScript 5.x best practice.
- `"isolatedModules": true` — required for tsup/esbuild transpilation (each file is independently transpilable).
- `"target": "ES2023"` — Node 22 supports ES2023 natively. Slightly more conservative than ES2024 for compatibility.
- `"module": "Node16"` and `"moduleResolution": "Node16"` — required for `.js` extension resolution in ESM imports. [CITED: STACK.md §tsconfig, MCP SDK requirement]
- `"resolveJsonModule": false` — not needed in Phase 1 (no JSON imports).
- `"declaration": false` — no type declaration files in Phase 1 (no library consumers).
- `"include"` explicitly includes `test/` so Vitest test files are typechecked.

### `tsup.config.ts` (complete)

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "bin/keeping-mcp": "bin/keeping-mcp.ts",
  },
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  dts: false,
  sourcemap: false,
  shims: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
```

**Notes:**
- `entry` as an object `{ "bin/keeping-mcp": "bin/keeping-mcp.ts" }` produces `dist/bin/keeping-mcp.js` — this matches `package.json` `"bin"` field. [CITED: tsup docs — object entry keys become output paths]
- `banner: { js: "#!/usr/bin/env node" }` injects the shebang as the FIRST line of the output file. This is the canonical approach. [CITED: tsup docs + confirmed via multiple GitHub issues and examples]
- `format: ["esm"]` only — no CJS. The package is `"type": "module"`.
- `dts: false` — no consumers in Phase 1; no declaration files needed.
- `sourcemap: false` — deferred per Claude's Discretion.
- `shims: false` — Node 22 has native `fetch`, `AbortSignal.timeout`, etc. No polyfills needed.
- `clean: true` — `dist/` is wiped before each build, preventing stale file accumulation.

### `biome.json` (complete)

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.16/schema.json",
  "files": {
    "includes": [
      "**",
      "!dist",
      "!node_modules",
      "!coverage",
      "!.planning"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noConsole": {
          "level": "error",
          "options": {
            "allow": ["error"]
          }
        }
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  }
}
```

**Notes:**
- `"$schema"` URL uses `2.4.16` (the verified latest version). [VERIFIED: npm registry]
- `"files.includes"` uses negated patterns (NOT `"ignore"` — that is Biome 1.x syntax). [VERIFIED: biomejs.dev/reference/configuration/]
- `noConsole.options.allow: ["error"]` allows `console.error` and blocks all other console methods (`.log`, `.warn`, `.info`, `.debug`, `.trace`, etc.). [VERIFIED: biomejs.dev/linter/rules/no-console/]
- `"level": "error"` makes violations fail the lint step (not just warn).
- `noConsole` is in the `suspicious` rule group. [VERIFIED: biomejs.dev]
- `process.stdout.write` has NO Biome rule. See Pitfall 5 above.
- `indentStyle: "space", indentWidth: 2` — standard for TypeScript projects; Biome default is tab but space is more common in TS ecosystem.

### `vitest.config.ts` (complete)

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

**Notes:**
- `environment: "node"` is the Vitest default for non-browser projects. Explicit declaration avoids confusion.
- No coverage configuration in Phase 1 (Claude's Discretion).
- No `globals: true` — prefer explicit `import { describe, it, expect, vi } from "vitest"` for clarity.
- Vitest 4.x with `"type": "module"` in `package.json` works natively without additional transformation config. [CITED: vitest.dev/config, STACK.md compatibility table]

### `src/config.ts` (complete)

```typescript
import { z } from "zod";

const ConfigSchema = z.object({
  KEEPING_TOKEN: z
    .string()
    .min(1, "KEEPING_TOKEN must not be empty"),
  KEEPING_REQUIRE_CONFIRM: z.stringbool().default(true),
  KEEPING_ORG_ID: z.string().optional(),
  KEEPING_LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
});

export type KeepingConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): KeepingConfig {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => issue.message)
      .join("; ");
    process.stderr.write(
      `[keeping-mcp] Configuration error: ${messages}\n`,
    );
    process.exit(1);
  }
  return result.data;
}
```

**Error message contract (D-05):** When `KEEPING_TOKEN` is missing or empty, `result.error.issues[0].message` will be `"KEEPING_TOKEN must not be empty"`. Combined with the prefix, the full stderr message becomes:
```
[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty
```
This is the EXACT string the CI smoke test asserts on. The message must not change without updating both the code and the CI assertion.

**`z.stringbool()` availability:** Requires Zod 4 (`zod@^4.4.3`). Importing `z.stringbool` from Zod 3.x main entry point will be `undefined`. If using Zod 3.25+ (the older locked stack version), you would access it via `import { z } from "zod/v4"`. Since we are now using Zod 4 directly, `import { z } from "zod"` is correct.

**`KEEPING_LOG_LEVEL` for Phase 1:** The logger reads this directly from `process.env` or receives it from config. In the entrypoint, pass `config.KEEPING_LOG_LEVEL` to `createLogger()`. The config schema validates it to the enum + default.

### `src/logger.ts` (complete)

```typescript
// RULE: never call process.stdout.write — stdout is reserved for MCP JSON-RPC

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createLogger(token: string, level: LogLevel = "info") {
  const minLevel = LEVEL_ORDER[level];

  function emit(lvl: LogLevel, ...args: unknown[]): void {
    if (LEVEL_ORDER[lvl] < minLevel) return;
    const serialized = args
      .map((arg) =>
        typeof arg === "string" ? arg : JSON.stringify(arg),
      )
      .join(" ");
    const redacted = serialized.replaceAll(token, "***");
    process.stderr.write(
      `[keeping-mcp] [${lvl.toUpperCase()}] ${redacted}\n`,
    );
  }

  return {
    debug: (...args: unknown[]): void => emit("debug", ...args),
    info: (...args: unknown[]): void => emit("info", ...args),
    warn: (...args: unknown[]): void => emit("warn", ...args),
    error: (...args: unknown[]): void => emit("error", ...args),
  };
}
```

**Token redaction safety note:** `replaceAll(token, "***")` operates on the serialized string. If `token` is a substring of a larger string, ALL occurrences are replaced. This is intentional — belt-and-suspenders. If `token` is an empty string (which the Zod schema prevents), `replaceAll("", "***")` would produce corrupted output. The `z.string().min(1)` guard in `config.ts` prevents this case.

**`JSON.stringify` for objects:** When `arg` is an object like `{ headers: { Authorization: 'Bearer kp_test_...' } }`, `JSON.stringify(arg)` produces a string that contains the token value, and `replaceAll` then redacts it. This is the intended behavior for the token-leak test.

### `bin/keeping-mcp.ts` (complete)

```typescript
#!/usr/bin/env node
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";

const config = loadConfig(); // exits with non-zero code on missing/invalid config
const log = createLogger(config.KEEPING_TOKEN, config.KEEPING_LOG_LEVEL);
log.info("config loaded, server boot deferred to Phase 2");
process.exit(0);
```

**Phase 1 contract:**
- On missing/empty `KEEPING_TOKEN`: `loadConfig()` writes to stderr and calls `process.exit(1)`. The entrypoint never reaches the `log.info` line.
- On valid config: logs one info line to stderr, then `process.exit(0)`.
- stdout MUST remain empty throughout (both paths). Verified by CI smoke test.

### `test/logger.test.ts` (complete)

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { createLogger } from "../src/logger.js";

const FAKE_TOKEN = "kp_test_FAKE_token_value";

describe("createLogger — token redaction (D-16)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts the token from object arguments", () => {
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrWrites.push(String(chunk));
      return true;
    });

    const log = createLogger(FAKE_TOKEN, "error");
    log.error({ headers: { Authorization: `Bearer ${FAKE_TOKEN}` } });

    const output = stderrWrites.join("");
    expect(output).not.toContain(FAKE_TOKEN);
    expect(output).toContain("***");
  });

  it("redacts the token from string arguments", () => {
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrWrites.push(String(chunk));
      return true;
    });

    const log = createLogger(FAKE_TOKEN, "error");
    log.error(`Auth: Bearer ${FAKE_TOKEN}`);

    const output = stderrWrites.join("");
    expect(output).not.toContain(FAKE_TOKEN);
    expect(output).toContain("***");
  });

  it("respects log level — debug messages suppressed at info level", () => {
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrWrites.push(String(chunk));
      return true;
    });

    const log = createLogger(FAKE_TOKEN, "info");
    log.debug("this should not appear");

    expect(stderrWrites).toHaveLength(0);
  });
});
```

**Notes:**
- `vi.spyOn(process.stderr, "write")` is the correct Vitest pattern for capturing stderr output. [ASSUMED — standard Vitest spy API, consistent with Vitest docs]
- `afterEach(() => vi.restoreAllMocks())` prevents spy leakage between tests.
- The mock returns `true` to satisfy Node's `process.stderr.write` return type.

### `.github/workflows/ci.yml` (complete)

```yaml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    name: CI (${{ matrix.os }}, Node ${{ matrix.node }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
        node: [22, 24]

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Lint and format check
        run: npx biome check .

      - name: Typecheck
        run: npx tsc --noEmit

      - name: Unit tests
        run: npx vitest run

      - name: Build
        run: npm run build

      - name: Smoke test — missing KEEPING_TOKEN exits non-zero with empty stdout
        shell: bash
        env:
          KEEPING_TOKEN: ""
        run: |
          set +e
          STDOUT=$(node dist/bin/keeping-mcp.js 2>/tmp/smoke_stderr)
          EXIT_CODE=$?
          STDERR=$(cat /tmp/smoke_stderr)
          set -e

          if [ "$EXIT_CODE" -eq 0 ]; then
            echo "FAIL: expected non-zero exit code, got 0"
            exit 1
          fi

          if [ -n "$STDOUT" ]; then
            echo "FAIL: expected empty stdout, got: $STDOUT"
            exit 1
          fi

          EXPECTED="[keeping-mcp] Configuration error: KEEPING_TOKEN must not be empty"
          if ! echo "$STDERR" | grep -qF "$EXPECTED"; then
            echo "FAIL: stderr does not contain expected message"
            echo "Expected: $EXPECTED"
            echo "Actual stderr: $STDERR"
            exit 1
          fi

          echo "Smoke test PASSED: exit_code=$EXIT_CODE, stdout_empty=true, stderr_contains_expected=true"
```

**Notes:**

- `shell: bash` on all OS rows uses Git Bash on `windows-latest`. This is the current best practice for cross-platform bash scripts in GitHub Actions. [CITED: GitHub Actions docs — Git Bash is available on all Windows runners]
- `env: KEEPING_TOKEN: ""` explicitly unsets (sets to empty string). An empty string triggers the `z.string().min(1)` validation error — same behavior as missing env var.
- `/tmp/smoke_stderr` works on both Linux and Git Bash on Windows (Git Bash maps `/tmp` to `C:\Users\<user>\AppData\Local\Temp`). [ASSUMED — confirm on first CI run; fallback is to use a temp file via `mktemp`]
- `set +e` disables `errexit` before the command to prevent immediate exit on non-zero. `set -e` re-enables after capture.
- `grep -qF "$EXPECTED"` uses fixed-string search (`-F` flag). The `[` characters in the message are treated as literals, not regex. Important — without `-F`, the `[` would be interpreted as a character class.
- `concurrency.cancel-in-progress: true` cancels duplicate runs on branch push, saving CI minutes. [CITED: GitHub Actions docs on concurrency]
- `actions/setup-node@v4` — v4 is the widely-deployed stable version; v6 exists but was released in late 2024/early 2025. Using v4 is the safer choice with broadest documentation coverage. [ASSUMED — v4 is confirmed working; v6 was released but may have breaking changes for some configurations]
- `fail-fast: false` — all four matrix jobs run even if one fails, providing full regression coverage.

**Smoke test edge case — Windows tmp directory:** Git Bash on `windows-latest` supports `/tmp`. However, if this causes issues, replace `/tmp/smoke_stderr` with `$RUNNER_TEMP/smoke_stderr` which is a portable GitHub Actions variable that maps to an OS-appropriate temp directory on both Linux and Windows.

### `LICENSE` (complete)

```
MIT License

Copyright (c) 2026 Bart Vanlier / RedSquare

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### `README.md` placeholder (complete)

```markdown
# keeping-mcp

Open-source MCP server for the [Keeping](https://keeping.nl) time-tracking API.

![CI](https://github.com/red-square-software/keeping-mcp/actions/workflows/ci.yml/badge.svg)

**Status:** work in progress — see [.planning/ROADMAP.md](.planning/ROADMAP.md) for current phase.
```

**CI badge URL format:** `https://github.com/{owner}/{repo}/actions/workflows/{workflow-file}/badge.svg` — confirmed standard GitHub Actions badge URL format.

### `.gitignore` additions

```
node_modules/
dist/
coverage/
.env
.env.*
*.log
*.tsbuildinfo
.idea/
```

Notes:
- `*.tsbuildinfo` — TypeScript incremental build cache; should not be committed.
- `.idea/` — already untracked per git status but worth gitignoring explicitly.

### `.gitattributes` (new file)

```
* text=auto eol=lf
*.sh text eol=lf
*.ts text eol=lf
*.js text eol=lf
*.json text eol=lf
*.yml text eol=lf
```

**Purpose:** Forces LF line endings across all OS environments, preventing the Windows-shebang CRLF pitfall. The `* text=auto eol=lf` rule normalizes all text files to LF on commit and checkout. [ASSUMED — standard cross-platform Git configuration]

---

## GitHub Repo Wiring

### Step 1: Add remote and push

```bash
git remote add origin git@github.com:red-square-software/keeping-mcp.git
git push -u origin main
```

Or HTTPS if SSH key not configured:
```bash
git remote add origin https://github.com/red-square-software/keeping-mcp.git
git push -u origin main
```

### Step 2: Edit repo metadata via `gh`

```bash
gh repo edit red-square-software/keeping-mcp \
  --description "Open-source MCP server for the Keeping time-tracking API (api.keeping.nl)" \
  --homepage "https://github.com/red-square-software/keeping-mcp"
```

**Verified flags:** `-d`/`--description` and `--homepage` are confirmed `gh repo edit` flags. [CITED: cli.github.com/manual/gh_repo_edit]

### Step 3: Branch protection AFTER first green CI run

Wait for at least one successful CI run on `main` before setting branch protection. Required status checks reference job names from the workflow. The job name is `CI (${{ matrix.os }}, Node ${{ matrix.node }})` — but GitHub status checks use the full matrix-expanded names. The simplest approach: use the workflow name `CI` as the check name, or wait and copy the exact check name from the first CI run's status.

**Recommended: use `gh api` with JSON body:**

```bash
gh api \
  --method PUT \
  repos/red-square-software/keeping-mcp/branches/main/protection \
  --header "Accept: application/vnd.github+json" \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": false,
    "contexts": [
      "CI (ubuntu-latest, Node 22)",
      "CI (ubuntu-latest, Node 24)",
      "CI (windows-latest, Node 22)",
      "CI (windows-latest, Node 24)"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": true
}
EOF
```

**Notes:**
- `"contexts"` array must match the EXACT job names as they appear in GitHub's status checks UI after the first CI run. The names above are derived from the matrix interpolation `CI (${{ matrix.os }}, Node ${{ matrix.node }})`. Verify against the actual first run.
- `"enforce_admins": false` — allows the sole admin (Bart) to push hotfixes directly if needed (per D-20 "No required reviewers").
- `"required_linear_history": true` — enforces squash/rebase merge, preventing merge commits on `main`.
- `"required_pull_request_reviews": null` — no PR review requirement (solo dev).
- `"restrictions": null` — no push restrictions (protection comes from status checks + linear history).
- [CITED: docs.github.com/en/rest/branches/branch-protection]

---

## Dependency-Ordered File Creation List

This is the minimal dependency graph for the executor. Files listed before their dependents must exist before the dependent is created or executed.

**Wave 1 — Config files (no npm, no code)**
1. `.gitattributes` (no deps)
2. `.gitignore` (no deps)
3. `package.json` (no deps)
4. `tsconfig.json` (no deps)
5. `tsup.config.ts` (no deps — but requires tsup installed)
6. `biome.json` (no deps)
7. `vitest.config.ts` (no deps — but requires vitest installed)
8. `LICENSE` (no deps)
9. `README.md` (no deps)

**Wave 2 — Install**
10. `npm install` (requires `package.json`)

**Wave 3 — Source files**
11. `src/config.ts` (requires `zod` installed, no other source deps)
12. `src/logger.ts` (no source deps, no npm deps)
13. `bin/keeping-mcp.ts` (depends on: `src/config.ts`, `src/logger.ts`)

**Wave 4 — Tests**
14. `test/logger.test.ts` (depends on: `src/logger.ts`, vitest installed)

**Wave 5 — CI**
15. `.github/workflows/ci.yml` (no local deps; references dist/ which requires build)

**Wave 6 — Build and verify locally**
16. `npm run build` (requires: `tsup.config.ts`, `bin/keeping-mcp.ts`, `src/config.ts`, `src/logger.ts`)
17. Local smoke test: `node dist/bin/keeping-mcp.js` → verify exit 1 + stderr + empty stdout
18. `npx biome check .` → verify lint passes
19. `npx tsc --noEmit` → verify typecheck passes
20. `npx vitest run` → verify tests pass

**Wave 7 — Commit and push**
21. `git add .` + first commit (all Phase 1 files)
22. `git remote add origin ...`
23. `git push -u origin main`
24. Wait for CI to go green

**Wave 8 — Repo wiring**
25. `gh repo edit ...` (description + homepage)
26. Branch protection API call (AFTER step 24 CI green)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | `vitest.config.ts` (to be created in Wave 1) |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` (same in Phase 1 — no test splitting needed) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-03 / SAFE-01 | Token never in stderr output | unit | `npx vitest run test/logger.test.ts` | Wave 4 |
| SAFE-01 | stdout empty when binary runs | smoke | CI step assertion | Wave 5 (CI) |
| AUTH-02 | Missing token exits non-zero with correct message | smoke | CI step assertion | Wave 5 (CI) |
| AUTH-01 | Token read from env var | integration (manual) | Run binary with real token | Not automated in Phase 1 |

### Wave 0 Gaps

- `test/logger.test.ts` — covers AUTH-03 token redaction contract
- `vitest.config.ts` — required before any test runs
- No additional test infrastructure needed for Phase 1

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime, CI | Yes (local) | v22.19.0 | — |
| npm | Package management | Yes (local) | 10.9.3 | — |
| git | Version control | Yes (assumed) | — | — |
| gh CLI | Branch protection, repo edit | Yes (assumed) | — | Manual via GitHub web UI |

**Missing dependencies with no fallback:** None identified for Phase 1 file creation and local validation.

**Missing dependencies with fallback:**
- `gh` CLI — if not installed, repo description and branch protection can be configured manually in GitHub web UI. The gh commands are provided for automation but are not strictly required for Phase 1 completion.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (token validation) | Zod `.string().min(1)` in config schema; no token in any output |
| V3 Session Management | No | Not applicable — no sessions in Phase 1 |
| V4 Access Control | No | Not applicable in Phase 1 |
| V5 Input Validation | Yes (env vars) | Zod schema with strict typing |
| V6 Cryptography | No | Token redaction via string replace — not cryptographic |

### Known Threat Patterns for Phase 1

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token in stdout via `console.log` | Information disclosure | biome `noConsole` rule + CI smoke test |
| Token in log output (e.g., full error object dump) | Information disclosure | Logger factory captures token at construction; `replaceAll` at emit |
| Env var typo silently accepting wrong boolean value | Tampering | `z.stringbool()` throws on unrecognized values; `z.enum()` for log level |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `z.coerce.boolean()` for env booleans | `z.stringbool()` (Zod 4) | Zod 4.x GA | Correctly parses `"false"` as `false` |
| `"files": { "ignore": [...] }` in biome.json | `"files": { "includes": ["**", "!dist"] }` | Biome 2.0 (June 2025) | Old syntax silently ignored in Biome 2.x |
| `actions/setup-node@v3` | `actions/setup-node@v4` | 2023 | v3 uses deprecated Node.js 16 runtime |
| `@types/node` latest | `@types/node@^22.x` | Ongoing | Pin to match `engines.node` to avoid type mismatches |

**Deprecated/outdated:**
- `"files": { "ignore": [...] }` in biome.json: Biome 1.x syntax — does not work in Biome 2.x.
- `z.coerce.boolean()` for boolean env vars: silently wrong for `"false"` input.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `z.stringbool()` is available in `zod@^4.4.3` via `import { z } from "zod"` | `src/config.ts` pattern | If not available, must use manual `.transform()` for boolean parsing — medium rework |
| A2 | `/tmp/smoke_stderr` is writable in Git Bash on `windows-latest` GitHub Actions runner | CI workflow smoke test | Smoke test fails on Windows; use `$RUNNER_TEMP/smoke_stderr` as fallback |
| A3 | `actions/setup-node@v4` caches npm with `cache: "npm"` using the `package-lock.json` hash | CI workflow | If v4 cache behavior changed, builds are slower but not broken |
| A4 | All six npm packages (`zod`, `typescript`, `tsup`, `vitest`, `@biomejs/biome`, `@types/node`) passed `npm view <pkg> version` — treated as legitimate | Package Legitimacy Audit | Low risk — all are well-established packages with millions of weekly downloads |
| A5 | `String.prototype.replaceAll` is available in Node 22 without polyfill | `src/logger.ts` token redaction | If not available, use `.split(token).join("***")` instead — trivial fix |
| A6 | `tsup` entry object `{ "bin/keeping-mcp": "bin/keeping-mcp.ts" }` produces `dist/bin/keeping-mcp.js` | `tsup.config.ts` | If output path differs, `package.json` `"bin"` field will not match and `npx` will fail |
| A7 | The GitHub status check names for branch protection match the matrix-interpolated job names exactly | Branch protection API call | Wrong check names mean protection is set but checks are never required — effectively no protection |
| A8 | `@types/node@^22.15.0` is the latest 22.x minor | `package.json` devDependencies | If newer 22.x patch exists, the version listed may be stale — run `npm view @types/node versions` to confirm |

---

## Open Questions (RESOLVED)

1. **`@types/node` version to pin** — **RESOLVED**
   - Pin `^22.15.0` as a known-good 22.x minor floor. Wave 1 task may bump to the current 22.x latest with `npm view @types/node versions` if available, but `^22.15.0` is the documented contract.

2. **Smoke test Windows `/tmp` behavior** — **RESOLVED**
   - Use `/tmp/smoke_stderr` as the primary path; Git Bash on `windows-latest` maps `/tmp` to the runner's temp directory. If a first CI run surfaces a write failure, switch to `$RUNNER_TEMP/smoke_stderr` (both variants are documented in the CI spec above, treat the second as a documented fallback).

3. **Exact status check names for branch protection** — **RESOLVED**
   - Phase 1 path: after the first green CI run on `main`, query `gh api repos/red-square-software/keeping-mcp/commits/main/check-runs --jq '.check_runs[].name'` to copy the exact check names, then PUT the branch protection payload referencing those names. This is the documented Plan 01-03 Task 4 path.

---

## Sources

### Primary (HIGH confidence)
- `biomejs.dev/linter/rules/no-console/` — noConsole rule options.allow syntax [VERIFIED via WebFetch]
- `biomejs.dev/reference/configuration/` — Biome 2.x files.includes negated pattern syntax [VERIFIED via WebFetch]
- `zod.dev/api?id=booleans` — z.stringbool() semantics and availability [VERIFIED via WebFetch]
- `docs.github.com/en/rest/branches/branch-protection` — branch protection JSON payload shape [VERIFIED via WebFetch]
- `cli.github.com/manual/gh_repo_edit` — `--description` and `--homepage` flags [CITED: WebSearch result]
- `npm view <pkg> version` for all 6 packages — confirmed current versions [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- tsup banner shebang injection via `banner: { js: "#!/usr/bin/env node" }` — confirmed across multiple blog posts and GitHub issues (issue #719) [CITED: multiple sources]
- GitHub Actions concurrency `cancel-in-progress: true` — confirmed from official docs and multiple 2025/2026 examples [CITED: docs.github.com]
- `actions/setup-node@v4` `cache: "npm"` — confirmed from official action docs [CITED: github.com/actions/setup-node]

### Tertiary (LOW confidence / ASSUMED)
- `.gitattributes` `* text=auto eol=lf` as CRLF prevention — standard practice, not verified against GitHub Actions runner behavior
- `/tmp` mapping in Git Bash on `windows-latest` — common knowledge, not verified against current runner image

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm registry
- File content specifications: HIGH — based on verified docs + locked CONTEXT.md decisions
- CI workflow: MEDIUM-HIGH — structure verified; Windows bash `/tmp` behavior is ASSUMED
- Branch protection: MEDIUM — payload structure verified against GitHub REST API docs; exact check names require first CI run
- Package legitimacy: ASSUMED — slopcheck unavailable; packages are industry-standard

**Research date:** 2026-06-09
**Valid until:** 2026-09-09 (90 days — stable tools; biome.json schema URL should be updated if biome releases beyond 2.4.16)
