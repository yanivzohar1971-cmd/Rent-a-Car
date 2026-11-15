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
| `EMULATOR_REAL_ROOM` | Talks to the **AgentDev APK** (`com.rentacar.app.agentdev`) running on an emulator, backed by its real Room DB. **Requires** an explicit `RENTACAR_GATEWAY_URL` and `RENTACAR_DEVICE_TOKEN`. Probes `GET /v1/health` at startup and **exits non-zero** (2 = bad config, 3 = gateway unreachable). There is **no fixture fallback**. |

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
