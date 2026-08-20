# YZ Dev Bridge

YZ Dev Bridge is a small task/context queue that lets ChatGPT hand work to Cursor without copy/paste. It does not modify Rent_a_Car by itself. Cursor remains the process that reads the repository, edits code, and runs tests.

## Why it exists

ChatGPT cannot reach `localhost` on this PC. Cursor can, through MCP stdio. Firebase therefore acts only as a secure HTTPS/Firestore relay: ChatGPT writes a task in the cloud, a local relay copies it into the bridge, and Cursor executes it through the existing MCP tools.

## Paths on this machine

| Item | Path |
| --- | --- |
| Rent_a_Car | `C:\Users\Yaniv\source\repos\Rent_a_Car` |
| Canonical YZ Dev Bridge | `C:\Users\Yaniv\source\repos\Rent_a_Car\tools\yz-dev-bridge` |
| Original source used for migration | `C:\Users\Yaniv\Downloads\YZ-DevBridge-v1.0.0\YZ-DevBridge` |
| Firebase backend | `C:\Users\Yaniv\source\repos\Rent_a_Car\functions` |
| Firebase project | `carexpert-94faa` |
| Cursor MCP config | `C:\Users\Yaniv\source\repos\Rent_a_Car\.cursor\mcp.json` |
| Cursor rule | `C:\Users\Yaniv\source\repos\Rent_a_Car\.cursor\rules\yz-dev-bridge.mdc` |

The Downloads copy is historical. All further development happens in `tools\yz-dev-bridge`.

## How Cursor connects

`.cursor\mcp.json` starts:

```
node C:\Users\Yaniv\source\repos\Rent_a_Car\tools\yz-dev-bridge\src\stdio.js
```

Tools include `bridge_status`, `bridge_create_task`, `bridge_list_tasks`, `bridge_get_task`, `bridge_claim_task`, `bridge_claim_next_task`, `bridge_update_task`, `bridge_put_context`, `bridge_get_context`, `bridge_list_projects`.

Cursor does not auto-claim tasks in every chat. It claims only when asked.

## How ChatGPT communicates through Firebase

```
ChatGPT --HTTPS Bearer token--> yzBridgeApi --Admin SDK--> yzDevBridgeTasks
local npm run relay --HTTPS--> yzBridgeApi
relay writes local data\bridge.json
Cursor MCP reads the same file
```

Collections: `yzDevBridgeTasks`, `yzDevBridgeAgents`.

Function export: `yzBridgeApi` in `functions\src\yzBridge\` (wired from `functions\src\index.ts`).

## Start it

```
cd C:\Users\Yaniv\source\repos\Rent_a_Car\tools\yz-dev-bridge
npm install
npm start
```

Optional GitHub inbox (third terminal):

```
npm run github-relay
```

This polls GitHub Issues and can open a visible local Cursor Agent window. See `docs/GITHUB-RELAY.md`.

## Test it

```
cd C:\Users\Yaniv\source\repos\Rent_a_Car\tools\yz-dev-bridge
npm test
```

```
cd C:\Users\Yaniv\source\repos\Rent_a_Car\functions
npm run test:yz-bridge
```

Or: `tools\yz-dev-bridge\scripts\test-all.ps1`

## Deploy the Firebase portion (manual only)

Nothing in this integration deploys to production.

When explicitly approved:

1. Set the secret (do not commit it):  
   `firebase functions:config:set yzbridge.api_token="LONG_RANDOM_TOKEN"`
2. Deploy only the new function if possible:  
   `firebase deploy --only functions:yzBridgeApi`
3. Optionally deploy the isolated Firestore rules/indexes.

## Secrets / environment

| Name | Where |
| --- | --- |
| `YZ_BRIDGE_API_TOKEN` | Functions env / `functions.config().yzbridge.api_token` / local `.env` |
| `YZ_BRIDGE_FIREBASE_API_URL` | Local relay `.env` |
| `YZ_BRIDGE_AGENT_ID` | Local relay `.env` |
| `YZ_BRIDGE_PROJECT` | Local relay `.env` (default `Rent_a_Car`) |
| `YZ_BRIDGE_RELAY_INTERVAL_MS` | Local relay `.env` (default `15000`) |
| `BRIDGE_AUTH_TOKEN` | Optional local HTTP MCP |
| `BRIDGE_DATA_FILE` | Optional override of `data\bridge.json` |

## Never commit

- `.env`
- API tokens
- `tools\yz-dev-bridge\data\bridge.json`
- `functions/.env`
- service account keys

See also `tools\yz-dev-bridge\docs\ARCHITECTURE.md`.
