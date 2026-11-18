# rentacar-mcp-host

Minimal **stdio MCP server** (JSON-RPC 2.0, newline-delimited) that lets Claude Code call the Rent a Car
Agent API gateway. No npm dependencies, no paid services, Node.js ≥ 18.

> **Status: development foundation.** It forwards to a gateway URL. There is currently **no production
> gateway on a real Android device** — see `docs/agent-api/AGENT-026-WINDOWS-MCP-HOST.md`.

## Behavior

| MCP method | Gateway call |
|------------|--------------|
| `initialize`, `ping`, `notifications/*` | handled locally |
| `tools/list` | `GET  {RENTACAR_GATEWAY_URL}/v1/tools` with `Authorization: Bearer <token>` |
| `tools/call` | `POST {RENTACAR_GATEWAY_URL}/v1/execute` with `Authorization: Bearer <token>`, body `{operation, parameters, requestId}` |

The host never sends a `userUid`; the gateway derives identity from the device token. Tool results are
returned as one JSON text block; `isError` is true unless the gateway answered `success: true`.

## Configuration (environment)

| Variable | Default | Purpose |
|----------|---------|---------|
| `RENTACAR_GATEWAY_URL` | `http://127.0.0.1:8742` | Gateway base URL |
| `RENTACAR_DEVICE_TOKEN` | *(required)* | Device token (`rac1.…`) issued at pairing |
| `RENTACAR_REQUEST_TIMEOUT_MS` | `15000` | Per-request timeout |
| `RENTACAR_EXECUTION_MODE` | `FIXTURE_TEST` | `FIXTURE_TEST` or `EMULATOR_REAL_ROOM` (see below) |

### Execution modes (AGENT-101)

| Mode | Behavior |
|------|----------|
| `FIXTURE_TEST` (default) | Legacy behavior: default gateway URL, fake/fixture gateways allowed. |
| `EMULATOR_REAL_ROOM` | Talks to the **AgentDev APK** (`com.rentacar.app.agentdev`) running on an emulator, backed by its real Room DB. **Requires** an explicit `RENTACAR_GATEWAY_URL`. There is **no fixture fallback**. Exits non-zero only for invalid configuration (2). |

### Availability and recovery (AGENT-121)

The host **never exits because the device is offline**. It keeps a connection state
(`ONLINE | DEVICE_UNAVAILABLE | AUTH_FAILED | NOT_CONFIGURED | UNKNOWN`) and:

- always exposes the local tool **`connection.status`** (live health, data environment, executable tool count);
- exposes the gateway's business tools **only while they are executable** (offline → status tool only);
- answers a business call made while offline with a structured `DEVICE_UNAVAILABLE` result (`data: null`,
  `maybeDelivered` flag) — **never retried**; the only retry is after HTTP 401 when the token source now
  yields a *different* token (gateway rejected the old token before executing anything);
- polls `/v1/health` every `RENTACAR_HEALTH_POLL_MS` (default 10000) and sends
  `notifications/tools/list_changed` when executability flips, so Claude Code picks the tools up
  without re-registering the server;
- reads the token from `RENTACAR_DEVICE_TOKEN` or, if unset, re-reads `RENTACAR_TOKEN_FILE` on each use
  (the launcher points it at `build/agentapi-e2e/token.env`), so token rotation after an emulator
  restart is picked up automatically.

### Data environment labels (AGENT-132)

`RENTACAR_DATA_ENVIRONMENT` = `DEVELOPMENT_DATA` (default for `EMULATOR_REAL_ROOM`) | `REAL_LOCAL_DATA` |
`REAL_CLOUD_DATA` | `TEST_FIXTURES` (default for `FIXTURE_TEST`). It is set per connector registration,
prefixed to every business tool description (`[DEVELOPMENT_DATA] …`), returned in `serverInfo`, and
attached to every tool result as `connector.dataEnvironment`, so synthetic data can never be presented as
real business data.

### One-command development session (AGENT-123)

```powershell
.\tools\agentapi\start-rentcar-claude.ps1     # idempotent; leaves the session running
.\tools\agentapi\stop-rentcar-claude.ps1      # removes only resources the session created
```

The AgentDev gateway listens on **port 18765** inside the emulator (127.0.0.1 only). Expose it with
`adb -s <serial> forward tcp:18765 tcp:18765`, then use `RENTACAR_GATEWAY_URL=http://127.0.0.1:18765`.
The full flow is scripted in `tools/agentapi/run-emulator-e2e.ps1`; architecture is in
`docs/agent-api/AGENT-101-EMULATOR-INTEGRATION.md`.

```powershell
$env:RENTACAR_EXECUTION_MODE = "EMULATOR_REAL_ROOM"
$env:RENTACAR_GATEWAY_URL    = "http://127.0.0.1:18765"
$env:RENTACAR_DEVICE_TOKEN   = (adb -s emulator-5554 exec-out run-as com.rentacar.app.agentdev cat files/agentdev_token.txt)
node .\src\index.mjs
```

Never commit a token. Logs go to stderr only (stdout is the protocol channel).

## Windows: add to Claude Code

PowerShell (token in the user environment, not on the command line history of a shared machine):

```powershell
$env:RENTACAR_DEVICE_TOKEN = "<token from pairing>"

claude mcp add rentacar `
  --env RENTACAR_GATEWAY_URL=http://127.0.0.1:8742 `
  --env RENTACAR_DEVICE_TOKEN=$env:RENTACAR_DEVICE_TOKEN `
  -- node C:\Users\Yaniv\source\repos\Rent_a_Car\tools\mcp-host\src\index.mjs
```

Optional: `--scope project` (writes `.mcp.json`; **do not** put the token in it) or `--scope user`.

Verify:

```powershell
claude mcp list
claude mcp get rentacar
```

Direct smoke test without Claude (initialize + list; expects the gateway to be running):

```powershell
$env:RENTACAR_DEVICE_TOKEN = "<token>"
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}','{"jsonrpc":"2.0","id":2,"method":"tools/list"}' |
  node .\src\index.mjs
```

## Tests

```powershell
cd tools\mcp-host
node --test test/*.test.mjs     # or: npm test
```

Tests run against an in-process fake gateway; no Android device or Claude install is needed.
