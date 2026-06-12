# Phase 3: Write Tools + Conditional Timers - Pattern Map

**Mapped:** 2026-06-12
**Files analyzed:** 16 new + 4 modified = 20
**Analogs found:** 18 / 20 (two have no direct analog — write-gate + date — research patterns apply)

## File Classification

### New Files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/tools/add-entry.ts` | controller (mcp-tool) | request-response (POST write) | `src/tools/timer-status.ts` | role-match (read shape; new write-gate seam) |
| `src/tools/update-entry.ts` | controller (mcp-tool) | request-response (PATCH partial-write) | `src/tools/timer-status.ts` | role-match |
| `src/tools/delete-entry.ts` | controller (mcp-tool) | request-response (DELETE + extra GET for preview) | `src/tools/timer-status.ts` + `src/tools/projects.ts` (404-branch shape) | role-match |
| `src/tools/start-timer.ts` | controller (mcp-tool) | request-response (POST write) | `src/tools/timer-status.ts` | role-match |
| `src/tools/stop-timer.ts` | controller (mcp-tool) | request-response (PATCH write + header read) | `src/tools/timer-status.ts` | role-match |
| `src/tools/resume-timer.ts` | controller (mcp-tool) | request-response (POST write + header read) | `src/tools/timer-status.ts` | role-match |
| `src/keeping/write-gate.ts` | service/utility | request-response (delegation + branching) | `src/keeping/client.ts` request<T> | partial-match (new domain) |
| `src/keeping/date.ts` | utility (pure) | transform (Date -> string) | `src/keeping/errors.ts` (pure stateless module shape) | role-match shape only |
| `test/tools/add-entry.test.ts` | test | request-response | `test/tools/timer-status.test.ts` | exact |
| `test/tools/update-entry.test.ts` | test | request-response | `test/tools/timer-status.test.ts` | exact |
| `test/tools/delete-entry.test.ts` | test | request-response | `test/tools/timer-status.test.ts` | exact |
| `test/tools/start-timer.test.ts` | test | request-response | `test/tools/timer-status.test.ts` | exact |
| `test/tools/stop-timer.test.ts` | test | request-response | `test/tools/timer-status.test.ts` | exact |
| `test/tools/resume-timer.test.ts` | test | request-response | `test/tools/timer-status.test.ts` | exact |
| `test/keeping/write-gate.test.ts` | test (unit, pure) | transform | `test/keeping/errors.test.ts` (pure-helper test shape) — analog by structure only | partial-match |
| `test/keeping/date.test.ts` | test (unit, pure) | transform | `test/keeping/errors.test.ts` (pure-helper test shape) | partial-match |

### Modified Files

| Modified File | Role | Data Flow | Closest Analog (within itself) | Match Quality |
|---------------|------|-----------|--------------------------------|---------------|
| `src/server.ts` | config (wiring) | event-driven (registration) | `registerEntriesList` / `registerTimerStatus` calls already present | exact (append pattern) |
| `src/keeping/client.ts` | service (HTTP) | request-response | `request<T>` / `rawFetch` methods within file | exact (add sibling + one-line 204 branch) |
| `src/keeping/types.ts` | model (interfaces) | n/a | `KeepingUser`, `KeepingOrg` already present | exact (append interfaces) |
| `.planning/REQUIREMENTS.md` | docs | n/a | existing WRITE-06 prose | exact (footnote amendment) |

---

## Pattern Assignments

### `src/tools/add-entry.ts` (controller, request-response — POST write)

**Analog:** `src/tools/timer-status.ts`

**Imports pattern** (timer-status.ts:37-40):
```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { KeepingClient } from "../keeping/client.js";
import { KeepingApiError, toIsErrorContent } from "../keeping/errors.js";
```
Phase 3 additions for write tools:
```typescript
import type { KeepingConfig } from "../config.js";
import { previewOrCall, classifyAmbiguous, AMBIGUOUS_TEXT } from "../keeping/write-gate.js";
import { todayInAmsterdam, nowInAmsterdamHHMM } from "../keeping/date.js";
```
Note: `KeepingApiError` is still imported by the catch arm of tools that need to distinguish 404 (delete-preview only — see delete-entry section). All other write tools may omit it since the ambiguous classifier owns 5xx duck-typing.

**Zod input-schema pattern** (timer-status.ts:42-47):
```typescript
const TimerStatusInput = z.object({
  organisation_id: z
    .string()
    .optional()
    .describe("Override KEEPING_ORG_ID; required for multi-org tokens."),
});
```
The `organisation_id` field is verbatim across every Phase 2 / 2.5 tool. New write tools MUST reuse this exact `.describe()` string for consistency. Append the write-specific fields (date, purpose, project_id, etc.) and the locked `confirm` block per D-3-12.

**registerXxx signature** (timer-status.ts:67):
```typescript
export function registerTimerStatus(server: McpServer, client: KeepingClient): void {
```
Phase 3 write tools take an extra `config: KeepingConfig` parameter so they can read `KEEPING_REQUIRE_CONFIRM`:
```typescript
export function registerAddEntry(server: McpServer, client: KeepingClient, config: KeepingConfig): void {
```

**registerTool body — annotations** (timer-status.ts:79-88):
```typescript
annotations: {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
},
```
Write-tool variant per D-3-11 (flip three booleans):
```typescript
annotations: {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
},
```

**Handler body — resolve + call + envelope** (timer-status.ts:90-111):
```typescript
async (input) => {
  try {
    const orgId = await client.resolveOrgId(input.organisation_id);
    const raw = await client.get<unknown>(`/${orgId}/time-entries/last`);
    const entry = extractTimeEntry(raw);
    const is_running = entry?.ongoing === true;
    const payload = { time_entry: entry, is_running };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    };
  } catch (err) {
    if (err instanceof KeepingApiError && err.status === 404) {
      const payload = { time_entry: null, is_running: false };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    }
    return toIsErrorContent(err);
  }
},
```
Write-tool variant replaces the 404 catch-branch with the D-3-16 ambiguous classifier and routes the API call through `previewOrCall`:
```typescript
async (input) => {
  try {
    const orgId = await client.resolveOrgId(input.organisation_id);
    const orgs = await client.organisations();
    const org = orgs.find((o) => String(o.id) === orgId);
    if (!org) throw new Error(`Organisation ${orgId} not found in cache`);

    const date = input.date ?? todayInAmsterdam();
    const body: Record<string, unknown> = { date, purpose: input.purpose };
    // ... build body per org.features.timesheet mode (times | hours) ...

    const result = await previewOrCall<{ time_entry: unknown; meta?: unknown }>(
      client,
      { requireConfirm: config.KEEPING_REQUIRE_CONFIRM, confirm: input.confirm === true },
      { method: "POST", path: `/${orgId}/time-entries`, body },
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    if (classifyAmbiguous(err)) {
      const msg = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: "text", text: `${AMBIGUOUS_TEXT} (${msg})` }] };
    }
    return toIsErrorContent(err);
  }
},
```

**Confirm field description (locked verbatim per D-3-12):**
```typescript
confirm: z.boolean().optional().describe(
  "Set to true ONLY after a human has reviewed the would_post preview returned by a prior dry-run call. The MCP client (LLM) MUST NOT set this autonomously — wait for the human to type 'yes' / 'confirm'."
),
```

---

### `src/tools/update-entry.ts` (controller, PATCH partial-write)

**Analog:** `src/tools/timer-status.ts` (same skeleton as add-entry).

**Differences from add-entry:**
1. `entry_id: z.string()` is a REQUIRED input (no `.optional()`).
2. Body construction is conditional per field — only supplied fields are sent (PATCH semantics).
3. `date`, `purpose`, `user_id` are immutable per OpenAPI (`entry_edit_request` omits them) — Zod schema rejects or silently drops them. Planner decides.
4. `previewOrCall` is called with `method: "PATCH", path: \`/${orgId}/time-entries/${input.entry_id}\``.

**Path pattern (D-3-05):** `/${orgId}/time-entries/${entry_id}`

All other patterns (imports, annotations, envelope, ambiguous catch) are identical to add-entry.

---

### `src/tools/delete-entry.ts` (controller, DELETE + extra GET for preview)

**Analog:** `src/tools/timer-status.ts` skeleton + `src/tools/projects.ts:53-62` for the secondary catch-branch shape.

**Unique element — delete preview enrichment (D-3-03):**

The tool inspects the gate condition itself BEFORE delegating to `previewOrCall`, so it can perform the extra GET to populate `would_delete` only on the preview path:

```typescript
async (input) => {
  try {
    const orgId = await client.resolveOrgId(input.organisation_id);
    const path = `/${orgId}/time-entries/${input.entry_id}`;
    const isDryRun = config.KEEPING_REQUIRE_CONFIRM && input.confirm !== true;

    if (isDryRun) {
      // Extra GET only on preview — never on the actual delete.
      const wouldDelete = await client.get<unknown>(path);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            would_post: { method: "DELETE", url: `https://api.keeping.nl/v1${path}`, body: null },
            would_delete: wouldDelete,
          }, null, 2),
        }],
      };
    }

    // Confirm path: delegate through gate; gate returns { ok: true } or similar
    // because rawFetch is 204-tolerant (D-3-27).
    const result = await previewOrCall<unknown>(
      client,
      { requireConfirm: config.KEEPING_REQUIRE_CONFIRM, confirm: input.confirm === true },
      { method: "DELETE", path },
    );
    return { content: [{ type: "text", text: JSON.stringify(result ?? { ok: true }, null, 2) }] };
  } catch (err) {
    if (classifyAmbiguous(err)) {
      const msg = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: "text", text: `${AMBIGUOUS_TEXT} (${msg})` }] };
    }
    return toIsErrorContent(err);
  }
},
```

**Description pattern (D-3-11):** Must include `"**DESTRUCTIVE: permanently deletes the entry**"` prominently.

---

### `src/tools/start-timer.ts` (controller, POST write — no end/no hours)

**Analog:** `src/tools/timer-status.ts` + add-entry body construction.

**Unique elements (D-3-06, D-3-24):**
1. Body MUST omit BOTH `end` and `hours` keys (assertable via strict `Object.keys` in test).
2. `start` defaults to `nowInAmsterdamHHMM()` (per D-3-28 correction — `HH:mm`, NOT full ISO).
3. Return shape is `{ timer_id: <number> }` derived from `time_entry.id` via the strict wrapper extractor (see Shared Pattern: Strict Wrapper Extractor).
4. Path is `/${orgId}/time-entries` (POST without `end`/`hours` = ongoing timer).

**Strict wrapper extraction for `timer_id`** (verbatim from timer-status.ts:58-65):
```typescript
function extractTimeEntry(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== "object") return null;
  const candidate = (raw as Record<string, unknown>).time_entry;
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  return candidate as Record<string, unknown>;
}
```
Then derive: `const timer_id = extractTimeEntry(result)?.id;` and surface `{ timer_id }`.

Note: When `previewOrCall` returns `{ would_post: ... }` (dry-run), there is no `time_entry` to extract — return the preview shape verbatim.

---

### `src/tools/stop-timer.ts` (controller, PATCH `/stop` + header read)

**Analog:** `src/tools/timer-status.ts` + new `requestWithHeaders<T>` consumer.

**Unique elements (D-3-18, D-3-19, D-3-05):**
1. Path is `/${orgId}/time-entries/${entry_id}/stop` with method **`PATCH`** (D-3-05 supersedes D-32-R's POST claim).
2. Uses `client.requestWithHeaders<T>("PATCH", path)` instead of `client.patch<T>(path)`.
3. Reads `headers.get("X-Server-Time-Ms")`, parses to Number, derives elapsed time anchor. Missing/unparseable header → fall back to `Date.now()`, emit `client.log.warn(...)`. NOT an isError.
4. NOTE: `previewOrCall` does NOT currently route through `requestWithHeaders`. Planner must decide whether to:
   - (a) extend `previewOrCall` with a variant that returns headers, OR
   - (b) inline the gate check inside stop-timer (like delete-entry does for the extra GET), OR
   - (c) add a `previewOrCallWithHeaders<T>` sibling.

Option (b) is cheapest and mirrors delete-entry. Option (c) is cleanest. Planner's choice.

**Fallback warn pattern** (logger.ts:24-29 — use `client.log.warn`):
```typescript
client.log.warn("X-Server-Time-Ms header missing on stop response; falling back to local clock");
```

---

### `src/tools/resume-timer.ts` (controller, POST `/resume` + header read)

**Analog:** `src/tools/timer-status.ts` + same `requestWithHeaders<T>` consumer as stop-timer.

**Unique elements:**
1. Path is `/${orgId}/time-entries/${entry_id}/resume` with method `POST` (D-3-05 — D-32-R confirmed unchanged).
2. Per Pitfall 6: response may be 200 (modified existing entry, same id) OR 201 (new ongoing entry, different id). Tool surfaces the wrapper `{ time_entry, meta }` verbatim — do NOT assert id-equality. Tool description SHOULD document this asymmetry.
3. Same header capture pattern as stop-timer.

---

### `src/keeping/write-gate.ts` (service/utility — NEW domain, no analog)

**No direct analog.** Use the research sketch in `03-RESEARCH.md` §"Pattern 3" verbatim:

```typescript
// src/keeping/write-gate.ts
import type { KeepingClient } from "./client.js";

const BASE = "https://api.keeping.nl/v1";  // duplicated from client.ts:32 — see note below

export type WriteMethod = "POST" | "PATCH" | "DELETE";

export interface WriteRequest {
  method: WriteMethod;
  path: string;
  body?: unknown;
}

export interface WriteGateConfig {
  requireConfirm: boolean;
  confirm: boolean;
}

export interface WouldPost {
  would_post: { method: WriteMethod; url: string; body: unknown };
}

export async function previewOrCall<T>(
  client: KeepingClient,
  cfg: WriteGateConfig,
  req: WriteRequest,
): Promise<WouldPost | T> {
  if (cfg.requireConfirm && !cfg.confirm) {
    return { would_post: { method: req.method, url: `${BASE}${req.path}`, body: req.body ?? null } };
  }
  switch (req.method) {
    case "POST":   return client.post<T>(req.path, req.body);
    case "PATCH":  return client.patch<T>(req.path, req.body);
    case "DELETE": return client.delete<T>(req.path);
  }
}

export const AMBIGUOUS_TEXT = "outcome unknown — verify with keeping_list_entries before retrying.";

export function classifyAmbiguous(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    if (err instanceof TypeError) return true;
  }
  if (err !== null && typeof err === "object" && "status" in err && typeof (err as { status: number }).status === "number") {
    return (err as { status: number }).status >= 500;
  }
  return false;
}
```

**Notes:**
- `BASE` duplicated from `src/keeping/client.ts:32`. Either export from client.ts and import here, or keep the duplication (D-3-02 makes the preview-URL assertion trivially testable when BASE is co-located).
- `classifyAmbiguous` uses duck-typing on `.status` to avoid a circular-import-flavored coupling with `KeepingApiError`. Either form works (planner discretion).

---

### `src/keeping/date.ts` (utility — NEW domain, no analog)

**No direct analog.** The closest shape-wise is `src/keeping/errors.ts` (pure stateless module exporting standalone functions, no class state).

Verbatim research sketch (`03-RESEARCH.md` §"Pattern 5"):
```typescript
// src/keeping/date.ts
export function todayInAmsterdam(now: Date = new Date()): string {
  // en-CA emits YYYY-MM-DD natively.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function nowInAmsterdamHHMM(now: Date = new Date()): string {
  // sv-SE emits 24h HH:mm format consistently.
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now);
}
```

**Optional** (per D-3-28): a third function `nowAmsterdamISO()` may be added for non-body uses (logs, return surfaces). Planner discretion. If shipped, it MUST NOT appear in any request body.

---

### `src/server.ts` (modified — append registration calls)

**Analog (within file):** existing `registerEntriesList(server, client);` calls at lines 36-41.

**Existing pattern** (server.ts:36-41):
```typescript
registerMe(server, client);
registerOrganisations(server, client);
registerProjects(server, client);
registerTasks(server, client);
registerEntriesList(server, client);
registerTimerStatus(server, client);
```

**Phase 3 additions** (note `config` is now passed for write tools — function signature already includes `_config: KeepingConfig`; rename to `config` since it becomes used):
```typescript
registerAddEntry(server, client, config);
registerUpdateEntry(server, client, config);
registerDeleteEntry(server, client, config);
registerStartTimer(server, client, config);
registerStopTimer(server, client, config);
registerResumeTimer(server, client, config);
// Optional 7th if keeping_get_entry ships (Claude's Discretion):
// registerGetEntry(server, client);
```

**Imports section** (server.ts:15-20):
```typescript
import { registerEntriesList } from "./tools/entries-list.js";
import { registerMe } from "./tools/me.js";
import { registerOrganisations } from "./tools/organisations.js";
import { registerProjects } from "./tools/projects.js";
import { registerTasks } from "./tools/tasks.js";
import { registerTimerStatus } from "./tools/timer-status.js";
```
Append six (or seven) imports following the same alphabetical-ish pattern.

---

### `src/keeping/client.ts` (modified — add `requestWithHeaders<T>` + 204 fix)

**Analog (within file):** `request<T>` at lines 164-194 and `rawFetch` at lines 196-222.

**Modification 1: 204-tolerant rawFetch (D-3-27 — FIRST task of the phase)**

Current `rawFetch` lines 216-222:
```typescript
if (!res.ok) {
  const text = await res.text().catch(() => "");
  throw new KeepingApiError(res.status, sanitiseBody(text, this.token));
}
return res.json();
```

Smallest fix: insert one branch before `return res.json()`:
```typescript
if (!res.ok) {
  const text = await res.text().catch(() => "");
  throw new KeepingApiError(res.status, sanitiseBody(text, this.token));
}
if (res.status === 204) return null;  // D-3-27: DELETE returns empty body.
return res.json();
```

**Modification 2: New `requestWithHeaders<T>` method (D-3-18)**

Analog: `request<T>` at lines 164-194. The new method mirrors it but returns `{ body, headers }` and reaches into `Response.headers` instead of dropping them.

Cleanest refactor: change `rawFetch` to return `{ body, headers }` (or add a parallel `rawFetchWithHeaders`); update `request<T>` to discard headers; add `requestWithHeaders<T>` that keeps them. The throttle MUST wrap the new path (see Pitfall 3 in research).

**Sketch:**
```typescript
async requestWithHeaders<T>(
  method: "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<{ body: T; headers: Headers }> {
  // Mirror request<T>'s throttle + pRetry wrapping; for non-GET methods
  // shouldRetry returns false anyway, so retries never fire — wrap for
  // surface consistency.
  // Refactor rawFetch to also expose headers, or add rawFetchWithHeaders.
  // ... implementation ...
}
```

**Critical invariants from research:**
- MUST share `this.throttle(...)` with `request<T>` (Pitfall 3).
- MUST wrap in `pRetry` for surface consistency even though writes don't retry.
- Headers instance has case-insensitive `.get("x-server-time-ms")` per WHATWG.

---

### `src/keeping/types.ts` (modified — append interfaces)

**Analog (within file):** `KeepingUser`, `KeepingOrg` interfaces at lines 19-51.

**Existing pattern** (types.ts:38-51):
```typescript
export interface KeepingOrg {
  id: number;
  name: string;
  url: string;
  current_plan: string;
  features: {
    timesheet: "times" | "hours";
    projects: boolean;
    tasks: boolean;
    breaks: boolean;
  };
  time_zone: string;  // D-3-29: underscore, NOT "timezone"
  currency: string;
}
```

**Phase 3 appends** (verbatim shapes from research §"Verified entry_create_request shape" and §"Verified POST 201 response"):
```typescript
// Request body for POST /{orgId}/time-entries (times-mode org).
export interface EntryCreateBody {
  date: string;                    // YYYY-MM-DD
  purpose: "work" | "break" | "special_leave" | "unpaid_leave" | "statutory_leave" | "sick_leave" | "work_reduction" | "trip";
  project_id?: number;
  task_id?: number;
  note?: string;
  tag_ids?: number[];
  external_references?: Array<{
    id: string; type: "generic_work_reference"; name: string; url?: string;
  }>;
  start?: string;                  // HH:mm (per D-3-28, NOT ISO)
  end?: string;                    // HH:mm
  hours?: number;                  // hours-mode only
}

// PATCH /{orgId}/time-entries/{entry_id} accepts the same shape minus user_id/date/purpose (immutable).
export type EntryEditBody = Omit<EntryCreateBody, "date" | "purpose">;

// Response wrapper for POST/PATCH/stop/resume.
export interface TimeEntryResponse {
  time_entry: Record<string, unknown>;  // raw inner entry — drift-tolerant per D-34
  meta?: {
    created_additional_time_entry_ids?: number[];
    modified_existing_time_entry_ids?: number[];
    deleted_existing_time_entry_ids?: number[];
  };
}
```

Planner refines exact field optionality and the `meta` shape during plan write.

---

### `test/tools/<tool>.test.ts` files (test harness)

**Analog:** `test/tools/timer-status.test.ts` (the canonical Phase 2.5 skeleton).

**buildClient helper pattern** (timer-status.test.ts:9-20):
```typescript
async function buildClient(mockClient: Partial<KeepingClient>) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTimerStatus(server, mockClient as KeepingClient);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}
```

Phase 3 variant — write tools take a `config` parameter, so `buildClient` needs an extra arg:
```typescript
async function buildClient(
  mockClient: Partial<KeepingClient>,
  config: KeepingConfig = { KEEPING_TOKEN: "x", KEEPING_REQUIRE_CONFIRM: true, KEEPING_LOG_LEVEL: "error" },
) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerAddEntry(server, mockClient as KeepingClient, config);
  // ... rest same as timer-status.test.ts
}
```

**Imports** (timer-status.test.ts:1-7):
```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import type { KeepingClient } from "../../src/keeping/client.js";
import { KeepingApiError, KeepingAuthError, MultiOrgError } from "../../src/keeping/errors.js";
import { registerTimerStatus } from "../../src/tools/timer-status.js";
```

**Mock-client pattern — happy path** (timer-status.test.ts:46-50):
```typescript
const mockClient: Partial<KeepingClient> = {
  resolveOrgId: async () => "47666",
  get: async <T>(): Promise<T> => ({ time_entry: entry }) as T,
};
```

Phase 3 write tools mock the relevant verb. For add-entry:
```typescript
const calls: { method: string; path: string; body: unknown }[] = [];
const mockClient: Partial<KeepingClient> = {
  resolveOrgId: async () => "47666",
  organisations: async () => [{ id: 47666, features: { timesheet: "times", ... }, ... }] as KeepingOrg[],
  post: async <T>(path: string, body: unknown): Promise<T> => {
    calls.push({ method: "POST", path, body });
    return { time_entry: { id: 999 }, meta: {} } as T;
  },
};
```

**Path-assertion pattern** (timer-status.test.ts:202-223):
```typescript
expect(calls.length).toBe(1);
expect(calls[0]).toBe("/47666/time-entries/last");
expect(calls[0]).not.toContain("?");
expect(calls[0]).not.toContain("/organisations/");
```

**Error-path pattern** (timer-status.test.ts:156-174 — D-25 verbatim assertion):
```typescript
const mockClient: Partial<KeepingClient> = {
  resolveOrgId: async () => "47666",
  get: async <T>(): Promise<T> => { throw new KeepingAuthError(); },
};
// ...
expect(res.isError).toBe(true);
expect(content[0]?.text).toBe(
  "Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.",
);
```

**Annotations-assertion pattern** (timer-status.test.ts:225-239):
```typescript
const list = await client.listTools();
const tool = list.tools.find((t) => t.name === "keeping_timer_status");
expect(tool?.annotations?.readOnlyHint).toBe(true);
expect(tool?.annotations?.destructiveHint).toBe(false);
expect(tool?.annotations?.idempotentHint).toBe(true);
expect(tool?.annotations?.openWorldHint).toBe(true);
```

Phase 3 write-tool variant (booleans flipped per D-3-11):
```typescript
expect(tool?.annotations?.readOnlyHint).toBe(false);
expect(tool?.annotations?.destructiveHint).toBe(true);
expect(tool?.annotations?.idempotentHint).toBe(false);
expect(tool?.annotations?.openWorldHint).toBe(true);
```

**Per-tool minimum test set (D-3-22):**
1. Dry-run (env=true, no confirm) → preview, zero post/patch/delete on mock.
2. Confirm path (env=true, confirm:true) → API called exactly once, exact method+path+body.
3. Env-false escape hatch (env=false) → API called even without confirm.
4. MultiOrgError → flows through `toIsErrorContent` with D-27 verbatim text.
5. 401 KeepingAuthError → flows through `toIsErrorContent` with D-25 verbatim text.
6. 4xx validation → flows through `toIsErrorContent` (definite-fail).
7. 5xx server error → ambiguous-failure envelope with "outcome unknown" text (D-3-16).
8. Path assertion — exact string match.
9. Annotation assertion (one per tool) — D-3-11 four booleans.

Tool-specific additions:
- delete-entry: assert extra GET on preview returns `would_delete` verbatim; assert `client.delete` was never called (D-3-23).
- start-timer: strict `Object.keys` on posted body excludes `end` AND `hours`; return shape is `{ timer_id }` (D-3-24).
- stop-timer: mock `requestWithHeaders` to return `Headers` with `X-Server-Time-Ms: "1718202000000"`; assert value surfaced as elapsed anchor (D-3-25).
- add-entry / update-entry / start-timer: DST default-date test — inject `now = new Date("2026-06-12T22:30:00Z")`, assert preview body `{ date: "2026-06-13", start: "00:30" }` (D-3-26 + D-3-28).

---

### `test/keeping/write-gate.test.ts` (centralised gate behavior — NEW)

**No direct analog.** Closest shape: `test/keeping/errors.test.ts` (pure-helper unit test). Test plan per D-3-17 + D-3-22:

1. `previewOrCall` with `requireConfirm:true, confirm:false` returns `{ would_post: { method, url: "https://api.keeping.nl/v1${path}", body } }` — no client method called.
2. `previewOrCall` with `requireConfirm:true, confirm:true` for each of POST/PATCH/DELETE calls the corresponding client method exactly once with the same path/body.
3. `previewOrCall` with `requireConfirm:false, confirm:false` (env-false escape hatch) calls client method.
4. `would_post.url` is the FULL URL with base (D-3-02 assertion).
5. `would_post.body` is `null` when `req.body` omitted (DELETE case).
6. `classifyAmbiguous` returns true for: KeepingApiError with status 500/502/503, `Error` with `name === "AbortError"`, raw `TypeError`.
7. `classifyAmbiguous` returns false for: KeepingApiError status 400/401/403/404/422, MultiOrgError, KeepingAuthError, plain `new Error("x")`.

### `test/keeping/date.test.ts` (NEW)

**No direct analog.** Plan per D-3-14 + D-3-15 + D-3-28:

1. `todayInAmsterdam(new Date("2026-06-12T22:30:00Z"))` → `"2026-06-13"` (summer rollover, CEST).
2. `todayInAmsterdam(new Date("2026-12-15T23:30:00Z"))` → `"2026-12-16"` (winter rollover, CET).
3. `nowInAmsterdamHHMM(new Date("2026-06-12T22:30:00Z"))` → `"00:30"` (DST-correct HH:mm).
4. `nowInAmsterdamHHMM(new Date("2026-12-15T23:30:00Z"))` → `"00:30"` (winter HH:mm — same digits, different UTC offset).
5. `process.versions.icu` truthy (smoke test per D-3-14).
6. Smoke: `Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(...)` matches `/^\d{4}-\d{2}-\d{2}$/`.

---

## Shared Patterns

### Authentication / Org Resolution (REUSED)

**Source:** `src/keeping/client.ts:117-142` (`resolveOrgId`) and `src/keeping/client.ts:107-113` (`organisations`).

**Apply to:** Every write tool's handler — first line is `const orgId = await client.resolveOrgId(input.organisation_id);`. Tools that need mode-switching (add-entry, update-entry — see D-3-08) ALSO call `const orgs = await client.organisations();` to read `features.timesheet`.

**Multi-org error propagation** (timer-status.test.ts:176-200 — verbatim):
```typescript
expect(content[0]?.text).toBe(
  "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: 100 (Acme), 200 (Beta).",
);
```

### Error Handling — SAFE-04 Envelope (REUSED + EXTENDED)

**Source:** `src/keeping/errors.ts:58-64` (`toIsErrorContent`).

**Existing pattern** (errors.ts:58-64):
```typescript
export function toIsErrorContent(err: unknown): {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
} {
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: "text", text: message }] };
}
```

**Phase 3 extension** — write tools insert ONE branch BEFORE `toIsErrorContent` per D-3-16:
```typescript
} catch (err) {
  if (classifyAmbiguous(err)) {
    const msg = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `${AMBIGUOUS_TEXT} (${msg})` }] };
  }
  return toIsErrorContent(err);
}
```
The structural seam is the SAME `try/catch` arm timer-status.ts uses for its 404-graceful-empty branch — the classifier is the write-tool equivalent of the read-tool 404 special-case.

### Validation — Zod 4 Input Schemas (REUSED)

**Source:** `src/tools/entries-list.ts:32-52` (Zod 4 with `.regex`, `.optional`, `.describe`, `.default`).

**Apply to:** Every write tool's input schema. Note the project uses Zod 4 (`^4.4.3` per `package.json`); import path is `import { z } from "zod"` (NOT `zod/v4`).

**Date-regex pattern** (entries-list.ts:38-39):
```typescript
from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD (calendar date, not UTC timestamp)"),
```

**HH:mm pattern** for write tools (per D-3-28):
```typescript
start: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?(am|pm)?$/i).optional()
  .describe("HH:mm in org timezone; ignored if org timesheet is 'hours' mode"),
```

### Strict Wrapper Extractor (REUSED for any new wrapper read)

**Source:** `src/tools/timer-status.ts:58-65` (verbatim).

**Apply to:** Any new wrapper extraction (`start-timer.ts` for `timer_id` derivation; potential `keeping_get_entry`):

```typescript
function extractTimeEntry(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== "object") return null;
  const candidate = (raw as Record<string, unknown>).time_entry;
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  return candidate as Record<string, unknown>;
}
```

**Three-clause guard breakdown** (locked invariant):
1. `raw === null || typeof raw !== "object"` — reject scalars and null.
2. `candidate === null || typeof candidate !== "object"` — reject missing key / null value.
3. `Array.isArray(candidate)` — reject bare arrays (D-2.5-05a post-fix lock).

Drift-loud per D-2.5-05a. Test 11/12 in `test/tools/timer-status.test.ts:241-286` enforce the Array.isArray guard verbatim and are templates for analogous Phase 3 wrapper-extractor tests.

### Token Sanitisation (REUSED, no Phase 3 change)

**Source:** `src/keeping/errors.ts:52-54` (`sanitiseBody`) + `src/logger.ts:20` (emit-time redaction).

**Apply to:** Implicit — write tools NEVER see raw response text. `rawFetch` runs `sanitiseBody` before throwing `KeepingApiError`; `logger` runs `.replaceAll(token, "***")` at emit time. Phase 3 adds zero new sanitisation surface.

### Throttle (REUSED — Pitfall 3 critical)

**Source:** `src/keeping/client.ts:69` (`pThrottle({ limit: 120, interval: 60_000 })`).

**Apply to:** `requestWithHeaders<T>` MUST share `this.throttle(...)` with `request<T>`. Bypassing via a parallel un-throttled rawFetch path leaks past the 120 req/min cap (Pitfall 3 in research). Test should be a sanity check that the throttle wraps both methods.

### No Retry on Writes (REUSED, no Phase 3 change)

**Source:** `src/keeping/client.ts:186-192` (`shouldRetry`).

**Apply to:** All write tools — `shouldRetry` returns `false` for any non-GET method, so writes never auto-retry. Tools MUST NOT add their own retry loop. The ambiguous-failure envelope is the only post-failure surface (D-3-16).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/keeping/write-gate.ts` | service/utility | request-response (delegation) | First write-gate helper in the codebase. Use research sketch §"Pattern 3" verbatim. |
| `src/keeping/date.ts` | utility (pure) | transform (Date → string) | First date-formatting helper. `Intl.DateTimeFormat` is single-file pure utility; no analog. Use research sketch §"Pattern 5" verbatim. |
| `test/keeping/write-gate.test.ts` | test | transform | New domain. Follow plan in `## Pattern Assignments` above. |
| `test/keeping/date.test.ts` | test | transform | New domain. Follow plan in `## Pattern Assignments` above. |

---

## Metadata

**Analog search scope:**
- `src/tools/*.ts` — all six existing read tools inspected (timer-status, entries-list, me, projects, organisations, tasks).
- `src/keeping/*.ts` — client.ts, errors.ts, types.ts, logger.ts inspected in full.
- `test/tools/*.test.ts` — timer-status.test.ts (canonical write-precedent skeleton — InMemoryTransport + Partial<KeepingClient> mock + path/annotation/error assertions) and entries-list.test.ts inspected.
- `test/keeping/*.test.ts` — client.test.ts inspected for fetch-mock shape (relevant for the `rawFetch` 204 fix verification).
- `test/fixtures/*.json` — `time-entry-response.sample.json` confirmed as structural reference.

**Files scanned:** 14 source + test files read in full; one fixture inspected; CONTEXT.md (542 lines) + RESEARCH.md (940 lines) loaded as primary input.

**Pattern extraction date:** 2026-06-12

**Key patterns identified:**
- All tools follow the `registerXxx(server, client[, config])` registration pattern with Zod input schema, `registerTool` body with `annotations` block, and `async (input) => { try { ... } catch (err) { ... toIsErrorContent(err) } }` envelope.
- The Phase 2.5 `timer-status.ts` is the canonical write-precedent skeleton — write tools add (a) `config` parameter, (b) `previewOrCall` routing, (c) `classifyAmbiguous` catch branch BEFORE `toIsErrorContent`, (d) flipped annotation booleans.
- Strict wrapper extractor (timer-status.ts:58-65) is the ONLY analog for write-tool response wrapper reads — three-clause guard (non-null object, non-null inner object, NOT array). Lock verbatim.
- `KeepingClient.rawFetch` at client.ts:216-222 has the 204-tolerance fix slot — one-line branch insertion is the smallest possible change (D-3-27).
- Test skeleton (timer-status.test.ts:9-20 `buildClient` + InMemoryTransport linked pair + `Partial<KeepingClient>` mock) is the verbatim template for all six new write-tool test files.
