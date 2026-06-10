// RULE: stdout is reserved for MCP JSON-RPC; every log line goes via the
// stderr logger (D-09). loadConfig() is the first executable statement after
// imports — preserves Phase 1 fail-fast (D-04, D-05).

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "../src/config.js";
import { KeepingClient } from "../src/keeping/client.js";
import { createLogger } from "../src/logger.js";
import { createServer } from "../src/server.js";

const config = loadConfig(); // exits with non-zero code on missing/invalid config
const log = createLogger(config.KEEPING_TOKEN, config.KEEPING_LOG_LEVEL);

const client = new KeepingClient(config.KEEPING_TOKEN, log);
const server = createServer(client, config, log);

// The transport owns the event loop — no process.exit after this line.
await server.connect(new StdioServerTransport());
