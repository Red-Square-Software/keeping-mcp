---
status: partial
phase: 03-write-tools-conditional-timers
source: [03-VERIFICATION.md]
started: 2026-06-12T10:05:00Z
updated: 2026-06-12T10:05:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. End-to-end dry-run preview against the live Keeping API
expected: With KEEPING_TOKEN set and KEEPING_REQUIRE_CONFIRM=true (default), keeping_add_entry returns a would_post envelope containing the FULL https://api.keeping.nl/v1/<orgId>/time-entries URL and the constructed body; calling again with confirm:true creates an entry visible in the Keeping UI.
result: [pending]

### 2. Real timer lifecycle: start → status → stop → resume on the same entry
expected: keeping_start_timer returns { timer_id }; keeping_timer_status reflects the running timer with elapsed_ms derived from X-Server-Time-Ms; keeping_stop_timer surfaces server_time_ms from the response header; keeping_resume_timer either returns the same timer_id (same-day) or a new one (Pitfall 6 day-rollover).
result: [pending]

### 3. Real ambiguous-timeout envelope under a forced network drop
expected: Inducing a 10-second AbortSignal.timeout() on a real outbound call (e.g., by routing through a stalled proxy or unreachable host) yields the AMBIGUOUS_TEXT envelope `outcome unknown — verify with keeping_list_entries before retrying. (<err.message>)` — not the toIsErrorContent definite-fail shape.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
