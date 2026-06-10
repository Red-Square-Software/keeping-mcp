// scripts/probe-live.ts — one-shot live API probe (D-30..D-37 + D-35).
//
// Owns:
//   1. Three timer-endpoint best-guess probes in parallel (D-31).
//   2. A single `/v1/users/me` GET to gather Q1 contingency evidence
//      (RESEARCH §Open Questions RESOLVED — Plan 02-06 Task 3 reads the
//      result before deciding whether to switch KeepingClient.me()).
//   3. One time_entries capture for a user-supplied date range (default
//      last 7 days, override via PROBE_FROM / PROBE_TO).
//   4. Anonymisation pass (D-35 step 3) → committed fixture under
//      test/fixtures/.
//   5. Human-readable notes file at .planning/research/LIVE-API.md with
//      the seven mandated sections (CONTEXT §Specific Ideas line 149 +
//      the /v1/users/me path probe section).
//
// Never runs from server code paths. Invoked manually by the developer
// via `npm run probe-live`. The script + tested anonymiser ship in this
// plan (02-05); the running of it against a real KEEPING_TOKEN is the
// human-verify checkpoint owned by Plan 02-06.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { loadConfig } from "../src/config.js";
import { KeepingClient } from "../src/keeping/client.js";
import { createLogger } from "../src/logger.js";

/**
 * D-35 step 3 denylist. Exactly six keys — adding one without revisiting
 * 02-CONTEXT.md §"Specific Ideas" line 148 and the T-02-05-02 mitigation
 * trips Test 9 in test/scripts/anonymise.test.ts.
 */
export const ANONYMISE_KEYS: ReadonlySet<string> = new Set([
  "description",
  "project_name",
  "task_name",
  "client_name",
  "user_name",
  "user_email",
]);

/**
 * Depth-first walker. At every key in ANONYMISE_KEYS, the value is
 * replaced with the literal string "[REDACTED]". Every other key
 * (and every array element) is recursed into. Primitives, booleans,
 * numbers, and null pass through unchanged at leaf positions.
 */
export function anonymise(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(anonymise);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = ANONYMISE_KEYS.has(k) ? "[REDACTED]" : anonymise(v);
    }
    return out;
  }
  return value;
}

// ---- Helpers ---------------------------------------------------------------

const KEEPING_BASE = "https://api.keeping.nl/v1";
const TIMEOUT_MS = 10_000;

/** Per-timer-probe result shape — mirrors CONTEXT §Specific Ideas line 149. */
type TimerProbe = {
  path: string;
  ok: boolean;
  status?: number;
  body?: unknown;
  error?: string;
};

/** /v1/users/me path probe — Q1 contingency evidence. */
type MeProbe = {
  path: string;
  ok: boolean;
  status: number;
};

/** mkdir -p the parent dir, then write pretty-printed JSON. */
async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * Last-week start date in YYYY-MM-DD. Used as the default PROBE_FROM /
 * PROBE_TO when the user hasn't set either. `toISOString().slice(0, 10)`
 * is acceptable here because this is a one-shot developer-run script, not
 * a server boundary — Pitfall 5 (Europe/Amsterdam timezone) applies to
 * tool handlers, not to a manual probe whose date range the developer
 * eyeballs before commit.
 */
function defaultLastWeek(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Raw fetch around a Keeping endpoint that catches every failure mode
 * (HTTP error, network, timeout) and returns a TimerProbe envelope so a
 * single failed probe never kills the other two (D-31).
 */
async function probeTimerPath(path: string, token: string): Promise<TimerProbe> {
  try {
    const res = await fetch(`${KEEPING_BASE}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        path,
        ok: false,
        status: res.status,
        error: text.slice(0, 500).replaceAll(token, "***"),
      };
    }
    const body = (await res.json().catch(() => null)) as unknown;
    return { path, ok: true, status: res.status, body };
  } catch (err) {
    return {
      path,
      ok: false,
      error: (err instanceof Error ? err.message : String(err)).replaceAll(token, "***"),
    };
  }
}

/** Build the LIVE-API.md document — seven mandated sections per CONTEXT line 149 + Q1 contingency. */
function buildLiveApiNotes(
  probes: TimerProbe[],
  meProbe: MeProbe,
  entries: unknown,
  from: string,
  to: string,
  orgId: string,
): string {
  const lines: string[] = [];
  lines.push("# Live API Capture");
  lines.push("");
  lines.push(`**Captured:** ${new Date().toISOString()}`);
  lines.push(`**Organisation:** ${orgId}`);
  lines.push(`**Time-entry range:** ${from} → ${to}`);
  lines.push("");
  lines.push(
    "_Generated by `npm run probe-live` — do not edit by hand. Plan 02-06 reviews this file_",
  );
  lines.push("_against the anonymised fixture before commit._");
  lines.push("");

  // ---- 1. Timer endpoint result ------------------------------------------
  lines.push("## Timer endpoint result");
  lines.push("");
  const winner = probes.find((p) => p.ok && p.status === 200);
  for (const p of probes) {
    if (p.ok) {
      lines.push(`- \`${p.path}\` → ${p.status ?? "200"} OK`);
    } else {
      lines.push(`- \`${p.path}\` → ${p.status ?? "ERROR"} (${p.error ?? "unknown"})`);
    }
  }
  lines.push("");
  if (winner) {
    lines.push(`**WINNING PATH**: \`${winner.path}\``);
    lines.push("");
    lines.push("Sample body (first 1000 chars):");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(winner.body, null, 2).slice(0, 1000));
    lines.push("```");
  } else if (probes.every((p) => p.status === 404)) {
    lines.push("All three timer paths returned 404. TIMER-01 is deferred from v1 per D-32.");
  } else {
    lines.push("No 200 response on any timer path. Inspect per-path errors above.");
  }
  lines.push("");

  // ---- 2. /v1/users/me path probe (Q1 contingency evidence) --------------
  lines.push("## /v1/users/me path probe");
  lines.push("");
  lines.push(`Status: ${meProbe.status}.`);
  lines.push("");
  if (meProbe.status === 200) {
    lines.push("Decision: no code change required; KeepingClient.me() stays on /v1/users/me.");
  } else if (meProbe.status === 404) {
    lines.push(
      `Decision: Plan 02-06 Task 3 must switch KeepingClient.me() to the org-scoped form ` +
        `/v1/organisations/${orgId}/users/me (RESEARCH Q1 contingency).`,
    );
  } else {
    lines.push(
      "Decision: unexpected status; Plan 02-06 Task 3 must investigate before committing.",
    );
  }
  lines.push("");

  // ---- 3. Time entry response shape --------------------------------------
  lines.push("## Time entry response shape");
  lines.push("");
  let firstItem: Record<string, unknown> | null = null;
  let topLevelDescription = "(unknown)";
  if (Array.isArray(entries)) {
    topLevelDescription = `Top-level shape: array of ${entries.length} items.`;
    if (entries.length > 0 && entries[0] !== null && typeof entries[0] === "object") {
      firstItem = entries[0] as Record<string, unknown>;
    }
  } else if (entries !== null && typeof entries === "object") {
    const wrapper = entries as Record<string, unknown>;
    if (Array.isArray(wrapper.entries)) {
      topLevelDescription = `Top-level shape: object with key 'entries' containing ${wrapper.entries.length} items.`;
      if (
        wrapper.entries.length > 0 &&
        wrapper.entries[0] !== null &&
        typeof wrapper.entries[0] === "object"
      ) {
        firstItem = wrapper.entries[0] as Record<string, unknown>;
      }
    } else {
      topLevelDescription = `Top-level shape: object with keys [${Object.keys(wrapper).join(", ")}] — no 'entries' array.`;
    }
  }
  lines.push(topLevelDescription);
  lines.push("");
  if (firstItem) {
    lines.push("First entry keys + typeof each value:");
    lines.push("");
    for (const [k, v] of Object.entries(firstItem)) {
      const t = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
      lines.push(`- \`${k}\`: ${t}`);
    }
  } else {
    lines.push("No items present in the capture — re-run with a wider date range.");
  }
  lines.push("");

  // ---- 4. Observed enum values (purpose, timesheet_mode) -----------------
  lines.push("## Observed enum values (purpose, timesheet_mode)");
  lines.push("");
  const purposeValues = new Set<string>();
  const items = Array.isArray(entries)
    ? entries
    : entries !== null &&
        typeof entries === "object" &&
        Array.isArray((entries as { entries?: unknown[] }).entries)
      ? (entries as { entries: unknown[] }).entries
      : [];
  for (const item of items) {
    if (item !== null && typeof item === "object") {
      const purpose = (item as Record<string, unknown>).purpose;
      if (typeof purpose === "string") purposeValues.add(purpose);
    }
  }
  if (purposeValues.size === 0) {
    lines.push("- `purpose`: no `purpose` field present in any captured entry.");
  } else {
    lines.push(
      `- \`purpose\`: distinct values: ${[...purposeValues].map((v) => `\`${v}\``).join(", ")}.`,
    );
  }
  lines.push(
    "- `timesheet_mode`: review the organisation cache (printed below) — populate this row manually after inspecting the orgs payload.",
  );
  lines.push("");

  // ---- 5. Pagination scheme observed -------------------------------------
  lines.push("## Pagination scheme observed");
  lines.push("");
  if (!Array.isArray(entries) && entries !== null && typeof entries === "object") {
    const wrapper = entries as Record<string, unknown>;
    const paginationKeys = ["meta", "pagination", "next_cursor", "links", "page", "total"];
    const present = paginationKeys.filter((k) => k in wrapper);
    if (present.length > 0) {
      lines.push(
        `Top-level pagination keys present: ${present.map((k) => `\`${k}\``).join(", ")}.`,
      );
      for (const k of present) {
        lines.push(`- \`${k}\` value (typeof): ${typeof wrapper[k]}`);
      }
    } else {
      lines.push("Not observed in this capture (no pagination-shaped keys at top level).");
    }
  } else {
    lines.push("Not observed in this capture (response is a bare array).");
  }
  lines.push("");

  // ---- 6. Error envelope observed ----------------------------------------
  lines.push("## Error envelope observed");
  lines.push("");
  const errorProbes = probes.filter((p) => !p.ok);
  if (errorProbes.length === 0) {
    lines.push("No error envelopes captured in this run.");
  } else {
    for (const p of errorProbes) {
      lines.push(`- \`${p.path}\` → status ${p.status ?? "(network)"}: ${p.error ?? "unknown"}`);
    }
  }
  lines.push("");

  // ---- 7. REQUIREMENTS update for Phase 3 --------------------------------
  lines.push("## REQUIREMENTS update for Phase 3");
  lines.push("");
  lines.push(
    "Copy ONE of the two lines below over the existing TIMER-01 row in `.planning/REQUIREMENTS.md`:",
  );
  lines.push("");
  lines.push("```");
  if (winner) {
    lines.push(`TIMER-01 | Phase 3 | verified — endpoint ${winner.path}`);
  } else if (probes.every((p) => p.status === 404)) {
    lines.push("TIMER-01 | Phase 3 | deferred — 404 on all probes");
  } else {
    lines.push("TIMER-01 | Phase 3 | TODO — inspect probes above, no clean 200 / 404 verdict");
  }
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

// ---- Main flow -------------------------------------------------------------

async function main(): Promise<void> {
  // Probe-specific fail-fast — fires BEFORE loadConfig's generic message so
  // the developer sees a probe-anchored hint. loadConfig() then runs as the
  // regular validator for the rest of the env (KEEPING_LOG_LEVEL etc).
  if (!process.env.KEEPING_TOKEN) {
    process.stderr.write(
      "[probe-live] KEEPING_TOKEN must be set in env or .env before running probe-live\n",
    );
    process.exit(1);
  }
  const config = loadConfig();
  const log = createLogger(config.KEEPING_TOKEN, config.KEEPING_LOG_LEVEL);
  const client = new KeepingClient(config.KEEPING_TOKEN, log);

  const orgId = await client.resolveOrgId();
  console.error(`[probe-live] probing against organisation_id=${orgId}`);

  // D-31: three timer-endpoint best guesses fired in parallel via
  // Promise.allSettled, but each probe already catches its own failures so
  // a Promise.all would have been safe too — allSettled is the explicit
  // belt-and-braces version asked for by D-31.
  const timerPaths = [
    `/v1/organisations/${orgId}/timers`,
    `/v1/organisations/${orgId}/timers/current`,
    `/v1/organisations/${orgId}/time_entries?running=true`,
  ];
  const settled = await Promise.allSettled(
    timerPaths.map((p) => probeTimerPath(p, config.KEEPING_TOKEN)),
  );
  const probes: TimerProbe[] = settled.map((s, i) => {
    const path = timerPaths[i] ?? "(unknown)";
    if (s.status === "fulfilled") return s.value;
    return {
      path,
      ok: false,
      error: (s.reason instanceof Error ? s.reason.message : String(s.reason)).replaceAll(
        config.KEEPING_TOKEN,
        "***",
      ),
    };
  });
  for (let i = 0; i < probes.length; i++) {
    const p = probes[i] as TimerProbe;
    const status = p.ok
      ? `${p.status ?? 200}`
      : `${p.status ?? "ERR"}${p.error ? ` (${p.error})` : ""}`;
    console.error(`[probe-live] timer probe ${i + 1}/3: ${p.path} -> ${status}`);
  }

  // Q1 contingency evidence — raw fetch (NOT client.me()) so a 401 doesn't
  // poison the cache and a 404 doesn't blow up the probe.
  const meRes = await fetch(`${KEEPING_BASE}/users/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.KEEPING_TOKEN}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const meProbe: MeProbe = { path: "/v1/users/me", ok: meRes.ok, status: meRes.status };
  console.error(`[probe-live] /v1/users/me path probe -> ${meRes.status}`);

  const from = process.env.PROBE_FROM ?? defaultLastWeek();
  const to = process.env.PROBE_TO ?? from;
  console.error(`[probe-live] capturing time_entries from=${from} to=${to}`);

  const entries = await client.get<unknown>(
    `/organisations/${orgId}/time_entries?from=${from}&to=${to}`,
  );

  // D-37: raw capture is gitignored. Write it anyway so the developer can
  // sanity-check the un-anonymised payload before committing the fixture.
  const rawPath = ".planning/research/.live-capture-raw.json";
  await writeJson(rawPath, {
    captured_at: new Date().toISOString(),
    organisation_id: orgId,
    timers: probes,
    users_me_probe: meProbe,
    time_entries: { from, to, body: entries },
  });
  console.error(`[probe-live] raw capture: ${rawPath}`);

  // D-35 step 4: anonymise then write the committed fixture.
  const fixturePath = "test/fixtures/time-entry-response.sample.json";
  await writeJson(fixturePath, anonymise(entries));
  console.error(`[probe-live] anonymised fixture: ${fixturePath}`);

  const notesPath = ".planning/research/LIVE-API.md";
  await mkdir(dirname(notesPath), { recursive: true });
  await writeFile(notesPath, buildLiveApiNotes(probes, meProbe, entries, from, to, orgId), "utf8");
  console.error(`[probe-live] human notes: ${notesPath}`);

  console.error(
    "[probe-live] probe-live complete. Review LIVE-API.md and commit the fixture + notes after confirming the anonymised output contains no PII.",
  );
}

// Entry-point guard: only run main() when invoked directly via
// `npm run probe-live` / `tsx scripts/probe-live.ts`. When the module is
// imported by the vitest unit tests, the import side-effect must be inert —
// otherwise the test runner would try to perform live HTTP calls. The check
// uses process.argv[1] to detect direct execution.
const invokedDirectly =
  typeof process.argv[1] === "string" && process.argv[1].includes("probe-live");
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`[probe-live] FAILED: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
