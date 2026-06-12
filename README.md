# keeping-mcp

![CI](https://github.com/red-square-software/keeping-mcp/actions/workflows/ci.yml/badge.svg)

Open-source Model Context Protocol (MCP) server that exposes the Keeping (api.keeping.nl) time-tracking API as tools an AI coding assistant can call. Built for solo developers who use Claude Code (or any MCP-capable client) and want their billable hours logged into Keeping at the end of a session instead of typed in by hand, while keeping Keeping's existing native Jortt invoicing integration intact. Every write tool is dry-run by default — your hours never reach Keeping until you explicitly confirm.

> ## ⚠ Writes are dry-run BY DEFAULT
>
> Every write tool (`keeping_add_entry`, `keeping_update_entry`, `keeping_delete_entry`,
> `keeping_start_timer`, `keeping_stop_timer`, `keeping_resume_timer`) returns a
> **preview** unless you pass `confirm: true` in the tool call.
>
> Setting `KEEPING_REQUIRE_CONFIRM=false` in your environment **disables this gate**.
> Writes then happen on the first call — there is no second chance.
>
> Recommendation: **never disable this gate** unless you are running
> the server in a non-interactive automation context and have explicitly accepted
> the loss of the confirmation step.

## Install

### Claude Code on Windows 11

Add to `%APPDATA%\Claude\claude_desktop_config.json` or to your project's `.mcp.json` file.

```json
{
  "mcpServers": {
    "keeping-mcp": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@red-square/keeping-mcp"],
      "env": {
        "KEEPING_TOKEN": "kp_live_your_token_here"
      }
    }
  }
}
```

The `cmd /c` wrapper is required on Windows — `npx` resolves to `npx.cmd`, and Claude Code's process spawn does not search PATHEXT extensions (see [anthropics/claude-code#58510](https://github.com/anthropics/claude-code/issues/58510)).

### Claude Code on macOS / Linux

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `~/.config/Claude/claude_desktop_config.json` (Linux), or your project's `.mcp.json`.

```json
{
  "mcpServers": {
    "keeping-mcp": {
      "command": "npx",
      "args": ["-y", "@red-square/keeping-mcp"],
      "env": {
        "KEEPING_TOKEN": "kp_live_your_token_here"
      }
    }
  }
}
```

### Other MCP clients

Any MCP-capable client that supports the stdio transport works. The server is started by `npx -y @red-square/keeping-mcp` and reads `KEEPING_TOKEN` from its environment. Discoverable in the [MCP Registry](https://registry.modelcontextprotocol.io/) as `io.github.red-square-software/keeping-mcp`.

## Get a Keeping access token

1. Sign in to your Keeping account.
2. Open **Preferences** (top-right menu).
3. Find the section **Show features for developers** and enable it.
4. A new **Personal access tokens** section appears.
5. Click **Generate new token**, name it (e.g. "Claude Code"), and copy the value.
6. Store it as `KEEPING_TOKEN` in your shell environment OR in your Claude Code config `env` block.

The token has full read+write access to your time entries — treat it like a password. Never commit it to git, never paste it into a chat, never read it back from a tool response (`keeping-mcp` never echoes it).

## Configuration

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `KEEPING_TOKEN` | yes | — | Keeping personal access token (created via the section above). |
| `KEEPING_REQUIRE_CONFIRM` | no | `true` | When `true`, write tools return a preview unless called with `confirm: true`. Setting to `false` disables the gate entirely — see warning below. |
| `KEEPING_ORG_ID` | no | — | Pin all calls to one organisation id. When unset and the token has access to multiple orgs, write tools require explicit `organisation_id` input per call. |
| `KEEPING_LOG_LEVEL` | no | `info` | Server stderr log verbosity. Accepts: `debug`, `info`, `warn`, `error`. |

> ## ⚠ Writes are dry-run BY DEFAULT
>
> Every write tool (`keeping_add_entry`, `keeping_update_entry`, `keeping_delete_entry`,
> `keeping_start_timer`, `keeping_stop_timer`, `keeping_resume_timer`) returns a
> **preview** unless you pass `confirm: true` in the tool call.
>
> Setting `KEEPING_REQUIRE_CONFIRM=false` in your environment **disables this gate**.
> Writes then happen on the first call — there is no second chance.
>
> Recommendation: **never disable this gate** unless you are running
> the server in a non-interactive automation context and have explicitly accepted
> the loss of the confirmation step.

## Tools

keeping-mcp registers 12 tools when the server starts. Read tools (`keeping_me`, `keeping_organisations`, `keeping_projects`, `keeping_tasks`, `keeping_list_entries`, `keeping_timer_status`) call Keeping's API without confirmation. Write tools (`keeping_add_entry`, `keeping_update_entry`, `keeping_delete_entry`, `keeping_start_timer`, `keeping_stop_timer`, `keeping_resume_timer`) return a dry-run preview unless invoked with `confirm: true` (default behavior controlled by `KEEPING_REQUIRE_CONFIRM`).

## Dry-run workflow (example transcript)

Write tools follow a two-step pattern: propose-then-confirm. The first call returns a preview of the HTTP request the server would send; the second call (with `confirm: true`) actually sends it.

Step 1 — preview (no `confirm`, no API call made). Illustrative; actual field names match Keeping's OpenAPI (see https://developer.keeping.nl).

```json
{
  "tool": "keeping_add_entry",
  "input": {
    "description": "Phase 4 release prep",
    "hours": 1.5,
    "project_id": 123
  },
  "response": {
    "would_post": {
      "method": "POST",
      "url": "/v1/organisations/456/time_entries",
      "body": {
        "description": "Phase 4 release prep",
        "hours": 1.5,
        "project_id": 123,
        "date": "2026-06-12",
        "purpose": "work"
      }
    }
  }
}
```

Step 2 — confirm (`confirm: true` added, request is sent to Keeping). Illustrative; actual response shape mirrors Keeping's OpenAPI.

```json
{
  "tool": "keeping_add_entry",
  "input": {
    "description": "Phase 4 release prep",
    "hours": 1.5,
    "project_id": 123,
    "confirm": true
  },
  "response": {
    "id": 98765,
    "day": "2026-06-12",
    "hours": 1.5,
    "description": "Phase 4 release prep",
    "project_id": 123,
    "purpose": "work"
  }
}
```

## Verifying provenance

Releases are published via GitHub Actions OIDC trusted publishing (no long-lived npm tokens). Every release carries an npm provenance attestation linking the published tarball to a specific commit in this repository.

```bash
npm audit signatures
# or, for a single package:
npm view @red-square/keeping-mcp --json | jq '.dist.attestations'
```

## Local development

```bash
git clone https://github.com/red-square-software/keeping-mcp.git
cd keeping-mcp
npm ci
npm test
npm run build
KEEPING_TOKEN=kp_live_your_token_here node dist/bin/keeping-mcp.js
```

All server output goes to stderr — stdout is reserved for MCP JSON-RPC framing. Never write diagnostic output to stdout; use `console.error` for logging.

## License

MIT — see [LICENSE](LICENSE).
