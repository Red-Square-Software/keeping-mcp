import { describe, expect, it } from "vitest";
import {
  KeepingApiError,
  KeepingAuthError,
  KeepingRateLimitError,
  MultiOrgError,
  sanitiseBody,
  toIsErrorContent,
} from "../../src/keeping/errors.js";

const FAKE_TOKEN = "kp_test_FAKE";

describe("KeepingClient error contracts (D-25, D-27, Pitfall G)", () => {
  it("KeepingAuthError message is byte-identical to D-25 wording", () => {
    const err = new KeepingAuthError();
    expect(err.message).toBe(
      "Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.",
    );
    expect(err.name).toBe("KeepingAuthError");
  });

  it("MultiOrgError message follows D-27 template byte-identical", () => {
    const err = new MultiOrgError([
      { id: "org_abc", name: "Acme Studio" },
      { id: "org_xyz", name: "Beta BV" },
    ]);
    expect(err.message).toBe(
      "Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: org_abc (Acme Studio), org_xyz (Beta BV).",
    );
    expect(err.name).toBe("MultiOrgError");
  });

  it("sanitiseBody scrubs every token occurrence (Pitfall G primitive)", () => {
    const out = sanitiseBody(`response with ${FAKE_TOKEN} inline`, FAKE_TOKEN);
    expect(out).toBe("response with *** inline");
    expect(out).not.toContain(FAKE_TOKEN);
  });

  it("KeepingApiError constructed with sanitiseBody does not leak the token (Pitfall G assertion)", () => {
    const body = `boom — ${FAKE_TOKEN} here`;
    const err = new KeepingApiError(500, sanitiseBody(body, FAKE_TOKEN));
    expect(err.message).not.toContain(FAKE_TOKEN);
    expect(err.message).toContain("500");
    expect(err.message).toContain("***");
    expect(err.status).toBe(500);
    expect(err.name).toBe("KeepingApiError");
  });

  it("toIsErrorContent wraps an Error into the MCP isError envelope (SAFE-04)", () => {
    const result = toIsErrorContent(new Error("anything"));
    expect(result).toEqual({
      isError: true,
      content: [{ type: "text", text: "anything" }],
    });
  });

  it("KeepingRateLimitError exposes retryAfter and references it in the message", () => {
    const err = new KeepingRateLimitError(42);
    expect(err.retryAfter).toBe(42);
    expect(err.message).toContain("42");
    expect(err.name).toBe("KeepingRateLimitError");
  });
});
