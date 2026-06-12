// Europe/Amsterdam date + time-of-day helpers (D-3-13, D-3-15, D-3-28).
//
// Two pure exports — no class, no module state, no I/O. Both accept an
// injectable `now: Date` for deterministic testing.
//
// Asymmetry:
//   - `todayInAmsterdam(now)` → `"YYYY-MM-DD"` — used for the `date` field on
//     entry_create_request / entry_edit_request. Default for `keeping_add_entry`
//     when the caller omits `date`. en-CA emits ISO-style `YYYY-MM-DD` natively
//     in `Intl.DateTimeFormat`.
//   - `nowInAmsterdamHHMM(now)` → `"HH:mm"` — used for `start` / `end` defaults
//     in `keeping_add_entry` and `keeping_start_timer`. D-3-28 supersedes
//     D-3-13's `nowAmsterdamISO`: the request body documents `start`/`end` as
//     time-only HH:mm strings (NOT full ISO 8601). The API derives the zone
//     from `organisation.time_zone`, so no offset suffix is included. sv-SE
//     emits 24h `HH:mm` consistently with `hour12: false`.
//
// Forbidden: `Date.prototype.toISOString` for date fields anywhere in this
// file (WRITE-08). Node 22 ships full-icu by default (D-3-14); the ICU smoke
// in test/keeping/date.test.ts asserts that guarantee.

/**
 * Returns today's date in Europe/Amsterdam as `YYYY-MM-DD`.
 *
 * DST-correct: at 2026-06-12T22:30:00Z (CEST +02:00) the Amsterdam clock has
 * already rolled over to 2026-06-13, so `todayInAmsterdam(...)` returns
 * `"2026-06-13"`. At 2026-12-15T23:30:00Z (CET +01:00) the Amsterdam clock
 * has rolled over to 2026-12-16.
 */
export function todayInAmsterdam(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Returns the current time-of-day in Europe/Amsterdam as 24-hour `HH:mm`.
 *
 * NO timezone suffix in the body — the Keeping API derives the zone from the
 * organisation's `time_zone` field (D-3-28, D-3-29). Used for `start`/`end`
 * defaults on entry_create_request / entry_edit_request bodies.
 */
export function nowInAmsterdamHHMM(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}
