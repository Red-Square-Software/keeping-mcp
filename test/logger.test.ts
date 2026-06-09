import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/logger.js";

const FAKE_TOKEN = "kp_test_FAKE_token_value";

describe("createLogger — token redaction (D-16)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts the token from object arguments", () => {
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrWrites.push(String(chunk));
      return true;
    });

    const log = createLogger(FAKE_TOKEN, "error");
    log.error({ headers: { Authorization: `Bearer ${FAKE_TOKEN}` } });

    const output = stderrWrites.join("");
    expect(output).not.toContain(FAKE_TOKEN);
    expect(output).toContain("***");
  });

  it("redacts the token from string arguments", () => {
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrWrites.push(String(chunk));
      return true;
    });

    const log = createLogger(FAKE_TOKEN, "error");
    log.error(`Auth: Bearer ${FAKE_TOKEN}`);

    const output = stderrWrites.join("");
    expect(output).not.toContain(FAKE_TOKEN);
    expect(output).toContain("***");
  });

  it("respects log level — debug messages suppressed at info level", () => {
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrWrites.push(String(chunk));
      return true;
    });

    const log = createLogger(FAKE_TOKEN, "info");
    log.debug("this should not appear");

    expect(stderrWrites).toHaveLength(0);
  });
});
