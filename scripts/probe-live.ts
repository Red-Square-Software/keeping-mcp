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
 *
 * KNOWN-WRONG (2026-06-11): the live probe revealed NONE of these keys
 * exist in real Keeping responses. The real sensitive fields are `note`,
 * `first_name`, `surname`. See `.planning/research/LIVE-API-FINDINGS.md` §7
 * — D-35 must be formally revised before the fixture is regenerated.
 * Until that revision lands, the `main()` flow below short-circuits the
 * fixture write (see PROBE_WRITE_FIXTURE guard) to keep accidental leaks
 * out of the committed tree.
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
  body?: unknown;
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
  lines.push(`- \`${meProbe.path}\` → ${meProbe.status}`);
  lines.push(`- \`${meOrgProbe.path}\` → ${meOrgProbe.status}`);
  lines.push("");
  if (meProbe.status === 200) {
    lines.push("Decision: no code change required; KeepingClient.me() stays on /v1/users/me.");
  } else if (meProbe.status === 404 && meOrgProbe.status === 200) {
    lines.push(
      `Decision: Plan 02-06 Task 3 must switch KeepingClient.me() to the org-scoped form ` +
        `\`/organisations/{org_id}/users/me\` (verified 200 against this token).`,
    );
  } else if (meProbe.status === 404 && meOrgProbe.status === 404) {
    lines.push(
      "Decision: BOTH the global and org-scoped /users/me paths returned 404. " +
        "Plan 02-06 Task 3 must investigate (no path verified) — likely the auth token " +
        "is scoped to a different endpoint, or `me` is exposed under another path entirely.",
    );
  } else {
    lines.push(
      "Decision: unexpected status combination; Plan 02-06 Task 3 must investigate before committing.",
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
      "**NO WINNING ENTRIES PATH**. Plan 02-06 Task 3 must extend the candidate list " +
        "and re-probe before committing the fixture.",
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
  // running timer" is the most recent time-entry whose `end` field is null
  // (or via /time-entries/last). This rewrites D-31's probes to point at
  // the real endpoint and a representative `date=today` listing.
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
  // poison the cache and a 404 doesn't blow up the probe. Also probe the
  // org-scoped fallback so Plan 02-06 Task 3 has a verified target path.
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

  const meOrgRes = await fetch(`${KEEPING_BASE}/organisations/${orgId}/users/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.KEEPING_TOKEN}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const meOrgProbe: MeProbe = {
    path: `/v1/organisations/${orgId}/users/me`,
    ok: meOrgRes.ok,
    status: meOrgRes.status,
  };
  console.error(
    `[probe-live] /v1/organisations/${orgId}/users/me path probe -> ${meOrgRes.status}`,
  );

  // Tenant-subdomain /users/me probes — three prefixes since the API base
  // path under tenant.keeping.nl is unknown.
  const meTenantProbes: MeProbe[] = [];
  // Extract tenantBase early so /users/me discovery can use it
  let tenantBaseEarly: string | null = null;
  if (orgsRaw !== null && typeof orgsRaw === "object") {
    const arr = (orgsRaw as { organisations?: unknown[] }).organisations;
    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr[0] as { url?: unknown };
      if (typeof first.url === "string") tenantBaseEarly = first.url.replace(/\/$/, "");
    }
  }
  // GROUND TRUTH from OpenAPI: /{organisation_id}/users/me is the real path.
  const meCandidates: string[] = [`${KEEPING_BASE}/${orgId}/users/me`];
  for (const url of meCandidates) {
    const probe = await probeAbsolutePath(url, config.KEEPING_TOKEN);
    meTenantProbes.push({ path: url, ok: probe.ok, status: probe.status ?? 0, body: probe.body });
    console.error(`[probe-live] me probe ${url} -> ${probe.status ?? "ERR"}`);
    if (probe.ok && probe.status === 200) break;
  }

  // Default to today since /time-entries is a single-day endpoint and the dev
  // is most likely actively logging time today (more useful sample).
  const from = process.env.PROBE_FROM ?? new Date().toISOString().slice(0, 10);
  const to = process.env.PROBE_TO ?? from;
  console.error(`[probe-live] capturing time_entries from=${from} to=${to}`);

  // Subdomain-scoped API discovery — the org payload exposes a `url` field
  // (e.g. https://red-square.keeping.nl) suggesting per-tenant subdomain
  // routing rather than path scoping under api.keeping.nl. Pull the URL out
  // of the raw orgs payload, then probe (subdomain, path) combinations.
  let tenantBase: string | null = null;
  if (orgsRaw !== null && typeof orgsRaw === "object") {
    const orgsArr = (orgsRaw as { organisations?: unknown[] }).organisations;
    if (Array.isArray(orgsArr) && orgsArr.length > 0) {
      const first = orgsArr[0] as { url?: unknown };
      if (typeof first.url === "string") {
        tenantBase = first.url.replace(/\/$/, "");
      }
    }
  }
  console.error(`[probe-live] tenant base URL from orgs payload: ${tenantBase ?? "(none)"}`);

  // Path-discovery loop — the actual entries endpoint name is unknown until
  // the live probe reveals it. Try several plausible (base, path, query)
  // combinations and capture every result. The first 200 wins.
  type EntryCandidate = { base: string; path: string; q: string };
  const apiBase = KEEPING_BASE.replace(/\/v1$/, ""); // strip /v1 so candidates control their own prefix
  // GROUND TRUTH from OpenAPI spec at https://developer.keeping.nl/openapi.json:
  //   - Path pattern is `/{organisation_id}/...` (NOT `/organisations/{id}/...`)
  //   - Endpoint is `time-entries` with hyphen (NOT `time_entries`)
  //   - Query param is `date=YYYY-MM-DD` (single day, NOT from/to range)
  //   - For ranges/many entries, use `/{organisation_id}/report/time-entries`
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
    users_me_tenant_probes: meTenantProbes,
    entries_path_probes: entryProbes,
    time_entries: { from, to, body: entries },
  });
  console.error(`[probe-live] raw capture: ${rawPath}`);

  // D-35 step 4 — DISABLED 2026-06-11. The live probe proved D-35's denylist
  // names keys that do not exist in real responses (`description`,
  // `project_name`, etc.) while real sensitive keys (`note`, `first_name`,
  // `surname`) are NOT in the denylist. Writing the fixture under the
  // current `anonymise()` would leak verbatim notes. Override with
  // `PROBE_WRITE_FIXTURE=1` only after D-35 is formally revised and the
  // denylist matches observed-sensitive fields.
  if (process.env.PROBE_WRITE_FIXTURE === "1") {
    const fixturePath = "test/fixtures/time-entry-response.sample.json";
    await writeJson(fixturePath, anonymise(entries));
    console.error(`[probe-live] anonymised fixture: ${fixturePath}`);
  } else {
    console.error(
      "[probe-live] fixture write SKIPPED (D-35 denylist out of date; see LIVE-API-FINDINGS.md §7).",
    );
  }

  // LIVE-API.md historically embedded raw sample bodies. After the
  // 2026-06-11 live probe we know those bodies can contain real `note`
  // text. The file path is now gitignored, but to be safe we also gate
  // its generation behind the same fixture-write env var. The structured
  // findings live in `.planning/research/LIVE-API-FINDINGS.md` (hand-curated,
  // never embedded raw bodies).
  if (process.env.PROBE_WRITE_FIXTURE === "1") {
    const notesPath = ".planning/research/LIVE-API.md";
    await mkdir(dirname(notesPath), { recursive: true });
    await writeFile(
      notesPath,
      buildLiveApiNotes(probes, meProbe, meOrgProbe, entryProbes, entries, from, to, orgId),
      "utf8",
    );
    console.error(`[probe-live] human notes: ${notesPath}`);
  } else {
    console.error(
      "[probe-live] LIVE-API.md write SKIPPED (embeds raw bodies; gate behind PROBE_WRITE_FIXTURE=1 after D-35 revision).",
    );
  }

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
