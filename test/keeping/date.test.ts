// Foundation tests for src/keeping/date.ts (D-3-13, D-3-15, D-3-28).
//
// Two pure helpers — `todayInAmsterdam` (YYYY-MM-DD) and `nowInAmsterdamHHMM`
// (24-hour HH:mm) — both via `Intl.DateTimeFormat` against `Europe/Amsterdam`.
//
// `Date.toISOString()` is forbidden for date fields (WRITE-08). The
// "Smoke" tests in this file lock the ICU presence guarantee (D-3-14)
// and the en-CA tag's `YYYY-MM-DD` natural emission.

import { describe, expect, it } from "vitest";
import { nowInAmsterdamHHMM, todayInAmsterdam } from "../../src/keeping/date.js";

describe("src/keeping/date.ts", () => {
  // ---------------------------------------------------------------------------
  // todayInAmsterdam — YYYY-MM-DD (D-3-13, D-3-15)
  // ---------------------------------------------------------------------------

  it("Test D1: todayInAmsterdam — summer (CEST) DST rollover (D-3-15)", () => {
    // 2026-06-12T22:30:00Z = 2026-06-13T00:30:00+02:00 in Amsterdam (CEST).
    const now = new Date("2026-06-12T22:30:00Z");
    expect(todayInAmsterdam(now)).toBe("2026-06-13");
  });

  it("Test D2: todayInAmsterdam — winter (CET) rollover", () => {
    // 2026-12-15T23:30:00Z = 2026-12-16T00:30:00+01:00 in Amsterdam (CET).
    const now = new Date("2026-12-15T23:30:00Z");
    expect(todayInAmsterdam(now)).toBe("2026-12-16");
  });

  it("Test D3: todayInAmsterdam — mid-day same-day case (regex + value)", () => {
    const now = new Date("2026-06-12T10:00:00Z"); // 12:00+02:00 Amsterdam
    const result = todayInAmsterdam(now);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe("2026-06-12");
  });

  // ---------------------------------------------------------------------------
  // nowInAmsterdamHHMM — 24-hour HH:mm (D-3-28)
  // ---------------------------------------------------------------------------

  it("Test D4: nowInAmsterdamHHMM — summer (CEST)", () => {
    const now = new Date("2026-06-12T22:30:00Z"); // 00:30 next day Amsterdam
    expect(nowInAmsterdamHHMM(now)).toBe("00:30");
  });

  it("Test D5: nowInAmsterdamHHMM — winter (CET); same HH:mm digits, different offset proves DST handling", () => {
    const now = new Date("2026-12-15T23:30:00Z"); // 00:30 next day Amsterdam (+01:00)
    expect(nowInAmsterdamHHMM(now)).toBe("00:30");
  });

  // ---------------------------------------------------------------------------
  // ICU presence smoke (D-3-14) — guards against small-icu Node builds
  // ---------------------------------------------------------------------------

  it("Test D6: process.versions.icu present AND en-CA emits YYYY-MM-DD natively", () => {
    expect(process.versions.icu).toBeTruthy();
    const stamp = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date("2026-06-12T10:00:00Z"));
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
