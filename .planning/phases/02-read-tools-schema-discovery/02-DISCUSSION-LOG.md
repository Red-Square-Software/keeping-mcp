# Phase 2: Read Tools & Schema Discovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 2-Read Tools & Schema Discovery
**Areas discussed:** Identity cache strategy, Multi-org resolution flow, Timer endpoint probe mechanics, Schema discovery + fixture lock

---

## Identity Cache Strategy

### TTL policy

| Option | Description | Selected |
|--------|-------------|----------|
| Forever-for-process (Recommended) | Cache for server lifetime. SAFE-05 wording matches this. Org list rarely changes mid-session; short-lived MCP server (per Claude session) keeps the risk window small. | ✓ |
| 5-min TTL per Pitfall 7 | Refresh every 5 min. Slightly fresher; adds a tiny scheduler. Useful if you expect very long sessions where orgs/users could change. | |
| Event-driven, no expiry | Cache until explicit refresh tool call. Predictable; user controls staleness; needs a `keeping_refresh_cache` tool. | |

**User's choice:** Forever-for-process

### Cache scope

| Option | Description | Selected |
|--------|-------------|----------|
| Only /users/me + /organisations (Recommended) | Matches SAFE-05 verbatim. /projects + /tasks stay fresh because Phase 3 writes might mutate them (Pitfall 8 cache-invalidation trap avoided). | ✓ |
| Add /projects + /tasks too | Bigger savings per Pitfall 7 (N+1 lookups). Adds invalidate-on-write wiring later in Phase 3. | |
| All four, with Phase-3-aware invalidate hook | Cache everything; expose `invalidate("projects")` for Phase 3 to call after a successful write. More code now but cleaner Phase 3. | |

**User's choice:** Only /users/me + /organisations

### Cache home

| Option | Description | Selected |
|--------|-------------|----------|
| Inside KeepingClient (Recommended) | Private fields on the client instance. Simplest. One source of truth; tools only touch the client API (e.g. client.me(), client.organisations()). | ✓ |
| Separate IdentityResolver module | src/keeping/identity.ts wraps the client with a memo. Cleaner layering if cache grows complex; minor overhead now. | |
| You decide | Default to whichever the planner judges cleaner once tool layout drafted. | |

**User's choice:** Inside KeepingClient

### 401 handling

| Option | Description | Selected |
|--------|-------------|----------|
| Surface as isError per tool call (Recommended) | SAFE-04 already says HTTP errors come back as isError:true. Treat 401 the same way — message: "Keeping rejected the token; check KEEPING_TOKEN and restart". Server stays up; user fixes env + restarts. | ✓ |
| Exit the server process | Hard fail: log to stderr + process.exit(1). Forces restart. Cleaner state but rougher UX in middle of session. | |
| Invalidate cache + retry once with fresh fetch | Treat as possible cache poisoning. Costs an extra request; doesn't actually help with token revocation. Mostly noise. | |

**User's choice:** Surface as isError per tool call

---

## Multi-org Resolution Flow

### KEEPING_ORG_ID semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Hard pin — always wins, ignore tool input (Recommended) | Env var beats per-tool organisation_id. Simplest mental model. Matches AUTH-05 wording. | |
| Default — tool input overrides | Env var is just the default; passing organisation_id on a tool call still works. More flexible; mild risk of accidental cross-org write in Phase 3. | ✓ |
| Alias — resolves before auto-detect, but tool input also overrides | Like (2) but explicit; same flexibility. | |

**User's choice:** Default — tool input overrides
**Notes:** Reverses the recommended option; resolveOrgId precedence locked in D-28 as: input arg → KEEPING_ORG_ID → single-org auto-detect → isError with options list.

### Multi-org-no-id behaviour

| Option | Description | Selected |
|--------|-------------|----------|
| isError + list of orgs in message (Recommended) | Return isError:true with text "Multiple organisations available. Pass organisation_id (or set KEEPING_ORG_ID). Options: ...". Self-documenting; lets the LLM pick. | ✓ |
| isError, plain message, no list | Just "Multiple orgs; pass organisation_id". User runs keeping_organisations themselves. | |
| Pick first org alphabetically + warn | Auto-pick + note in response. Risky — wrong-org write in Phase 3 is exactly the failure mode AUTH-05 guards. | |

**User's choice:** isError + list of orgs in message

### Resolution logic location

| Option | Description | Selected |
|--------|-------------|----------|
| client.resolveOrgId(input?) (Recommended) | Single method on KeepingClient: takes optional input, returns resolved id. Tools just call it. One source of truth; identical behaviour everywhere. | ✓ |
| Per-tool inline | Each tool does its own resolve. More obvious in tool code; risk of divergence as tools grow. | |
| Server-level middleware (wrap registerTool) | Wrap each tool registration to inject resolved org_id. Cleaner separation; more SDK plumbing. | |

**User's choice:** client.resolveOrgId(input?)

### org_id validation

| Option | Description | Selected |
|--------|-------------|----------|
| Validate against cached orgs (Recommended) | If KEEPING_ORG_ID or tool input doesn't match any of the user's orgs, return isError early. Catches typos before they hit Keeping; aligns with "only scope writes to authenticated user" constraint. | ✓ |
| Trust input, let API 404 | Pass through; surface API error. Simpler; slightly worse UX. | |
| Validate only on writes (Phase 3), trust on reads | Reads can't hurt much. Adds a validate flag; conditional logic. | |

**User's choice:** Validate against cached orgs

---

## Timer Endpoint Probe Mechanics

### Probe trigger

| Option | Description | Selected |
|--------|-------------|----------|
| One-shot npm script (Recommended) | scripts.probe-timer in package.json. User runs `npm run probe-timer` once with their KEEPING_TOKEN; output captured + committed as fixture/note. Server itself does NOT probe at startup. | ✓ |
| Server startup probe | Client constructor probes once on first /organisations call; caches the result. Adds a request per cold start; reveals the path inside the server too. | |
| Dedicated keeping_diagnostic tool | Read tool that probes on demand. User/LLM invokes; result returned + cached. Useful for ongoing health checks; weakest "phase-deciding" signal because it runs only when called. | |

**User's choice:** One-shot npm script
**Notes:** Renamed to `npm run probe-live` later in the discussion because the same script also captures the schema (folded under D-35).

### Probe endpoints

| Option | Description | Selected |
|--------|-------------|----------|
| Try 3 best-guess paths, record all responses (Recommended) | GET /timers, GET /timers/current, GET /time_entries?running=true (Toggl-style fallback). Decides Phase 3 with hard data. | ✓ |
| Try one, escalate if 404 | Start with /timers; if 404, try /timers/current; if 404, done. | |
| Just /timers/current | Simplest. Risk: false negative if Keeping uses a different name. | |

**User's choice:** Try 3 best-guess paths, record all responses

### Probe result destination

| Option | Description | Selected |
|--------|-------------|----------|
| New .planning/research/LIVE-API.md + REQUIREMENTS update (Recommended) | Capture probe transcripts in LIVE-API.md. Update REQUIREMENTS.md TIMER-01 status. | ✓ |
| Inline note in PROJECT.md Context | Append a line under Context. Risk of getting lost when other Context edits happen. | |
| Phase 2 SUMMARY.md only | Capture in phase summary. Less discoverable when starting Phase 3. | |

**User's choice:** New LIVE-API.md + REQUIREMENTS update

### Phase 2 timer tool scope

| Option | Description | Selected |
|--------|-------------|----------|
| Wait for Phase 3 (Recommended) | Phase 2 is read+identity+metadata only per ROADMAP. Ship timer status with start/stop in Phase 3 for annotation consistency. | ✓ |
| Ship keeping_timer_status in Phase 2 | Read-only (readOnlyHint:true) so fits Phase 2 scope. Slightly stretches Phase 2 boundary. | |
| Add as a separate plan in Phase 2 if probe non-404 | Conditional plan: only created if probe shows a path. Most pure but adds branching. | |

**User's choice:** Wait for Phase 3

---

## Schema Discovery & Fixture Lock

### Response shape

| Option | Description | Selected |
|--------|-------------|----------|
| Pass through raw API JSON, no field renaming (Recommended) | READ-02 verbatim. Wrap in { entries: <raw array> } and return. Zod validates only shape, not field names. | ✓ |
| Zod-parsed with permissive schema + .passthrough() | Apply a best-guess Zod schema that allows extra fields. Risks hiding rename if .passthrough drops a renamed key into the unknown bucket. | |
| Both — return raw plus a parsed_warning if schema mismatches | Belt + suspenders. More code; same outcome in practice. | |

**User's choice:** Pass through raw API JSON

### Capture mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Same probe-timer script captures it (Recommended) | Extend the npm script: after timer probe, also call /time_entries for the day, write raw response to test/fixtures/time-entry-response.json. One ritual; everything happens with real token, no manual steps. | ✓ |
| Separate npm run discover-schema script | Dedicated script: calls keeping_list_entries equivalent against any existing real entry. User runs it once after timer probe. | |
| Manual: user calls keeping_list_entries from Claude Code, pastes JSON | User makes the call themselves, captures + commits. Lowest tooling cost; most error-prone. | |

**User's choice:** Same probe-timer script captures it
**Notes:** Script renamed `npm run probe-live` because it now does both timer probe + schema capture.

### Commit policy (first answer)

| Option | Description | Selected |
|--------|-------------|----------|
| test/fixtures/time-entry-response.json + LIVE-API.md notes (Recommended) | Real entry JSON committed as fixture. LIVE-API.md captures human notes. Phase 3 tests load fixture directly. | |
| Only LIVE-API.md notes, anonymise fixture | Strip ids/descriptions from fixture before commit. Safer if real entry contains client names. Adds a scrub step. | |
| Nothing committed — capture stays in user's local LIVE-API.md (gitignored) | Phase 3 plans read from same local file. Cleanest privacy; loses CI replay value. | ✓ |

**User's choice (first):** Nothing committed
**Notes:** Reversed by the next turn — user said "Ok dan doe toch maar capture committen." Final commit policy is D-37: anonymised fixture committed, raw stays local + gitignored.

### CI drift guard / commit form

| Option | Description | Selected |
|--------|-------------|----------|
| Synthetic fixture committed (hand-written from notes) (Recommended) | test/fixtures/*.sample.json contains a fake-but-shape-accurate entry. Phase 3 Zod parse tests run on it. Pitfall 12 caught; no real data shipped. | |
| No CI drift test — rely on probe re-run | User re-runs probe-live periodically. Manual; lighter. | |
| Phase 3 decides | Defer. | |

**User's choice (free-text):** "Ok dan doe toch maar capture committen." (= commit the live capture after all)

### Capture form

| Option | Description | Selected |
|--------|-------------|----------|
| Anonymised (Recommended) | Probe script scrubs description / project names / client names to placeholders. Field names + enum values + ids preserved. Repo stays public-safe. | ✓ |
| Raw real entry | Commit whatever the API returns. Simplest. Only safe if test entry has no client-confidential text. | |
| Both — raw local, anonymised committed | Belt + suspenders. Raw stays local for human reference. | |

**User's choice:** Anonymised
**Notes:** Locked as D-35. Raw capture written to gitignored `.planning/research/.live-capture-raw.json` per D-37; anonymised version committed to `test/fixtures/time-entry-response.sample.json`.

---

## Claude's Discretion

- Exact `p-retry` + `p-throttle` wiring order inside `KeepingClient` constructor
- Pagination strategy default (`page` / `per_page` per FEATURES research; iterate if probe reveals cursor scheme)
- `keeping_list_entries` default `limit` value (200 per FEATURES recommendation)
- Tool description copy for the 5 read tools (planner drafts; must include timezone note per Pitfall 5)
- Phase 2 CI smoke upgrade — MCP `initialize` JSON-RPC handshake assertion (D-15 deferred from Phase 1; planner places it)
- HTTP error envelope parsing — loose, surface `errors[0].message` or `message` or raw body
- Anonymisation field-list extension if probe reveals additional human-named fields

## Deferred Ideas

- `keeping_refresh_cache` tool — revisit if forever-cache becomes friction
- `keeping_timer_status` — Phase 3 alongside start/stop
- MCP Elicitation flow — depends on Claude Code client support (UXv2-04)
- `outputSchema` on read tools — after wire format locked (v1.x)
- Late-night session heuristic — Phase 3 `keeping_add_entry` only (UXv2-01)
- ESLint plugin to ban `Date.toISOString()` on date fields — until first regression
