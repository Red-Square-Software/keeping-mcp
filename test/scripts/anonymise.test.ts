// Tests for the anonymise() walker shipped in scripts/probe-live.ts.
//
// Six denylisted keys (D-35 step 3, CONTEXT.md §"Specific Ideas" line 148):
//   description, project_name, task_name, client_name, user_name, user_email.
//
// Test 9 (ANONYMISE_KEYS.size === 6) is the drift guard: adding a key without
// revisiting CONTEXT.md trips this test and forces the planner to acknowledge
// the scope change.

import { describe, expect, it } from "vitest";
import { ANONYMISE_KEYS, anonymise } from "../../scripts/probe-live.js";

describe("anonymise() walker (D-35)", () => {
  it("Test 1: replaces a top-level denylisted key with [REDACTED]", () => {
    expect(anonymise({ description: "client meeting" })).toEqual({
      description: "[REDACTED]",
    });
  });

  it("Test 2: passes through top-level non-denylisted keys verbatim", () => {
    expect(anonymise({ id: "te-1", hours: 1.5 })).toEqual({ id: "te-1", hours: 1.5 });
  });

  it("Test 3: redacts nested object denylisted keys at any depth", () => {
    expect(anonymise({ user: { user_email: "x@y.z", id: "u-1" } })).toEqual({
      user: { user_email: "[REDACTED]", id: "u-1" },
    });
  });

  it("Test 4: walks arrays of objects and redacts each element", () => {
    expect(
      anonymise([
        { description: "a", id: "1" },
        { description: "b", id: "2" },
      ]),
    ).toEqual([
      { description: "[REDACTED]", id: "1" },
      { description: "[REDACTED]", id: "2" },
    ]);
  });

  it("Test 5: redacts all six denylisted keys when present at top level", () => {
    const input = {
      description: "x",
      project_name: "x",
      task_name: "x",
      client_name: "x",
      user_name: "x",
      user_email: "x",
    };
    expect(anonymise(input)).toEqual({
      description: "[REDACTED]",
      project_name: "[REDACTED]",
      task_name: "[REDACTED]",
      client_name: "[REDACTED]",
      user_name: "[REDACTED]",
      user_email: "[REDACTED]",
    });
  });

  it("Test 6: preserves null, boolean, and numeric values verbatim", () => {
    expect(anonymise({ hours: 0, billable: true, deleted: null })).toEqual({
      hours: 0,
      billable: true,
      deleted: null,
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

  it("Test 9: ANONYMISE_KEYS contains exactly the six locked denylist names", () => {
    // Drift guard — if this fails, revisit 02-CONTEXT.md §Specific Ideas line 148
    // and the threat model T-02-05-02 mitigation before adding/removing keys.
    expect(ANONYMISE_KEYS.size).toBe(6);
    expect(ANONYMISE_KEYS.has("description")).toBe(true);
    expect(ANONYMISE_KEYS.has("project_name")).toBe(true);
    expect(ANONYMISE_KEYS.has("task_name")).toBe(true);
    expect(ANONYMISE_KEYS.has("client_name")).toBe(true);
    expect(ANONYMISE_KEYS.has("user_name")).toBe(true);
    expect(ANONYMISE_KEYS.has("user_email")).toBe(true);
  });
});
