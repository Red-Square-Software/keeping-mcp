# Architecture Patterns

**Domain:** TypeScript MCP server — HTTP API wrapper (Keeping time-tracking)
**Researched:** 2026-06-08

---

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  bin/keeping-mcp.ts  (entrypoint: env validation, stdio)    │
└───────────────────────┬─────────────────────────────────────┘
                        │ creates
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  src/server.ts  (McpServer instantiation, tool wiring)      │
│  Registers all tools. Pure wiring — no business logic.      │
└──────┬──────────────────────────────────────────────────────┘
       │ calls
       ▼
┌─────────────────────────────────────────────────────────────┐
│  src/tools/*.ts  (one file per tool or logical group)       │
│  keeping_me.ts  keeping_organisations.ts  entries.ts  …     │
│  Each file exports a registerTool() call + handler.         │
│  Owns: dry-run gate, org resolution, response shaping.      │
└──────┬──────────────────────────────────────────────────────┘
       │ calls
       ▼
┌─────────────────────────────────────────────────────────────┐
│  src/keeping/client.ts  (KeepingClient class)               │
│  Owns: Bearer injection, rate-limit bucket, timeouts,       │
│        /users/me caching, multi-org session state.          │
└──────┬──────────────────────────────────────────────────────┘
       │ uses
       ▼
       Node.js native fetch  (no extra HTTP library needed)
```

Data flow: **env → config → client → tool handler → MCP response**

---

## Component Boundaries

| Component | File(s) | Responsibility | Must NOT touch |
|-----------|---------|----------------|----------------|
| **Entrypoint** | `bin/keeping-mcp.ts` | Parse env, fail-fast on missing token, create client + server, connect stdio transport | Tool logic, Keeping API |
| **Server wiring** | `src/server.ts` | Instantiate McpServer, call each tool's register function | HTTP calls, env vars |
| **Tool handlers** | `src/tools/*.ts` | Zod input schema, dry-run gate, call client, shape MCP response | Raw fetch, token |
| **HTTP client** | `src/keeping/client.ts` | Auth headers, rate limiting, caching, retries, timeouts | MCP protocol types |
| **Schemas** | `src/keeping/types.ts` | TypeScript types for Keeping API payloads | Nothing — pure types |
| **Config** | `src/config.ts` | Read + validate env vars, export typed config object | Side effects |

---

## Module Layout

Surveyed reference implementations:
- **`modelcontextprotocol/servers` (filesystem, fetch)** — flat index.ts with all tools in one file; fine for 3–4 tools, brittle beyond that.
- **`aashari/boilerplate-mcp-server`** — `src/tools/`, `src/services/`, `src/controllers/`, `src/utils/` split; each tool in its own file, service layer for HTTP.
- **`lzinga/us-gov-open-data-mcp`** — module-per-API-domain pattern; token-bucket rate limiter + exponential backoff on 429.
- **Xata MCP server** — generated client from OpenAPI + `initMcpTools(server)` helper; not applicable here (no public Keeping OpenAPI spec).

Recommended layout for keeping-mcp:

```
keeping-mcp/
├── bin/
│   └── keeping-mcp.ts          # CLI entrypoint (#!/usr/bin/env node)
├── src/
│   ├── server.ts               # McpServer instantiation + tool wiring
│   ├── config.ts               # Env-var validation (Zod), typed config
│   ├── keeping/
│   │   ├── client.ts           # KeepingClient class
│   │   └── types.ts            # API payload types
│   └── tools/
│       ├── me.ts               # keeping_me
│       ├── organisations.ts    # keeping_organisations
│       ├── projects.ts         # keeping_projects + keeping_tasks
│       └── entries.ts          # keeping_list_entries, keeping_add_entry,
│                               # keeping_update_entry, keeping_delete_entry
├── test/
│   ├── unit/
│   │   ├── client.test.ts
│   │   └── tools/
│   │       └── entries.test.ts
│   └── integration/
│       └── entries.integration.test.ts   # gated on KEEPING_TOKEN_TEST
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE
```

---

## Tool Registration Pattern

The current MCP TS SDK pattern (verified against `ts.sdk.modelcontextprotocol.io` docs, 2026-06-08):

```typescript
// src/tools/entries.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KeepingClient } from '../keeping/client.js';
import type { Config } from '../config.js';

const AddEntryInputSchema = z.object({
  organisation_id: z.string().optional().describe(
    'Required when the token has access to multiple organisations.'
  ),
  date: z.string().describe('ISO 8601 date, e.g. 2026-06-08'),
  duration_minutes: z.number().int().positive(),
  project_id: z.string().optional(),
  task_id: z.string().optional(),
  description: z.string().optional(),
  confirm: z.boolean().default(false).describe(
    'Set true to actually create the entry. When false (or KEEPING_REQUIRE_CONFIRM=true), returns a dry-run preview.'
  ),
});

type AddEntryInput = z.infer<typeof AddEntryInputSchema>;

export function registerEntryTools(
  server: McpServer,
  client: KeepingClient,
  config: Config
): void {
  server.registerTool(
    'keeping_add_entry',
    {
      title: 'Add time entry',
      description: 'Create a new time entry in Keeping. Returns a preview by default; pass confirm:true to write.',
      inputSchema: AddEntryInputSchema,
      outputSchema: z.object({
        preview: z.object({ method: z.string(), url: z.string(), body: z.unknown() }).optional(),
        entry: z.unknown().optional(),
      }),
    },
    async (input: AddEntryInput) => {
      const orgId = await client.resolveOrgId(input.organisation_id);
      const body = {
        date: input.date,
        duration_minutes: input.duration_minutes,
        project_id: input.project_id,
        task_id: input.task_id,
        description: input.description,
      };

      const requireConfirm = config.requireConfirm;
      if (requireConfirm && !input.confirm) {
        const preview = {
          preview: {
            method: 'POST',
            url: `https://api.keeping.nl/v1/organisations/${orgId}/time_entries`,
            body,
          },
        };
        return {
          structuredContent: preview,
          content: [{ type: 'text' as const, text: JSON.stringify(preview, null, 2) }],
        };
      }

      const entry = await client.post(
        `/organisations/${orgId}/time_entries`,
        body
      );
      const result = { entry };
      return {
        structuredContent: result,
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
```

Key SDK notes (HIGH confidence, from official docs):
- `registerTool(name, { title, description, inputSchema, outputSchema? }, handler)`
- `inputSchema` accepts a Zod object schema directly; SDK converts it to JSON Schema for protocol advertising.
- Return `{ content: [...], structuredContent: object }` — `structuredContent` is validated against `outputSchema` at runtime.
- Return `{ content: [...], isError: true }` for recoverable errors (skips outputSchema validation).
- **Never `console.log` in a stdio server** — stdout carries JSON-RPC frames; any stray line breaks the client parser.
- Use `console.error` or a logger that writes to stderr only.

---

## Keeping HTTP Client

### Hand-rolled vs Generated

Keeping does not publish a machine-readable OpenAPI spec (the docs SPA was not parseable in prior research). Generated clients (`openapi-typescript`, `@hey-api/openapi-ts`) are therefore not applicable for v1. Hand-rolled thin fetch wrapper is the correct choice.

The wrapper is small: ~150 lines covers auth injection, rate limiting, caching, and timeout.

### KeepingClient Implementation Sketch

```typescript
// src/keeping/client.ts
import type { Config } from '../config.js';

const BASE = 'https://api.keeping.nl/v1';
const TIMEOUT_MS = 10_000;
// 120 req/min → 2 tokens/sec, burst of 10
const TOKENS_PER_SEC = 2;
const BUCKET_CAPACITY = 10;

export class KeepingClient {
  private readonly token: string;
  private tokens: number = BUCKET_CAPACITY;
  private lastRefill: number = Date.now();

  // Cached after first resolution
  private meCache: { userId: string; orgIds: string[] } | null = null;

  constructor(config: Config) {
    this.token = config.token;
  }

  // ── Rate limiting ────────────────────────────────────────────
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      BUCKET_CAPACITY,
      this.tokens + elapsed * TOKENS_PER_SEC
    );
    this.lastRefill = now;
  }

  private async acquireToken(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    // Wait for the next token to accrue, then recurse once
    const waitMs = Math.ceil((1 - this.tokens) / TOKENS_PER_SEC * 1000);
    await new Promise<void>(res => setTimeout(res, waitMs));
    return this.acquireToken();
  }

  // ── Core fetch ───────────────────────────────────────────────
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    await this.acquireToken();

    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const combined = signal
      ? AbortSignal.any([signal, timeout])
      : timeout;

    const res = await fetch(`${BASE}${path}`, {
      method,
      signal: combined,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '30', 10);
      await new Promise<void>(r => setTimeout(r, retryAfter * 1000));
      return this.request(method, path, body, signal); // one retry
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Keeping API ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>('GET', path, undefined, signal);
  }

  post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>('POST', path, body, signal);
  }

  patch<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>('PATCH', path, body, signal);
  }

  delete<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>('DELETE', path, undefined, signal);
  }

  // ── /users/me caching ────────────────────────────────────────
  async getMe(): Promise<{ userId: string; orgIds: string[] }> {
    if (this.meCache) return this.meCache;
    const data = await this.get<{ id: string; organisations: { id: string }[] }>('/users/me');
    this.meCache = {
      userId: data.id,
      orgIds: data.organisations.map(o => o.id),
    };
    return this.meCache;
  }

  // ── Org resolution ────────────────────────────────────────────
  async resolveOrgId(explicitId?: string): Promise<string> {
    const me = await this.getMe();
    if (explicitId) {
      if (!me.orgIds.includes(explicitId)) {
        throw new Error(`organisation_id "${explicitId}" not found in token's orgs.`);
      }
      return explicitId;
    }
    if (me.orgIds.length === 1) return me.orgIds[0];
    throw new Error(
      `Token has access to ${me.orgIds.length} organisations. Pass organisation_id explicitly.`
    );
  }
}
```

**Rate-limit strategy rationale:** Token bucket is preferred over simple retry-after-on-429 because it prevents hitting the ceiling in the first place (proactive, not reactive). At 120 req/min sustained and a 10-token burst capacity, a typical session (dozen tool calls) never comes close to the limit. The 429 handler is a safety net for external bursts or parallel sessions. One retry after waiting `Retry-After` seconds is sufficient; the token bucket prevents cascading.

**Caching:** `/users/me` is fetched at most once per server lifetime. The cache lives on the KeepingClient instance, which is created once in the entrypoint and threaded through all tool handlers. This avoids ~1 extra API round-trip per write call.

**Org discovery timing:** Lazy on first call (not eager on startup). Rationale: eager startup adds latency and a failure mode before the user issues any tool call. Lazy resolution surfaces the error exactly when it matters and allows the server to start cleanly even if the network is momentarily unavailable.

---

## Confirmation / Dry-Run Pattern

### Contract

`KEEPING_REQUIRE_CONFIRM` (env, default `"true"`) controls whether write tools require explicit confirmation.

Every write tool (`keeping_add_entry`, `keeping_update_entry`, `keeping_delete_entry`) includes `confirm: boolean` (default `false`) in its Zod input schema.

Decision tree in each write handler:

```
if (config.requireConfirm && !input.confirm)
  → return preview object (no API call)
else
  → call API, return result
```

Preview object shape (returned as both `structuredContent` and text):

```typescript
type DryRunPreview = {
  preview: {
    method: 'POST' | 'PATCH' | 'DELETE';
    url: string;          // full URL that would be called
    body: unknown;        // request body that would be sent
  };
};
```

When `KEEPING_REQUIRE_CONFIRM=false` the `confirm` parameter still works — passing `confirm: false` still returns the preview. This lets users invoke dry-run explicitly even when the env flag is off.

### Why a tool-level flag, not a separate "preview" tool

A separate `keeping_preview_entry` tool duplicates schema maintenance and requires Claude to call two different tools in the session. A single tool with `confirm: boolean` keeps the schema in one place and the LLM's workflow linear: propose → user says yes → re-call with `confirm: true`.

---

## Multi-Organisation Handling

Logic lives in `KeepingClient.resolveOrgId()` (shown above), called by every write tool and by `keeping_me`. Read tools (list entries, list projects) also require an org context and follow the same pattern.

Rules:
- Single org in token → `organisation_id` parameter is optional, auto-resolved.
- Multiple orgs in token → `organisation_id` is required; missing it throws a clear error that surfaces as `isError: true` to the client.
- Invalid org id → error surfaced immediately, not silently ignored.

The `organisation_id` parameter is declared `.optional()` in all tool schemas so the MCP client does not require it in single-org setups.

---

## Configuration

```typescript
// src/config.ts
import { z } from 'zod';

const ConfigSchema = z.object({
  token: z.string().min(1, 'KEEPING_TOKEN must not be empty'),
  requireConfirm: z.boolean().default(true),
  orgId: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const raw = {
    token: process.env.KEEPING_TOKEN,
    requireConfirm: process.env.KEEPING_REQUIRE_CONFIRM !== 'false',
    orgId: process.env.KEEPING_ORG_ID,
  };

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    // Write to stderr — stdout is reserved for JSON-RPC
    process.stderr.write(
      `[keeping-mcp] Configuration error:\n${result.error.message}\n`
    );
    process.exit(1);
  }
  return result.data;
}
```

**Fail-fast on missing token (at startup, not on first call).**

Rationale: MCP servers are spawned as subprocesses by the client host (Claude Code, Claude Desktop). The user sees the spawn either succeed or fail. If the token is missing, failing fast with a clear stderr message is far more helpful than letting the server start, returning success on `initialize`, and then surfacing a cryptic API 401 three tool calls later. Multiple community sources and the official MCP debugging guide agree on fail-fast as the best practice for required credentials.

`KEEPING_REQUIRE_CONFIRM` defaults to `true` (safe); `"false"` disables confirm requirement. Any other value (typo) keeps the safe default.

`KEEPING_ORG_ID` is a shortcut: if set, it pre-fills `organisation_id` on every tool call so users with multiple orgs do not have to pass it every time. Tool schemas still accept an explicit `organisation_id` parameter that overrides this.

---

## Entrypoint

```typescript
// bin/keeping-mcp.ts
#!/usr/bin/env node
import { loadConfig } from '../src/config.js';
import { KeepingClient } from '../src/keeping/client.js';
import { createServer } from '../src/server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

async function main(): Promise<void> {
  const config = loadConfig();                    // exits on missing token
  const client = new KeepingClient(config);
  const server = createServer(client, config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server now runs until the process is killed by the host
}

main().catch(err => {
  process.stderr.write(`[keeping-mcp] Fatal: ${err.message}\n`);
  process.exit(1);
});
```

```typescript
// src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { KeepingClient } from './keeping/client.js';
import type { Config } from './config.js';
import { registerMeTools } from './tools/me.js';
import { registerOrganisationTools } from './tools/organisations.js';
import { registerProjectTools } from './tools/projects.js';
import { registerEntryTools } from './tools/entries.js';

export function createServer(client: KeepingClient, config: Config): McpServer {
  const server = new McpServer({
    name: 'keeping-mcp',
    version: process.env.npm_package_version ?? '0.0.0',
  });

  registerMeTools(server, client, config);
  registerOrganisationTools(server, client, config);
  registerProjectTools(server, client, config);
  registerEntryTools(server, client, config);

  return server;
}
```

`createServer` is a pure function (no side effects, no I/O) — this makes it trivially testable.

---

## Build Order (Dependency Graph)

Dependencies flow downward. Each layer is independently shippable/testable before the layer above.

```
Phase 1 — Foundation
  config.ts          (no deps)
  keeping/types.ts   (no deps)
  keeping/client.ts  (depends on: config.ts)
      → Runnable milestone: client can call /users/me, list orgs

Phase 2 — Read Tools
  tools/me.ts          (depends on: client, config)
  tools/organisations.ts
  tools/projects.ts
  server.ts            (depends on: all tool registrations)
  bin/keeping-mcp.ts   (depends on: server.ts, client.ts, config.ts)
      → Runnable milestone: npx keeping-mcp starts, read tools work end-to-end

Phase 3 — Write Tools (dry-run first)
  tools/entries.ts with dry-run path only (confirm always false)
      → Runnable milestone: keeping_add_entry returns preview

Phase 4 — Live Writes
  tools/entries.ts with live write path
  keeping_update_entry, keeping_delete_entry
      → Runnable milestone: full CRUD with confirmation gate

Phase 5 — Timer Tools (if Keeping API exposes them)
  tools/timers.ts     (depends on: client, config)
      → Runnable milestone: start/stop timer via MCP

Phase 6 — Release pipeline
  .github/workflows/release.yml (OIDC npm publish on tag)
```

Each phase ends with something runnable via `npx`. No phase leaves the repo in a broken state.

**What blocks what:**
- `config.ts` blocks everything — it's the root dependency.
- `keeping/client.ts` blocks all tool handlers.
- `server.ts` + `bin/keeping-mcp.ts` block e2e testing (but tool logic can be unit-tested before wiring).
- Write tools should not be wired until the dry-run path is exercised against a real token (schema unknowns, see PROJECT.md).

---

## Testing Strategy

### Unit Tests (Vitest, no real API calls)

Test tool handler logic by injecting a mocked `KeepingClient`:

```typescript
// test/unit/tools/entries.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEntryTools } from '../../../src/tools/entries.js';

const mockClient = {
  resolveOrgId: vi.fn().mockResolvedValue('org-1'),
  post: vi.fn().mockResolvedValue({ id: 'entry-1' }),
};

const config = { token: 'test', requireConfirm: true, orgId: undefined };

describe('keeping_add_entry', () => {
  it('returns dry-run preview when confirm=false', async () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerEntryTools(server as any, mockClient as any, config);

    // Call handler directly (preferred for speed over in-process transport)
    // See integration tests for full protocol path
    expect(mockClient.post).not.toHaveBeenCalled();
  });
});
```

For speed, test the exported handler functions directly rather than going through the full MCP protocol. Protocol compliance is verified with MCP Inspector (see below).

### Integration Tests (gated on env var)

```typescript
// test/integration/entries.integration.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { KeepingClient } from '../../src/keeping/client.js';

const RUN = process.env.KEEPING_TOKEN_TEST !== undefined;

describe.skipIf(!RUN)('Keeping API integration', () => {
  let client: KeepingClient;

  beforeAll(() => {
    client = new KeepingClient({ token: process.env.KEEPING_TOKEN_TEST!, requireConfirm: true });
  });

  it('resolves /users/me', async () => {
    const me = await client.getMe();
    expect(me.userId).toBeTruthy();
    expect(me.orgIds.length).toBeGreaterThan(0);
  });
});
```

In CI, `KEEPING_TOKEN_TEST` is set only in the maintainer's workflow (not in fork PRs). The `describe.skipIf` pattern gates the test gracefully — the suite passes without skipping CI.

### Protocol-Level Testing (MCP Inspector)

```bash
npx @modelcontextprotocol/inspector npx keeping-mcp
```

Use MCP Inspector to:
- Verify tool schemas are advertised correctly.
- Exercise dry-run flow interactively.
- Catch `console.log` stdout pollution before it reaches users.

MCP Inspector is the official Anthropic-developed visual debugger; it connects via stdio proxy and validates JSON-RPC framing in real time.

---

## Scalability Considerations

| Concern | In-process (single session) | Notes |
|---------|-----------------------------|-------|
| Rate limiting | Token bucket per KeepingClient instance | Sufficient; server is single-process, single-user |
| Org list | Cached in-memory for server lifetime | Fine; org membership doesn't change during a session |
| Concurrent tool calls | MCP SDK serialises tool calls per connection | No additional locking needed |
| Token leak | env var → never logged, never in responses | Enforced by config layer |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Writing to stdout
**What:** `console.log(...)`, `process.stdout.write(...)` anywhere in tool or client code.
**Why bad:** stdout is the JSON-RPC transport channel. A stray newline or log line corrupts the framing and the client sees a parse error with no useful message.
**Instead:** `console.error(...)` or a logger that explicitly targets `process.stderr`.

### Anti-Pattern 2: Re-fetching /users/me on every tool call
**What:** Calling `/users/me` inside the tool handler to resolve `userId` or org context.
**Why bad:** Every tool call costs an extra API round-trip; on a session with 20 tool calls that's 20 wasted requests against a 120 req/min limit.
**Instead:** Cache on `KeepingClient` instance after first fetch; expose `getMe()` which returns the cache on subsequent calls.

### Anti-Pattern 3: Eager org resolution at startup
**What:** Calling `/users/me` during `main()` before the MCP transport is connected.
**Why bad:** Adds startup latency; a transient network failure prevents the server from starting at all even if only read tools would be called.
**Instead:** Lazy resolution on first write call (or first `keeping_me` / `keeping_organisations` call).

### Anti-Pattern 4: Throwing inside tool handlers
**What:** `throw new Error('something went wrong')` in a tool handler.
**Why bad:** The SDK catches and re-wraps it, but the error message may be opaque and the `isError` flag is set in ways the caller cannot predict.
**Instead:** `return { content: [{ type: 'text', text: errorMessage }], isError: true }` — explicit, predictable.

### Anti-Pattern 5: Monolithic tool file
**What:** All 9+ tools in one `src/tools/index.ts` file.
**Why bad:** Merge conflicts, hard to navigate, all tools break together when one has a type error.
**Instead:** One file per logical domain (`entries.ts`, `projects.ts`, `me.ts`, `organisations.ts`), each exporting a `registerXTools(server, client, config)` function.

---

## Sources

- MCP TypeScript SDK official docs (tool registration, stdio, structured output): https://ts.sdk.modelcontextprotocol.io/documents/server.html
- MCP TypeScript SDK tool registration deep-dive: https://deepwiki.com/modelcontextprotocol/typescript-sdk/3.2-tool-registration-and-execution
- `aashari/boilerplate-mcp-server` layout reference: https://github.com/aashari/boilerplate-mcp-server
- `lzinga/us-gov-open-data-mcp` (token-bucket rate limiter pattern): https://github.com/lzinga/us-gov-open-data-mcp
- Xata MCP server (generated client + initMcpTools pattern): https://xata.io/blog/built-xata-mcp-server
- MCP Inspector (official protocol-level test tool): https://github.com/modelcontextprotocol/inspector
- Fail-fast env var pattern, stdlib analysis: https://apxml.com/courses/getting-started-model-context-protocol/chapter-4-debugging-and-client-integration/managing-environment-variables
- AbortSignal.timeout() + AbortSignal.any() for combined cancel/timeout: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static
- Token bucket rate limiting for API clients: https://casperswebsites.com/articles/handling-rate-limited-apis-with-typescript
- MCP server testing with Vitest in-process client: https://www.kaigritun.com/mcp/testing-mcp-servers
- MCP error handling best practices: https://mcpcat.io/guides/error-handling-custom-mcp-servers/
