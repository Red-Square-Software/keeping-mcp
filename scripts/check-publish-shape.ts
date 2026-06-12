// scripts/check-publish-shape.ts — pre-publish CI gate (DIST-04 + DIST-05).
//
// Runs three assertions and exits non-zero if any fails. Output is stderr-only
// (CLAUDE.md: stdio MCP servers must never pollute stdout; this script reuses
// the same discipline so it's safe to invoke from any context).
//
// Assertion 1 (DIST-04 / ROADMAP SC #1): `npm pack --dry-run --json` ships
//   exactly the four-file ALLOWLIST. Any drift (a stray test file, a leaked
//   .env, a forgotten dist subdirectory) fails before publish.
//
// Assertion 2 (DIST-05 / RESEARCH §Pitfall 6): package.json.mcpName ===
//   server.json.name. mcp-publisher rejects drift at registry publish time;
//   this is the local guard that catches it pre-tag-push.
//
// Assertion 3 (DIST-04 anti-pattern): refuses to run if .npmignore exists.
//   .npmignore silently overrides files[] — DIST-04 mandates files[] as the
//   SOLE filter mechanism, so an .npmignore appearing in the repo is a regression.
//
// Invoked via `npm run check-publish-shape` (wired in package.json scripts).
// Plan 04-03's release workflow runs this as a CI step before `npm publish`.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWLIST: readonly string[] = [
  "LICENSE",
  "README.md",
  "dist/bin/keeping-mcp.js",
  "package.json",
];

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(msg: string): never {
  process.stderr.write(`[check-publish-shape] FAIL: ${msg}\n`);
  process.exit(1);
}

function ok(msg: string): void {
  process.stderr.write(`[check-publish-shape] OK: ${msg}\n`);
}

// ---- Assertion 1: tarball allowlist (DIST-04 / ROADMAP SC #1) -------------
const packResult = spawnSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
  shell: process.platform === "win32",
});
if (packResult.status !== 0) {
  fail(`npm pack --dry-run --json exited ${packResult.status}: ${packResult.stderr}`);
}
const parsed = JSON.parse(packResult.stdout) as Array<{ files: Array<{ path: string }> }>;
const actualPaths = parsed[0]?.files.map((f) => f.path).sort() ?? [];
const expectedPaths = [...ALLOWLIST].sort();
const driftDetected =
  actualPaths.length !== expectedPaths.length || actualPaths.some((p, i) => p !== expectedPaths[i]);
if (driftDetected) {
  fail(
    `tarball contents drift\n  expected: ${JSON.stringify(expectedPaths)}\n  actual:   ${JSON.stringify(actualPaths)}`,
  );
}
ok(`tarball contents match allowlist (${actualPaths.length} files)`);

// ---- Assertion 2: mcpName <-> server.json.name binding (DIST-05) ----------
const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")) as {
  mcpName?: string;
};
const srv = JSON.parse(readFileSync(resolve(REPO_ROOT, "server.json"), "utf8")) as {
  name?: string;
};
if (!pkg.mcpName) {
  fail("package.json missing mcpName field — DIST-02 regressed");
}
if (pkg.mcpName !== srv.name) {
  fail(`namespace drift: package.json.mcpName='${pkg.mcpName}' but server.json.name='${srv.name}'`);
}
ok(`mcpName <-> server.json.name bound to ${pkg.mcpName}`);

// ---- Assertion 3: no .npmignore (DIST-04 sole-filter mandate) ------------
if (existsSync(resolve(REPO_ROOT, ".npmignore"))) {
  fail(".npmignore exists — DIST-04 mandates files[] whitelist as the SOLE filter mechanism");
}
ok("no .npmignore present — files[] whitelist is the sole filter");

process.stderr.write("[check-publish-shape] All three assertions passed.\n");
