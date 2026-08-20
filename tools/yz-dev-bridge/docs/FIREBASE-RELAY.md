# Firebase relay

## Project

- Firebase project: `carexpert-94faa`
- Existing backend: `C:\Users\Yaniv\source\repos\Rent_a_Car\functions`
- Node engine: 20
- Default Functions region: `us-central1` (same as most existing HTTPS functions)
- Admin initialization already lives in `functions/src/index.ts`

## New Cloud Function

One routed HTTPS function:

- Export name: `yzBridgeApi`
- Source: `functions/src/yzBridge/`
- Lazy-loaded from `functions/src/index.ts` so existing exports stay compatible

Expected production URL after a **manual** deploy (not performed by this integration):

`https://us-central1-carexpert-94faa.cloudfunctions.net/yzBridgeApi`

## New Firestore collections

Isolated from reservations, suppliers, cars, commissions, users, and all other app data:

- `yzDevBridgeTasks`
- `yzDevBridgeAgents`

Client Firestore rules deny all reads and writes. Only the Admin SDK in Cloud Functions may access them.

These collections are **not deployed** until Yaniv explicitly approves a Firebase deploy.

## Task document fields

- `id`
- `project`
- `title`
- `instructions`
- `priority` (`low` | `normal` | `high` | `critical`)
- `status` (`QUEUED` | `CLAIMED` | `RUNNING` | `COMPLETED` | `FAILED` | `CANCELLED`)
- `createdAt` / `updatedAt` / `claimedAt` / `completedAt` (server timestamps)
- `claimedBy`
- `resultSummary`
- `changedFiles`
- `tests`
- `error`
- `source`
- `requestId` (optional idempotency key)

Claiming uses a Firestore transaction. Two relay processes cannot both claim the same `QUEUED` task.

## API routes

All routes require:

```
Authorization: Bearer <YZ_BRIDGE_API_TOKEN>
```

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/status` | Health and coarse task counts |
| GET | `/tasks` | List, filter by `project`, `status`, `claimedBy` |
| GET | `/task?id=` | Retrieve one task |
| GET | `/task/:id` | Retrieve one task |
| POST | `/tasks` | Create a `QUEUED` task |
| POST | `/task/:id/claim` | Atomic claim |
| POST | `/task/:id/status` | Deterministic status transition |
| POST | `/task/:id/result` | Persist completion / failure / cancellation |

ChatGPT GET `/chatgpt/*` accepts either:

- the permanent secret `YZ_BRIDGE_CHATGPT_KEY`, or
- a temporary session capability `YZ_BRIDGE_CHATGPT_SESSION_KEY` that is valid only before `YZ_BRIDGE_CHATGPT_SESSION_EXPIRES_AT` (ISO-8601 UTC). After expiry, that session credential is rejected with the same `401 { "ok": false, "code": "unauthorized" }` as a missing or wrong key.

Neither ChatGPT secret authorizes the bearer API (`/status`, claim, result, administration). Do not commit real values. Templates may use `<YZ_BRIDGE_CHATGPT_KEY>` or `<YZ_BRIDGE_CHATGPT_SESSION_KEY>`.


Two prompt-delivery modes exist. Both create the same `yzDevBridgeTasks` documents consumed by the existing local relay. There is no second task-processing path and no file/binary upload.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/chatgpt/enqueue` | INLINE: create a `QUEUED` Rent_a_Car task from one URL |
| GET | `/chatgpt/task` | Read one task status/result (no instructions) |
| GET | `/chatgpt/chunks/create` | CHUNKS: create a temporary prompt buffer |
| GET | `/chatgpt/chunks/append` | CHUNKS: append one URL-encoded chunk |
| GET | `/chatgpt/chunks/status` | CHUNKS: buffer metadata only (no chunk bodies) |
| GET | `/chatgpt/chunks/commit` | CHUNKS: assemble prompt and create one normal task |

Templates (never put the real key in git):

```
https://us-central1-carexpert-94faa.cloudfunctions.net/yzBridgeApi/chatgpt/enqueue?key=<YZ_BRIDGE_CHATGPT_KEY>&title=<URL_ENCODED_TITLE>&instructions=<URL_ENCODED_INSTRUCTIONS>&project=Rent_a_Car&requestId=<UNIQUE_ID>
https://us-central1-carexpert-94faa.cloudfunctions.net/yzBridgeApi/chatgpt/task?key=<YZ_BRIDGE_CHATGPT_KEY>&id=<TASK_ID>
https://us-central1-carexpert-94faa.cloudfunctions.net/yzBridgeApi/chatgpt/chunks/create?key=<YZ_BRIDGE_CHATGPT_KEY>&title=<URL_ENCODED_TITLE>&project=Rent_a_Car&priority=normal&requestId=<UNIQUE_ID>
https://us-central1-carexpert-94faa.cloudfunctions.net/yzBridgeApi/chatgpt/chunks/append?key=<YZ_BRIDGE_CHATGPT_KEY>&bufferId=<BUFFER_ID>&index=<INDEX>&data=<URL_ENCODED_CHUNK>
https://us-central1-carexpert-94faa.cloudfunctions.net/yzBridgeApi/chatgpt/chunks/status?key=<YZ_BRIDGE_CHATGPT_KEY>&bufferId=<BUFFER_ID>
https://us-central1-carexpert-94faa.cloudfunctions.net/yzBridgeApi/chatgpt/chunks/commit?key=<YZ_BRIDGE_CHATGPT_KEY>&bufferId=<BUFFER_ID>&chunkCount=<COUNT>
```

CHUNKS limits (chosen from the spec):

- Maximum characters per chunk: `6000`
- Maximum chunk count: `100`
- Maximum assembled prompt: `300000` characters
- OPEN buffer TTL: 24 hours (`expiresAt` / `expiresAtMs`). An OPEN buffer past TTL is marked `EXPIRED` lazily on access. No scheduled function is required.
- Firestore TTL policies can later be attached to `yzDevBridgePromptBuffers.expiresAt` if automatic physical deletion is desired. That is not enabled in this change.
- COMMITTED buffers keep metadata (`committedTaskId`, counts, timestamps) for correlation. Chunk bodies are not required after commit.

Collection: `yzDevBridgePromptBuffers` with subcollection `chunks/{index}`. Isolated from business data. Client SDK access is denied in source rules; the function uses the Admin SDK.

Assembled instructions are the decoded chunk `data` values concatenated in index order with no trim, no extra whitespace, and no markdown rewrite.

### GET compatibility for task creation

Evaluated and implemented as `GET /compat/enqueue`, **disabled by default**.

It still requires the `Authorization` header. Tokens must never be placed in the query string. Enable only if a client cannot POST, by setting `YZ_BRIDGE_ENABLE_GET_ENQUEUE=true` on the function. Prefer `POST /tasks` in production.

## Request lifecycle

1. ChatGPT sends `POST /tasks` with project `Rent_a_Car`, title, instructions, priority, optional `requestId`.
2. Function authenticates, validates, optionally deduplicates `requestId`, writes `QUEUED`.
3. Response: `{ ok: true, taskId, status: "QUEUED" }`.
4. Local `npm run relay` polls `GET /tasks?status=QUEUED&project=Rent_a_Car`.
5. Relay calls `POST /task/:id/claim`. Exactly one caller wins.
6. Relay inserts a local MCP task (`READY`) with `metadata.firebaseTaskId`.
7. Cursor claims and works through existing `bridge_*` tools.
8. Relay publishes `RUNNING`, then `COMPLETED` / `FAILED` / `CANCELLED`.
9. ChatGPT reads `GET /task?id=...`.

## Authentication strategy

Machine-to-machine bearer token.

Lookup order:

1. `process.env.YZ_BRIDGE_API_TOKEN`
2. Legacy runtime config `functions.config().yzbridge.api_token`

This matches the existing backend, which already uses `functions.config()` for secrets such as `admin.sitemap_token`.

Never commit the token. Never log it.

### Configure the secret (manual, do not run until approved)

```
firebase functions:config:set yzbridge.api_token="LONG_RANDOM_TOKEN"
```

Or, for emulator / local Functions:

```
# functions/.env  (gitignored)
YZ_BRIDGE_API_TOKEN=LONG_RANDOM_TOKEN
```

## Rate protection

Per-instance in-memory limiter (best-effort across Cloud Functions instances): 30 mutating requests and 120 reads per IP/agent per minute.

## Polling strategy

Local relay default interval: 15 seconds (`YZ_BRIDGE_RELAY_INTERVAL_MS`, minimum 5000). Do not poll more aggressively.

The relay never executes shell commands from Firestore payloads. It only converts authorized task records into local YZ Dev Bridge tasks.

## Development / emulator testing

The Rent_a_Car `functions` package supports:

```
cd C:\Users\Yaniv\source\repos\Rent_a_Car\functions
npm run build
npm run serve
```

`npm run serve` starts the Functions emulator. There is currently no committed Firestore emulator suite for this relay. Unit tests use an in-memory Firestore stand-in:

```
cd C:\Users\Yaniv\source\repos\Rent_a_Car\functions
npm run test:yz-bridge
```

To try the function emulator after a local build:

```
$env:YZ_BRIDGE_API_TOKEN="local-dev-token"
firebase emulators:start --only functions
```

Then point `YZ_BRIDGE_FIREBASE_API_URL` at the emulator URL printed for `yzBridgeApi`.

Do not use production Firestore for experiments.

## Deployment procedure (do not deploy yet)

When Yaniv explicitly approves:

1. Confirm no secrets are in git.
2. `cd C:\Users\Yaniv\source\repos\Rent_a_Car`
3. Set `yzbridge.api_token` as above.
4. Deploy **only** the new function if possible: `firebase deploy --only functions:yzBridgeApi`
5. Deploy Firestore rules/indexes only if the isolated collections should be locked down in production: `firebase deploy --only firestore:rules,firestore:indexes`
6. Verify `GET /status` with the bearer token.
7. Do not deploy hosting or unrelated functions unless intended.

This integration did **not** deploy anything.
