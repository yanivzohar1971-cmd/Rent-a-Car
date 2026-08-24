# YZ Dev Bridge architecture

Canonical local copy:

`C:\Users\Yaniv\source\repos\Rent_a_Car\tools\yz-dev-bridge`

Original source used for the migration (do not treat as the development copy):

`C:\Users\Yaniv\Downloads\YZ-DevBridge-v1.0.0\YZ-DevBridge`

## Why this exists

ChatGPT cannot open `localhost` on Yaniv's PC. Cursor can. The two tools therefore cannot share a local MCP socket directly.

Firebase is used only as a **secure HTTPS/Firestore relay**. It stores authorized task records. It does **not** run repository commands, patch Kotlin/TypeScript, or spawn shells.

Local code execution stays under Cursor, using the existing YZ Dev Bridge MCP tools.

## End-to-end flow

```
ChatGPT
    |
    | HTTPS + Authorization: Bearer <YZ_BRIDGE_API_TOKEN>
    v
Firebase Cloud Function  yzBridgeApi
    |  (project carexpert-94faa, code in Rent_a_Car\functions)
    v
Firestore relay collections
    yzDevBridgeTasks
    yzDevBridgeAgents
    ^
    |  HTTPS poll / claim / result  (optional local process: npm run relay)
    |
Local YZ Dev Bridge
    tools\yz-dev-bridge
    data\bridge.json
    |
    | MCP stdio
    v
Cursor Agent
    |
    v
Rent_a_Car source code
```

## Process roles

| Piece | Role | Executes local commands? |
| --- | --- | --- |
| ChatGPT | Creates a task over HTTPS | No |
| `yzBridgeApi` | Authenticates, validates, writes Firestore | No |
| Firestore | Durable queue and results | No |
| `npm run relay` | Maps Firebase tasks into the local JSON store | No |
| `npm run dashboard` | Local Live Control Center (Supervisor + UI/API/SSE) | No |
| MCP stdio server | Exposes `bridge_*` tools to Cursor | No |
| Cursor | Reads/changes Rent_a_Car, runs tests/builds | Yes, with normal Cursor approval |

## Local-only mode (already working)

Cursor launches:

```
node C:\Users\Yaniv\source\repos\Rent_a_Car\tools\yz-dev-bridge\src\stdio.js
```

ChatGPT can also create tasks through the **same** MCP tools if it is connected to this machine by some other means. That path does not need Firebase.

Firebase relay mode is **additive and optional**. If `YZ_BRIDGE_FIREBASE_API_URL` is unset, the local MCP bridge continues to work exactly as before.

## Local task lifecycle (MCP)

Statuses used by Cursor MCP tools:

`READY` → `IN_PROGRESS` → `COMPLETED` | `FAILED` | `BLOCKED` | `CANCELLED`

`FAILED` is the terminal status for failed verification or implementation. Do not encode a failed verification as `COMPLETED` with `metadata.failed=true`.

## Firebase task lifecycle (relay)

`QUEUED` → `CLAIMED` → `RUNNING` → `COMPLETED` | `FAILED` | `CANCELLED`

Mapping:

- Firebase `QUEUED` is claimed by the local relay, then inserted locally as `READY`.
- Cursor claim (`IN_PROGRESS`) is published as Firebase `RUNNING`.
- Local `COMPLETED` is published as Firebase `COMPLETED`.
- Local `FAILED` is published as Firebase `FAILED`.
- Local `CANCELLED` is published as Firebase `CANCELLED`.
- Local `BLOCKED` with `metadata.failed` / `metadata.verificationFailed` is published as Firebase `FAILED` (legacy mapping).

## Project context lifecycle

`bridge_put_context` / `bridge_get_context` remain local JSON context. They are not mirrored to Firestore in this phase. Durable handoff of work uses tasks, not context documents.

## Locking

The local store uses `data/bridge.json.lock` so the Cursor MCP process and the Firebase relay process can share one file without lost writes. Stale locks older than 30 seconds are removed automatically.
