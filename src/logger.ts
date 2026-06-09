// RULE: never call process.stdout.write — stdout is reserved for MCP JSON-RPC

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createLogger(token: string, level: LogLevel = "info") {
  const minLevel = LEVEL_ORDER[level];

  function emit(lvl: LogLevel, ...args: unknown[]): void {
    if (LEVEL_ORDER[lvl] < minLevel) return;
    const serialized = args
      .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
      .join(" ");
    const redacted = serialized.replaceAll(token, "***");
    process.stderr.write(`[keeping-mcp] [${lvl.toUpperCase()}] ${redacted}\n`);
  }

  return {
    debug: (...args: unknown[]): void => emit("debug", ...args),
    info: (...args: unknown[]): void => emit("info", ...args),
    warn: (...args: unknown[]): void => emit("warn", ...args),
    error: (...args: unknown[]): void => emit("error", ...args),
  };
}
