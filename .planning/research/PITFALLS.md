# Pitfalls Research

**Domain:** TypeScript MCP server — Keeping time-tracking API integration (billable hours, public npm, Windows-first user)
**Researched:** 2026-06-08
**Confidence:** HIGH (all critical pitfalls verified against official sources, real GitHub issues, and MCP spec)

---

## Critical Pitfalls

### Pitfall 1: stdout Pollution Corrupts the JSON-RPC Stream

**What goes wrong:**
Any call to `console.log()`, `process.stdout.write()`, or any library that defaults to stdout will inject non-JSON bytes into the MCP wire protocol. The client receives malformed data, cannot parse the JSON-RPC envelope, and reports a cryptic parse error — never "something wrote to stdout". The connection drops silently or loops on errors. This is the single most common MCP server failure mode and it catches almost every first-time implementor.

Real case: `claude-flow` issue #835 — startup banner messages written to stdout via `printSuccess()` broke all MCP clients until the wrapper was made completely silent and all logging was routed through the spawned server's stderr.

**Why it happens:**
`console.log` writing to stdout is deeply ingrained in Node.js development habits. Third-party libraries (database drivers, HTTP clients, debug utilities) may also write to stdout. Startup banners are the most common offender: they print before any tool call and permanently corrupt the stream.

**How to avoid:**
- Replace every `console.log` with `console.error`. `console.error` writes to stderr, which the MCP client ignores.
- Use a structured logger (e.g., `pino`) explicitly configured with `destination: process.stderr`.
- Audit all third-party dependencies for stdout writes during initialization.
- Add a CI smoke test: pipe a minimal `initialize` request to the built binary and assert stdout contains only valid JSON-RPC (zero non-JSON lines). Any extraneous line is a red build.
- Use the MCP SDK's `server.sendLoggingMessage()` for runtime log data that should be visible to the client in a structured way.

**Warning signs:**
- Client reports "unexpected token" or parse errors on startup.
- MCP inspector shows the server connecting then immediately disconnecting.
- Any library that has a "verbose mode" or startup banner.

**Phase to address:** Foundation / scaffolding phase (Phase 1) — get the logging discipline right before writing any tool logic.

---

### Pitfall 2: KEEPING_TOKEN Leaks into Tool Responses, Error Messages, or Logs

**What goes wrong:**
The personal access token is a Bearer credential with write scope over billable hours. If it appears in a tool response (even as part of an error), in an MCP log notification, or in a stack trace, it will be stored in the LLM conversation context and potentially surfaced to the user or persisted to disk.

The highest-risk vector is `fetch` error handling: `response.headers`, the `request` property on `TypeError` objects, and formatted error strings from HTTP libraries can all include the `Authorization` header value. A pattern like:

```typescript
throw new Error(`HTTP ${response.status}: ${JSON.stringify(response)}`)
```

may serialize the full response object including request headers, embedding the token in the error message.

Other leak vectors:
- `console.error(err)` where `err` carries a `config.headers` property (axios pattern).
- Stack traces captured as strings and returned in tool `content` arrays.
- Debug logging that dumps the full `RequestInit` object.
- README or test fixtures using real-looking token strings that users copy as-is.

**Why it happens:**
Developers want useful error messages and log full objects. The default `Error` serialization in Node.js does not strip properties, and fetch response objects carry request metadata.

**How to avoid:**
- Never log or return the `Authorization` header value. Create a wrapper `httpClient` that builds headers from the token once and never exposes the built `RequestInit`.
- Sanitize error objects before surfacing them: extract only `status`, `statusText`, and a safe subset of the response body.
- Write a unit test that verifies no tool response or error path contains the string value of a test token (`FAKE_TOKEN_FOR_TESTS`).
- In README examples, use clearly fake tokens: `kp_live_XXXXXXXXXXXXXXXXXXXX` — a lookalike format that is obviously not a real credential.
- For npm publish: use the `files` whitelist in `package.json` (see Pitfall 9) rather than `.npmignore`, to guarantee `.env` and test fixture files are never shipped.

**Warning signs:**
- Any error handling code that does `JSON.stringify(requestOptions)` or `JSON.stringify(error)`.
- Axios/node-fetch error objects with `.config` or `.request` properties being logged.
- Test files checked into the repo with `KEEPING_TOKEN=` lines.

**Phase to address:** Foundation phase (Phase 1) — build the HTTP client wrapper with sanitization before any tool is implemented.

---

### Pitfall 3: Duplicate Billable Entries on Transient Network Retry

**What goes wrong:**
`keeping_add_entry` is not idempotent — two identical POST requests create two separate time entries. If the network times out after the Keeping API has processed the request but before the response arrives, and the MCP client or calling code retries, the user ends up with duplicate billable hours that may flow into their Jortt invoice.

The MCP tool annotation `idempotentHint: false` (the default) correctly signals non-idempotency to clients, but this relies on clients honouring the hint. A client that retries all tool calls on timeout will still double-post.

**Why it happens:**
Network reliability assumptions are too optimistic. A timeout after a write is ambiguous — success or failure is unknown. Retrying to be safe creates the duplicate.

**How to avoid:**
- **Do not retry write verbs (`POST`/`PATCH`/`DELETE`) on timeout or network error.** Return an error to the LLM explaining the outcome is unknown. Let the user verify via `keeping_list_entries` before attempting again.
- Set `idempotentHint: false` and `destructiveHint: true` on all write tools so clients with annotation awareness do not auto-retry.
- The tool response for a timeout/ambiguous state should say: "The request may or may not have succeeded. Use `keeping_list_entries` to verify before retrying."
- If Keeping ever exposes an idempotency key header (check during API exploration), wire it through with a UUID generated per tool call invocation.

**Warning signs:**
- Any `catch` block on a write call that falls through to a retry.
- Retry logic that does not distinguish between read and write HTTP methods.

**Phase to address:** Write tools phase (Phase 3) — implement from day one, not retrofitted.

---

### Pitfall 4: The "Confirm" Field Can Be Bypassed by the Model Itself

**What goes wrong:**
The dry-run design uses `confirm: true` in the tool input schema to gate actual writes. The intention is that the user explicitly reviews a preview and then the model passes `confirm: true`. But a model that reads the tool description may reason: "the user wants this entry logged; I should pass `confirm: true` to complete it" — bypassing the review step entirely. This is not a theoretical attack; it is a normal LLM reasoning pattern when the description or system prompt implies a goal of completing the action.

OWASP's MCP Security Cheat Sheet explicitly calls this out: "Ensure the confirmation UI cannot be bypassed by LLM-crafted responses."

**Why it happens:**
The `confirm: true` field is visible in the tool's JSON Schema and is part of the LLM's context. A helpfully-worded description like "Pass confirm: true to execute" is an invitation for the model to do exactly that in a single call when it infers the user's intent is to log hours.

**How to avoid:**
- **Separate the preview and write into two distinct tool calls** (or a two-phase exchange). `keeping_preview_entry` returns a rendered preview; `keeping_add_entry` is a different tool that requires explicit user text in the conversation, not just `confirm: true` in the schema.
- If the single-tool-with-confirm design is kept: phrase the description to emphasise that `confirm` must be the user's explicit instruction: "Do not pass confirm: true unless the user has reviewed the preview in this conversation and explicitly said to proceed."
- Consider honouring the MCP Elicitation spec (draft as of June 2025) once Claude Code supports it — the server can pause and request structured user confirmation through the client UI rather than relying on schema fields.
- Never describe `confirm` as something the model "should" pass automatically.

**Warning signs:**
- Tool description uses phrases like "set confirm: true to execute" without qualifying who should trigger this.
- In manual testing, the model completes an add-entry cycle in a single message with no preview shown.

**Phase to address:** Write tools phase (Phase 3) — design the tool schema and description before implementation.

---

### Pitfall 5: Timezone Mismatch Between Claude's Date Input and Keeping's Storage

**What goes wrong:**
The user is in the Netherlands (CET/CEST, UTC+1/+2). Node.js runs in UTC by default unless `TZ` is set. Claude may pass dates in various formats depending on the system prompt and user locale. If `2026-06-08` is treated as a bare date and Keeping interprets it against a different timezone offset, an entry may land on the wrong day — particularly dangerous at day boundaries (an entry created at 23:00 local time on Tuesday might be logged as Wednesday).

The reverse is also possible: Keeping returns timestamps in one timezone, the server parses them naively in UTC, and `keeping_list_entries` shows entries one day off.

**Why it happens:**
Dutch API, UTC server, European user. The three timezones can all differ. Bare `YYYY-MM-DD` date strings are ambiguous when combined with timezone-aware storage. `Date.toISOString()` always returns UTC, which shifts the calendar date for users east of UTC.

**How to avoid:**
- Treat `day` (or `date`) fields as calendar dates, not timestamps. Pass them as `YYYY-MM-DD` strings, never as UTC-normalised ISO timestamps.
- Do not call `.toISOString()` on a date and pass the string — this converts to UTC and may shift the day.
- Validate the Keeping API response format during the schema-iteration phase: confirm whether the API stores and returns plain dates or UTC timestamps, and whether it applies server-side timezone conversion.
- Expose the date to the user in the preview and ask them to confirm it looks right before submitting.
- Document in the README that users should pass dates as `YYYY-MM-DD`.

**Warning signs:**
- Any use of `new Date(dateString).toISOString()` before sending a date to the API.
- Test entries landing one day off from the calendar date passed.

**Phase to address:** Schema-iteration phase (Phase 2, during API exploration) and write tools phase (Phase 3).

---

### Pitfall 6: Windows — npx Does Not Execute Without `cmd /c` Wrapper in Claude Code

**What goes wrong:**
On Windows, `npx` resolves to `npx.cmd`, a batch script. Node's `child_process.spawn()` does not invoke `.cmd` files as executables — it expects a binary. Claude Code uses spawn internally to start MCP servers. If the README config snippet shows:

```json
{ "command": "npx", "args": ["-y", "keeping-mcp"] }
```

this will fail silently or throw `ENOENT` on Windows. The server never starts, and Claude Code shows no useful error.

This is a documented, actively-filed bug in Claude Code (issue #20061) and is not going to be fixed transparently on the client side.

**Why it happens:**
Unix-first documentation. The author runs Windows 11, but most MCP documentation examples assume macOS/Linux. The cmd wrapper requirement is not obvious and is not part of the MCP spec.

**How to avoid:**
- In the README, provide a Windows-specific config block alongside the Unix block:

  ```json
  // Windows
  { "command": "cmd", "args": ["/c", "npx", "-y", "keeping-mcp"] }

  // macOS / Linux
  { "command": "npx", "args": ["-y", "keeping-mcp"] }
  ```

- Test the full cold-start `npx` flow on Windows 11 before publishing.
- Use forward slashes in any path arguments — they work on all platforms and avoid JSON string escaping issues.
- The bin script itself (`#!/usr/bin/env node`) is fine — Windows npm handles the shebang via a generated `.cmd` wrapper in `node_modules/.bin`. The issue is in the Claude Code config, not the script itself.

**Warning signs:**
- README only has one config snippet with bare `"command": "npx"`.
- No Windows CI job or manual smoke test.
- First GitHub issue from a Windows user: "server not connecting".

**Phase to address:** Distribution phase (Phase 5) — README and publish prep.

---

## Moderate Pitfalls

### Pitfall 7: Rate Limit Exhaustion via Redundant Lookup Calls

**What goes wrong:**
If every write tool call first fetches `/users/me` + `/organisations` + `/projects` to resolve identifiers, a single `keeping_add_entry` might consume 3–4 of the 120 req/min limit. In a long session with multiple calls, this depletes the quota quickly and causes 429s.

**How to avoid:**
- Cache read-only lookups in memory with a TTL: organisations and projects rarely change (5-minute TTL is conservative and safe). Users/me can be cached for the session lifetime.
- On write tool calls, only re-fetch if the cache entry is expired or if the user explicitly forces a refresh.
- Invalidate project/task cache immediately after a successful write (in case the write modified a task's state).
- Handle 429 by honouring the `Retry-After` header if present; otherwise use exponential backoff with jitter (cap at 30 seconds). For write verbs, do not retry automatically (see Pitfall 3).

**Warning signs:**
- No caching module present in the codebase.
- Every tool handler contains a direct fetch to `/organisations`.

**Phase to address:** Phase 2 (read tools / API integration layer).

---

### Pitfall 8: Tool Annotations Set Incorrectly on Write Tools

**What goes wrong:**
The MCP spec defaults are: `destructiveHint: true`, `idempotentHint: false`. If these are not explicitly set on write tools, the defaults are correct — but if a developer sets them incorrectly (e.g., `destructiveHint: false` on `keeping_delete_entry` to reduce friction), MCP clients that honour annotations may skip confirmation dialogs for destructive operations.

Conversely, if `idempotentHint: true` is accidentally set on `keeping_add_entry`, clients may auto-retry on failure, creating duplicate entries.

**How to avoid:**
- `keeping_add_entry`, `keeping_update_entry`, `keeping_delete_entry`: explicitly set `destructiveHint: true`, `idempotentHint: false`.
- `keeping_list_entries`, `keeping_me`, `keeping_organisations`, `keeping_projects`, `keeping_tasks`: explicitly set `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`.
- Never leave annotations unset on write tools — rely on explicit, reviewed configuration.

**Warning signs:**
- Any write tool with `idempotentHint: true`.
- `keeping_delete_entry` with `destructiveHint: false`.

**Phase to address:** Phase 3 (write tools).

---

### Pitfall 9: npm Publish Ships .env Files or Test Fixtures

**What goes wrong:**
If a `.npmignore` file is added to the project, npm uses it instead of `.gitignore` — they are not cumulative. Any file excluded by `.gitignore` but not mentioned in `.npmignore` will be published. A `.env` file with a real token, or a test fixture containing a token string, becomes public on the npm registry.

**How to avoid:**
- Use the `files` whitelist in `package.json` instead of `.npmignore`. The `files` array is a positive list of what to include; everything else is excluded by default.
- Example: `"files": ["dist/", "bin/", "README.md", "LICENSE"]`.
- Run `npm publish --dry-run` before the first real publish and audit the file list.
- Never add `.npmignore` — the whitelist approach is strictly safer.

**Warning signs:**
- `.npmignore` file exists in the repo.
- `files` field absent from `package.json`.
- `.env` or `*.test.ts` files appear in `npm pack --dry-run` output.

**Phase to address:** Phase 5 (distribution/publish prep).

---

### Pitfall 10: MCP Registry Version Is Immutable — Getting Semver Wrong on First Publish

**What goes wrong:**
The MCP Registry treats each published version as immutable. If `server.json` ships with `"version": "0.1.0"` but `package.json` says `"1.0.0"`, or if a version range like `"^1.0.0"` is used (rejected by the registry), the publish pipeline fails or lands with a mismatched version that cannot be corrected short of publishing a new version.

Prerelease versions (`1.2.3-1`) published after the corresponding release (`1.2.3`) will not be marked "latest" due to semver ordering — confusing for users.

**How to avoid:**
- Lock `server.json` and `package.json` to the same version string, automated by the release pipeline.
- In GitHub Actions, derive `server.json`'s version from `package.json` at publish time (e.g., `jq -n --arg v "$(node -p \"require('./package.json').version\")" '{version: $v, ...}'`).
- Use strict semver (`MAJOR.MINOR.PATCH`). Avoid date-based versions for the first release.
- Never use version ranges in `server.json` — they are prohibited and will fail validation.
- Treat `1.0.0` as the first public release; use `0.x.y` for pre-public iteration so a patch to `1.0.0` does not require a major bump.

**Warning signs:**
- `server.json` version is hardcoded and different from `package.json`.
- First publish test done without `--dry-run`.

**Phase to address:** Phase 5 (distribution / release pipeline).

---

### Pitfall 11: GitHub Actions OIDC Misconfig Silently Falls Back to Classic Token Auth

**What goes wrong:**
npm trusted publishing via OIDC requires: `id-token: write` permission on the job, npm CLI >= 11.5.1, an exact match between the Trusted Publisher configuration (org name, repo name, workflow filename, environment name) and the actual workflow identity. Any mismatch causes npm to reject the OIDC token with a 404 — and if an `NPM_TOKEN` secret happens to also be present in the environment, npm silently falls back to classic token auth. The OIDC setup appears to work but is not actually being used.

Common mismatches: workflow calls a reusable workflow (`workflow_call`), which changes the workflow identity; `id-token: write` is granted to the parent job but not propagated to the child; the environment name in the Trusted Publisher config differs from what the Actions environment is called.

**How to avoid:**
- Set `id-token: write` on the specific job that runs `npm publish`, not only on the workflow level.
- Do not use reusable workflows (`workflow_call`) for the publish step unless you understand the identity propagation rules.
- Verify the Trusted Publisher configuration at `https://www.npmjs.com/package/<name>/access` matches exactly.
- Confirm npm CLI version: add `run: npm install -g npm@latest` before the publish step.
- Set `--provenance` flag or add `"publishConfig": { "provenance": true }` to `package.json`.
- After first publish, verify provenance attestation appears on the npm package page.

**Warning signs:**
- Publish succeeds but provenance badge is absent on npm.
- `NPM_TOKEN` secret exists in the repo alongside OIDC config (creates ambiguous auth path).

**Phase to address:** Phase 5 (release pipeline).

---

### Pitfall 12: Schema Drift — Keeping Changes a Field Name, Server Breaks Silently

**What goes wrong:**
The Keeping API schema is not fully documented (the SPA docs were not parseable in prior research). Field names for the time-entry POST body are confirmed by iteration against real entries, not from a published OpenAPI spec. If Keeping renames `day` to `date` or changes the `hours` field to `duration_minutes`, the server will silently send wrong payloads — no error if Keeping ignores unknown fields, or mysterious 422s if it enforces strict validation.

**How to avoid:**
- After Phase 2 schema iteration, write a Zod schema that mirrors the confirmed Keeping wire format. Use this schema to parse all API responses (not just to validate tool inputs).
- Add a runtime assertion test: `keeping_list_entries` → parse response through the Zod schema → fail fast on unknown/missing fields. Surface this as a "schema health check" tool or a startup diagnostic.
- Log (to stderr) when the response shape does not match expectations — do not swallow the error silently.
- Monitor Keeping's developer documentation URL for changes; check it on each release cycle.
- Pin the schema iteration results as a test fixture (`tests/fixtures/time-entry-response.json`) so regressions are caught in CI.

**Warning signs:**
- No Zod schema for response parsing, only for input validation.
- API integration tests that only assert on status codes, not field names.

**Phase to address:** Phase 2 (API exploration / schema iteration).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `console.log` for debug output | Fast during development | Corrupts stdout permanently in production | Never — replace with `console.error` from day one |
| No in-memory cache for `/organisations` and `/projects` | Simpler code | Rate limit exhaustion in real sessions | Never in released code — add in Phase 2 |
| Hardcode `server.json` version separately from `package.json` | Trivial initially | Manual sync errors, immutable wrong version in registry | Never — automate from first publish |
| Single-tool confirm-by-schema pattern for writes | Fewer tools to document | LLM bypass of confirmation gate | Acceptable only if MCP Elicitation is wired as a future upgrade path |
| No `.npmignore`, no `files` whitelist | Zero config | Any sensitive file added to repo gets published | Never — add `files` whitelist before first publish |
| Retry all HTTP errors including 5xx on writes | Simpler retry logic | Duplicate billable entries | Never for write verbs |
| Generic error forwarding from fetch | Useful stack traces | Token leaks in error messages | Never — sanitize in Phase 1 HTTP client wrapper |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Keeping API — time entries | Using `Date.toISOString()` to format the `day` field | Pass plain `YYYY-MM-DD` strings; never UTC-normalise a calendar date |
| Keeping API — time entries | Treating a 200 response to a POST as definitely success and retrying on no response | Treat ambiguous timeout outcomes as unknown; require user verification |
| Keeping API — rate limits | Fetching `/organisations` on every tool call | Cache with 5-minute TTL; invalidate on write |
| Keeping API — auth | Logging the full `RequestInit` object in error handlers | Strip `Authorization` header before any serialization |
| MCP stdio transport | Any `console.log` call anywhere in the import chain | Audit all imports; configure all loggers to stderr before wiring up transport |
| Claude Code on Windows | `"command": "npx"` in MCP config | Wrap as `"command": "cmd", "args": ["/c", "npx", ...]` |
| npm trusted publishing | `id-token: write` only at workflow level | Grant per-job; verify exact match in npm Trusted Publisher config |
| MCP Registry | Hardcoded version in `server.json` out of sync with `package.json` | Derive `server.json` version from `package.json` in the release pipeline |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 lookup on every write call | 3–4 API calls per tool invocation; 429 errors in long sessions | In-memory cache with TTL for read-only endpoints | Any session with more than ~30 tool calls |
| Cold start npx with full `node_modules` | 3–5 second startup delay on first `npx keeping-mcp` | Bundle to single file with `esbuild`; reduces 3.4 MB to ~400 KB and startup from ~1500 ms to ~600 ms | Always visible; worse on slow npm registry connections |
| No backpressure on stdin | Message framing issues with large response payloads | Use `StdioServerTransport` from the official SDK — it handles framing correctly; do not implement raw stdin parsing | Edge case with very large `keeping_list_entries` responses |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Token value in tool response or error message | Token stored in LLM context, persisted to conversation history on disk | Sanitize all error objects before returning; test with a known fake token that must not appear in any output |
| `.env` file in npm publish | Public credential exposure on npm registry | Use `files` whitelist in `package.json`; never use `.npmignore` |
| README example with real-looking token | User copies it as-is, or token is a real one the author accidentally pasted | Use obviously-fake pattern: `kp_live_XXXXXXXXXXXXXXXXXXXX` |
| `KEEPING_TOKEN` in git history | Permanent credential leak even after rotation | `.gitignore` entry from day one; `git-secrets` or GitHub secret scanning pre-push hook |
| Unguarded write tools without dry-run | Accidental billable entry creation | `KEEPING_REQUIRE_CONFIRM=true` default; preview-first architecture |
| LLM-driven `confirm: true` bypass | Write executed without human review | Separate preview and execute into distinct interaction turns; document that `confirm` is a user-controlled gate |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| README doesn't front-load the dry-run workflow | Users assume writes happen immediately and are either over-cautious or get burned | Lead the README "How it works" section with the preview → confirm → write flow |
| macOS-only Claude Code config snippet | Windows users (starting with this user) get silent failures | Provide both `cmd /c npx` (Windows) and bare `npx` (macOS/Linux) snippets with clear OS labels |
| No explanation of `KEEPING_REQUIRE_CONFIRM=false` danger | Power users may disable the guard without understanding the risk | Add a prominent warning block in the README: "Setting this to false means writes happen immediately without preview" |
| Token setup buries the "enable developer features" step | Users get 401 errors without knowing they need to enable the feature in Keeping preferences first | Make "Step 1: Enable developer access in Keeping" the very first setup instruction |
| Tool error messages include raw HTTP status without context | "422 Unprocessable Entity" is unhelpful | Map known status codes to human-readable explanations ("The entry date format was not accepted — use YYYY-MM-DD") |

---

## "Looks Done But Isn't" Checklist

- [ ] **stdout clean**: Run `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' | node dist/index.js` — first line of stdout must be valid JSON-RPC; if there are any non-JSON lines first, you have a stdout leak.
- [ ] **Token redaction**: Search output of all tool calls and error paths for the string `FAKE_TOKEN_FOR_TESTS` — it must never appear.
- [ ] **npm files whitelist**: Run `npm pack --dry-run` and audit the file list — `.env`, `*.test.*`, `tests/`, `.github/` must be absent.
- [ ] **Windows npx config**: The README must contain `"command": "cmd"` for the Windows config block.
- [ ] **Write tool annotations**: `keeping_add_entry`, `keeping_update_entry`, `keeping_delete_entry` must have `idempotentHint: false` and `destructiveHint: true` confirmed in the tool definition.
- [ ] **Dry-run default**: With no env vars set, calling `keeping_add_entry` must return a preview and not POST to the API. Verify with a real token against a test organisation.
- [ ] **Cache present**: The `keeping_organisations` and `keeping_projects` responses must be served from cache on the second call in the same session — verify with a network interceptor in tests.
- [ ] **OIDC publish**: After first publish, the npm package page must show a provenance attestation. If it doesn't, OIDC is not working.
- [ ] **Date sanity**: Pass `2026-12-31` (a plausible real date) as the entry date — verify the stored entry in Keeping shows December 31, not January 1 (UTC overflow).

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Token leaked in npm package | HIGH | Rotate token immediately in Keeping preferences; unpublish the npm version (`npm unpublish <name>@<version>`) within 72-hour window; audit git history for additional occurrences; force-push a clean history if token is in commits |
| Duplicate billable entries created | MEDIUM | `keeping_list_entries` to identify duplicates; `keeping_delete_entry` to remove; document the incident to validate why no-retry-on-write is correct |
| stdout pollution discovered post-publish | MEDIUM | Patch release with `console.log` → `console.error` substitution; bump patch version; the fix is typically one-line but the detection is delayed |
| Wrong version published to MCP registry | LOW | Publish a new correct version; the old version cannot be deleted but will be superseded as "latest" by the new one |
| OIDC publish regression (falls back to token) | LOW | Debug the permission and trust configuration; next release will use correct OIDC path; no rollback needed |
| Schema drift from Keeping API change | MEDIUM | Zod parse failure surfaces in CI fixture tests; update the schema and re-run schema-iteration protocol; bump minor version |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| stdout pollution corrupts JSON-RPC stream | Phase 1 — Foundation | CI smoke test: pipe `initialize` request, assert stdout is valid JSON only |
| KEEPING_TOKEN leak in responses/logs | Phase 1 — Foundation | Unit test: no tool response contains fake token string |
| Duplicate entries on retry | Phase 3 — Write tools | Integration test: timeout simulation must not create two entries |
| Confirm field bypass by model | Phase 3 — Write tools | Manual test: single-message flow must not post without explicit user confirmation |
| Timezone mismatch on date fields | Phase 2 (schema iteration) + Phase 3 | Integration test: entry date in Keeping matches date passed in YYYY-MM-DD |
| Windows `cmd /c` wrapper missing | Phase 5 — Distribution | Manual Windows 11 smoke test before publish |
| Rate limit exhaustion | Phase 2 — Read tools | In-session test: 10 consecutive tool calls must not exceed 10 API requests |
| Incorrect tool annotations | Phase 3 — Write tools | Code review checklist item on every write tool PR |
| npm ships .env files | Phase 5 — Distribution | `npm pack --dry-run` output review in CI |
| MCP registry version mismatch | Phase 5 — Distribution | Automated: version derived from `package.json` in publish workflow |
| OIDC misconfig | Phase 5 — Distribution | Post-publish: verify provenance attestation on npm package page |
| Schema drift from Keeping | Phase 2 + ongoing | Zod response schema in CI fixture tests; fails on unexpected field changes |

---

## Sources

- MCP stdio stdout corruption (real issue): https://github.com/ruvnet/claude-flow/issues/835
- MCP debugging guide: https://chatforest.com/guides/debugging-mcp-servers/
- MCP tool annotations specification: https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/
- MCP tool annotation defaults and write tool risks: https://chatforest.com/guides/mcp-tool-annotations-explained/
- MCP schema vulnerabilities (confirm bypass, unguarded destructive ops): https://agenticcontrolplane.com/blog/mcp-schema-vulnerabilities
- OWASP MCP Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html
- MCP Elicitation (human-in-the-loop, draft spec June 2025): https://dev.to/kachurun/mcp-elicitation-human-in-the-loop-for-mcp-servers-m6a
- Idempotent agent patterns / no-retry for writes: https://labs.adaline.ai/p/reliable-tool-using-ai-agents-production
- npm files whitelist vs .npmignore danger: https://medium.com/@jdxcode/for-the-love-of-god-dont-use-npmignore-f93c08909d8d
- Node.js security: avoid publishing secrets: https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/security/avoid_publishing_secrets.md
- npm trusted publishing OIDC pitfalls: https://philna.sh/blog/2026/01/28/trusted-publishing-npm/
- MCP registry versioning (immutable versions, range prohibition): https://modelcontextprotocol.io/registry/versioning
- Windows `cmd /c` wrapper requirement for Claude Code: https://github.com/SuperClaude-Org/SuperClaude_Framework/issues/390
- Claude Code Windows MCP issues (issue #20061): https://github.com/anthropics/claude-code/issues/20061
- Windows Claude Code MCP setup guide: https://github.com/BunPrinceton/claude-mcp-windows-guide
- HTTP 429 / Retry-After handling: https://zuplo.com/learning-center/http-429-too-many-requests-guide
- MCP caching strategy: https://fast.io/resources/mcp-server-caching/
- esbuild cold start reduction: https://www.chrisarmstrong.dev/posts/package-aws-lambda-nodejs-functions-individually-with-esbuild-for-faster-cold-start
- StdioServerTransport handles message framing: https://ts.sdk.modelcontextprotocol.io/v2/documents/Documents.Server_Guide.html
- Timezone handling in REST APIs: https://www.moesif.com/blog/technical/timestamp/manage-datetime-timestamp-timezones-in-api/

---
*Pitfalls research for: TypeScript MCP server — Keeping time-tracking API (keeping-mcp)*
*Researched: 2026-06-08*
