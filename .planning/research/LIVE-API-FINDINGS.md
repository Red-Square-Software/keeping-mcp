# Live API Findings — Keeping v1 ground truth

**Source:** `https://developer.keeping.nl/openapi.json` (Redoc-rendered docs at
`https://developer.keeping.nl/`). Spec mirrored in
`.planning/research/keeping-openapi.json`.

**Probed:** 2026-06-11 against `https://api.keeping.nl/v1` with a real
`KEEPING_TOKEN` (org `47666`, "Red Square"). Raw capture intentionally NOT
committed (contained one real `note` field with confidential business text);
gitignored at `.planning/research/.live-capture-raw.json`.

This document is the canonical reference for re-aligning Phase 2 code with the
real API. It supersedes the path/shape assumptions baked into
`02-CONTEXT.md`, the RESEARCH doc, and the executed plans 02-01..02-06.

---

## 1. Base URL & path pattern

- **Server base** (per OpenAPI `servers[0].url`):
  `https://api.keeping.nl/v1`
- **All authenticated endpoints** live under the path template
  `/{organisation_id}/...` — NOT `/organisations/{organisation_id}/...`.
- The single global endpoint at this base is `GET /organisations` (list).
- The org payload exposes a tenant URL (e.g.
  `https://red-square.keeping.nl`), but that hostname does NOT serve the API
  — verified by probing every plausible prefix (`/v1`, `/api/v1`, `/api`,
  `/api/v2`, `/v2`, ``) against `/users/me` and `/time-entries`. All 404.

## 2. Complete endpoint inventory (from OpenAPI)

```
POST   /oauth/token
GET    /organisations

GET    /{organisation_id}/users
GET    /{organisation_id}/users/me
GET    /{organisation_id}/users/{user_id}

GET    /{organisation_id}/time-entries           # single day, ?date=YYYY-MM-DD
GET    /{organisation_id}/time-entries/last
GET    /{organisation_id}/time-entries/{entry_id}
POST   /{organisation_id}/time-entries/{entry_id}/resume
POST   /{organisation_id}/time-entries/{entry_id}/stop

GET    /{organisation_id}/report
GET    /{organisation_id}/report/time-entries    # multi-day, multi-user range

GET    /{organisation_id}/projects
GET    /{organisation_id}/projects/{project_id}
POST   /{organisation_id}/projects/{project_id}/archive
POST   /{organisation_id}/projects/{project_id}/restore

GET    /{organisation_id}/tasks
GET    /{organisation_id}/tasks/{task_id}
POST   /{organisation_id}/tasks/{task_id}/archive
POST   /{organisation_id}/tasks/{task_id}/restore

GET    /{organisation_id}/clients
GET    /{organisation_id}/clients/{client_id}

GET    /{organisation_id}/tags
```

Endpoint name uses **hyphens**: `time-entries` (NOT `time_entries`).

## 3. Verified response shapes (200 OK)

### `GET /organisations`

```json
{
  "organisations": [
    {
      "id": <number>,
      "name": "<string>",
      "url": "https://<slug>.keeping.nl",
      "current_plan": "<string>",
      "features": {
        "timesheet": "times" | "...",
        "projects": <bool>,
        "tasks": <bool>,
        "breaks": <bool>
      },
      "timezone": "Europe/Amsterdam",
      "currency": "EUR"
    }
  ]
}
```

Wrapper key `organisations`. Numeric `id`. `KeepingClient.organisations()`
already handles the wrapper after the post-probe patch (commit `3fcf1f5`).

### `GET /{organisation_id}/users/me`

```json
{
  "user": {
    "id": <number>,
    "first_name": "<string>",
    "surname": "<string>",
    "code": null | "<string>",
    "role": "administrator" | "...",
    "state": "active" | "..."
  }
}
```

Wrapper key `user`. **No `name`. No `email`.** Phase 2's `KeepingUser` typing
(`{ id, name?, email? }`) is wrong on both optional fields.

### `GET /{organisation_id}/time-entries?date=YYYY-MM-DD`

```json
{
  "time_entries": [
    {
      "id": <number>,
      "user_id": <number>,
      "date": "YYYY-MM-DD",
      "purpose": "work" | "...",
      "approval_status": "unsubmitted" | "...",
      "project_id": <number> | null,
      "task_id": <number> | null,
      "tag_ids": [<number>, ...],
      "note": "<string>",
      "external_references": [...],
      "start": "<ISO8601 with +HH:MM offset>",
      "end": "<ISO8601 with +HH:MM offset>",
      "hours": <number>,
      "ongoing": <bool>,
      "locked": <bool>,
      "is_direct_hours": <bool>,
      "included_in_total": <bool>
    }
  ],
  "meta": {
    "user_id": <number>,
    "date": "YYYY-MM-DD"
  }
}
```

Wrapper key `time_entries` (plural, underscore — only in JSON, the URL still
uses `time-entries`). `meta` is the only top-level sibling — no `links`,
`pagination`, or `next_cursor`. Per spec, the response is NOT paginated.

Single-day endpoint. Query param is `date` (singular), default today.
Multi-day / multi-user ranges go through `GET /{organisation_id}/report/time-entries`.

### `GET /{organisation_id}/time-entries/last`

```json
{ "time_entry": { ...same fields as the array element above... } }
```

Wrapper key `time_entry` (singular). This is the "most recent entry for the
authenticated user". A `time_entry.ongoing === true` is the canonical
"running timer" signal — there is NO separate `/timers` resource.

## 4. Identity / auth

- Bearer token in `Authorization: Bearer <token>` works against
  `https://api.keeping.nl/v1/...`. Confirmed against `/organisations`,
  `/{org_id}/users/me`, `/{org_id}/time-entries`, `/{org_id}/time-entries/last`.
- Token scope appears to include `time` (see `security: [{ auth: ["time"] }]`
  on `GET /{organisation_id}/time-entries`). Scope-name list to be derived
  from OpenAPI `securitySchemes`.

## 5. Error envelope (404 sample)

```json
{ "error": { "message": "<localised string>" } }
```

Single `error.message` string. No `code`, no `details`. Localised to the
account's language (Dutch was returned for this account). The Phase 2
`KeepingApiError` already stores the raw text — no shape change needed,
but the message rendering in tool isError content should pull `error.message`
out of the envelope for cleaner UX.

## 6. Phase 2 code that needs to change

Every file below is wrong against ground truth and needs revision in the
next phase / debug session:

| File | What's wrong |
|------|-------------|
| `src/keeping/client.ts` | `me()` calls `/users/me`. Must call `/{orgId}/users/me`. No HTTP verb on `me()` knows the org id today. |
| `src/keeping/types.ts` | `KeepingUser` has `name?` + `email?`. Reality: `first_name`, `surname`, `code`, `role`, `state`. |
| `src/tools/me.ts` | Returns whatever `client.me()` returns — already wrapped as `{ user: {...} }` after fix. Decide: unwrap or pass through. |
| `src/tools/projects.ts` | Path `/v1/organisations/{orgId}/projects` → `/v1/{orgId}/projects`. |
| `src/tools/tasks.ts` | Same — drop `/organisations/` segment. |
| `src/tools/entries-list.ts` | Same path fix PLUS query params: `date=YYYY-MM-DD` (single day), not `from=&to=`. Multi-day range needs `/report/time-entries`. |
| `scripts/probe-live.ts` | Anonymise denylist (D-35) covers six keys that do not exist in real responses. Real sensitive fields: `note`, `first_name`, `surname`. No `email` exists. |
| `.planning/REQUIREMENTS.md` | TIMER-01 is NOT deferred. It's served by `/time-entries/last` + `ongoing` flag + `POST /{id}/stop` + `POST /{id}/resume`. |

## 7. Phase 2 LOCKED decisions that contradict ground truth

These need formal revision (`gsd-discuss-phase` or explicit user override)
before re-execution:

- **D-32** — "No timer tool in v1." → Timer is in scope; reusable via existing
  `time-entries` lifecycle. TIMER-01 should be in Phase 2 or split as its own
  small phase but is no longer deferred-from-v1.
- **D-34** — "KeepingUser is loose pass-through of `{ id, name?, email? }`." →
  Real shape is `{ user: { id, first_name, surname, code, role, state } }`.
  Either rewrite the type or genuinely pass through `{ user: ... }` raw.
- **D-35** — "Anonymisation denylist is exactly six keys: `description,
  project_name, task_name, client_name, user_name, user_email`." → None of
  those keys exist in real time-entry or user responses. Replace with the
  observed-sensitive set: `note`, `first_name`, `surname`. Reconsider whether
  `purpose`, `external_references`, project/task numeric ids also leak.
- **D-27 / D-29** — Multi-org error template references organisations by
  `<id> (<name>)`. Real `id` is numeric — template still works but needs
  numeric-id test coverage.

## 8. What was committed before this finding landed

| Commit | Subject | Status |
|--------|---------|--------|
| `c40ae30` and earlier | Phase 2 waves 1–5 | Code present but pointing at wrong paths/shapes. Tests pass against mocks (mocks share the wrong shape). |
| `3fcf1f5` | unwrap `/organisations` response shape | Correct fix, keep. |

## 9. Next-session plan (recommendation)

1. Open `/gsd-debug` or a small replan slice.
2. Use this doc + `keeping-openapi.json` as required reading.
3. Revise CONTEXT D-32, D-34, D-35 with the user.
4. Rewrite `KeepingClient` request path strategy: `/v1/{orgId}/{path}`.
5. Rewrite the four tools (`me`, `projects`, `tasks`, `entries-list`) and
   their tests against the real shapes.
6. Decide TIMER-01 disposition (Phase 2 inclusion vs Phase 3 split).
7. Regenerate the anonymised fixture from a non-empty day, anonymising
   `note` + identity fields.
