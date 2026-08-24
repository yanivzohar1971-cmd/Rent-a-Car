# YZ DEV BRIDGE — LIVE CONTROL CENTER

Local dashboard and Supervisor for YZ Dev Bridge.

This is Bridge infrastructure only. It does not modify Rent_a_Car or Glasses business source or data.

## Start

From `tools/yz-dev-bridge`:

```
npm run dashboard
```

Equivalent:

```
npm run control-center
```

URL:

[http://127.0.0.1:8787/](http://127.0.0.1:8787/)

SSE stream:

[http://127.0.0.1:8787/events](http://127.0.0.1:8787/events)

Health:

[http://127.0.0.1:8787/health](http://127.0.0.1:8787/health)

Do not auto-start the GitHub relay:

```
$env:YZ_BRIDGE_DASHBOARD_AUTO_START_RELAY="false"
npm run dashboard
```

## Files

- Static UI: `dashboard/index.html`, `dashboard/styles.css`, `dashboard/app.js`
- Supervisor / HTTP / API / SSE: `src/dashboard/`
- Relay runtime sidecar: `src/github/relayRuntimeStatus.js` (fail-soft; written beside the Store)

## Supervisor

```
YZ Bridge Supervisor
    |
    +-- Dashboard HTTP / API / SSE   (this process)
    |
    +-- GitHub Relay child           (only if started by Supervisor)
    |
    +-- Bridge Store                 (existing locked snapshot)
```

The dashboard stays up if the GitHub relay is stopped or restarted. The Supervisor tracks the exact child PID it spawned. It does not scan Windows for `node` / PowerShell / Cursor processes and does not kill unrelated PIDs.

If a relay is already running (runtime sidecar PID is live), START refuses rather than launching a second poller.

## START / STOP / RESTART

Buttons in **BRIDGE CONTROL** or:

- `POST /api/relay/start`
- `POST /api/relay/stop`
- `POST /api/relay/restart`
- `POST /api/relay/restart-after-current-task`

START: spawn the owned GitHub relay child (`src/githubRelay.js`).

STOP: signal only that owned child.

RESTART: if no Agent task is active (`IN_PROGRESS` or an active Agent session), stop then start immediately.

If a task is active, `POST /api/relay/restart` returns **409 TASK_ACTIVE**. Use **RESTART AFTER CURRENT TASK**.

There is no generic process-kill control.

## RESTART AFTER CURRENT TASK

If idle: restart immediately.

If a valid Agent task is active: schedule a restart, leave the relay running, and restart only after that task becomes terminal (`COMPLETED` / `FAILED` / `CANCELLED`) and no Agent remains active.

This avoids cutting result publishing or Agent handoff.

## SSE

Browser uses `EventSource('/events')`.

- Initial `snapshot` (compact dashboard state, not raw `bridge.json`)
- Incremental `state` / `status` / `stats` / `projects` / `relay` / `task` / `event` / `health`
- `heartbeat` so stale connections are visible
- Bounded activity history (200 events)
- Reconnects with native EventSource behavior

The browser does not poll. The Supervisor reads the Store on a 1s interval and emits only on change.

## API

| Method | Route |
| --- | --- |
| GET | `/api/status` |
| GET | `/api/stats` |
| GET | `/api/projects` |
| GET | `/api/tasks` |
| GET | `/api/tasks/:taskId` |
| GET | `/api/agents` |
| GET | `/api/github` |
| GET | `/api/firebase` |
| GET | `/api/events` |
| GET | `/api/health` |
| GET | `/events` |
| POST | `/api/relay/start` |
| POST | `/api/relay/stop` |
| POST | `/api/relay/restart` |
| POST | `/api/relay/restart-after-current-task` |

GET handlers are read-only. They do not ingest GitHub issues or mutate Firebase.

Query `?debug=1` on GET APIs for extra safe diagnostics.

## DEBUG mode

UI toggle or `http://127.0.0.1:8787/?debug=1`.

Normal mode: clean operator view.

DEBUG may add Store timestamps, launch method, and sanitized internals.

Never exposed, including DEBUG:

- GitHub / Firebase / API tokens
- passwords
- session nonce
- customer PII (emails/phones redacted)
- private temp filenames

## Local-only security

Default bind: `127.0.0.1`.

Non-loopback bind is refused unless `YZ_BRIDGE_DASHBOARD_ALLOW_REMOTE=true`.

Tokens stay server-side. Browser JavaScript never receives env vars or credentials.

Port override: `YZ_BRIDGE_DASHBOARD_PORT` (default `8787`).

`npm run http` (MCP Streamable HTTP) also defaults to 8787. Do not run both on the same port.

## Tests

```
npm test
npm run syntax
npm run check
```

Dashboard tests cover status/task/project APIs, issue-state override, SSE, Supervisor start/stop/restart-after-task, Store safety, sanitization, and a frontend HTML smoke check.

Playwright is not a project dependency; HTTP/SSE fixture tests cover the live update path without GitHub mutations.

## Environment

| Variable | Meaning |
| --- | --- |
| `YZ_BRIDGE_DASHBOARD_HOST` | Bind host (default `127.0.0.1`) |
| `YZ_BRIDGE_DASHBOARD_PORT` | Bind port (default `8787`) |
| `YZ_BRIDGE_DASHBOARD_AUTO_START_RELAY` | Start owned GitHub relay with the dashboard (default `true`) |
| `YZ_BRIDGE_DASHBOARD_DEBUG` | Default DEBUG payloads (default `false`) |
| `YZ_BRIDGE_DASHBOARD_ALLOW_REMOTE` | Allow non-loopback bind (default `false`) |
| `BRIDGE_DATA_FILE` | Store path (same as the rest of the Bridge) |
