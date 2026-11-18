# PROGRESS — Claude Agent API

```
CURRENT_PHASE: AGENT-137..140 complete in isolation; NOT_READY_FOR_PHYSICAL_INSTALLATION (signing not yet verified)
CURRENT_BRANCH: feature/claude-agent-api
TARGET_APP: com.rentacar.app (standard DEBUG build, installed via adb install -r / Cursor)
ROOM: v44, identity hash 4f1a8052...48ed == main (no migration); destructive fallback removed from standard
BACKGROUND: specialUse FGS + boot receiver; EMULATOR_TESTED 32/33 (+T6 manual)
RELAY: E2E-sealed, client+device credentials, TLS; NOT deployed
EXECUTABLE_WRITE_OPERATIONS: 0 production
UNIT_TESTS_APP_TOTAL: 912 pass / 0 fail
RELAY_TESTS: 10/10 | MCP_HOST: 13/13 | STARTUP_SMOKE: 9/9
NATIVE_CLAUDE_MCP: verified earlier 2026-11-18; re-check BLOCKED by adb transport at end of session
BLOCKERS:
  - SIGNING_COMPATIBILITY_NOT_YET_VERIFIED (read phone's installed cert; owner approval)
  - Owner approval for install (adb install -r) after backup
  - Relay hosting/domain + deploy approval; AGENT_RELAY_URL build
  - Physical-device background behaviour unverified
NEXT_ACTION: owner approves read-only certificate check (CURSOR-INSTALLATION-HANDOFF.md section 2)
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
