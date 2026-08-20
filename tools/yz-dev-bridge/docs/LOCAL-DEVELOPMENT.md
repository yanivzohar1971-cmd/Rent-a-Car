# Local development

Working copy:

`C:\Users\Yaniv\source\repos\Rent_a_Car\tools\yz-dev-bridge`

## Install

```
cd C:\Users\Yaniv\source\repos\Rent_a_Car\tools\yz-dev-bridge
npm install
```

## Test the local bridge (including relay unit tests)

```
npm test
```

Syntax check:

```
npm run syntax
```

All-in-one from PowerShell (bridge tests + Functions yzBridge tests):

```
powershell -ExecutionPolicy Bypass -File .\scripts\test-all.ps1
```

## Start the local MCP stdio bridge

Cursor already starts this via `.cursor\mcp.json`. To run it yourself:

```
npm start
```

or

```
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

## HTTP mode (optional, still local)

```
$env:BRIDGE_AUTH_TOKEN="use-a-long-random-secret"
npm run http
```

Health: `http://127.0.0.1:8787/health`  
MCP: `http://127.0.0.1:8787/mcp`

## Check bridge status

```
npm run cli -- status
```

or

```
powershell -ExecutionPolicy Bypass -File .\scripts\check-status.ps1
```

## Test MCP from Cursor

1. Confirm `.cursor\mcp.json` points at `tools\yz-dev-bridge\src\stdio.js`.
2. Restart Cursor or refresh MCP servers.
3. The server name is `yz-dev-bridge`.
4. Call `bridge_status`.

## Firebase relay locally

1. Copy `.env.example` to `.env` (gitignored).
2. Set `YZ_BRIDGE_FIREBASE_API_URL` and `YZ_BRIDGE_API_TOKEN`. Never commit `.env`.
3. Keep Cursor MCP running (stdio).
4. In a second terminal:

```
npm run relay
```

or

```
powershell -ExecutionPolicy Bypass -File .\scripts\start-relay.ps1
```

The relay process and Cursor MCP share `data\bridge.json` through the file lock.

## Test Firebase Functions module (no production deploy)

```
cd C:\Users\Yaniv\source\repos\Rent_a_Car\functions
npm run test:yz-bridge
```

That compiles TypeScript and runs `node --test test/yzBridge.test.js` against an in-memory store.

## Firebase emulator (supported by the Functions package)

```
cd C:\Users\Yaniv\source\repos\Rent_a_Car\functions
$env:YZ_BRIDGE_API_TOKEN="local-dev-token"
npm run serve
```

`npm run serve` is `npm run build && firebase emulators:start --only functions`.

This repository does not currently ship a Firestore emulator harness for yzBridge; prefer `npm run test:yz-bridge` for automated verification.
