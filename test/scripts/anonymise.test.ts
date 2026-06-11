// Tests for the anonymise() walker shipped in scripts/probe-live.ts.
//
// D-35-R denylist (revised 2026-06-11, see
// `.planning/phases/02-read-tools-schema-discovery/02-CONTEXT.md` §Revisions):
//
//   Confirmed-sensitive in real responses:
//     note, first_name, surname
//   Identity / linkage defence-in-depth:
//     code, email, name, user_name, user_email,
//     client_name, project_name, task_name, description
//   External references / behavioural-leakage guards:
//     purpose, external_references
//
// Total: 15 keys. Test 9 (size + membership) is the drift guard: adding or
// removing a key without updating CONTEXT §Revisions §D-35-R trips this test.

import { describe, expect, it } from "vitest";
import { ANONYMISE_KEYS, anonymise } from "../../scripts/probe-live.js";

describe("anonymise() walker (D-35-R)", () => {
  it("Test 1: replaces a top-level denylisted key with [REDACTED]", () => {
    expect(anonymise({ note: "client meeting" })).toEqual({
      note: "[REDACTED]",
    });
  });

  it("Test 2: passes through top-level non-denylisted keys verbatim", () => {
    // Numeric ids are PRESERVED — they are opaque tokens, not PII.
    expect(anonymise({ id: 12345, hours: 1.5, user_id: 789 })).toEqual({
      id: 12345,
      hours: 1.5,
      user_id: 789,
    });
  });

  it("Test 3: redacts nested object denylisted keys at any depth (real /users/me shape)", () => {
    expect(
      anonymise({
        user: { id: 789, first_name: "Ella", surname: "van Doorn", role: "administrator" },
      }),
    ).toEqual({
      user: {
        id: 789,
        first_name: "[REDACTED]",
        surname: "[REDACTED]",
        role: "administrator",
      },
    });
  });

  it("Test 4: walks arrays of objects and redacts each element (real time_entries shape)", () => {
    expect(
      anonymise([
        { id: 1, note: "wrote spec", project_id: 100 },
        { id: 2, note: "design review", project_id: 100 },
      ]),
    ).toEqual([
      { id: 1, note: "[REDACTED]", project_id: 100 },
      { id: 2, note: "[REDACTED]", project_id: 100 },
    ]);
  });

  it("Test 5: redacts every key in the locked denylist when present at top level", () => {
    const input: Record<string, unknown> = {};
    for (const key of ANONYMISE_KEYS) {
      input[key] = "secret";
    }
    const result = anonymise(input) as Record<string, unknown>;
    for (const key of ANONYMISE_KEYS) {
      expect(result[key]).toBe("[REDACTED]");
    }
  });

  it("Test 6: preserves null, boolean, and numeric values verbatim", () => {
    expect(anonymise({ hours: 0, ongoing: true, end: null })).toEqual({
      hours: 0,
      ongoing: true,
      end: null,
    });
  });

  it("Test 7: returns empty array / object identity on empty containers", () => {
    expect(anonymise([])).toEqual([]);
    expect(anonymise({})).toEqual({});
  });

  it("Test 8: returns primitives at the root unchanged", () => {
    expect(anonymise("hello")).toBe("hello");
    expect(anonymise(42)).toBe(42);
    expect(anonymise(null)).toBe(null);
  });

  it("Test 9: ANONYMISE_KEYS contains exactly the D-35-R locked denylist", () => {
    // Drift guard — if this fails, revisit
    // `.planning/phases/02-read-tools-schema-discovery/02-CONTEXT.md`
    // §Revisions §D-35-R before adding/removing keys.
    const expected = new Set([
      // Confirmed-sensitive in real responses.
      "note",
      "first_name",
      "surname",
      // Identity / linkage defence-in-depth.
      "code",
      "email",
      "name",
      "user_name",
      "user_email",
      "client_name",
      "project_name",
      "task_name",
      "description",
      // External references / behavioural-leakage guards.
      "purpose",
      "external_references",
    ]);
    expect(ANONYMISE_KEYS.size).toBe(expected.size);
    for (const key of expected) {
      expect(ANONYMISE_KEYS.has(key)).toBe(true);
    }
    // No unexpected extras.
    for (const key of ANONYMISE_KEYS) {
      expect(expected.has(key)).toBe(true);
    }
  });

  it("Test 10: numeric ids are NOT redacted (opaque tokens, not PII)", () => {
    // Sanity check that none of the id-shaped keys made it into the denylist.
    const idKeys = ["id", "user_id", "project_id", "task_id", "tag_ids", "organisation_id"];
    for (const key of idKeys) {
      expect(ANONYMISE_KEYS.has(key)).toBe(false);
    }
  });
});
