// Error contracts for KeepingClient. Two invariants:
//   1. D-25 and D-27 messages are byte-identical to the wording locked in
//      02-CONTEXT.md §Specific Ideas. Tests in test/keeping/errors.test.ts
//      are the gate; do not edit either side without updating both.
//   2. KeepingApiError NEVER stores a raw API response body — callers must
//      pass it through `sanitiseBody(text, token)` first (Pitfall G,
//      defence-in-depth with src/logger.ts:20 emit-time redaction).

export class KeepingAuthError extends Error {
  constructor() {
    // D-25 verbatim wording (02-CONTEXT.md line 146).
    super("Keeping rejected the token. Verify KEEPING_TOKEN and restart the MCP server.");
    this.name = "KeepingAuthError";
  }
}

export class KeepingRateLimitError extends Error {
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super(`Rate limited; retry after ${retryAfter}s`);
    this.retryAfter = retryAfter;
    this.name = "KeepingRateLimitError";
  }
}

export class KeepingApiError extends Error {
  readonly status: number;
  constructor(status: number, sanitisedBody: string) {
    super(`Keeping API error ${status}: ${sanitisedBody.slice(0, 500)}`);
    this.status = status;
    this.name = "KeepingApiError";
  }
}

export class MultiOrgError extends Error {
  // 2026-06-11: real `KeepingOrg.id` is numeric. Accept either form so legacy
  // string-id test data and real numeric-id production data both render via
  // the same template literal.
  constructor(orgs: ReadonlyArray<{ id: string | number; name: string }>) {
    // D-27 verbatim template (02-CONTEXT.md line 145).
    const options = orgs.map((o) => `${o.id} (${o.name})`).join(", ");
    super(
      `Multiple organisations available. Pass organisation_id, or set KEEPING_ORG_ID. Options: ${options}.`,
    );
    this.name = "MultiOrgError";
  }
}

// Pitfall G defence-in-depth: scrub the token from API response bodies BEFORE
// it reaches an error message. Mirrors src/logger.ts:20 emit-time primitive
// applied earlier in the chain.
export function sanitiseBody(text: string, token: string): string {
  return text.replaceAll(token, "***");
}

// SAFE-04 envelope: tool handlers' catch-all surface. Never throw to the
// MCP transport — return isError instead.
export function toIsErrorContent(err: unknown): {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
} {
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: "text", text: message }] };
}
