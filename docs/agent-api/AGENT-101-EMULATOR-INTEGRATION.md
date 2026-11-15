# AGENT-101 — Emulator Integration (Real Room)

**Status:** PARTIAL — real emulator Room path verified; Claude Code live NL query blocked on login  
**Branch:** `feature/claude-agent-api`  
**Verification level:** Real emulator Room tests (not fixture-only)

## Architecture

```
Windows MCP client (Node stdio)
        |
        v
tools/mcp-host (EMULATOR_REAL_ROOM)
        |
        v
http://127.0.0.1:18765  (ADB forward)
        |
        v
Android Emulator loopback 127.0.0.1:18765
        |
        v
AgentDevLoopbackServer → LoopbackGatewayRouter → AuthenticatedAgentGateway
        |
        v
RentCarAgentAPI → Android local read executors → Room repositories
```

## Isolated development APK

| Field | Value |
|-------|-------|
| Flavor | `agentdev` |
| Application ID | `com.rentacar.app.agentdev` |
| Label | Rent a Car AgentDev |
| Dev UID | `agent-dev-uid` (BuildConfig; never from client) |
| Gateway port | `18765` (loopback only) |
| Firebase | Google Services processing skipped for agentdev; stub resources only |
| Production APK | Untouched (`com.rentacar.app` / `standard` flavor) |

## Emulator

| Field | Value |
|-------|-------|
| AVD name | `RentacarAgentDev` |
| System image | `system-images;android-34;google_apis;x86_64` (API 34) |
| Device profile | pixel_6 |
| Serial used | `emulator-5554` |
| ADB note | On this host `adb start-server` can hang in SYN_SENT; runner uses `adb nodaemon server` |

## Room fixtures

Seeded idempotently by `AgentDevFixtureSeeder` into the **agentdev** Room DB only:

- 3 suppliers (Alpha / Beta / Gamma; ids 9001–9003)
- 3 customers (ids 9301–9303)
- 6 reservations (ids 9401–9406; mixed statuses / dates / order+contract numbers)
- 3 car sales + commission payments (unpaid / partial / paid)

## Local transport security

- Listener binds `127.0.0.1` only (never `0.0.0.0`)
- Bearer device token from auto-pair; identity derived from token (client `userUid` rejected)
- Writes remain disabled
- Token file written under app files; pulled via `run-as` for tests; not committed

## How to run

```powershell
.\tools\agentapi\run-emulator-e2e.ps1 -StartEmulator -SkipBuild
```

Requires: Android SDK, Node.js, AVD image (or existing `RentacarAgentDev`).

## Verification flags (AGENT-101)

| Flag | Value |
|------|-------|
| EMULATOR_RUNNING | true |
| DEV_APK_INSTALLED | true |
| REAL_ROOM_POPULATED | true |
| ANDROID_ENDPOINT_RUNNING | true |
| MCP_HOST_CONNECTED | true |
| MCP_REAL_ROOM_QUERY_PASSED | true |
| CLAUDE_CODE_MCP_REGISTERED | true (local scope `rentcar-emulator`) |
| CLAUDE_CODE_REAL_QUERY_PASSED | false — `claude auth status` → loggedIn=false |

## Production limitations

- Emulator + ADB forward only (not phone / public TLS gateway)
- agentdev pairing secret is BuildConfig-local for offline pairing
- No production Firebase / sync / customer data
- Claude Code interactive login required for NL tool use
