---
slug: phase-2-api-contract
status: resolved
trigger: Plan 02-06 human-verify probe revealed Phase 2 KeepingClient + tools point at wrong endpoints, wrong response shapes, and use a wrong anonymisation denylist. CONTEXT.md decisions D-32, D-34, D-35 contradict OpenAPI ground truth captured at .planning/research/keeping-openapi.json.
created: 2026-06-11
updated: 2026-06-11
resolved: 2026-06-11
---

# Debug: phase-2-api-contract

## Symptoms

### Expected behavior
- `npm run probe-live` against a real `KEEPING_TOKEN` returns 200 on `/users/me`, `/time-entries`, `/projects`, `/tasks`, `/timer`.
- Phase 2 production code (`src/keeping/client.ts`, `src/tools/*.ts`) hits real Keeping endpoints and returns shapes that match the live API.
- Anonymisation denylist redacts every field that actually carries PII / business-confidential data when probe-live writes the committed fixture.
- D-32 (no timer in v1), D-34 (`KeepingUser` shape), D-35 (anonymise denylist) are consistent with reality.

### Actual behavior
- Every `/v1/organisations/<id>/...` path returns 404 against the live API. Only `GET /v1/organisations` succeeds.
- `GET /v1/users/me` returns 404 (global path). Org-scoped path `/v1/organisations/<id>/users/me` also 404.
- `KeepingUser` is typed `{ id, name?, email? }` but the real `/users/me` payload is `{ user: { id, first_name, surname, code, role, state } }` — no `name`, no `email`, plus a wrapper key.
- D-35 anonymise denylist names six keys (`description`, `project_name`, `task_name`, `client_name`, `user_name`, `user_email`) that do NOT appear in real responses. Real sensitive fields are `note`, `first_name`, `surname`.
- D-32 deferred TIMER-01 to Phase 3 on the assumption that v1 has no timer resource. OpenAPI proves `/time-entries/last` + `ongoing: bool` flag + `POST /{id}/stop` + `POST /{id}/resume` provide the full lifecycle today.
- 62/62 unit tests pass — because mocks share the same wrong contract as the code under test. Tests provide false confidence.

### Error messages
- `{ "error": { "message": "We kunnen de pagina die je zoekt niet vinden." } }` — Dutch 404 envelope from `api.keeping.nl/v1` on every guessed path.
- Pre-fix probe crash: `[probe-live] FAILED: orgs.map is not a function` (now resolved in commit `3fcf1f5` — `/organisations` returns a `{ organisations: [...] }` wrapper, not a bare array).

### Timeline
Never worked. The wrong contract was baked in from Phase 2 Plan 02-01 (Plan-checker locked D-32/D-34/D-35 before the live probe was run). Bug surfaced 2026-06-11 during Plan 02-06's first execution of `npm run probe-live` against a real `KEEPING_TOKEN`.

### Reproduction
```
$env:KEEPING_TOKEN = "<real token>"
npm run probe-live
```
With the current `probe-live` patched to use ground-truth paths (`/v1/{org_id}/users/me`, `/v1/{org_id}/time-entries?date=YYYY-MM-DD`, `/v1/{org_id}/time-entries/last`) every request returns 200. With the original Phase 2 code paths (`/v1/organisations/{org_id}/...`, `time_entries` underscore, `from/to` range) every request returns 404.

## Ground truth

- OpenAPI spec mirrored at `.planning/research/keeping-openapi.json`
- Hand-curated delta + next-session plan at `.planning/research/LIVE-API-FINDINGS.md`
- Discovery commit: `f4b6771 discover(02-06): capture Keeping v1 API ground truth, halt before client rewrite`

Key contract corrections (full list in `LIVE-API-FINDINGS.md`):

| Surface | Phase 2 assumed | Real |
|---|---|---|
| Base path template | `/v1/organisations/{org_id}/...` | `/v1/{org_id}/...` |
| Collection name | `time_entries` (underscore) | `time-entries` (hyphen) |
| List range params | `?from=&to=` | `?date=YYYY-MM-DD` (single day) |
| Multi-day range | (none) | `GET /{org_id}/report/time-entries` |
| `/users/me` shape | flat `{ id, name?, email? }` | `{ user: { id, first_name, surname, code, role, state } }` |
| Timer resource | absent (D-32 deferred) | `/time-entries/last` + `ongoing` + `/stop` + `/resume` |
| Sensitive fields | `description, project_name, task_name, client_name, user_name, user_email` | `note, first_name, surname` |

## Files affected

- `src/keeping/client.ts` — `me()` path and any future `request()` callers that assume `/organisations/{org_id}/` prefix
- `src/keeping/types.ts` — `KeepingUser` shape
- `src/tools/me.ts` — passes through `client.me()`; recheck whether to unwrap `{ user: ... }` envelope
- `src/tools/projects.ts` — path prefix
- `src/tools/tasks.ts` — path prefix
- `src/tools/entries-list.ts` — path prefix, query param name, single-vs-multi-day decision
- `scripts/probe-live.ts` — `ANONYMISE_KEYS` (currently disabled fixture write behind `PROBE_WRITE_FIXTURE=1` env guard)
- `test/keeping/client.test.ts` and `test/tools/*.test.ts` — all mocks use wrong shapes
- `test/scripts/anonymise.test.ts` — Test 9 asserts the wrong six-key denylist
- `.planning/REQUIREMENTS.md` — TIMER-01 status
- `.planning/phases/02-read-tools-schema-discovery/02-CONTEXT.md` — D-32, D-34, D-35 revisions

## Current Focus

hypothesis: The Phase 2 contract decisions (D-32, D-34, D-35) plus the `/v1/organisations/{org_id}/...` path strategy in `KeepingClient.request()` were authored without live-API evidence. The OpenAPI spec is the canonical truth. Fixing requires a coordinated rewrite of: client request path strategy, `KeepingUser` typing, four tools and their mocks, and the anonymise denylist — all behind a CONTEXT.md decision revision so the locked-decision audit trail stays clean.
test: Compare each affected file against `.planning/research/keeping-openapi.json` and `.planning/research/LIVE-API-FINDINGS.md` §6. Rerun `npm run probe-live` against a real token; every endpoint must return 200. Reset `PROBE_WRITE_FIXTURE=1` and confirm the regenerated fixture contains no real `note` / `first_name` / `surname` text.
expecting: All five `keeping_*` MCP tools execute end-to-end against the live API without 404s; `KeepingUser` consumers reference `first_name`/`surname` (or a deliberately raw `{ user: {...} }` pass-through); D-32, D-34, D-35 are either revised in CONTEXT.md or formally superseded; anonymise denylist redacts every observed-sensitive field; tests use mocks that match the OpenAPI shapes.
next_action: RESOLVED 2026-06-11. CONTEXT D-32/D-34/D-35 revised in-place (D-32-R/D-33-R/D-34-R/D-35-R). Production source + mocks rewritten atomically in this debug session. Awaiting a real-token `npm run probe-live` re-run against the new code to commit the regenerated fixture (`PROBE_WRITE_FIXTURE=1`) and remove the env-gate in a cleanup commit.

## Evidence

- timestamp: 2026-06-11T12:00:00Z | probe-live initial run against real token failed with `orgs.map is not a function`. Root cause: `/organisations` returns `{ organisations: [...] }` wrapper. Fixed in commit `3fcf1f5`.
- timestamp: 2026-06-11T13:12:00Z | Patched probe-live with multi-base discovery probes (`api.keeping.nl/{v1, /, openapi.json, swagger.json, docs}`, plus tenant subdomain `red-square.keeping.nl` with 6 prefixes × 5 paths). Every nested path 404. Only `/v1/organisations` returned 200.
- timestamp: 2026-06-11T14:30:00Z | Found Redoc OpenAPI loader at `https://developer.keeping.nl/` referencing `/openapi.json`. Downloaded spec; ground truth captured at `.planning/research/keeping-openapi.json`. 22 endpoint paths under `/{organisation_id}/...` template.
- timestamp: 2026-06-11T15:00:00Z | Rerun probe with ground-truth paths: `/v1/47666/users/me` → 200, `/v1/47666/time-entries?date=2026-06-11` → 200, `/v1/47666/time-entries/last` → 200. `users/me` returned `{ user: { id, first_name, surname, code: null, role: "administrator", state: "active" } }`. `time-entries/last` returned `{ time_entry: { ..., note: "<real Dutch business text>", ongoing: false, ... } }`. Real `note` field text scrubbed from repo before commit per security review.
- timestamp: 2026-06-11T15:15:00Z | Discovery committed (`f4b6771`). Phase 2 production source untouched. Fixture and `LIVE-API.md` write gated behind `PROBE_WRITE_FIXTURE=1` until D-35 revised. 62/62 tests still pass against wrong-shape mocks.
- timestamp: 2026-06-11T16:15:00Z | Coordinated rewrite landed in this debug session. CONTEXT D-32/D-33/D-34/D-35 revised in-place with `-R` suffix decisions. `KeepingClient.me()` now resolves `orgId` first and calls `/{orgId}/users/me`; `KeepingClient.request<T>()` prepends only `BASE`; tools build the `/{orgId}/<path>` segment. `KeepingUser` matches observed wrapped shape. `KeepingOrg` matches OpenAPI nested-features shape with `id: number`; `resolveOrgId()` coerces by `String(o.id)` at the comparison boundary. `MultiOrgError` accepts `id: string | number`. `keeping_list_entries` dispatches single-day to `/{orgId}/time-entries?date=` and multi-day to `/{orgId}/report/time-entries?from=&to=`. ANONYMISE_KEYS broadened to defensive 15-key set per D-35-R; numeric ids preserved verbatim. All 67/67 tests pass (was 62 — five new tests cover D-34-R path strategy + D-35-R drift guard + limit truncation + user_id propagation). Typecheck clean. Biome lint clean. PROBE_WRITE_FIXTURE gate retained pending a fresh real-token re-run.

## Eliminated

- hypothesis: Token is too narrowly scoped (causing 404 instead of 403). Eliminated by `/users/me` returning 200 under the correct path with the same token — scope is fine, paths were wrong.
- hypothesis: API lives on tenant subdomain (`red-square.keeping.nl`). Eliminated: probed 6 prefixes × {`/users/me`, `/me`} and 6 prefixes × 5 entries paths — all 404. The subdomain hosts the web UI, not the API.
- hypothesis: API uses `time_entries` underscore. Eliminated by OpenAPI spec showing `time-entries` hyphen on every reference; live probe of `time-entries` returned 200.
- hypothesis: D-32 was right and v1 has no timer. Eliminated — OpenAPI exposes `/time-entries/last`, `ongoing: bool`, `/stop`, `/resume`.

## Resolution

root_cause: Contract-level decision error. D-32 (timer absent), D-34 (`KeepingUser` shape + path strategy), and D-35 (anonymise denylist) were locked in Phase 2 Plan 02-01 before the live probe ran. Every assumption — `/v1/organisations/{org_id}/...` path template, `time_entries` underscore URL, `from/to` range query, flat `{id, name?, email?}` user shape, six-key anonymise denylist — contradicts the published OpenAPI spec. The mocks shared the wrong contract, so 62/62 tests passed against a wholly fictional API. The bug never manifested until the first live probe ran on 2026-06-11.

fix: Coordinated rewrite landed in this debug session. (1) CONTEXT D-32/D-33/D-34/D-35 revised in-place with `-R` suffix decisions citing OpenAPI ground truth. (2) `KeepingClient.request<T>(method, path)` now prepends only `BASE`; tools build the `/{orgId}/<path>` segment themselves. (3) `KeepingClient.me()` resolves `orgId` first and calls `/{orgId}/users/me`. (4) `KeepingUser` typed to the observed wrapped shape `{ user: { id, first_name, surname, code, role, state } }`. (5) `KeepingOrg` typed to OpenAPI shape with `id: number` and nested `features.{timesheet, projects, tasks, breaks}`; `resolveOrgId()` coerces via `String(o.id)` at the comparison boundary. (6) `MultiOrgError` accepts `id: string | number` to render numeric ids cleanly. (7) `keeping_list_entries` dispatches single-day (`from === to`) to `/{orgId}/time-entries?date=` and multi-day to `/{orgId}/report/time-entries?from=&to=`; top-level normalisation accepts both `time_entries` and legacy `entries` wrapper keys; `limit` becomes a client-side post-fetch truncation guard (Keeping does not paginate). (8) `keeping_projects` / `keeping_tasks` drop the `/organisations/` prefix. (9) `ANONYMISE_KEYS` becomes a defensive 15-key set per D-35-R: confirmed-sensitive (`note`, `first_name`, `surname`) + identity defence-in-depth (`code`, `email`, `name`, `user_name`, `user_email`, `client_name`, `project_name`, `task_name`, `description`) + behavioural-leakage (`purpose`, `external_references`); numeric ids are preserved as opaque tokens. (10) Drift guard test rewritten to assert the new denylist exactly. (11) TIMER-01 split as Phase 2.5 (status-only) + Phase 3 (start/stop/resume) per D-32-R / D-33-R — TIMER-01 is no longer "deferred from v1".

verification:
- `npm run typecheck` → clean.
- `npm run lint` (biome) → clean.
- `npx vitest run` → 67/67 tests pass (was 62; five new tests cover D-34-R path strategy, D-35-R drift guard, limit truncation, user_id propagation, and `me()` URL assertion).
- Pending: a fresh `npm run probe-live` against a real `KEEPING_TOKEN` to (a) confirm `keeping_me`, `keeping_organisations`, `keeping_projects`, `keeping_tasks`, `keeping_list_entries` all return 200, (b) regenerate the fixture under `PROBE_WRITE_FIXTURE=1` and confirm anonymise() scrubs every sensitive field, (c) commit the fixture and remove the env-gate in a cleanup commit.

files_changed:
- `.planning/phases/02-read-tools-schema-discovery/02-CONTEXT.md` (D-32/D-33/D-34/D-35 revisions)
- `.planning/REQUIREMENTS.md` (TIMER-01 disposition)
- `src/keeping/client.ts` (path strategy, me() org-scoping, numeric-id coercion)
- `src/keeping/types.ts` (KeepingUser + KeepingOrg shapes)
- `src/keeping/errors.ts` (MultiOrgError accepts numeric id)
- `src/tools/me.ts` (wrapped-user pass-through)
- `src/tools/projects.ts` (path prefix)
- `src/tools/tasks.ts` (path prefix)
- `src/tools/entries-list.ts` (single/multi-day dispatch + wrapper normalisation + limit truncation)
- `scripts/probe-live.ts` (ANONYMISE_KEYS to D-35-R defensive set; meTenantProbes / defaultLastWeek removed; LIVE-API.md no longer embeds raw bodies)
- `test/keeping/client.test.ts` (routed fetch mocks + numeric-id orgs + D-34-R me-path assertion)
- `test/tools/me.test.ts` (wrapped-user payload + numeric ids)
- `test/tools/projects.test.ts` (path assertion)
- `test/tools/tasks.test.ts` (path assertion)
- `test/tools/entries-list.test.ts` (single-day + multi-day path assertions, limit truncation, user_id propagation)
- `test/tools/organisations.test.ts` (real org shape with nested features)
- `test/scripts/anonymise.test.ts` (D-35-R 15-key drift guard + numeric-id preservation)
