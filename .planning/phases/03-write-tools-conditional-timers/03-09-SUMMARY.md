---
phase: 03-write-tools-conditional-timers
plan: 09
subsystem: keeping/write-gate
tags:
  - keeping-mcp
  - phase-3
  - gap-closure
  - cr-01
  - d-3-16
  - ambiguous-classifier
  - timeout-handling
dependency_graph:
  requires:
    - classifyAmbiguous (src/keeping/write-gate.ts)
    - AbortSignal.timeout (rawFetch/rawFetchWithHeaders in src/keeping/client.ts)
  provides:
    - classifyAmbiguous TimeoutError arm (covers Node 22 AbortSignal.timeout shape)
    - Regression test W12 (real DOMException("timeout","TimeoutError") shape)
  affects:
    - All six Phase 3 write tools (add-entry, update-entry, delete-entry, start-timer, stop-timer, resume-timer)
    - WRITE-05 + D-3-16 ambiguous-failure envelope contract
tech_stack:
  added: []
  patterns:
    - "classifyAmbiguous OR-arm on err.name (AbortError || TimeoutError) — matches both manual abort and timeout origin"
    - "Regression test constructs the REAL runtime exception (new DOMException) — not a synthetic Object.assign mock — to pin the Node 22 shape"
key_files:
  created: []
  modified:
    - src/keeping/write-gate.ts
    - test/keeping/write-gate.test.ts
decisions:
  - "Closed CR-01 / 03-VERIFICATION.md Gap #1 by adding `err.name === \"TimeoutError\"` as an additive OR arm in classifyAmbiguous; existing AbortError arm preserved verbatim because manual AbortController.abort() still throws AbortError (defence-in-depth for any future manual-cancel callsite)"
  - "Regression test W12 constructs `new DOMException(\"timeout\", \"TimeoutError\")` — the actual shape Node 22's AbortSignal.timeout() throws — NOT a synthetic Object.assign mock. The synthetic-mock approach is what hid CR-01 in W9; W12 must exercise the real shape to be a meaningful gate."
metrics:
  duration: "~5 minutes"
  completed_date: "2026-06-12"
  tasks_completed: 1
  files_created: 0
  files_modified: 2
requirements:
  - WRITE-05
  - TIMER-01
  - TIMER-02
---

# Phase 3 Plan 09: Ambiguous-Classifier Gap Closure (CR-01) Summary

**One-liner:** Add `TimeoutError` arm to `classifyAmbiguous()` so Node 22's `AbortSignal.timeout()` — used by both `rawFetch` and `rawFetchWithHeaders` — surfaces as the D-3-16 / WRITE-05 byte-locked `AMBIGUOUS_TEXT` envelope across all six Phase 3 write tools, instead of misclassifying real 10-second timeouts as definite-fail (which would teach the AI consumer "safe to retry" on a duplicate-risk write).

## What Was Built

### Source change — `src/keeping/write-gate.ts`

**Line 104 (the fix):**

```typescript
if (err.name === "AbortError" || err.name === "TimeoutError") return true;
```

The existing `AbortError` branch is preserved verbatim — manual `AbortController.abort()` still throws `AbortError`. `TimeoutError` is the new additive OR arm; the JSDoc bullet above the function now reads:

```typescript
*   - `AbortError` (manual AbortController.abort) OR `TimeoutError` (10-second AbortSignal.timeout fired in Node 22)
```

documenting WHY both arms are required.

### Regression test — `test/keeping/write-gate.test.ts`

New `Test W12` placed immediately after `Test W11`, inside the same `describe("src/keeping/write-gate.ts", ...)` group:

```typescript
it("Test W12: classifyAmbiguous returns true for DOMException TimeoutError (Node 22 AbortSignal.timeout shape)", () => {
  // Node 22's AbortSignal.timeout() throws DOMException with name="TimeoutError",
  // NOT AbortError. Confirmed at runtime per 03-VERIFICATION.md Gap #1 evidence.
  // The classifier MUST catch this exception shape — it is the single most
  // important failure mode WRITE-05 / D-3-16 was designed to surface as
  // ambiguous (write fired, network dropped, outcome unknown).
  const err = new DOMException("timeout", "TimeoutError");
  expect(err.name).toBe("TimeoutError");
  expect(classifyAmbiguous(err)).toBe(true);
});
```

The intermediate `expect(err.name).toBe("TimeoutError")` assertion is intentional: it pins the `DOMException` constructor's behavior so a future reader can see immediately that this test exercises the REAL runtime shape, not a synthetic mock.

## Verification

### Automated

| Command                                                              | Result |
| -------------------------------------------------------------------- | ------ |
| `npx vitest run test/keeping/write-gate.test.ts`                    | 12 passed (W1–W12) |
| `npx vitest run`                                                     | 19 files, 163 tests passed (162 prior + 1 new W12) |
| `npx vitest run -t "Test W9"`                                       | 1 passed (synthetic AbortError mock still green — proves additive OR arm, not replacement) |
| `npx tsc --noEmit`                                                   | exit 0, no output |
| `npx biome check src/keeping/write-gate.ts test/keeping/write-gate.test.ts` | exit 0, "Checked 2 files in 6ms. No fixes applied." |

### TDD gate sequence

1. **RED:** Added W12 first; ran vitest; W12 failed with `AssertionError: expected false to be true` at line 207 — exactly as predicted by the gap analysis. The other 11 W tests continued passing.
2. **GREEN:** Updated `classifyAmbiguous` line 104 with the OR arm; re-ran vitest; all 12 W tests pass.
3. **REFACTOR:** Not needed — the change is a single literal addition.

### Grep-pinned done criteria

| Criterion | Verification | Result |
| --------- | ------------ | ------ |
| Line 104 contains `err.name === "TimeoutError"` | `grep TimeoutError src/keeping/write-gate.ts` | line 95 (docstring) + line 104 (source) — 2 hits |
| JSDoc mentions both arms | same grep | docstring bullet on line 95 includes both `AbortError` and `TimeoutError` |
| Test contains literal `new DOMException("timeout", "TimeoutError")` exactly once | `grep -c` | 1 |
| Test label `Test W12:` appears exactly once | `grep -c` | 1 |
| W9 still passes | `npx vitest run -t "Test W9"` | exit 0, 1 passed |

## Behavioral Impact

Before this fix, the chain was:

1. User calls `keeping_add_entry` (or any of the five other Phase 3 write tools) with `confirm: true`.
2. `KeepingClient.post` → `rawFetch` → fetch with `signal: AbortSignal.timeout(10_000)`.
3. Network drops mid-flight; the 10-second timer fires.
4. fetch rejects with `DOMException("This operation was aborted", "TimeoutError")`.
5. Tool catch arm calls `classifyAmbiguous(err)` — returned `false` (no matching arm: name was not "AbortError", not a TypeError, no numeric .status).
6. Error flows through `toIsErrorContent` as definite-fail. Envelope reads e.g. `Keeping API error 0` or the raw `DOMException` message — clean enough to look like a definite failure.
7. AI consumer reads the envelope, concludes the write did not land, retries. The entry may already exist server-side — **duplicate write risk**.

After this fix, step 5 returns `true`. Envelope becomes the D-3-16 byte-locked `AMBIGUOUS_TEXT`:

```
outcome unknown — verify with keeping_list_entries before retrying. (<original message>)
```

The AI consumer is told explicitly to verify via `keeping_list_entries` before retrying, eliminating the duplicate-write hazard. This is the single most important failure mode WRITE-05 / D-3-16 was designed to surface — and it now works.

## Deviations from Plan

None. Plan executed exactly as written — one source-line replacement, one JSDoc bullet rewrite, one new test, in the exact TDD order specified (RED → GREEN).

No advisory items (WR-01..WR-06, IN-01..IN-04 from 03-REVIEW.md) were touched per the plan's scope gate.

## Gap Closure

| Gap | Source | Status before this plan | Status after |
| --- | ------ | ----------------------- | ------------ |
| 03-VERIFICATION.md Gap #1 (Truth #2 / SC #2) | classifyAmbiguous misses Node 22 TimeoutError | FAILED | **CLOSED** (W12 regression gate in place) |
| 03-REVIEW.md CR-01 (BLOCKER) | Same defect — same fix | OPEN | **CLOSED** |

CR-02 (HH:mm regex too permissive in `add-entry.ts`, `update-entry.ts`, `start-timer.ts`) is the parallel Wave 1 sibling plan (Plan 03-10) — **not closed by this plan**.

## Commits

| Hash | Type | Message |
| ---- | ---- | ------- |
| `93ffc00` | fix | `fix(03-09): add TimeoutError arm to classifyAmbiguous (CR-01)` |

## Self-Check: PASSED

- `src/keeping/write-gate.ts` exists and contains the OR-arm form on line 104 — verified.
- `test/keeping/write-gate.test.ts` contains the W12 test with the real DOMException construction — verified.
- Commit `93ffc00` exists in `git log` — verified.
- All 163 tests pass, tsc + biome exit 0 — verified.
