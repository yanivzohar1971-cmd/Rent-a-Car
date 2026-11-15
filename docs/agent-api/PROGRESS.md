# PROGRESS — Claude Agent API

```
CURRENT_PHASE: AGENT-101 PARTIAL (real emulator Room path verified; Claude NL blocked on login)
CURRENT_BRANCH: feature/claude-agent-api
BASELINE_COMMIT: f60512d714050643129eeea533374c8a785fd738
OPERATIONS_RECONCILED: 204 (105 READ / 99 WRITE)
REGISTERED_OPERATIONS: 204
IMPLEMENTED_OPERATIONS: 33 read operations
EXECUTABLE_LOCAL_OPERATIONS: 33 (AgentDev emulator path verified against real Room)
EXECUTABLE_CLOUD_OPERATIONS: 0
EXECUTABLE_WRITE_OPERATIONS: 0
MCP_CONNECTED_TO_REAL_ANDROID: true (emulator AgentDev APK only; not physical phone)
MCP_CONNECTED_TO_CLAUDE_CODE: false (CLI registered locally; auth loggedIn=false)
ARCHITECTURE_STATUS: agentdev flavor com.rentacar.app.agentdev + loopback :18765 + ADB forward + MCP EMULATOR_REAL_ROOM → real Room repositories
UNIT_TESTS: 736 standardDebug unit tests, 0 failures; MCP host 9/9; emulator E2E 18/18
RELEASE_READINESS: NOT READY (see RELEASE-READINESS.md)
BLOCKERS:
  - Claude Code login required for live NL queries
  - No physical-device / TLS production gateway
  - Writes still disabled; no Keystore token store
NEXT_ACTION: Claude login + NL verification; then real authenticated phone access / cloud reads / secure writes
```

## Phase checklist

| Item | Status |
|------|--------|
| Phase 0 documentation | Done |
| AGENT-001 API contract + registry | Done |
| AGENT-010 supplier.list / supplier.get local reads | Done |
| AGENT-012 reservation.list.manage / reservation.get local reads | Done |
| AGENT-013 customer.list / customer.get local reads | Done |
| AGENT-014 through AGENT-018 local read batches | Done |
| AGENT-019 shared read infrastructure | Done |
| AGENT-020 in-process MCP foundation | Done (fixtures only) |
| AGENT-021 MCP audit | Done |
| AGENT-022..025 authenticated gateway, device tokens, presence, TTL/replay | Done (JVM/fixtures) |
| AGENT-026 Windows MCP host (`tools/mcp-host`) | Done (fake-gateway tests; no real Claude session) |
| AGENT-027 E2E tests (Kotlin + Node) | Done |
| AGENT-028 cloud read stub | Done (always disabled; no deploy) |
| AGENT-029 Claude Mobile connector | Docs only |
| AGENT-030 connectivity docs/regression | Done |
| AGENT-041 write command foundation | Done (prepare/preview only) |
| Batch B partial reads | 2 implemented, 72 classified |
| Batch D partial: sandbox write prepares (AGENT-051) | Done (customer/supplier/request create; sandbox only) |
| Batch E partial: workflow stubs (AGENT-061) | Done (2 read-only workflows) |
| Batch F partial: Claude connection diagnostics UI | Done (screen + ViewModel + route; not linked, not device-verified) |
| Batch G partial: security hardening tests | Done (20 tests; 2 hardening fixes) |
| Batch H partial: acceptance checklist + release readiness | Done (docs; real-device/Claude execution NOT EXECUTED) |
| AGENT-101 emulator + real Room MCP path | Done (emulator); Claude NL blocked on login |
| Real physical-device transport / Claude authenticated NL | Not started / blocked |
| Write operations | Disabled |

## Git policy reminder

- Work only on `feature/claude-agent-api`
- Never merge to `main` automatically
- Never force-push
- No YZ Dev Bridge
