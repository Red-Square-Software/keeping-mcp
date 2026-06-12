// createServer — pure wiring. Constructs the McpServer instance and registers
// every tool against the shared KeepingClient. Plan 03-08 lands the six
// Phase 3 write registrations in a single atomic commit; Plans 03-02..03-07
// deliberately did NOT touch this file so they could run in parallel.
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
import { registerAddEntry } from "./tools/add-entry.js";
import { registerDeleteEntry } from "./tools/delete-entry.js";
import { registerEntriesList } from "./tools/entries-list.js";
import { registerMe } from "./tools/me.js";
import { registerOrganisations } from "./tools/organisations.js";
import { registerProjects } from "./tools/projects.js";
import { registerResumeTimer } from "./tools/resume-timer.js";
import { registerStartTimer } from "./tools/start-timer.js";
import { registerStopTimer } from "./tools/stop-timer.js";
import { registerTasks } from "./tools/tasks.js";
import { registerTimerStatus } from "./tools/timer-status.js";
import { registerUpdateEntry } from "./tools/update-entry.js";

type Logger = ReturnType<typeof import("./logger.js").createLogger>;

export function createServer(
  client: KeepingClient,
  // config carries KEEPING_REQUIRE_CONFIRM, which the six Phase 3 write tools
  // read for the AND-gate dry-run check (D-3-01, AUTH-04). _log is unused for
  // now but kept in the signature so future plans can wire it without changing
  // call sites.
  config: KeepingConfig,
  _log: Logger,
): McpServer {
  // NOTE: NO `capabilities: { logging: ... }` declared — see Pitfall A
  // (02-RESEARCH.md lines 626-647). Stderr remains the only logging surface (D-09).
  const server = new McpServer({ name: "keeping-mcp", version: "0.1.0" });

  // Phase 2 + Phase 2.5 reads — readOnlyHint:true, no confirm gate.
  registerMe(server, client);
  registerOrganisations(server, client);
  registerProjects(server, client);
  registerTasks(server, client);
  registerEntriesList(server, client);
  registerTimerStatus(server, client);

  // Phase 3 writes — confirm-gated via config.KEEPING_REQUIRE_CONFIRM (D-3-01
  // AND-gate). destructiveHint:true, idempotentHint:false on every one.
  registerAddEntry(server, client, config);
  registerUpdateEntry(server, client, config);
  registerDeleteEntry(server, client, config);
  registerStartTimer(server, client, config);
  registerStopTimer(server, client, config);
  registerResumeTimer(server, client, config);

  // All 12 tools registered: 6 Phase 2 reads (keeping_me, keeping_organisations,
  // keeping_projects, keeping_tasks, keeping_list_entries, keeping_timer_status)
  // + 6 Phase 3 writes (keeping_add_entry, keeping_update_entry,
  // keeping_delete_entry, keeping_start_timer, keeping_stop_timer,
  // keeping_resume_timer). Phase 4 ships distribution / release pipeline.

  return server;
}
