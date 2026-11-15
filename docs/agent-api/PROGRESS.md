# PROGRESS — Claude Agent API

```
CURRENT_PHASE: AGENT-102..115 PARTIAL batch complete (foundations); Claude NL + live Firebase blocked
CURRENT_BRANCH: feature/claude-agent-api
REGISTERED_OPERATIONS: 204 (105 READ / 99 WRITE)
IMPLEMENTED_LOCAL_READS: 33
EXECUTABLE_CLOUD_OPERATIONS: 0 live Firebase; isolated in-memory cloud port TESTED_WITH_FIXTURES
EXECUTABLE_WRITE_OPERATIONS: 0 production; AgentDev-gated Room writes for customer/supplier/request/reservation/commissionPayment (unit-tested)
MCP_CONNECTED_TO_REAL_ANDROID: true (emulator AgentDev only)
MCP_CONNECTED_TO_CLAUDE_CODE: false (CLI registered; loggedIn=false)
CLAUDE_MOBILE_CONNECTED: false
UNIT_TESTS_AGENTAPI: 396 pass
MCP_HOST_TESTS: 9 pass
ROOM_SCHEMA: v44 unchanged
RELEASE_READINESS: NOT READY
BLOCKERS:
  - CLAUDE_CODE_LOGIN_REQUIRED
  - No isolated non-prod Firebase for live cloud
  - No public TLS remote device endpoint
  - Sync tombstones / unique sync_queue index deferred (no schema bump)
NEXT_ACTION: Claude login + NL; optional emulator write E2E; isolated Firebase; physical-device TLS
```

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
