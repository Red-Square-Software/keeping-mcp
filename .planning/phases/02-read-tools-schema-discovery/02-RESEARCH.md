# Phase 2: Read Tools & Schema Discovery - Research

**Researched:** 2026-06-10
**Domain:** MCP TypeScript server boot, HTTP client wiring (throttle + retry), live API schema discovery
**Confidence:** HIGH (SDK source inspected at v1.29.0 tag; npm registry queried for current versions; package legitimacy verified)

## Summary

Phase 2 turns the dormant Phase 1 binary into a runnable MCP server. Every architectural and stack
decision is already locked: `@modelcontextprotocol/sdk` ^1.29 with stdio transport, Zod 4 for input
schemas, native `fetch` for HTTP, `p-throttle` for the 120 req/min cap, `p-retry` for read-only 429
backoff, raw-pass-through `keeping_list_entries`, identity cache for `/users/me` + `/organisations`
inside `KeepingClient`, and a one-shot `npm run probe-live` script that captures both the timer
endpoint reality and an anonymised time-entry fixture.

Two findings adjust the original STACK.md pins:
1. **`p-throttle` is now at v8.1.0** (was v5 in STACK.md research). v6 dropped Node <18; v7 removed
   the `abort()` method (use `signal` option instead); v8 requires Node >=20. The API surface we
   need (`pThrottle({ limit, interval })` returning a wrapper) is unchanged. Use `^8.1.0`.
2. **`p-retry` is now at v8.0.0** (was v6.2.1 in STACK.md research). v7 was a full rewrite removing
   the `retry` package dependency; `onFailedAttempt`/`shouldRetry` now receive a context object
   (`{ error, attemptNumber, retriesLeft, retriesConsumed, retryDelay }`). v8 requires Node >=22.
   The `onFailedAttempt` callback can **return a Promise**, which is the official pattern for
   honoring `Retry-After`. Use `^8.0.0`.

The MCP SDK 1.29 `registerTool` accepts an **optional** `outputSchema`. Omitting it is the right
choice for `keeping_list_entries` per D-34 (raw pass-through). The SDK's `inputSchema` accepts both
a ZodRawShape and a full `z.object(...)` — both work. `server.sendLoggingMessage()` is a **silent
no-op** unless the server constructor declares `capabilities: { logging: {} }` — relevant if we
ever want protocol-channel logs; stderr remains primary diagnostic per D-09.

`InMemoryTransport.createLinkedPair()` from `@modelcontextprotocol/sdk/inMemory.js` is the
recommended in-process unit-test pattern — no child process spawn, no shell quoting hell.

**Primary recommendation:** Land the `KeepingClient` (throttle + retry + cache + sanitised errors)
first as a vertical slice with `keeping_me` only. Once that wave is green, add `keeping_organisations`
+ `resolveOrgId`, then `keeping_projects` + `keeping_tasks`, then `keeping_list_entries` plus the
`probe-live` script in the final wave (because the script depends on the same `KeepingClient`).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Identity Cache**
- **D-22:** Cache `/users/me` and `/organisations` for server lifetime (no TTL, no expiry). Per SAFE-05 + the MCP-server-per-Claude-session lifetime model — the staleness window is the duration of one Claude Code session.
- **D-23:** Cache scope is ONLY `/users/me` + `/organisations`. `/projects` and `/tasks` stay fresh per call. Avoids Phase 3 cache-invalidation surface (Pitfall 8) and respects the "feature-flag-driven" nature of project/task availability.
- **D-24:** Cache lives inside `KeepingClient` as private fields. Tools call `client.me()` / `client.organisations()` and the client memoises internally. No separate IdentityResolver module.
- **D-25:** On mid-session 401: surface as `{ isError: true, content: [...] }` from the affected tool with the message `Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.` Do not invalidate cache, do not auto-retry, do not exit the process. Restart is the user's signal of intent.

**Multi-Org Resolution**
- **D-26:** `KEEPING_ORG_ID` is a DEFAULT, not a hard pin. A tool input `organisation_id` overrides the env var.
- **D-27:** When the user has multiple orgs AND `KEEPING_ORG_ID` is unset AND the tool call did not pass `organisation_id`: return `{ isError: true, content: ... }` with a message listing the available orgs by id + name. Exact wording: `Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: <id> (<name>), <id> (<name>).`
- **D-28:** Auto-detect + resolve lives in a single method: `client.resolveOrgId(input?: string): Promise<string>`. Resolution order: (a) input arg if present, (b) `KEEPING_ORG_ID` if set, (c) auto-detect if cached `organisations()` returns exactly one org, (d) else throw the "multiple orgs" error from D-27.
- **D-29:** `resolveOrgId()` validates the resolved id against the cached `organisations()` list. If it doesn't match, return `isError` early with the same "Options: ..." message.

**Timer Endpoint Probe**
- **D-30:** Probe is a one-shot `npm run probe-live` script, not server-startup behaviour. Server never probes; tests never probe.
- **D-31:** Probe hits three best-guess paths in parallel and records the full response (status, headers, body):
  1. `GET /v1/organisations/:org_id/timers`
  2. `GET /v1/organisations/:org_id/timers/current`
  3. `GET /v1/organisations/:org_id/time_entries?running=true`
- **D-32:** Probe result lives in TWO places: `.planning/research/LIVE-API.md` (committed human notes) and `.planning/REQUIREMENTS.md` (TIMER-01 status row updated).
- **D-33:** Phase 2 does NOT ship any timer-facing tool. Even `keeping_timer_status` ships in Phase 3 alongside start/stop.

**Schema Discovery & Fixture**
- **D-34:** `keeping_list_entries` returns the API response with NO field renaming. Wire shape: `{ entries: <raw array from Keeping>, count: <number> }`. Zod validates only that the top-level shape is an object containing an array; nothing inside the array is renamed, dropped, or re-typed.
- **D-35:** Live capture is folded into the same `probe-live` script. After timer probes, the script: (1) calls `GET .../time_entries?from=<date>&to=<date>`; (2) writes raw response to `.planning/research/.live-capture-raw.json` (gitignored); (3) anonymises (strip `description`, `project_name`, `task_name`, `client_name`, `user_name`, `user_email`; preserve ids, timestamps, all numeric/enum fields); (4) writes anonymised result to `test/fixtures/time-entry-response.sample.json`; (5) writes human notes to `.planning/research/LIVE-API.md`.
- **D-36:** Phase 3 schema-drift CI test consumes `test/fixtures/time-entry-response.sample.json` (created here, used there).
- **D-37:** `.gitignore` augmented in Phase 2: `.planning/research/.live-capture-raw.json` and `.planning/research/.probe-raw-*.json`. Raw captures NEVER hit the repo.

**Phase 1 Carry-Forward (must not regress)**
- D-01..03: `src/` layout, ESM-only, Node >=22, `mcpName`, `bin`, `files` whitelist all fixed.
- D-04..05: `loadConfig()` reads `KEEPING_TOKEN` (required), `KEEPING_REQUIRE_CONFIRM` (stringbool, default true), `KEEPING_ORG_ID` (optional), `KEEPING_LOG_LEVEL` (enum, default "info"). Exact error message at startup.
- D-06..09: stderr-only logger; token redaction at emit; biome `noConsole` rule (allow only `console.error`).
- D-13/D-15: Phase 1 ships a "missing-token" smoke; Phase 2 upgrades to MCP `initialize` JSON-RPC handshake assertion.
- D-20: branch protection live on `main`; Phase 2 work goes via feature branches + PRs.

### Claude's Discretion

- Exact HTTP library plumbing order: native `fetch` + `p-retry` + `p-throttle` per STACK; planner picks wiring order.
- Pagination strategy for `keeping_list_entries`: best-guess offset (`page` / `per_page`) per FEATURES; iterate if probe reveals cursor scheme.
- `keeping_list_entries` default `limit` value (200 per FEATURES recommendation).
- Tool description copy for the 5 read tools — planner drafts; must include the timezone note for date params per Pitfall 5.
- MCP `initialize` JSON-RPC handshake CI smoke (D-15 deferred from Phase 1) — planner places it in `ci.yml`.
- HTTP error envelope: parse loosely; surface `errors[0].message` or `message` or raw body text — whichever exists — as the `isError` text.
- Anonymisation field list — D-35 step 3 lists the default; planner extends if probe reveals additional human-named fields.

### Deferred Ideas (OUT OF SCOPE)

- `keeping_refresh_cache` tool.
- `keeping_timer_status` read tool (belongs in Phase 3 alongside start/stop per D-33).
- MCP Elicitation flow for confirmation.
- `outputSchema` on read tools (defer until wire format fully locked after Phase 2 live capture).
- Late-night session heuristic (Phase 3, UXv2-01).
- ESLint plugin to ban `Date.toISOString()` on date fields.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-04 | `KEEPING_REQUIRE_CONFIRM` env defaults to `true`; setting to `false` allows writes without per-call `confirm: true` | Already wired in Phase 1 `src/config.ts` via `z.stringbool().default(true)`. Phase 2: plumb `requireConfirm` field into `KeepingClient` / tool context so Phase 3 write tools can read it. No new logic in Phase 2 — just thread the value through. |
| AUTH-05 | Optional `KEEPING_ORG_ID` env pins operations to one organisation when set | Phase 1 already accepts the env var. Phase 2: implement `resolveOrgId()` per D-26..29 — env is a *default*, not a pin. Validates against cached org list per D-29. |
| IDENT-01 | `keeping_me` returns authenticated user's `user_id` per organisation | Tool registers via `server.registerTool('keeping_me', { ... }, handler)`. Handler calls `client.me()`. Per D-23/D-24, `client.me()` calls `GET /v1/users/me` (or org-scoped equivalent per FEATURES — verify wire format during probe). Response cached for server lifetime. |
| IDENT-02 | `keeping_organisations` returns list of orgs incl. feature flags (`projects`, `tasks`, `timesheet_mode`) | Tool calls `client.organisations()`. Cached for server lifetime. Feature flags surface as-is from API (raw pass-through per D-34 spirit, even though D-34 strictly governs only `keeping_list_entries`). |
| IDENT-03 | When `KEEPING_ORG_ID` unset and one org accessible: auto-use; when multiple: require explicit `organisation_id` | Implemented in `client.resolveOrgId()` per D-28. Read tools that need an org call this method; multi-org-with-no-input returns `isError` with org list per D-27. |
| META-01 | `keeping_projects` returns projects for org (gracefully empty if feature disabled) | Tool calls `client.get('/organisations/:org_id/projects')` after `resolveOrgId()`. Per D-23, NOT cached. On 404 / empty response from feature-disabled org: return `{ content: [{type:'text', text:'Projects feature not enabled for this organisation.'}] }` (not `isError`). |
| META-02 | `keeping_tasks` returns tasks for org (gracefully empty if feature disabled) | Same pattern as META-01. |
| READ-01 | `keeping_list_entries` returns time entries for given user + date range | Tool inputs: `organisation_id?`, `from`, `to?`, `user_id?`, `limit?` (default 200 per discretion). Calls `client.get('/organisations/:org_id/time_entries?from=<>&to=<>&user_id=<>')`. |
| READ-02 | `keeping_list_entries` exposes raw API field names (no renaming) — schema-discovery role | Per D-34: response shape is `{ entries: <raw array>, count: <number> }`. Zod validates only the top-level envelope. No `outputSchema` on this tool (deferred per CONTEXT.md). |
| READ-03 | Read tools annotated `readOnlyHint: true` | Per SDK 1.29 `ToolAnnotations` schema: `{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }` on every read tool. Set explicitly per Pitfall 8. |
| SAFE-02 | HTTP client respects 120 req/min via proactive token bucket (2 req/s, burst 10) | `pThrottle({ limit: 2, interval: 1000 })` is the canonical equivalent — 2 calls per second. For burst-10 semantics, see Architecture Patterns §"Throttle wiring" — `p-throttle` does not natively model "burst" capacity, so we either accept a strict 2/sec ceiling OR use `pThrottle({ limit: 120, interval: 60_000 })` which gives effective burst behaviour up to the minute boundary. **Recommendation: use the 120/60s form** — closer to Keeping's actual contract, simpler reasoning, and burst-10 was a derived heuristic, not a Keeping-stated requirement. |
| SAFE-03 | Read requests retry on 429 honouring `Retry-After`; write requests do not retry | Per p-retry v8 docs: `onFailedAttempt(context)` can return a Promise — parse `Retry-After` from the error's attached response, await that many ms, then let p-retry's internal retry proceed. Use `shouldRetry` to gate by HTTP method: only allow retry when method === 'GET'. Throw `AbortError` from inside `shouldRetry`-equivalent (or return `false`) for write verbs. |
| SAFE-04 | HTTP errors surface as `isError: true` tool responses with Keeping error message; tool never throws | Anti-Pattern 4 from ARCHITECTURE.md applies. Every tool handler wraps its `client.*()` call in try/catch and converts to `{ isError: true, content: [{ type: 'text', text: <sanitised> }] }`. Sanitiser is mandatory per Pitfall 2. |
| SAFE-05 | `/users/me` and `/organisations` cached in-memory for server lifetime | Identity cache implementation in `KeepingClient` (D-22, D-24). Two private fields; lazy-populated on first call; never invalidated. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MCP protocol handshake (stdio) | Entrypoint (`bin/keeping-mcp.ts`) | — | `StdioServerTransport.connect()` lives at the process boundary, after config validation. |
| Tool registration & dispatch | Server wiring (`src/server.ts`) | — | `McpServer.registerTool()` calls are pure wiring; no business logic. |
| Tool input validation (Zod) | Tool handler (`src/tools/*.ts`) | SDK | SDK runs the schema through `safeParseAsync`; handlers receive parsed args. |
| Org id resolution | KeepingClient (`src/keeping/client.ts`) | — | Single source of truth per D-28; tools never re-implement. |
| HTTP request (auth, throttle, retry) | KeepingClient | Node native `fetch` | Per ARCHITECTURE.md 5-layer split; tools never touch `fetch` directly. |
| Rate limiting (120/min) | KeepingClient | `p-throttle` | Proactive client-side cap; one queue instance shared by every request. |
| Read-only retry on 429 | KeepingClient | `p-retry` | Wrap each `request()` call; `shouldRetry` gates on HTTP method. |
| Identity cache (`/users/me`, `/organisations`) | KeepingClient | — | Private fields per D-24; lazy population; lifetime cache per D-22. |
| Error sanitisation | KeepingClient | logger | All thrown errors pass through a sanitiser that strips `Authorization` header before they reach a tool handler (defence in depth with logger's emit-time redaction). |
| MCP error envelope (`isError: true`) | Tool handler | — | Per SDK spec — handler returns the CallToolResult; throwing causes opaque protocol errors. |
| `probe-live` script | Top-level (`scripts/probe-live.ts`) | KeepingClient | Script imports `KeepingClient` and reuses it; rate limiting + auth come for free. |
| CI smoke (initialize handshake) | `.github/workflows/ci.yml` | Built binary | Pipes JSON-RPC into `node dist/bin/keeping-mcp.js`; asserts stdout cleanliness, token redaction. |

## Standard Stack

### Core (already in tree, leave alone)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | `^4.4.3` (installed) | Tool input schemas, env validation | Phase 1 locked; SDK 1.29 supports Zod 4 directly via `import * as z from "zod"` [VERIFIED: SDK 1.29 mcp.ts uses `zod-compat.ts` shim — accepts both v3 and v4 shapes]. |
| TypeScript | `^6.0.3` (installed) | Source language | Phase 1 pin; `"module": "Node16"`, `"moduleResolution": "Node16"` enforced. |
| `tsup` | `^8.5.1` (installed) | ESM bundle + shebang injection | Phase 1 pin. |
| `vitest` | `^4.1.8` (installed) | Unit + integration tests | Phase 1 pin. |
| `@biomejs/biome` | `^2.4.16` (installed) | Lint + format | Phase 1 pin; `noConsole` rule enforced. |

### Core (new in Phase 2)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | `^1.29.0` [VERIFIED: npm registry — latest stable 1.29.0 published 2026-Q1, confirmed via `npm view @modelcontextprotocol/sdk version`] | MCP protocol server, stdio transport, tool registration | Official first-party SDK. `dist-tags.latest = 1.29.0`. v2.0 is pre-alpha — do not use. |
| `p-throttle` | `^8.1.0` [VERIFIED: npm registry — current 8.1.0 published 2025-11-08; STACK.md research recorded ^5.0.0 which is two majors behind] | Client-side 120 req/min cap | sindresorhus, 9+ years on registry, no postinstall, no sub-dependencies. v8 requires Node >=20 (compatible with our Node >=22). |
| `p-retry` | `^8.0.0` [VERIFIED: npm registry — current 8.0.0 published 2026-03-26; STACK.md research recorded ^6.2.1 which is two majors behind] | Read-only retry on 429 honouring `Retry-After` | sindresorhus, 9+ years on registry, no postinstall. v8 requires Node >=22 (matches our floor). `onFailedAttempt` callback can return Promise — the official pattern for Retry-After. |

### Supporting (dev-only, new in Phase 2)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | `^4.22.4` [VERIFIED: npm registry] | Run `scripts/probe-live.ts` directly without a build step | The probe script is dev-only; not shipped. `npx tsx scripts/probe-live.ts` is the recommended invocation. Native `node --experimental-strip-types` works on Node 22.18+ but pinning `tsx` keeps the script runnable on any 22.x for the user. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `p-retry` + native fetch + manual `Retry-After` parsing | `axios` + `axios-retry` | Adds ~60 KB dep tree, introduces yet another error envelope to sanitise (Pitfall 2). Reject. |
| `p-throttle` (queue) | Hand-rolled token bucket in KeepingClient | ARCHITECTURE.md sketches a ~30 LOC token-bucket; `p-throttle` is ~40 LOC of dep but gets us `queueSize` monitoring and tested correctness. Use `p-throttle`. |
| `tsx` for probe script | `node --experimental-strip-types scripts/probe-live.ts` | Native works on Node 22.18+ only [CITED: nodejs.org/api/typescript.html — type stripping became stable in v22.18.0]. User runs `npm run probe-live` locally; their Node may be older. `tsx` removes the version-pin landmine. |
| `tsx` for probe script | Compile to JS as a build step | Adds build complexity for a script run once or twice. Reject. |
| `dotenv` for probe script | `node --env-file=.env` | [CITED: nodejs.org/api/cli.html — `--env-file` stable in Node v22.21.0 and v24.10.0] Native flag is the right call — no extra dep. With `tsx`: `tsx --env-file=.env scripts/probe-live.ts` (tsx forwards Node flags). |

**Installation:**

```bash
npm install @modelcontextprotocol/sdk p-throttle p-retry
npm install -D tsx
```

**Version verification (run at planning time, dated 2026-06-10):**

```
npm view @modelcontextprotocol/sdk version  -> 1.29.0
npm view p-throttle version                  -> 8.1.0
npm view p-retry version                     -> 8.0.0
npm view tsx version                         -> 4.22.4
```

## Package Legitimacy Audit

> slopcheck was unavailable on this Windows research environment (no pip in PATH). All entries
> below are tagged with their registry-verified provenance but marked `[ASSUMED]` per the
> mandatory protocol. The planner MUST insert `checkpoint:human-verify` tasks before each install.

| Package | Registry | Age | Downloads (weekly) | Source Repo | Postinstall | slopcheck | Disposition |
|---------|----------|-----|--------------------|-------------|-------------|-----------|-------------|
| `@modelcontextprotocol/sdk` | npm | ~2 yrs | 1M+ | github.com/modelcontextprotocol/typescript-sdk | none | `[ASSUMED]` (slopcheck unavailable) | Approved — first-party SDK, source repo verified, used by Phase 1 of this plan already (researched but not yet installed) |
| `p-throttle` | npm | 9+ yrs (created 2016-10-21) | 50M+ | github.com/sindresorhus/p-throttle | none | `[ASSUMED]` | Approved — sindresorhus maintained, well-established, no postinstall, no sub-dependencies |
| `p-retry` | npm | 9+ yrs (created 2016-10-21) | 200M+ | github.com/sindresorhus/p-retry | none | `[ASSUMED]` | Approved — sindresorhus maintained, well-established, no postinstall, single dep on `is-network-error` (also sindresorhus) |
| `tsx` | npm | 3+ yrs | 30M+ | github.com/privatenumber/tsx | none | `[ASSUMED]` | Approved — widely adopted TS runner, no postinstall. Dev-only |

**Packages removed due to slopcheck [SLOP] verdict:** none (slopcheck not run)
**Packages flagged as suspicious [SUS]:** none (slopcheck not run)

**Planner mitigation:** because slopcheck was unavailable, every install task in this plan
**must** be preceded by a `checkpoint:human-verify` step instructing the user to confirm the
package name spelling, the GitHub repo URL shown in the table above, and the maintainer's npm
profile before allowing the install to run.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│ Claude Code (MCP client) — spawns server as child process            │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │ stdio: JSON-RPC frames
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ bin/keeping-mcp.ts (entrypoint)                                      │
│   1. loadConfig()       ─ Phase 1: typed env, fail-fast              │
│   2. createLogger()     ─ Phase 1: stderr + token redaction          │
│   3. new KeepingClient(config, log)        ─ NEW Phase 2             │
│   4. createServer(client, config, log)     ─ NEW Phase 2             │
│   5. server.connect(new StdioServerTransport())                      │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │ McpServer.registerTool() x 5
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ src/server.ts        createServer(client, config, log) → McpServer   │
│   Wires registerMe / registerOrganisations / registerProjects /      │
│   registerTasks / registerEntryList. Pure wiring; no business logic. │
└────┬──────────────┬──────────────┬──────────────┬──────────────┬─────┘
     ▼              ▼              ▼              ▼              ▼
┌─────────┐  ┌─────────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐
│ me.ts   │  │ organisat-  │  │projects  │  │tasks.ts  │  │entries-   │
│         │  │ ions.ts     │  │.ts       │  │          │  │list.ts    │
│ inputs: │  │ inputs:     │  │ inputs:  │  │ inputs:  │  │ inputs:   │
│ org_id? │  │ (none)      │  │ org_id?  │  │ org_id?  │  │ org_id?,  │
│         │  │             │  │          │  │          │  │ from, to?,│
│         │  │             │  │          │  │          │  │ user_id?, │
│         │  │             │  │          │  │          │  │ limit?    │
│ calls   │  │ calls       │  │ calls    │  │ calls    │  │ calls     │
│ client. │  │ client.     │  │ client.  │  │ client.  │  │ client.   │
│ me()    │  │ organisat-  │  │ get(...) │  │ get(...) │  │ get(...)  │
│         │  │ ions()      │  │          │  │          │  │           │
└────┬────┘  └──────┬──────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘
     │              │              │              │              │
     └──────────────┴──────────────┼──────────────┴──────────────┘
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ src/keeping/client.ts — KeepingClient                                │
│                                                                       │
│  resolveOrgId(input?)  ──> reads cached organisations(), validates    │
│  me()                  ──> lifetime cache of /users/me               │
│  organisations()       ──> lifetime cache of /organisations         │
│  get/post/patch/delete ──> request<T>(method, path, body?)           │
│                                                                       │
│  request<T>():                                                        │
│    1. throttled() wrapper — p-throttle limit=120 interval=60_000      │
│    2. pRetry(()=> fetch(...), {                                       │
│         retries: 3,                                                   │
│         shouldRetry: ({error}) => method === 'GET' && is429or5xx,   │
│         onFailedAttempt: async ({error}) => await sleep(retryAfter)  │
│       })                                                              │
│    3. on 401 — throw KeepingAuthError (caught at tool layer per D-25)│
│    4. on ok=false — throw KeepingApiError (sanitised: no token, no   │
│       Authorization header, no full RequestInit)                     │
│    5. on ok=true — res.json()                                        │
└──────────────────────────────────┬───────────────────────────────────┘
                                   ▼
                        Node native fetch
                        Authorization: Bearer ***
                        → api.keeping.nl/v1/...
```

### Recommended Project Structure

```
keeping-mcp/
├── bin/
│   └── keeping-mcp.ts          # ENHANCED: now connects MCP transport
├── src/
│   ├── config.ts               # (Phase 1, unchanged)
│   ├── logger.ts               # (Phase 1, unchanged)
│   ├── server.ts               # NEW: createServer(client, config, log)
│   ├── keeping/
│   │   ├── client.ts           # NEW: KeepingClient
│   │   └── types.ts            # NEW: loose TS types for known shapes
│   └── tools/
│       ├── me.ts               # NEW
│       ├── organisations.ts    # NEW
│       ├── projects.ts         # NEW
│       ├── tasks.ts            # NEW
│       └── entries-list.ts     # NEW (read-only entries listing)
├── scripts/
│   └── probe-live.ts           # NEW: one-shot live probe + schema capture
├── test/
│   ├── logger.test.ts          # (Phase 1, unchanged)
│   ├── config.test.ts          # OPTIONAL: add if not present
│   ├── keeping/
│   │   └── client.test.ts      # NEW: throttle, retry, cache, sanitiser
│   ├── tools/
│   │   ├── me.test.ts          # NEW: uses InMemoryTransport
│   │   ├── organisations.test.ts
│   │   ├── projects.test.ts
│   │   ├── tasks.test.ts
│   │   └── entries-list.test.ts
│   └── fixtures/
│       └── time-entry-response.sample.json  # created by probe-live, committed
└── .planning/research/
    ├── LIVE-API.md             # NEW: created by probe-live first run, committed
    └── .live-capture-raw.json  # GITIGNORED — created by probe-live, never committed
```

### Pattern 1: `registerTool` with Zod input schema (SDK 1.29)

**Source verified:** SDK 1.29.0 source `src/server/mcp.ts` lines 1052-1081.

**What:** The current public API for registering a tool with config + handler. `outputSchema` and
`annotations` are both fully optional config keys.

**When to use:** Every tool in this phase. `outputSchema` is omitted for `keeping_list_entries`
per D-34 (raw pass-through); set for the other four if a strict shape is desired (still deferred
per Deferred Ideas — omitting on all five reduces churn).

**Example:**

```typescript
// Source: SDK 1.29.0 src/server/mcp.ts L1052-1081 + src/types.ts L1318-1361
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KeepingClient } from "../keeping/client.js";

const MeInput = z.object({
  organisation_id: z
    .string()
    .optional()
    .describe("Override KEEPING_ORG_ID. Required when token has access to multiple orgs."),
});

export function registerMe(server: McpServer, client: KeepingClient): void {
  server.registerTool(
    "keeping_me",
    {
      title: "Who am I",
      description:
        "Returns the authenticated user's id, name, email, and role for the selected " +
        "organisation. Identity is cached for the server's lifetime.",
      inputSchema: MeInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true, // calls an external API
      },
      // outputSchema OMITTED — deferred per CONTEXT.md Deferred Ideas
    },
    async (input) => {
      try {
        const orgId = await client.resolveOrgId(input.organisation_id);
        const me = await client.me(); // cached
        return {
          content: [{ type: "text", text: JSON.stringify({ ...me, organisation_id: orgId }, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: sanitiseError(err) }],
        };
      }
    },
  );
}
```

Key SDK details from source inspection:

- `inputSchema` type: `ZodRawShapeCompat | AnySchema | undefined` — passing either `{ organisation_id: z.string().optional() }` (a raw shape) OR `z.object({...})` (a full schema) works. **Recommend `z.object(...)`** for consistency with Phase 1's `loadConfig()` and to enable `.describe()` chains.
- `annotations` type: `ToolAnnotations` from `types.ts` L1318. All four hints are individually optional booleans.
- `_meta`: optional `Record<string, unknown>` — not needed in Phase 2.

### Pattern 2: KeepingClient `request<T>()` with p-throttle + p-retry composed

**Source verified:** p-throttle README, p-retry README, both fetched 2026-06-10.

**What:** A single `request<T>()` private method that every public verb (`get`, `post`, `patch`,
`delete`) routes through. p-throttle wraps the request to enforce 120/min globally. p-retry wraps
the throttled call so the retry counter does NOT consume throttle budget for the same logical
attempt.

**When to use:** Every Keeping API call from inside `KeepingClient`. No tool ever bypasses this.

**Example:**

```typescript
// Source: p-throttle README + p-retry README (sindresorhus, fetched 2026-06-10)
import pThrottle from "p-throttle";
import pRetry, { AbortError } from "p-retry";

const BASE = "https://api.keeping.nl/v1";
const TIMEOUT_MS = 10_000;

export class KeepingClient {
  private readonly token: string;
  private readonly log: Logger;
  private readonly throttle = pThrottle({ limit: 120, interval: 60_000 });
  private meCache: KeepingUser | null = null;
  private orgsCache: KeepingOrg[] | null = null;

  constructor(token: string, log: Logger) {
    this.token = token;
    this.log = log;
  }

  private async rawFetch(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      throw new KeepingAuthError(); // D-25
    }
    if (res.status === 429) {
      // throw with attached Retry-After for p-retry to honour
      const retryAfter = Number(res.headers.get("Retry-After") ?? "30");
      const err = new KeepingRateLimitError(retryAfter);
      throw err;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new KeepingApiError(res.status, sanitiseBody(body));
    }
    return res.json();
  }

  // Public surface — every verb calls this
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const throttled = this.throttle(() => this.rawFetch(method, path, body));

    return (await pRetry(throttled, {
      retries: 3,
      // GET only — write verbs never retry per SAFE-03 and Pitfall 3
      shouldRetry: ({ error }) => {
        if (method !== "GET") return false;
        if (error instanceof KeepingRateLimitError) return true;
        // Optional: retry network errors on GET too
        return error instanceof TypeError; // fetch network errors
      },
      // Retry-After honour — onFailedAttempt may return a Promise per p-retry v8 docs
      onFailedAttempt: async ({ error }) => {
        if (error instanceof KeepingRateLimitError) {
          this.log.warn(`429 received, sleeping ${error.retryAfter}s before retry`);
          await new Promise((r) => setTimeout(r, error.retryAfter * 1000));
        }
      },
    })) as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }
  // ... post/patch/delete identical signatures
}
```

**Critical wiring detail:** `throttle(fn)` returns a wrapped function whose call consumes a token
*every invocation*. We pass the **same wrapped function** to `pRetry` so each retry attempt is its
own throttle-budget consumer (correct — a retry IS a new HTTP request, and we don't want it to
bypass the rate limit). If we wanted retries to be free relative to throttle budget, we would
wrap the other direction. The current ordering is correct for Keeping's contract.

**Burst behaviour:** `pThrottle({ limit: 120, interval: 60_000 })` lets the first 120 requests
through immediately, then queues. This matches "120 req/min" more faithfully than the original
"2/sec burst 10" derivation. The `strict` option (default `false`) uses a windowed algorithm
which is the right shape for a per-minute cap.

### Pattern 3: Identity cache — single source per D-22..D-24

**What:** Two private fields on `KeepingClient`; lazy-populated; never invalidated.

**Example:**

```typescript
async me(): Promise<KeepingUser> {
  if (this.meCache) return this.meCache;
  this.meCache = await this.get<KeepingUser>("/users/me");
  return this.meCache;
}

async organisations(): Promise<KeepingOrg[]> {
  if (this.orgsCache) return this.orgsCache;
  this.orgsCache = await this.get<KeepingOrg[]>("/organisations");
  return this.orgsCache;
}

async resolveOrgId(input?: string): Promise<string> {
  const orgs = await this.organisations();
  const ids = orgs.map((o) => o.id);

  const candidate = input ?? process.env.KEEPING_ORG_ID;
  if (candidate) {
    if (!ids.includes(candidate)) {
      throw new MultiOrgError(orgs, `organisation_id "${candidate}" not found`);
    }
    return candidate;
  }
  if (ids.length === 1) return ids[0];
  throw new MultiOrgError(orgs); // exact wording per D-27 lives on the error class
}
```

**Note on 401 handling per D-25:** When `client.me()` is called from inside `resolveOrgId()` and
the API returns 401, the `KeepingAuthError` bubbles up to the tool handler's try/catch, which
emits the exact D-25 message via `isError`. The cache fields stay `null` — meaning the very next
tool call will re-attempt the API (which is fine, the user is supposed to restart at this point;
the next call will hit 401 again and emit the same message).

### Pattern 4: Anonymisation utility for the probe script

**What:** A pure function that walks a parsed JSON value and replaces any value at a key in the
denylist with `"[REDACTED]"`. Strings, numbers, booleans, dates, ids untouched.

**Example:**

```typescript
// scripts/probe-live.ts — used to produce test/fixtures/time-entry-response.sample.json
const ANONYMISE_KEYS = new Set([
  "description",
  "project_name",
  "task_name",
  "client_name",
  "user_name",
  "user_email",
]);

function anonymise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(anonymise);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = ANONYMISE_KEYS.has(k) ? "[REDACTED]" : anonymise(v);
    }
    return out;
  }
  return value;
}
```

Allow-list alternative considered: too brittle — Keeping API may add fields we haven't seen, and
an allow-list would silently drop them, losing schema-discovery value. Denylist by name is
correct here.

### Pattern 5: InMemoryTransport for unit tests (faster than child process)

**Source verified:** SDK 1.29.0 `test/server/mcp.test.ts` L1-72 and `src/inMemory.ts`.

**What:** Pair an in-process `Client` and `McpServer` via `InMemoryTransport.createLinkedPair()`.
No spawn, no stdio framing, no shell quoting.

**When to use:** Every tool handler test. Faster than spawning the binary; deterministic.

**Example:**

```typescript
// Source: SDK 1.29.0 test/server/mcp.test.ts L23-72
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, it, expect } from "vitest";
import { registerMe } from "../../src/tools/me.js";

describe("keeping_me", () => {
  it("returns user info from the (mocked) client", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = {
      me: async () => ({ id: "u-1", name: "Test", email: "x@y.z" }),
      resolveOrgId: async () => "org-1",
      organisations: async () => [{ id: "org-1", name: "Acme" }],
    } as any;
    registerMe(server, mockClient);

    const client = new Client({ name: "test-client", version: "0.0.0" });
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverT), client.connect(clientT)]);

    const res = await client.callTool({ name: "keeping_me", arguments: {} });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse((res.content[0] as any).text)).toMatchObject({ id: "u-1" });
  });
});
```

### Anti-Patterns to Avoid

- **Throwing inside a tool handler.** Per ARCHITECTURE.md anti-pattern 4: always return `{ isError: true, content: [...] }`. Throwing produces opaque protocol errors and skips the sanitised message.
- **Letting `fetch` errors propagate raw.** A `TypeError` from native fetch can include the failed request URL but not the body — still sanitise. A response object stringified may include nothing dangerous because `Response` doesn't serialise the request, BUT custom error subclasses (`KeepingApiError`, etc.) MUST scrub the response body of any `authorization` substring as a paranoia defence.
- **Calling `console.log` in the probe script.** Even though the probe is run by hand and not over MCP stdio, keep the project-wide rule: use `console.error` (biome `noConsole` allows only `error`). The probe writes user-facing output via `console.error("Probe complete. See LIVE-API.md")`.
- **Eagerly fetching `/users/me` in `bin/keeping-mcp.ts`.** Per ARCHITECTURE.md anti-pattern 3, identity resolution is lazy — first tool call triggers it. Avoids startup-time network failures preventing the server from booting at all.
- **Re-implementing `resolveOrgId()` inside individual tool handlers.** Per D-28, one method on `KeepingClient`. Tools call `client.resolveOrgId(input.organisation_id)` — full stop.
- **Adding TTL or refresh logic to the identity cache.** Per D-22, no TTL, no expiry. Process lifetime is the only invalidation event.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 120 req/min rate limiting | Custom token bucket with timestamps | `p-throttle` ^8.1.0 | Same problem space, tested, `queueSize` monitoring built in. ARCHITECTURE.md sketches a token-bucket but it duplicates `p-throttle`. |
| 429 retry with Retry-After | Manual `setTimeout` + recursion in `request()` | `p-retry` ^8.0.0 with `onFailedAttempt` returning a Promise | p-retry handles attempt counting, abort-via-AbortError, signal forwarding. Native fetch errors integrate cleanly. |
| Spawning the built binary for unit tests | `child_process.spawn` + parse JSON-RPC frames from stdout | `InMemoryTransport.createLinkedPair()` | First-party SDK pattern, no process boundary, deterministic, faster. SDK's own tests use it. |
| Loading .env in the probe script | `dotenv` package | `node --env-file=.env` (or `tsx --env-file=.env`) | Native, stable in Node 22.21+ and 24.10+ [CITED: nodejs.org/api/cli.html]. Removes one dep. |
| Running TS in the probe script | Custom transpile step + commit JS | `tsx` (`npx tsx scripts/probe-live.ts`) | Single binary that handles TS + ESM + node-style imports. Used as devDep only. |
| MCP `initialize` request synthesis in CI | Build a fake JSON-RPC client | Hand-craft one JSON line and pipe it in via `printf` + `node dist/bin/...` | Per `/specification/latest/basic/lifecycle` — `initialize` is one line; piping it in and asserting the server's response is a valid JSON-RPC frame is exactly what D-15 calls for. Doesn't need a real client. |

**Key insight:** Phase 2's job is wiring well-established libraries together — not building rate limiters or retry machines. Every "Don't hand-roll" item above maps to a library we're already approving in the stack. The custom code we WRITE is the cache, the org resolver, the error sanitiser, and the tool handlers themselves.

## Runtime State Inventory

Not applicable — Phase 2 is greenfield code addition, not a rename / refactor / migration.

## Common Pitfalls

### Pitfall A: `sendLoggingMessage` is a silent no-op without `capabilities.logging`

**Source:** SDK 1.29.0 `src/server/index.ts` L641-648 — the method early-returns when
`this._capabilities.logging` is falsy.

**What goes wrong:** Developer reads CLAUDE.md line "use `server.sendLoggingMessage` for structured
log forwarding to the client" and adds calls in tool handlers. None of them surface anywhere
because `McpServer` was constructed without declaring the `logging` capability.

**Why it happens:** SDK constructor signature is `new McpServer(serverInfo, options?)` — capabilities
default to `{}`. The Phase 1 carry-forward decision is stderr-only logging (D-09), so the easy
move is to **not declare** `logging`. Then anyone who later adds `sendLoggingMessage` calls hits
this footgun.

**How to avoid:** Decision for Phase 2 — **do not declare `capabilities.logging`** in
`createServer()`. Stderr is the only logging surface. Document this with a comment at the
McpServer construction site so future-you (or future-me) doesn't bolt on `sendLoggingMessage`
calls expecting them to work.

**Warning signs:** A `sendLoggingMessage` call exists anywhere in `src/` without the corresponding
constructor option.

### Pitfall B: SDK `inputSchema` types accept BOTH ZodRawShape and ZodObject — easy to mix accidentally

**Source:** SDK 1.29.0 `src/server/mcp.ts` L1052 — `InputArgs extends undefined | ZodRawShapeCompat | AnySchema = undefined`.

**What goes wrong:** Half the tool files use `inputSchema: { organisation_id: z.string().optional() }` (raw shape) and the other half use `inputSchema: z.object({ organisation_id: z.string().optional() })`. Both work at runtime; both pass TypeScript. The inconsistency makes refactors painful.

**How to avoid:** Pick ONE style and document it. **Recommendation:** always use `z.object(...)`.
Reasons: (1) consistency with `loadConfig()` which uses `z.object`; (2) `.describe()`, `.refine()`,
and other Zod object methods become available; (3) easier to extract `type ToolInput = z.infer<typeof ToolInputSchema>` for the handler signature.

**Warning signs:** Any tool file using `inputSchema: { field: zod }` raw-shape form.

### Pitfall C: `p-throttle` queue size with errors — unhandled rejections drain the queue forever

**Source:** p-throttle README — "throttledFn.queueSize" property.

**What goes wrong:** If `rawFetch` throws and the calling code does not await the throttled call,
the rejection is swallowed but the slot is consumed. After enough silent rejections, the queue
may stall (no backpressure on retries) or starve.

**How to avoid:** All `request<T>()` calls MUST be awaited inside `KeepingClient`. p-retry wraps
the throttled call and is itself awaited. Tools that call `client.get/post/...` MUST `await`.
Easy in this design because the call chain is shallow.

**Warning signs:** A `client.X(...)` call without `await` anywhere in `src/tools/`.

### Pitfall D: `node --env-file=.env` fails when the file is missing

**Source:** nodejs.org/api/cli.html — `--env-file=` throws if the file doesn't exist; use
`--env-file-if-exists=` for the tolerant form.

**What goes wrong:** Probe script ships with `node --env-file=.env scripts/probe-live.ts` in
`package.json` scripts. User runs `npm run probe-live` without creating `.env` first → cryptic
"Cannot find file" error before the script's own friendly "set KEEPING_TOKEN first" message can fire.

**How to avoid:** Use `--env-file-if-exists=.env` in the script command. Inside the script,
validate `process.env.KEEPING_TOKEN` is set and emit a friendly stderr message + exit 1 if not.

### Pitfall E: `keeping_list_entries` returning a giant raw array as text content can hit MCP message-size limits

**What goes wrong:** A year of entries could be 5–10 MB of JSON. Stringified into `content[0].text`
that's one huge JSON-RPC frame.

**How to avoid:**
- Default the `limit` input to 200 (per CONTEXT.md discretion bullet).
- Cap the upper bound to e.g. 1000 in the Zod schema (`z.number().int().min(1).max(1000).default(200)`).
- Document in tool description that for larger date ranges users should narrow `from`/`to`.

**Warning signs:** A test that asks for "all entries in 2025" without a date range guard.

### Pitfall F (carry-forward from Phase 1 research §1 stdout pollution): A new dependency writes to stdout at import time

**Source:** PITFALLS.md §1 — `console.log` in startup banners.

**What goes wrong:** `p-throttle`, `p-retry`, `tsx`, or `@modelcontextprotocol/sdk` itself prints
something to stdout during import. The CI smoke pipe-an-`initialize` test catches this.

**How to avoid:**
- Phase 2's upgraded CI smoke test (D-15) asserts stdout contains ONLY valid JSON-RPC.
- Manual verification: after install of new deps, run `echo '{}' | node -e "import('@modelcontextprotocol/sdk/server/mcp.js')"` and confirm no stdout output.
- Biome `noConsole` rule prevents OUR code; it can't prevent dependencies.

### Pitfall G (carry-forward from Phase 1 §2 token leak): Native `fetch` errors don't carry `Authorization` but custom errors might

**Source:** PITFALLS.md §2.

**What goes wrong:** We attach the response body to `KeepingApiError` for a useful message. If
Keeping's error response echoes back the request headers (some debug-mode APIs do this), the body
itself could contain the bearer token.

**How to avoid:**
- `sanitiseBody(text: string): string` runs `text.replace(this.token, "***")` before storing
  on the error. Defense in depth with the logger's emit-time redaction (D-08).
- The logger's redaction is the final safety net — anything that makes it into a log line still
  gets `***`'d. But error MESSAGES that bypass the logger (e.g., a tool handler stringifies the
  error's `.message` directly into `content[0].text`) need the sanitiser at construction time.
- Unit test: throw a `KeepingApiError` constructed with a body that contains the test token; assert
  `.message` contains `***` and not the token.

### Pitfall H: Probe script's `package.json` script entry must be `tsx --env-file-if-exists=.env scripts/probe-live.ts`, not bare `node`

**What goes wrong:** `node scripts/probe-live.ts` works on Node 22.18+ via native type stripping
but fails on Node 22.0–22.17 (the floor we ship). The probe script is run by users who installed
`keeping-mcp` and want to capture their own schema — they may not have the latest Node 22.

**How to avoid:** Standardise on `tsx`. It's a devDep so it's installed for anyone who clones
the repo; it works on any Node 18+.

## Code Examples

### Common Operation 1: Tool registration with sanitised error catch

```typescript
// src/tools/organisations.ts
// Source: SDK 1.29.0 mcp.ts L1052-1081 + ToolAnnotations from types.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KeepingClient } from "../keeping/client.js";
import { toIsErrorContent } from "../keeping/errors.js";

const Input = z.object({});

export function registerOrganisations(server: McpServer, client: KeepingClient): void {
  server.registerTool(
    "keeping_organisations",
    {
      title: "List organisations",
      description:
        "Returns the list of organisations the token can access. Each org includes feature " +
        "flags (projects, tasks, timesheet_mode). Cached for the server's lifetime.",
      inputSchema: Input,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const orgs = await client.organisations();
        return {
          content: [{ type: "text", text: JSON.stringify(orgs, null, 2) }],
        };
      } catch (err) {
        return toIsErrorContent(err);
      }
    },
  );
}
```

### Common Operation 2: `keeping_list_entries` (raw pass-through per D-34)

```typescript
// src/tools/entries-list.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KeepingClient } from "../keeping/client.js";
import { toIsErrorContent } from "../keeping/errors.js";

const Input = z.object({
  organisation_id: z
    .string()
    .optional()
    .describe("Override KEEPING_ORG_ID; required for multi-org tokens."),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD (calendar date, not UTC timestamp)")
    .describe("Inclusive start date. Calendar date in YYYY-MM-DD; Europe/Amsterdam timezone."),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Inclusive end date; defaults to `from` (single day)."),
  user_id: z.string().optional().describe("Defaults to the authenticated user."),
  limit: z.number().int().min(1).max(1000).default(200),
});

export function registerEntriesList(server: McpServer, client: KeepingClient): void {
  server.registerTool(
    "keeping_list_entries",
    {
      title: "List time entries",
      description:
        "Returns time entries for a date range. Wire shape preserved exactly as returned " +
        "by the Keeping API — no field renaming — so this tool doubles as schema discovery " +
        "for Phase 3 write tools. Dates are calendar dates in YYYY-MM-DD; not UTC timestamps.",
      inputSchema: Input,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const orgId = await client.resolveOrgId(input.organisation_id);
        const params = new URLSearchParams({
          from: input.from,
          to: input.to ?? input.from,
          limit: String(input.limit),
        });
        if (input.user_id) params.set("user_id", input.user_id);
        const raw = await client.get<{ entries?: unknown[] } | unknown[]>(
          `/organisations/${orgId}/time_entries?${params}`,
        );

        // Per D-34: top-level normalisation only; entries pass through.
        const entries = Array.isArray(raw) ? raw : (raw.entries ?? []);
        const payload = { entries, count: entries.length };

        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        };
      } catch (err) {
        return toIsErrorContent(err);
      }
    },
  );
}
```

### Common Operation 3: Error envelope helper (mid-session 401 per D-25)

```typescript
// src/keeping/errors.ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export class KeepingAuthError extends Error {
  constructor() {
    super("Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.");
  }
}

export class MultiOrgError extends Error {
  constructor(orgs: { id: string; name: string }[], prefix?: string) {
    const list = orgs.map((o) => `${o.id} (${o.name})`).join(", ");
    const head =
      prefix ?? "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID.";
    super(`${head} Options: ${list}.`);
  }
}

export class KeepingApiError extends Error {
  constructor(public readonly status: number, sanitisedBody: string) {
    super(`Keeping API ${status}: ${sanitisedBody}`);
  }
}

export class KeepingRateLimitError extends Error {
  constructor(public readonly retryAfter: number) {
    super(`429 Too Many Requests; retry after ${retryAfter}s`);
  }
}

export function toIsErrorContent(err: unknown): CallToolResult {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
```

### Common Operation 4: CI smoke — pipe `initialize` and assert stdout cleanliness

**Source:** modelcontextprotocol.io/specification/latest/basic/lifecycle (current `protocolVersion`
is `2025-11-25`).

```yaml
# .github/workflows/ci.yml — addition to the existing job after the build step
- name: Smoke test — MCP initialize handshake produces only valid JSON-RPC on stdout
  shell: bash
  env:
    KEEPING_TOKEN: kp_test_FAKE_token_value
  run: |
    REQ='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"ci-smoke","version":"1.0.0"}}}'
    OUTPUT=$(printf '%s\n' "$REQ" | node dist/bin/keeping-mcp.js 2>/tmp/stderr || true)

    # 1. stdout MUST be one or more valid JSON lines (parse each line)
    while IFS= read -r LINE; do
      [ -z "$LINE" ] && continue
      echo "$LINE" | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))" || {
        echo "FAIL: stdout contained non-JSON line: $LINE"; exit 1;
      }
    done <<< "$OUTPUT"

    # 2. stderr MUST NOT contain the fake token (D-08 redaction)
    if grep -q "kp_test_FAKE_token_value" /tmp/stderr; then
      echo "FAIL: fake token leaked to stderr"; cat /tmp/stderr; exit 1;
    fi

    # 3. The first stdout line MUST be a JSON-RPC response to id=1
    FIRST=$(printf '%s' "$OUTPUT" | head -n1)
    echo "$FIRST" | node -e "
      const r = JSON.parse(require('fs').readFileSync(0,'utf8'));
      if (r.jsonrpc !== '2.0' || r.id !== 1 || !r.result) {
        console.error('FAIL: not a valid initialize response:', r); process.exit(1);
      }
      if (!r.result.serverInfo || !r.result.protocolVersion) {
        console.error('FAIL: missing serverInfo/protocolVersion:', r); process.exit(1);
      }
    "
    echo "Smoke PASSED: initialize handshake, clean stdout, no token leak"
```

**Windows note:** The job uses `shell: bash`, which on `windows-latest` resolves to Git Bash —
the same shell that ran the Phase 1 smoke test successfully. No PowerShell variant needed.

### Common Operation 5: `npm run probe-live` script command

```jsonc
// package.json — addition
{
  "scripts": {
    "probe-live": "tsx --env-file-if-exists=.env scripts/probe-live.ts"
  }
}
```

### Common Operation 6: Probe script skeleton

```typescript
// scripts/probe-live.ts
// Run via: npm run probe-live
// Requires .env with KEEPING_TOKEN (and optionally KEEPING_ORG_ID).
// Captures three timer-endpoint probes + one time_entries fixture.
// Writes:
//   .planning/research/.live-capture-raw.json (gitignored)
//   .planning/research/LIVE-API.md            (committed)
//   test/fixtures/time-entry-response.sample.json (committed, anonymised)

import { loadConfig } from "../src/config.ts";
import { createLogger } from "../src/logger.ts";
import { KeepingClient } from "../src/keeping/client.ts";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const ANONYMISE_KEYS = new Set([
  "description",
  "project_name",
  "task_name",
  "client_name",
  "user_name",
  "user_email",
]);

function anonymise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(anonymise);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = ANONYMISE_KEYS.has(k) ? "[REDACTED]" : anonymise(v);
    }
    return out;
  }
  return value;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config.KEEPING_TOKEN, "info");
  const client = new KeepingClient(config.KEEPING_TOKEN, log);

  const orgId = await client.resolveOrgId();
  log.info(`probing against organisation_id=${orgId}`);

  // 1. Three timer paths in parallel — record everything
  const TIMER_PATHS = [
    `/organisations/${orgId}/timers`,
    `/organisations/${orgId}/timers/current`,
    `/organisations/${orgId}/time_entries?running=true`,
  ];
  const probes = await Promise.allSettled(
    TIMER_PATHS.map(async (path) => {
      try {
        const body = await client.get(path);
        return { path, ok: true, body };
      } catch (err) {
        return { path, ok: false, error: (err as Error).message };
      }
    }),
  );

  // 2. Time-entry fixture — pick a small date range (env-driven, fallback to last week)
  const from = process.env.PROBE_FROM ?? defaultLastWeek();
  const to = process.env.PROBE_TO ?? from;
  const entries = await client.get(
    `/organisations/${orgId}/time_entries?from=${from}&to=${to}`,
  );

  // Write RAW (gitignored)
  await writeJson(".planning/research/.live-capture-raw.json", {
    timers: probes,
    time_entries: { from, to, body: entries },
  });

  // Write anonymised fixture (committed)
  await writeJson("test/fixtures/time-entry-response.sample.json", anonymise(entries));

  // Write human notes
  await writeFile(
    ".planning/research/LIVE-API.md",
    buildLiveApiNotes(probes, entries, from, to),
    "utf8",
  );

  log.info("probe-live complete. Review .planning/research/LIVE-API.md.");
}

function defaultLastWeek(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function buildLiveApiNotes(probes: unknown, entries: unknown, from: string, to: string): string {
  // ... format per Specific Ideas section of CONTEXT.md:
  // "Timer endpoint result", "Time entry response shape",
  // "Observed enum values (purpose, timesheet_mode)",
  // "Pagination scheme observed", "Error envelope observed"
  return `# Live API Capture\n\nCaptured: ${new Date().toISOString()}\n\n...`;
}

main().catch((err) => {
  process.stderr.write(`[probe-live] FAILED: ${(err as Error).message}\n`);
  process.exit(1);
});
```

## State of the Art

| Old Approach (STACK.md research, June 2026) | Current Approach (June 2026) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `p-retry ^6.2.1` | `p-retry ^8.0.0` | v7 (rewrite, new context object API), v8 published 2026-03-26 (Node >=22, `retryDelay` in context) | API change: `onFailedAttempt(error)` → `onFailedAttempt({ error, attemptNumber, retriesLeft, retriesConsumed, retryDelay })`. Code examples in STACK.md / ARCHITECTURE.md using the older callback shape need updating. |
| `p-throttle ^5.0.0` | `p-throttle ^8.1.0` | v6 (Node >=18), v7 (removed `abort()` method, use `signal`), v8 (Node >=20, published 2025-11-08) | Cleaner API. STACK.md research is unaffected at the import-and-invoke layer; just version bump. |
| MCP `protocolVersion: "2024-11-05"` (Phase 1 research) | `protocolVersion: "2025-11-25"` (current MCP spec) | November 2025 spec release | CI smoke uses `"2025-11-25"`; SDK 1.29 negotiates this correctly. |
| Node 22 native TS via `--experimental-strip-types` (June 2026 research) | Native TS stable as `node script.ts` since Node 22.18 (no flag) | Node v22.18.0 release | Probe script could use `node scripts/probe-live.ts` if we floor at 22.18, BUT we floor at 22.0 in `engines`, so we still need `tsx` for safety. |

**Deprecated/outdated:**

- `pRetry(fn, { onFailedAttempt: (err) => ... })` (old v6 form) — replaced by `({ error, ... }) => ...` context object.
- `pThrottle({ ... }).abort()` (v6 form) — removed in v7; use `signal: AbortSignal` option.
- Recommending `dotenv` as a default for env loading in Node-22-targeted projects — superseded by native `--env-file=`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Keeping API paths follow `/v1/organisations/:org_id/...` for projects, tasks, time_entries, timers | Throughout (FEATURES.md baseline; UNVERIFIED in source research) | If the path scheme differs, every tool returns 404 until paths are corrected. The probe-live script will surface this on first run. |
| A2 | `keeping_me` resolves via `GET /v1/users/me` (root-scoped, not org-scoped) | KeepingClient `me()` example | If Keeping requires `/v1/organisations/:org_id/users/me`, the cache key needs to become org-scoped. Detectable on first probe run. |
| A3 | Keeping returns `Retry-After` header on 429 responses | p-retry wiring | If missing, our 30s default applies. Acceptable fallback. |
| A4 | Keeping API does not echo back the `Authorization` header in error response bodies | Pitfall G | Defence-in-depth sanitiser handles even if it does. |
| A5 | The 401 mid-session indicates a revoked / expired / invalid token (vs. a transient auth issue) | D-25 wording | If 401 can be transient (e.g., upstream auth-service blip), we surface an alarming "verify token" message for what's actually a glitch. Acceptable — restart is a cheap user action. |
| A6 | `pThrottle({ limit: 120, interval: 60_000 })` is closer to Keeping's 120/min contract than `{ limit: 2, interval: 1000 }` | Pattern 2 | If Keeping enforces a strictly-rolling per-second cap, the 120/60s form may briefly violate (e.g., 120 in second 0 + 120 in second 60 = 240 in 61 seconds). Practically: tool sessions rarely burst that hard. |
| A7 | `windows-latest` GitHub runner ships Git Bash compatible with the Phase 1 smoke test shell scripts | CI smoke (Common Operation 4) | Phase 1 D-13 already proved this works. Continued assumption. |
| A8 | The probe script's date defaults to "last 7 days" produce some entries to anonymise | Probe script skeleton | If user has no entries in last week, fixture is empty → schema discovery yields little. Acceptable — surface this fact in LIVE-API.md and let the user re-run with `PROBE_FROM`/`PROBE_TO` env vars. |

**Note:** Assumptions A1–A4 are explicitly the ones the probe-live script is designed to verify
on first run. The act of running `npm run probe-live` resolves them from `[ASSUMED]` to
`[VERIFIED]` for Phase 3. Phase 2 PLANs should NOT depend on these being verified before
shipping — the probe is the last task, not a precondition.

## Open Questions (RESOLVED)

1. **Should `keeping_me` be the org-scoped `/v1/organisations/:org_id/users/me` or the global `/v1/users/me`?**
   - RESOLVED: COMMIT to the global `GET /v1/users/me` form as the default in `KeepingClient.me()` for Phase 2. The cache shape (one user object) is identical regardless of which path serves it, so the public KeepingClient surface does not change.
   - Contingency (documented Phase 2 sub-task, NOT a runtime surprise): if the live probe in Plan 02-06 returns 404 on `/v1/users/me`, the Plan 02-06 REQUIREMENTS-update task includes a follow-up code fix to switch `KeepingClient.me()` to the org-scoped form `/v1/organisations/${orgId}/users/me` (resolving `orgId` via the existing `resolveOrgId()` precedence). The contingency is captured as an explicit acceptance criterion in Plan 02-06 Task 3 so the path discrepancy cannot ship un-handled.
   - What we know: FEATURES.md research notes both shapes are plausible, no docs were retrievable.
   - What we no longer treat as unclear: cache shape (one user object regardless of which path serves it). The path choice is now committed-with-contingency, not deferred-to-runtime.

2. **Does Keeping pagination use `page`/`per_page` (offset-based) or a cursor scheme?**
   - RESOLVED: deferred to Phase 3 explicitly per CONTEXT D-34. Phase 2 ships `keeping_list_entries` with `limit` only — no `page`, no `cursor` input. The probe-live capture in Plan 02-06 will record whatever pagination metadata Keeping returns (`next_cursor`, `meta.total_pages`, `Link` header, etc.) into LIVE-API.md `## Pagination scheme observed` so Phase 3 can pick the exact pagination shape from real evidence. Acceptable for v1 because typical session-summary workflow asks for a single day's worth of entries, well below any reasonable default page size.

3. **Does the SDK's `Client.callTool()` return shape exactly match `CallToolResult` from the schema, including handling of `isError` and `content`?**
   - RESOLVED: yes — confirmed by direct source inspection of SDK 1.29 `test/server/mcp.test.ts` L1340-1350 which calls `result.isError` and `result.content` against the standard `CallToolResultSchema`. No code change needed; tool tests in Plan 02-02 Task 2 / Plan 02-03 / Plan 02-04 may rely on the schema shape directly.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Server runtime + tests | ✓ | (project floors `>=22.0.0`; CI matrix 22 + 24) | — |
| npm | install deps, run scripts | ✓ | (already in tree, Phase 1 used npm ci) | — |
| GitHub Actions (`ubuntu-latest`, `windows-latest`) | CI smoke | ✓ | (Phase 1 CI green) | — |
| Git Bash on Windows runner | CI smoke shell | ✓ | (Phase 1 smoke proven) | — |
| Keeping API (`api.keeping.nl/v1`) | All tools — REAL HTTP | Cannot verify here; must work for user | — | None — without a real token, only unit-test paths are exercised. The probe-live script is the only place that hits the live API. |
| Real `KEEPING_TOKEN` (for probe-live) | One-off probe + manual e2e validation | User must supply | — | None — Phase 2's success criteria #6 (timer endpoint result documented) is unreachable without a real token. The user runs `npm run probe-live` after the rest of Phase 2 ships. |

**Missing dependencies with no fallback:**
- Real `KEEPING_TOKEN` — required for the final task in Phase 2 (probe-live execution + LIVE-API.md commit + REQUIREMENTS TIMER-01 update). Planner: gate the probe-live execution behind a `checkpoint:human-verify` task that asks the user to run the script and commit the outputs.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

> `workflow.nyquist_validation: false` in `.planning/config.json` — section omitted.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Bearer-token auth via `KEEPING_TOKEN` env var. Token never logged, never in responses, never serialised into errors. Phase 1 logger redacts at emit; Phase 2 adds error-construction-time sanitiser as defence in depth. |
| V3 Session Management | no | No sessions — stateless server invocations, identity cached per-process. |
| V4 Access Control | yes | Server only acts on the authenticated user's data; admin-scope operations explicitly out of scope per PROJECT.md. `resolveOrgId()` validates that any tool-provided org_id belongs to the token's org list (D-29). |
| V5 Input Validation | yes | Zod 4 schemas on every tool input (CONTEXT.md / SDK 1.29 standard). Date fields are validated as `YYYY-MM-DD` strings (not UTC ISO), per Pitfall 5. `limit` bounded to `[1, 1000]`. |
| V6 Cryptography | no | No crypto — token is opaque; HTTPS handled by `fetch`. |
| V7 Error Handling & Logging | yes | All errors surface via `{ isError: true, content: [...] }` envelope (SAFE-04). Logger redacts token. Error messages sanitised before construction. CI smoke verifies token does not appear in stderr. |
| V11 BizLogic | yes | Phase 2 is read-only; Phase 3 will add the dry-run gate. Phase 2 does NOT introduce any code path that writes to Keeping. |
| V13 API & Web Service | yes | Rate-limit awareness (120/min via p-throttle). 429 backoff (Retry-After honoured). No retry on writes (deferred to Phase 3 — Phase 2 has no writes). |
| V14 Configuration | yes | `KEEPING_TOKEN` is the only secret. Validated at startup (Phase 1 `loadConfig`). `.env.*` already in `.gitignore` (Phase 1). Phase 2 adds `.planning/research/.live-capture-raw.json` and `.planning/research/.probe-raw-*.json` to `.gitignore` (D-37) so raw API captures never reach the repo. |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token leak via stringified `fetch` error | Information Disclosure | Custom error classes with sanitised bodies (Pitfall G); logger emit-time redaction (D-08); CI smoke asserts no token in stderr |
| stdout pollution corrupts JSON-RPC | Denial of Service (client can't parse) | biome `noConsole` rule (only `console.error` allowed); CI smoke pipes `initialize` and asserts stdout-is-only-JSON (D-15 + Common Operation 4) |
| Rate-limit exhaustion via redundant identity calls | Denial of Service (against ourselves and the API) | Identity cache for `/users/me` + `/organisations` (D-22..24); p-throttle global cap (SAFE-02) |
| LLM-driven retry of an ambiguous-outcome write | Tampering | Out of scope for Phase 2 (no writes). Phase 3 handles via no-retry-on-write rule per SAFE-03 + Pitfall 3 |
| Anonymised fixture leaks real client/project names | Information Disclosure | Denylist anonymiser in probe-live script (D-35); raw capture in `.gitignore` (D-37); reviewable diff at commit time |
| Probe script run inadvertently against production with destructive params | Tampering | Probe is read-only (all `GET`s). No DELETE/POST/PATCH. Documented in script header comment. |

## Sources

### Primary (HIGH confidence)

- SDK 1.29.0 source at `github.com/modelcontextprotocol/typescript-sdk` tag `v1.29.0`:
  - `src/server/mcp.ts` L1052-1081 — `registerTool` signature (`outputSchema?` confirmed optional)
  - `src/server/mcp.ts` L1272-1293 — `ToolCallback` / `BaseToolCallback` types
  - `src/server/index.ts` L635-648 — `sendLoggingMessage` capability gate
  - `src/types.ts` L1318-1361 — `ToolAnnotationsSchema` (readOnlyHint, destructiveHint, idempotentHint, openWorldHint)
  - `src/types.ts` L1444-1470 — `CallToolResultSchema` (content, structuredContent, isError)
  - `src/inMemory.ts` L1-40 — `InMemoryTransport.createLinkedPair()`
  - `test/server/mcp.test.ts` L23-72 — In-process Client+Server test pattern
- `https://modelcontextprotocol.io/specification/latest/basic/lifecycle` — current `protocolVersion: "2025-11-25"` and minimal `initialize` payload
- `https://modelcontextprotocol.io/docs/tools/debugging` — stderr-only logging rule confirmed (carry-forward from Phase 1)
- `npm view @modelcontextprotocol/sdk` — version 1.29.0 latest as of 2026-06-10
- `npm view p-throttle` — version 8.1.0, no postinstall, sindresorhus repo confirmed
- `npm view p-retry` — version 8.0.0, no postinstall, sindresorhus repo confirmed, dep on `is-network-error`
- `npm view tsx` — version 4.22.4, privatenumber repo confirmed

### Secondary (MEDIUM confidence)

- `https://github.com/sindresorhus/p-retry/blob/main/readme.md` — API signature, `onFailedAttempt` returning Promise pattern for Retry-After
- `https://github.com/sindresorhus/p-throttle/blob/main/readme.md` — `pThrottle({ limit, interval, strict })` signature, `queueSize` monitoring
- `https://nodejs.org/api/cli.html` — `--env-file=` and `--env-file-if-exists=` stable as of v22.21.0 / v24.10.0
- `https://nodejs.org/api/typescript.html` — Native TS support stable in Node 22.18+ (no flag); file extensions mandatory in imports

### Tertiary (carry-forward from Phase 1 / project-internal research)

- `.planning/research/STACK.md` — Phase 1 stack baseline; version pins on p-throttle/p-retry now superseded (this RESEARCH.md is authoritative)
- `.planning/research/ARCHITECTURE.md` — 5-layer split, KeepingClient sketch, anti-patterns
- `.planning/research/FEATURES.md` — Per-tool I/O sketches (Keeping API endpoint inventory is UNVERIFIED — schema discovery resolves)
- `.planning/research/PITFALLS.md` — Pitfalls 1 (stdout), 2 (token leak), 5 (timezone), 7 (rate limit), 8 (annotations), 12 (schema drift) all apply in Phase 2

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every package verified against npm registry on 2026-06-10; SDK signatures verified against tagged source
- Architecture: HIGH — patterns directly carry forward from Phase 1 research, with the throttle + retry composition verified against current library docs
- Pitfalls: HIGH — all pitfalls validated; new pitfalls (A–H) derived from source-level findings during this session
- Keeping API specifics: MEDIUM-LOW — schema is UNVERIFIED per FEATURES.md; that's the point of the probe-live script. Phase 2 plans must NOT assume any specific Keeping wire shape beyond "JSON object or array" until the probe runs.

**Research date:** 2026-06-10
**Valid until:** 2026-07-10 (30 days — fast-moving SDK + library landscape; re-verify before Phase 3 starts)

---

*Phase 2 RESEARCH.md*
*Researcher: gsd-researcher*
*Output destination: .planning/phases/02-read-tools-schema-discovery/02-RESEARCH.md*
