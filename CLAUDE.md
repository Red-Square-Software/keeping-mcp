<!-- GSD:project-start source:PROJECT.md -->
## Project

**keeping-mcp**

Open-source Model Context Protocol (MCP) server that exposes the Keeping (api.keeping.nl) time-tracking API as tools an AI coding assistant can call. Built for solo developers who use Claude Code (or any MCP-capable client) and want their billable hours logged into Keeping at the end of a session instead of typed in by hand, while keeping Keeping's existing native Jortt invoicing integration intact.

**Core Value:** A Claude Code (or any MCP client) user can log a reviewed time entry into their Keeping account through a single tool call, with explicit confirmation before anything is written.

### Constraints

- **Tech stack**: TypeScript on Node.js, official `@modelcontextprotocol/sdk`, Zod for tool input schemas. — User's first MCP server; matches the dominant ecosystem and registry tooling.
- **License**: MIT. — Standard for MCP servers; permissive enough for downstream packaging.
- **Hosting / namespace**: GitHub repo under the `redsquare-nl` org; npm package name aligns with `io.github.redsquare-nl/keeping-mcp` registry namespace. — Required by the MCP registry's GitHub-verified namespace model.
- **Security**: Personal access token must never appear in logs, tool output, or commits. Read only from env var. — Billable-hours data and a write-capable API token; leak is high-impact.
- **API**: Must respect Keeping's 120 req/min rate limit, and must scope writes to the authenticated user (only admins can write other users' entries; v1 deliberately does not target that path).
- **Platform**: User runs Claude Code on Windows 11. Server must work on Windows + macOS + Linux (Node.js + npx covers this, but path/env handling needs to stay portable).
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@modelcontextprotocol/sdk` | `^1.29.0` | MCP protocol implementation (server primitives, stdio transport, tool registration) | Latest stable v1.x; v2.0 is pre-alpha (API unstable, stable v2 estimated Q3 2026). v1.29.0 is the most recent production-ready release. |
| TypeScript | `^5.8.0` | Type-safe source language | SDK docs require `"module": "Node16"` + `"moduleResolution": "Node16"` or `"Bundler"` — TS 5.x enforces these correctly. |
| Node.js | `>=22.0.0` | Runtime | Node 20 reached EOL 2026-04-30; Node 22 is current Active LTS (supported until 2027-04-30). Stable native `fetch`. 30 % faster startup than Node 20. Target `>=22` in `engines` field. |
| Zod | `^3.25.0` | Tool input schema validation | SDK 1.x internally imports from `zod/v4` but maintains backwards compatibility for Zod `>=3.25`. Zod v3.25+ is the safe floor — resolves the `w._parse is not a function` breakage seen in earlier SDK versions. Use `import * as z from "zod"` (v3 entry point). If you want v4 features, use `import * as z from "zod/v4"` — both work with SDK 1.29+. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Native `fetch` (Node.js built-in) | N/A (Node 22) | HTTP client for Keeping REST API | Zero dependency, sufficient for straightforward request/response. Use for all Keeping API calls. |
| `p-retry` | `^6.2.1` | Exponential-backoff retry with respect for `Retry-After` header | Wrap every Keeping API call; handles transient 5xx and rate-limit 429 responses cleanly without reimplementing backoff math. Small (no sub-dependencies). |
| `p-throttle` | `^5.0.0` | Client-side rate limiting to stay within Keeping's 120 req/min cap | Apply as a queue wrapper around the API client module. Prevents the server from even sending requests that would be rate-limited. |
| `@modelcontextprotocol/inspector` | latest (devDep) | Interactive test UI for the running server | Use during development to manually invoke tools and inspect JSON-RPC traffic without a full Claude Code session. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| `tsup` | Bundle TypeScript to ESM, produce `dist/`, generate `bin/` entry for `npx` | See build section below. Handles `"type": "module"`, shebang injection, and declaration file generation in one config. Much simpler than raw `tsc` for producing a distributable CLI. |
| `vitest` | Unit + integration tests | ESM-native, TypeScript-native. Use `InMemoryTransport` from the SDK for in-process tests — faster and more reliable than spawning a child process. |
| `biome` | Lint + format in one binary | Single config file, zero plugin dependency chain, ~20× faster than eslint+prettier on this codebase size. TypeScript support is production-grade as of Biome 2.0 (June 2025). No complex plugin setup needed for a focused server project. |
## Installation
# Runtime dependencies
# Dev dependencies
## Key Configuration Details
### McpServer API (SDK 1.x — current stable)
### tsup configuration
### tsconfig.json
## Logging (stdio transport — CRITICAL)
- Use `console.error(...)` for all diagnostic output — it writes to stderr, which the host application captures automatically.
- Never use `console.log(...)`, `process.stdout.write(...)`, or any logger that defaults to stdout.
- For structured log forwarding to the client, use `server.sendLoggingMessage({ level: "info", data: "..." })` — this sends an MCP `notifications/message` over the protocol channel, not stderr.
## MCP Registry Publishing — `server.json`
## GitHub Actions Release Pipeline
### npm (Trusted Publishing / OIDC — no long-lived token)
- uses: actions/setup-node@v5
- run: npm publish --access public
### MCP Registry (OIDC — no secret)
- name: Install mcp-publisher
- name: Authenticate to MCP Registry
- name: Publish to MCP Registry
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@modelcontextprotocol/sdk ^1.29.0` | `v2.0.0-alpha.*` | Only if you specifically need Standard Schema support (Valibot/ArkType) and are comfortable with a pre-alpha API that will have breaking changes before GA. Not for v1 production work. |
| Zod `^3.25.0` | Zod `^4.0.0` | Safe to use Zod v4 directly from `"zod/v4"` import once you verify no other dependency in your tree locks Zod to v3 below 3.25. SDK 1.29+ supports both. |
| Native `fetch` + `p-retry` + `p-throttle` | `axios` + `axios-retry` | Axios is fine if you want a higher-level API with interceptors. Adds ~60 KB to the bundle. For a simple token-authenticated REST client with ~8 endpoints, native fetch + lightweight utilities is leaner. |
| Native `fetch` | `ofetch` | `ofetch` is ergonomic and has built-in retry, but adds a dependency and its retry logic is not rate-limit-header-aware. `p-retry` gives you `Retry-After` header handling explicitly. |
| `tsup` | `tsc` only | If you do not need a shebang-injected bin entry and are comfortable with the `tsc` output structure. Raw `tsc` is simpler but requires manual `chmod +x` handling and cannot inline the shebang cleanly. |
| `biome` | `eslint` + `prettier` | Use eslint if you need plugins not yet in Biome (e.g., complex import-order rules, tailwind). For a focused server project with no framework-specific lint rules, Biome covers everything needed. |
| `vitest` | `node:test` | `node:test` is zero-dependency and built in, but its TypeScript integration requires extra setup and it does not support ESM test imports as cleanly. For a project already using tsup/ESM, vitest is less friction. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `console.log` anywhere in server code | Writes to stdout, corrupts MCP protocol framing, causes client parse errors | `console.error` / `process.stderr.write` |
| `@modelcontextprotocol/sdk` v2.0-alpha | Pre-alpha, breaking changes expected, API not finalised. Stable v2 estimated Q3 2026 | `^1.29.0` |
| Node.js `<22` as engine target | Node 20 reached EOL 2026-04-30; new greenfield projects should not target an EOL runtime | `>=22` in `engines` |
| Zod `<3.25` with SDK 1.17+ | Causes `w._parse is not a function` runtime errors in tool handlers | `^3.25.0` or `^4.0.0` |
| Storing `KEEPING_TOKEN` in code, logs, or tool output | Bearer token for a write-capable API; leak is high-impact | Read only from `process.env.KEEPING_TOKEN`, scrub from all log output |
| Long-lived npm tokens in GitHub Actions secrets for publish | Secrets can leak in forks/PRs; OIDC is more secure and generally available | npm trusted publishing (OIDC), `id-token: write` permission |
| `winston` or `pino` for logging | These default to stdout or require non-trivial configuration to route to stderr only | Simple stderr wrapper (see logging section above) |
## Version Compatibility
| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@modelcontextprotocol/sdk ^1.29.0` | Zod `^3.25.0` or `^4.0.0` | SDK 1.29 supports both via backwards-compat shim. Use consistent import paths. |
| `@modelcontextprotocol/sdk ^1.29.0` | Node.js `>=20` | SDK package.json declares `engines: >=20`. Targeting `>=22` is safe and recommended. |
| `tsup ^8.x` | Node.js `>=18` | No compatibility issues with Node 22 or TypeScript 5.x. |
| `vitest ^3.x` | Node.js `>=18`, ESM | Works with `"type": "module"` and `"module": "Node16"` tsconfig. |
| `biome ^2.x` | Any Node.js (binary) | Biome is a Rust binary; Node version irrelevant. |
## Sources
- `github.com/modelcontextprotocol/typescript-sdk` — SDK API shape (`McpServer`, `registerTool`, `StdioServerTransport`), version confirmed as `1.29.0` stable, v2.0-alpha status
- `ts.sdk.modelcontextprotocol.io` (Context7 `/websites/ts_sdk_modelcontextprotocol_io_v2`) — `registerTool` signature, Zod v4 import path in current docs
- `modelcontextprotocol.io/docs/tools/debugging` — Official guidance: logs to stderr only for stdio transport; stdout is reserved for protocol
- `modelcontextprotocol.io/registry/github-actions` — Complete OIDC workflow for MCP registry publish; `mcp-publisher` downloaded from GitHub releases
- `static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json` — `server.json` required fields: `name`, `description`, `version`; `packages[].registryType`, `identifier`, `transport`
- `modelcontextprotocol.info/tools/registry/publishing/` — `mcpName` field requirement in `package.json` for npm namespace ownership proof
- `github.com/modelcontextprotocol/typescript-sdk/issues/925` — Zod v4 compat issue (closed); resolved in SDK 1.x with backward-compat shim for `>=3.25`
- `docs.npmjs.com/trusted-publishers/` — npm OIDC trusted publishing GA (2025-07-31); `id-token: write`, no `NODE_AUTH_TOKEN` needed
- `nodejs.org/en/about/previous-releases` — Node 20 EOL 2026-04-30; Node 22 Active LTS until 2027-04-30
- `github.com/modelcontextprotocol/registry` — Registry in preview; API freeze v0.1 declared 2025-10-24
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
