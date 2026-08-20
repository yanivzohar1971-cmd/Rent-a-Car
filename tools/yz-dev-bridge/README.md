# YZ Dev Bridge

A small shared MCP bridge for handing development work between ChatGPT and Cursor without copy/paste.

This is the canonical copy for Rent_a_Car:

`C:\Users\Yaniv\source\repos\Rent_a_Car\tools\yz-dev-bridge`

The original zip used for migration remains at `C:\Users\Yaniv\Downloads\YZ-DevBridge-v1.0.0\YZ-DevBridge` and should not be used for further development.

Repository overview: `C:\Users\Yaniv\source\repos\Rent_a_Car\docs\YZ-DEV-BRIDGE.md`

Detailed docs in `docs\`:

- `ARCHITECTURE.md`
- `FIREBASE-RELAY.md`
- `LOCAL-DEVELOPMENT.md`
- `SECURITY.md`
- `TROUBLESHOOTING.md`

## What it does

The bridge is a persistent task/context store exposed as MCP tools. Both clients see the same JSON-backed state.

Main flow:

1. ChatGPT creates a task with `bridge_create_task`.
2. Cursor atomically picks it up with `bridge_claim_next_task` (or lists/claims a specific task).
3. Cursor works in the real repository.
4. Cursor publishes findings/results with `bridge_update_task`.
5. ChatGPT reads the same task with `bridge_get_task`.

No repository files are modified by the bridge itself. The bridge only carries task state, context and results.

## Requirements

- Node.js 20+
- npm
- Cursor with MCP support
- For ChatGPT custom MCP apps: a plan/workspace that supports developer mode/custom MCP apps, plus a remotely reachable HTTPS endpoint.

## Install

From this directory:

    npm install
    npm test

A dependency-free CLI is also included for diagnostics:

    npm run cli -- status

## Cursor — local stdio mode

The included `.cursor/mcp.json` works when Cursor opens this bridge directory itself.

To install the bridge into another workspace such as RentACar:

    .\install-cursor.ps1 -WorkspacePath "C:\path\to\RentACar"

The script writes that workspace's `.cursor/mcp.json` using an absolute path to this bridge and also installs the recommended Cursor rule.

Restart Cursor or refresh MCP servers. The server should appear as `yz-dev-bridge` with these tools:

- `bridge_status`
- `bridge_create_task`
- `bridge_list_tasks`
- `bridge_get_task`
- `bridge_claim_task`
- `bridge_claim_next_task`
- `bridge_update_task`
- `bridge_put_context`
- `bridge_get_context`
- `bridge_list_projects`

## HTTP mode

For a remote MCP client or tunnel:

    $env:BRIDGE_AUTH_TOKEN="use-a-long-random-secret"
    npm run http

Defaults:

- MCP: `http://127.0.0.1:8787/mcp`
- Health: `http://127.0.0.1:8787/health`

Cursor can also connect via HTTP:

    {
      "mcpServers": {
        "yz-dev-bridge": {
          "url": "http://127.0.0.1:8787/mcp",
          "headers": {
            "Authorization": "Bearer YOUR_SECRET"
          }
        }
      }
    }

## ChatGPT connection

ChatGPT cannot access localhost. Prefer the Firebase HTTPS relay documented in `docs/FIREBASE-RELAY.md`.

The older HTTP MCP path is still available for a tunnel:

ChatGPT custom MCP apps require a remote endpoint, so localhost is not enough. Run HTTP mode and expose `/mcp` through a secure HTTPS deployment/tunnel, then configure that HTTPS MCP endpoint as the custom app endpoint.

Important security rule: do not expose write-capable MCP tools publicly without authentication/access control. `src/http.js` refuses a non-loopback bind unless a bearer token is configured, unless you explicitly override the safety check.

If the ChatGPT MCP configuration you use requires OAuth rather than a static bearer token, put an OAuth-capable gateway/proxy in front of this bridge instead of disabling authentication.

## Firebase relay (optional)

```
npm run relay
```

Requires `YZ_BRIDGE_FIREBASE_API_URL` and `YZ_BRIDGE_API_TOKEN` (see `.env.example`). The relay does not execute shell commands.

## Data

Default persistent state:

    data/bridge.json

Override with:

    BRIDGE_DATA_FILE=C:\somewhere\bridge.json

Writes are serialized and use atomic temp-file rename so two clients do not overwrite each other's updates within one bridge process.

## Suggested usage

From ChatGPT:

    Create a high-priority RentACar task called "Diagnose Shagrir matching" with the full constraints and evidence.

From Cursor:

    Check YZ Dev Bridge for the newest READY RentACar task and execute it.

Back in ChatGPT:

    Read the latest result for that task and review Cursor's findings.

## Security model

- Local Cursor path: stdio, no network port.
- Remote path: Streamable HTTP or Firebase HTTPS relay.
- HTTP bearer token is optional on localhost but strongly recommended elsewhere.
- Firebase `yzBridgeApi` always requires a bearer token.
- The bridge never executes arbitrary shell commands and never edits repositories by itself.
- Repository modifications remain under Cursor's normal approval/security model.
