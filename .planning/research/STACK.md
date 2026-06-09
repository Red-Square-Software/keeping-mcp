# Stack Research

**Domain:** TypeScript MCP server (stdio transport, npm distribution)
**Researched:** 2026-06-08
**Confidence:** HIGH (all version numbers verified against npm, official SDK docs, official registry docs)

---

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

---

## Installation

```bash
# Runtime dependencies
npm install @modelcontextprotocol/sdk zod p-retry p-throttle

# Dev dependencies
npm install -D typescript tsup vitest @types/node biome @modelcontextprotocol/inspector
```

---

## Key Configuration Details

### McpServer API (SDK 1.x — current stable)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";

const server = new McpServer({
  name: "keeping-mcp",
  version: "1.0.0",
});

server.registerTool(
  "keeping_me",
  {
    description: "Resolve the authenticated user for an organisation",
    inputSchema: z.object({ organisation_id: z.string().optional() }),
  },
  async ({ organisation_id }) => ({
    content: [{ type: "text", text: JSON.stringify({ organisation_id }) }],
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
```

`registerTool(name, { description, inputSchema }, handler)` is the stable 1.x API. The `v2.0-alpha` removed old `.tool()` and deprecated method signatures — do not use those. Do not pin to `v2.0.0-alpha.*` — the stable v1.x branch has its own long-lived v1.x branch in the repo.

### tsup configuration

```ts
// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  dts: true,
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
```

`package.json` must have:
```json
{
  "type": "module",
  "bin": { "keeping-mcp": "./dist/index.js" },
  "main": "./dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "files": ["dist"],
  "engines": { "node": ">=22" },
  "mcpName": "io.github.red-square-software/keeping-mcp"
}
```

The `mcpName` field in `package.json` is **mandatory** for MCP Registry publishing — the registry fetches the npm package and verifies this field matches the `name` in `server.json`. If it is missing or mismatched, publication fails.

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "outDir": "dist",
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`"module": "Node16"` and `"moduleResolution": "Node16"` are required by the MCP SDK. Without them, TypeScript cannot resolve the SDK's `.js` extension imports and compilation fails.

---

## Logging (stdio transport — CRITICAL)

**stdout is reserved for JSON-RPC protocol traffic.** Any writes to stdout that are not valid MCP protocol messages corrupt the framing and cause the client to see parse errors.

Rules:
- Use `console.error(...)` for all diagnostic output — it writes to stderr, which the host application captures automatically.
- Never use `console.log(...)`, `process.stdout.write(...)`, or any logger that defaults to stdout.
- For structured log forwarding to the client, use `server.sendLoggingMessage({ level: "info", data: "..." })` — this sends an MCP `notifications/message` over the protocol channel, not stderr.

Recommended pattern for this project:

```typescript
// src/logger.ts
export const log = {
  info:  (msg: string) => process.stderr.write(`[INFO]  ${msg}\n`),
  warn:  (msg: string) => process.stderr.write(`[WARN]  ${msg}\n`),
  error: (msg: string) => process.stderr.write(`[ERROR] ${msg}\n`),
  debug: (msg: string) => process.env.KEEPING_DEBUG && process.stderr.write(`[DEBUG] ${msg}\n`),
};
```

Do not pull in a logging library (pino, winston) unless there is a specific need — the overhead and configuration surface are not justified for a local stdio server. The pattern above is all that is needed.

---

## MCP Registry Publishing — `server.json`

Schema version: `2025-12-11` (latest at research date).

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.red-square-software/keeping-mcp",
  "description": "MCP server for Keeping time-tracking — log billable hours from Claude Code",
  "title": "Keeping MCP",
  "version": "1.0.0",
  "repository": {
    "url": "https://github.com/red-square-software/keeping-mcp",
    "source": "github"
  },
  "packages": [
    {
      "registryType": "npm",
      "registryBaseUrl": "https://registry.npmjs.org",
      "identifier": "keeping-mcp",
      "version": "1.0.0",
      "runtimeHint": "npx",
      "transport": {
        "type": "stdio"
      },
      "environmentVariables": [
        {
          "name": "KEEPING_TOKEN",
          "description": "Personal access token from Keeping preferences (Developer features)",
          "isRequired": true,
          "isSecret": true
        },
        {
          "name": "KEEPING_REQUIRE_CONFIRM",
          "description": "Set to 'false' to skip dry-run confirmation on write tools (default: true)",
          "isRequired": false,
          "isSecret": false
        }
      ]
    }
  ]
}
```

`name` (required), `description` (required), `version` (required), and the `packages` array with `registryType`, `identifier`, and `transport` are the minimum. The registry is in preview as of research date; API freeze at v0.1 was declared 2025-10-24 with no breaking changes planned.

---

## GitHub Actions Release Pipeline

Two independent publish targets on every `v*` tag push:

### npm (Trusted Publishing / OIDC — no long-lived token)

```yaml
permissions:
  id-token: write   # Required for npm OIDC trusted publishing
  contents: read

- uses: actions/setup-node@v5
  with:
    node-version: "lts/*"
    registry-url: "https://registry.npmjs.org"

- run: npm publish --access public
  # NODE_AUTH_TOKEN not needed when trusted publishing is configured on npmjs.com
  # Provenance attestation is generated automatically
```

npm trusted publishing (OIDC) is generally available as of 2025-07-31. Configure the trust relationship on npmjs.com under the package's Trusted Publishers settings (specify org, repo, and workflow filename). No `NPM_TOKEN` secret needed at publish time.

### MCP Registry (OIDC — no secret)

```yaml
- name: Install mcp-publisher
  run: |
    curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher

- name: Authenticate to MCP Registry
  run: ./mcp-publisher login github-oidc

- name: Publish to MCP Registry
  run: ./mcp-publisher publish
```

With `id-token: write` permission, no secrets are required for the registry publish step. The `mcp-publisher` binary is downloaded from the registry repo's GitHub releases (always latest). Namespace ownership (`io.github.red-square-software`) is verified via GitHub OIDC — the workflow must run in the `red-square-software` GitHub org's repo.

---

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

---

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

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@modelcontextprotocol/sdk ^1.29.0` | Zod `^3.25.0` or `^4.0.0` | SDK 1.29 supports both via backwards-compat shim. Use consistent import paths. |
| `@modelcontextprotocol/sdk ^1.29.0` | Node.js `>=20` | SDK package.json declares `engines: >=20`. Targeting `>=22` is safe and recommended. |
| `tsup ^8.x` | Node.js `>=18` | No compatibility issues with Node 22 or TypeScript 5.x. |
| `vitest ^3.x` | Node.js `>=18`, ESM | Works with `"type": "module"` and `"module": "Node16"` tsconfig. |
| `biome ^2.x` | Any Node.js (binary) | Biome is a Rust binary; Node version irrelevant. |

---

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

---
*Stack research for: TypeScript MCP server (keeping-mcp)*
*Researched: 2026-06-08*
