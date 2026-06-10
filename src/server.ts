// createServer — pure wiring. Constructs the McpServer instance and registers
// every tool against the shared KeepingClient. Plans 02-03 and 02-04 will
// append more `register*` calls below the existing one.
//
// Pitfall A: do NOT pass `capabilities: { logging: ... }` to McpServer. The
// SDK's `server.sendLoggingMessage(...)` is a silent no-op without that
// capability declared, and our Phase 1 carry-forward (D-09) makes stderr the
// only logging surface anyway. Documenting the omission at the construction
// site keeps future-me from bolting on sendLoggingMessage calls expecting them
// to work.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { KeepingConfig } from "./config.js";
import type { KeepingClient } from "./keeping/client.js";
import { registerMe } from "./tools/me.js";

type Logger = ReturnType<typeof import("./logger.js").createLogger>;

export function createServer(
  client: KeepingClient,
  // _config carries KEEPING_REQUIRE_CONFIRM for Phase 3 write tools to read
  // (AUTH-04 plumbed but not gated in Phase 2). _log is unused for now but kept
  // in the signature so Plans 02-03/02-04 can wire it without changing call sites.
  _config: KeepingConfig,
  _log: Logger,
): McpServer {
  // NOTE: NO `capabilities: { logging: ... }` declared — see Pitfall A
  // (02-RESEARCH.md lines 626-647). Stderr remains the only logging surface (D-09).
  const server = new McpServer({ name: "keeping-mcp", version: "0.1.0" });

  registerMe(server, client);
  // Plans 02-03 / 02-04 append more register* calls here.

  return server;
}
