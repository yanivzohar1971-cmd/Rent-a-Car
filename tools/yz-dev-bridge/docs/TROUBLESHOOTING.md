# Troubleshooting

## Cursor does not see MCP

- Confirm `C:\Users\Yaniv\source\repos\Rent_a_Car\.cursor\mcp.json` points at  
  `C:\Users\Yaniv\source\repos\Rent_a_Car\tools\yz-dev-bridge\src\stdio.js`
- Run `npm install` in `tools\yz-dev-bridge`.
- Restart Cursor or refresh MCP servers.
- A backup of the previous MCP file is `.cursor\mcp.json.bak`.

## MCP disabled

- Cursor settings may disable MCP globally. Re-enable MCP / third-party tools.
- If the stdio process crashes, Cursor disables the server until reload. Run `node src\stdio.js` in a terminal to see the error.

## Firebase request not received

- The Cloud Function has not been deployed yet. This integration does not deploy.
- Token mismatch: function and ChatGPT/relay must share `YZ_BRIDGE_API_TOKEN`.
- Wrong URL: must include the function name `yzBridgeApi` and the route, for example `/tasks`.
- ChatGPT cannot call localhost; it must use the deployed HTTPS function, not `127.0.0.1`.

## Task stuck in QUEUED

- Local relay is not running (`npm run relay`).
- Relay env vars missing (`YZ_BRIDGE_FIREBASE_API_URL`, `YZ_BRIDGE_API_TOKEN`).
- Relay `YZ_BRIDGE_PROJECT` does not match the task `project` (expected `Rent_a_Car`).
- Authentication failure on poll (401). Check token; it will not be printed in logs.

## Task stuck in CLAIMED

- Relay claimed it and wrote a local `READY` task, but Cursor has not claimed it. That is normal until you ask Cursor to pick up the task.
- Relay crashed after claim and before local insert. Restart `npm run relay`; it recovers `CLAIMED`/`RUNNING` tasks for its `YZ_BRIDGE_AGENT_ID`.

## Local bridge offline

- Cursor is not running, or MCP stdio failed.
- `data\bridge.json` permissions or a stuck lock file (see below).
- Another tool deleted `node_modules`. Re-run `npm install`.

## Authentication failure

- Missing `Authorization: Bearer` header.
- Function secret not configured (`503 not_configured`).
- Token differs between ChatGPT, Functions, and local `.env`.
- GET enqueue attempted with `?token=` is rejected on purpose.

## GitHub issue not ingested

- Title must start with `[YZ-BRIDGE]` (Issue #3 bootstrap titles such as `[YZ-BRIDGE-BOOTSTRAP]` are ignored on purpose).
- Author must be `yanivzohar1971-cmd`.
- `npm run github-relay` must be running.
- GitHub auth: `gh auth login`, or existing git credentials for github.com.

## No visible Cursor Agent window

- `YZ_BRIDGE_AGENT_AUTO_LAUNCH` must be `true`.
- Official Cursor CLI must be installed and authenticated (`agent --version`, `agent status` / `cursor-agent --version`).
- The CLI MCP identifier is `yz-dev-bridge` (`agent mcp list`). The Cursor IDE cached name `project-0-Rent_a_Car-yz-dev-bridge` is not the CLI identifier.
- Windows Terminal is preferred (`wt.exe` via Start-Process); PowerShell without `-NoExit` is the default dedicated-task host (optional `-NoExit` via `YZ_BRIDGE_AGENT_WINDOW_KEEP_OPEN=true`). Node detached processes are not used as the visible window.

- Re-posting without the same `requestId` creates a second Firebase document.
- Local duplicates are prevented by `metadata.firebaseTaskId`. If you still see two local tasks, they have different Firebase ids.
- Pass a stable `requestId` from ChatGPT for idempotent creates.

## Firestore connectivity failure

- Emulator vs production mismatch.
- Local network / DNS / VPN.
- Relay retries transient 5xx and network errors three times, then logs `YZ relay tick failed` and waits for the next interval.

## Stale lock file

Path: `tools\yz-dev-bridge\data\bridge.json.lock`

The store deletes locks older than 30 seconds. If a process was killed mid-write and the lock is fresh, wait or confirm no `node` bridge process is running, then delete the lock file only.

## Concurrent process behavior

- Cursor MCP stdio and `npm run relay` are supposed to run together. They coordinate with the lock file.
- Two relay processes with the same agent can both poll; Firebase transactions still allow only one claim winner.
- Two Cursor windows sharing the same `bridge.json` are supported by the same lock.

## Existing local-only tests fail

From `tools\yz-dev-bridge`:

```
npm test
```

Baseline before this work was 6 passing store tests. Relay tests are additional files under `test/`.
