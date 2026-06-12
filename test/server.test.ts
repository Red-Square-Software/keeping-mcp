// Wiring smoke test — asserts createServer registers EXACTLY the 12 tools
// Phase 3 ships (6 Phase 2 reads + 6 Phase 3 writes). The list is alphabetised
// because we sort `names` before comparing — that way the test is stable
// against registration order changes in src/server.ts while still catching:
//
//   - a forgotten `register*` call (count drops to < 12)
//   - an accidentally-extra `register*` call (count rises to > 12)
//   - a typo in a tool name (the exact-name list mismatches)
//
// T-03-08-01 (Tampering) mitigation per 03-08-PLAN.md threat model.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { KeepingClient } from "../src/keeping/client.js";
import { createLogger } from "../src/logger.js";
import { createServer } from "../src/server.js";

describe("createServer wiring", () => {
  it("registers all 12 tools (6 reads + 6 writes)", async () => {
    const log = createLogger("kp_test_FAKE", "error");
    const client = new KeepingClient("kp_test_FAKE", log);
    const config = {
      KEEPING_TOKEN: "kp_test_FAKE",
      KEEPING_REQUIRE_CONFIRM: true as boolean,
      KEEPING_LOG_LEVEL: "error" as const,
    };

    const server = createServer(client, config, log);
    const mcpClient = new Client({ name: "wiring-smoke", version: "0.0.0" });
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverT), mcpClient.connect(clientT)]);

    const { tools } = await mcpClient.listTools();
    const names = tools.map((t) => t.name).sort();

    expect(names).toEqual([
      "keeping_add_entry",
      "keeping_delete_entry",
      "keeping_list_entries",
      "keeping_me",
      "keeping_organisations",
      "keeping_projects",
      "keeping_resume_timer",
      "keeping_start_timer",
      "keeping_stop_timer",
      "keeping_tasks",
      "keeping_timer_status",
      "keeping_update_entry",
    ]);
  });
});
