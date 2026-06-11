// scripts/probe-live.ts — one-shot live API probe (D-30..D-37 + D-35-R).
//
// Owns:
//   1. Timer-endpoint reality probes against the OpenAPI ground-truth paths
//      (`/{org_id}/time-entries/last`, `/{org_id}/time-entries?date=today`).
//   2. A single `/{org_id}/users/me` GET to confirm the org-scoped path
//      returns 200 (Q1 RESOLVED per D-34-R — the global `/users/me` path
//      404s and is no longer probed as a target candidate).
//   3. One time-entries capture for a user-supplied date (default today).
//   4. Anonymisation pass (D-35-R) → committed fixture under test/fixtures/.
//   5. Human-readable notes file at .planning/research/LIVE-API.md with
//      the seven mandated sections.
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
 * D-35-R denylist (locked 2026-06-11). Drift guard test 9 in
 * `test/scripts/anonymise.test.ts` asserts the exact membership + size.
 * Adding or removing a key without updating `02-CONTEXT.md` §Revisions
 * §D-35-R trips the test.
 *
 * Composition:
 *   - Observed-sensitive in real responses:
 *       `note`, `first_name`, `surname`.
 *   - Identity / linkage defence-in-depth (sensitive IF added to a future
 *     payload):
 *       `code`, `email`, `name`, `user_name`, `user_email`,
 *       `client_name`, `project_name`, `task_name`, `description`.
 *   - External references / behavioural-leakage guards:
 *       `purpose`, `external_references`.
 *
 * Numeric IDs (`id`, `user_id`, `project_id`, `task_id`, `tag_ids`) are
 * NOT redacted — they are opaque tokens, not PII.
 */
export const ANONYMISE_KEYS: ReadonlySet<string> = new Set([
  // Confirmed-sensitive in real responses (2026-06-11 probe).
  "note",
  "first_name",
  "surname",
  // Identity / linkage defence-in-depth.
  "code",
  "email",
  "name",
  "user_name",
  "user_email",
  "client_name",
  "project_name",
  "task_name",
  "description",
  // External references / behavioural-leakage guards.
  "purpose",
  "external_references",
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
  body?: unknown;
};

/** mkdir -p the parent dir, then write pretty-printed JSON. */
async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * Raw fetch against an arbitrary absolute URL, same envelope shape as
 * probeTimerPath. Used for subdomain discovery where the base host varies.
 */
async function probeAbsolutePath(url: string, token: string): Promise<TimerProbe> {
  try {
    const res = await fetch(url, {
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
        path: url,
        ok: false,
        status: res.status,
        error: text.slice(0, 500).replaceAll(token, "***"),
      };
    }
    const body = (await res.json().catch(() => null)) as unknown;
    return { path: url, ok: true, status: res.status, body };
  } catch (err) {
    return {
      path: url,
      ok: false,
      error: (err instanceof Error ? err.message : String(err)).replaceAll(token, "***"),
    };
  }
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
  meOrgProbe: MeProbe,
  entryProbes: TimerProbe[],
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
    lines.push("Sample body keys (top-level only; values intentionally not embedded):");
    lines.push("");
    lines.push("```");
    if (winner.body !== null && typeof winner.body === "object") {
      for (const k of Object.keys(winner.body as Record<string, unknown>)) {
        lines.push(`- ${k}`);
      }
    } else {
      lines.push(`(top-level shape: ${typeof winner.body})`);
    }
    lines.push("```");
  } else if (probes.every((p) => p.status === 404)) {
    lines.push(
      "All timer probes returned 404. Per D-32-R, this should not happen against the real API — re-probe and inspect.",
    );
  } else {
    lines.push("No 200 response on any timer path. Inspect per-path errors above.");
  }
  lines.push("");

  // ---- 2. /users/me path probe (Q1 RESOLVED — kept for transparency) ----
  lines.push("## /users/me path probe");
  lines.push("");
  lines.push(`- \`${meProbe.path}\` → ${meProbe.status}`);
  lines.push(`- \`${meOrgProbe.path}\` → ${meOrgProbe.status}`);
  lines.push("");
  if (meOrgProbe.status === 200) {
    lines.push(
      "Decision (D-34-R): KeepingClient.me() calls the org-scoped path " +
        "`/{orgId}/users/me`. Confirmed 200 against this token.",
    );
  } else {
    lines.push(
      "WARNING: the org-scoped /users/me path did not return 200. Investigate before " +
        "trusting this probe run — D-34-R assumes org-scoped works.",
    );
  }
  lines.push("");

  // ---- 2b. Entries path discovery ---------------------------------------
  lines.push("## Entries path discovery");
  lines.push("");
  for (const p of entryProbes) {
    if (p.ok) {
      lines.push(`- \`${p.path}\` → ${p.status ?? "200"} OK`);
    } else {
      lines.push(`- \`${p.path}\` → ${p.status ?? "ERROR"} (${p.error ?? "unknown"})`);
    }
  }
  lines.push("");
  const winningEntryProbe = entryProbes.find((p) => p.ok && p.status === 200);
  if (winningEntryProbe) {
    lines.push(`**WINNING ENTRIES PATH**: \`${winningEntryProbe.path}\``);
  } else {
    lines.push(
      "**NO WINNING ENTRIES PATH**. Per D-34-R the single-day endpoint " +
        "`/{orgId}/time-entries?date=...` should return 200 against any real token.",
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
    // D-34-R: the real wrapper key is `time_entries` (underscore).
    const innerKey = Array.isArray(wrapper.time_entries)
      ? "time_entries"
      : Array.isArray(wrapper.entries)
        ? "entries"
        : null;
    if (innerKey) {
      const inner = wrapper[innerKey] as unknown[];
      topLevelDescription = `Top-level shape: object with key '${innerKey}' containing ${inner.length} items.`;
      if (inner.length > 0 && inner[0] !== null && typeof inner[0] === "object") {
        firstItem = inner[0] as Record<string, unknown>;
      }
    } else {
      topLevelDescription = `Top-level shape: object with keys [${Object.keys(wrapper).join(", ")}] — no entries array.`;
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
    : entries !== null && typeof entries === "object"
      ? Array.isArray((entries as { time_entries?: unknown[] }).time_entries)
        ? ((entries as { time_entries: unknown[] }).time_entries as unknown[])
        : Array.isArray((entries as { entries?: unknown[] }).entries)
          ? ((entries as { entries: unknown[] }).entries as unknown[])
          : []
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
    "Copy the appropriate line below over the existing TIMER-01 row in `.planning/REQUIREMENTS.md`:",
  );
  lines.push("");
  lines.push("```");
  if (winner) {
    lines.push(`TIMER-01 | Phase 2.5 | verified — endpoint ${winner.path}`);
  } else {
    lines.push("TIMER-01 | Phase 2.5 | TODO — inspect probes above, no 200 verdict");
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

  // Discovery probes — REST roots and OpenAPI/Swagger docs sometimes
  // advertise the actual collection list.
  const discoveryUrls = [
    `${KEEPING_BASE}`,
    `https://api.keeping.nl`,
    `${KEEPING_BASE}/openapi.json`,
    `${KEEPING_BASE}/swagger.json`,
    `${KEEPING_BASE}/docs`,
  ];
  const discoveryProbes: TimerProbe[] = [];
  for (const url of discoveryUrls) {
    const p = await probeAbsolutePath(url, config.KEEPING_TOKEN);
    discoveryProbes.push({ ...p, path: url });
    console.error(`[probe-live] discovery probe ${url} -> ${p.status ?? "ERR"}`);
  }
  const rootProbe = discoveryProbes[0]; // back-compat label

  // Capture the raw /organisations payload BEFORE client unwrap so we can
  // inspect the exact shape (numeric id vs slug, nested feature flags, etc.)
  // when downstream paths 404. The KeepingClient unwrap only retains the
  // list — but discovery needs the full envelope.
  const orgsRawRes = await fetch(`${KEEPING_BASE}/organisations`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.KEEPING_TOKEN}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const orgsRaw = (await orgsRawRes.json().catch(() => null)) as unknown;
  console.error(`[probe-live] /v1/organisations raw status=${orgsRawRes.status}`);

  const orgId = await client.resolveOrgId();
  console.error(`[probe-live] probing against organisation_id=${orgId}`);

  // GROUND TRUTH from OpenAPI: there is no /timers resource. The "current
  // running timer" is the most recent time-entry whose `ongoing === true`
  // (or via /time-entries/last).
  const today = new Date().toISOString().slice(0, 10);
  // probeTimerPath prepends KEEPING_BASE (= /v1) — paths must NOT begin with /v1.
  const timerPaths = [`/${orgId}/time-entries/last`, `/${orgId}/time-entries?date=${today}`];
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
    console.error(`[probe-live] timer probe ${i + 1}/${probes.length}: ${p.path} -> ${status}`);
  }

  // Q1 contingency evidence — raw fetch (NOT client.me()) so a 401 doesn't
  // poison the cache and a 404 doesn't blow up the probe. Keep the global
  // /users/me probe even though D-34-R resolves the path in favour of the
  // org-scoped form — it confirms the 404 still occurs (a future
  // re-introduction of /users/me at the global path would be a positive
  // signal worth surfacing).
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

  // D-34-R: the org-scoped path is `/v1/{orgId}/users/me`, NOT
  // `/v1/organisations/{orgId}/users/me`.
  const meOrgRes = await fetch(`${KEEPING_BASE}/${orgId}/users/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.KEEPING_TOKEN}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const meOrgProbe: MeProbe = {
    path: `/v1/${orgId}/users/me`,
    ok: meOrgRes.ok,
    status: meOrgRes.status,
  };
  console.error(`[probe-live] /v1/${orgId}/users/me path probe -> ${meOrgRes.status}`);

  // Default to today since /time-entries is a single-day endpoint and the dev
  // is most likely actively logging time today (more useful sample).
  const from = process.env.PROBE_FROM ?? new Date().toISOString().slice(0, 10);
  const to = process.env.PROBE_TO ?? from;
  console.error(`[probe-live] capturing time_entries from=${from} to=${to}`);

  // Path-discovery loop is now a sanity check rather than open exploration:
  // we already know the ground-truth paths from OpenAPI. The probe still
  // tries them to confirm 200 against the live token.
  type EntryCandidate = { base: string; path: string; q: string };
  const apiBase = KEEPING_BASE.replace(/\/v1$/, ""); // strip /v1 so candidates control their own prefix
  // GROUND TRUTH from OpenAPI spec at https://developer.keeping.nl/openapi.json:
  //   - Path pattern is `/{organisation_id}/...` (NOT `/organisations/{id}/...`)
  //   - Endpoint is `time-entries` with hyphen (NOT `time_entries`)
  //   - Single-day endpoint: `?date=YYYY-MM-DD`
  //   - Multi-day range:     `/{organisation_id}/report/time-entries?from=&to=`
  const candidates: EntryCandidate[] = [
    { base: apiBase, path: `/v1/${orgId}/time-entries`, q: `date=${from}` },
    { base: apiBase, path: `/v1/${orgId}/report/time-entries`, q: `from=${from}&to=${to}` },
  ];
  const entryProbes: TimerProbe[] = [];
  for (const c of candidates) {
    const fullPath = `${c.base}${c.path}?${c.q}`;
    const probe = await probeAbsolutePath(fullPath, config.KEEPING_TOKEN);
    // Preserve TimerProbe shape but use the absolute URL as the path label
    entryProbes.push({ ...probe, path: fullPath });
    const status = probe.ok ? `${probe.status ?? 200}` : `${probe.status ?? "ERR"}`;
    console.error(`[probe-live] entries probe ${fullPath} -> ${status}`);
    if (probe.ok && probe.status === 200) break;
  }
  const winningEntry = entryProbes.find((p) => p.ok && p.status === 200);
  const entries: unknown = winningEntry?.body ?? null;
  if (!winningEntry) {
    console.error(
      "[probe-live] NO ENTRY PATH RETURNED 200 — see entries probe table in LIVE-API.md",
    );
  }

  // D-37: raw capture is gitignored. Write it anyway so the developer can
  // sanity-check the un-anonymised payload before committing the fixture.
  const rawPath = ".planning/research/.live-capture-raw.json";
  await writeJson(rawPath, {
    captured_at: new Date().toISOString(),
    organisation_id: orgId,
    root_probe: rootProbe,
    discovery_probes: discoveryProbes,
    organisations_raw: { status: orgsRawRes.status, body: orgsRaw },
    timers: probes,
    users_me_probe: meProbe,
    users_me_org_probe: meOrgProbe,
    entries_path_probes: entryProbes,
    time_entries: { from, to, body: entries },
  });
  console.error(`[probe-live] raw capture: ${rawPath}`);

  // D-35-R denylist is now aligned with observed-sensitive fields. The
  // PROBE_WRITE_FIXTURE gate is RETAINED as a deliberate two-step safety
  // net: the developer reviews the raw capture in
  // `.planning/research/.live-capture-raw.json` first, confirms anonymise()
  // would scrub everything sensitive in their own payload, then re-runs
  // with PROBE_WRITE_FIXTURE=1 to commit the anonymised fixture. The gate
  // can be removed in a follow-up once one clean fixture is committed.
  if (process.env.PROBE_WRITE_FIXTURE === "1") {
    const fixturePath = "test/fixtures/time-entry-response.sample.json";
    await writeJson(fixturePath, anonymise(entries));
    console.error(`[probe-live] anonymised fixture: ${fixturePath}`);
  } else {
    console.error(
      "[probe-live] fixture write SKIPPED (set PROBE_WRITE_FIXTURE=1 after reviewing .live-capture-raw.json).",
    );
  }

  // LIVE-API.md is rendered from probe results without embedding raw bodies
  // (the section-3 sample-body section only lists top-level keys now). It
  // is therefore SAFE to write unconditionally; the previous fixture gate
  // existed because raw bodies were embedded.
  const notesPath = ".planning/research/LIVE-API.md";
  await mkdir(dirname(notesPath), { recursive: true });
  await writeFile(
    notesPath,
    buildLiveApiNotes(probes, meProbe, meOrgProbe, entryProbes, entries, from, to, orgId),
    "utf8",
  );
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
