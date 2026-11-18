# PROGRESS — Claude Agent API

```
CURRENT_PHASE: AGENT-121..135 batch complete (real-data readiness); real data NOT connected (owner authorization pending)
CURRENT_BRANCH: feature/claude-agent-api
REGISTERED_OPERATIONS: 204 (105 READ / 99 WRITE)
IMPLEMENTED_LOCAL_READS: 33 (unchanged; financial labels corrected)
CLOUD_READS: 10 operations EMULATOR_TESTED on Firebase Emulator Suite (demo-rentacar-agent); 0 live Firebase
EXECUTABLE_WRITE_OPERATIONS: 0 production (all 99 disabled; ProductionAgentGateway refuses WRITE before execution)
NATIVE_CLAUDE_MCP: CLAUDE_TESTED (mcp__rentcar-emulator__supplier_list returned AgentDev Room rows, 2026-11-18)
MCP_HOST: v0.2.0 resilient (starts offline, DEVICE_UNAVAILABLE, list_changed recovery, token re-read)
CONNECTORS: rentcar-emulator (DEVELOPMENT_DATA, Room via emulator) | rentcar-cloud-dev (DEVELOPMENT_DATA, Firebase emulator)
ANDROID_REAL_DEVICE: not connected (no TLS relay; production gateway UNIT_TESTED only, not wired)
CLAUDE_MOBILE_CONNECTED: false (needs public HTTPS remote MCP + OAuth; Android custom-connector OAuth unconfirmed)
UNIT_TESTS_APP_TOTAL: 896 pass / 0 fail (90 classes); agentapi 403
MCP_HOST_TESTS: 13 pass | CLOUD_DEV_TESTS: 6 pass (inside emulators) | EMULATOR_E2E: 18/18 | RESTART_ACCEPTANCE: 11/11
ROOM_SCHEMA: v44 unchanged
RELEASE_READINESS: NOT READY
BLOCKERS:
  - OWNER_AUTHORIZATION_FOR_REAL_DATA (live Firestore mirror and/or in-app opt-in on the owner's phone)
  - No public TLS remote MCP endpoint (mobile + remote device)
  - OutboundRelayTransport has no network implementation (AGENT-128)
  - ProductionAgentGateway not yet wired into the normal app (toggle + persistent token store)
  - Sync tombstones / unique sync_queue index deferred (no schema bump)
NEXT_ACTION: owner decides real-data path (cloud mirror read vs in-app device access); see AGENT-121-135-REAL-DATA-READINESS.md
```

## Batch checklist (121-135)

| Task | Status |
|------|--------|
| AGENT-121 MCP startup/recovery | Done - EMULATOR_TESTED + live restart test |
| AGENT-122 Emulator/ADB lifecycle | Done - EMULATOR_TESTED |
| AGENT-123 One-command startup | Done - EMULATOR_TESTED (`start-rentcar-claude.ps1`) |
| AGENT-124 Real data inventory | Done (doc, source evidence) |
| AGENT-125 Production-compatible component | UNIT_TESTED (`ProductionAgentGateway`), not wired |
| AGENT-126 Session binding | UNIT_TESTED (live-session re-check, revoke on account switch) |
| AGENT-127 Pairing | Pre-existing service/UI; production wiring pending |
| AGENT-128 Remote transport | Abstraction only; TLS relay NOT implemented |
| AGENT-129 Cloud reads | EMULATOR_TESTED (Firebase emulator), not live |
| AGENT-130 Source routing metadata | EMULATOR_TESTED |
| AGENT-131 Business reads / financial labels | UNIT_TESTED + EMULATOR_TESTED |
| AGENT-132 Claude Code connectors | CLAUDE_TESTED (rentcar-emulator); rentcar-cloud-dev registered |
| AGENT-133 Claude Android | Documented; not connected |
| AGENT-134 Security/regression | 896 unit + 13 host + 6 cloud + 18 E2E + 11 restart, all pass |
| AGENT-135 Integrated acceptance | A-L executed except F (remote gateway) - see readiness doc |

## Batch checklist (102–115)

| Task | Status |
|------|--------|
| AGENT-102 Emulator E2E hardening | Done |
| AGENT-103 Session binding | Done (unit) |
| AGENT-104 Keystore tokens | Done (API+unit; Keystore needs device) |
| AGENT-105 Remote transport | Done (abstraction; prod endpoint disabled) |
| AGENT-106 Availability/recovery | Done (unit) |
| AGENT-107 Cloud read executor | Done (isolated port; live Firebase BLOCKED) |
| AGENT-108 Source router | Done (unit) |
| AGENT-109 Claude Code | MCP registered; NL BLOCKED on login |
| AGENT-110 Claude Mobile | Prepared/docs; not connected |
| AGENT-111 Room write foundation | Done (AgentDev-gated; unit) |
| AGENT-112 Sync hardening | Helpers+docs; worker rethrow deferred |
| AGENT-113 Reservation writes | Done (AgentDev-gated; unit) |
| AGENT-114 Financial safety | Specs+tests; prod commits disabled |
| AGENT-115 Integrated acceptance | Documented PARTIAL |

## Git policy

- Work only on `feature/claude-agent-api`
- Never merge to `main` automatically
- Never force-push
