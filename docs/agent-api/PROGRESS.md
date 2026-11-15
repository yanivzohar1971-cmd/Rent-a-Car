# PROGRESS — Claude Agent API

```
CURRENT_PHASE: 3 (AGENT-021..030 connectivity foundation COMPLETE; Batch C AGENT-041 foundation started)
CURRENT_BRANCH: feature/claude-agent-api
BASELINE_COMMIT: f60512d714050643129eeea533374c8a785fd738
PHASE0_DOCS_COMMIT: 1a0e8cd
AGENT_001_COMMIT: 552d2ac
AGENT_010_COMMIT: e5b57d6
AGENT_012_COMMIT: 5af222d
OPERATIONS_RECONCILED: 204 (105 READ / 99 WRITE)
REGISTERED_OPERATIONS: 204
IMPLEMENTED_OPERATIONS: 33 read operations (31 + Batch B partial: agent.history.reservations, import.log.list)
EXECUTABLE_LOCAL_OPERATIONS: 33 (when RentCarAgentAPI.forAndroidLocalReads wires all ports)
EXECUTABLE_CLOUD_OPERATIONS: 0
EXECUTABLE_WRITE_OPERATIONS: 0
REMAINING_UNIMPLEMENTED: 171 (72 reads / 99 writes); reads classified in READ-ELIGIBILITY.md (6 ELIGIBLE, 66 NOT_ELIGIBLE)
ARCHITECTURE_STATUS: 33 local reads + read-only MCP adapter + authenticated gateway (token-bound identity, TTL, replay) + Node stdio MCP host + dev loopback router; fixtures only; NOT connected to real Android or Claude Code
COMMAND_FOUNDATION: agentapi.commands prepare/preview/confirmation-token pipeline; commits disabled (sandbox-only); 0 production writes
SANDBOX_WRITE_PREPARES: customer.create, supplier.create, request.create (PREPARE+PREVIEW, in-memory sandbox commit only; AGENT-051)
WORKFLOWS: 2 read-only stubs (findCustomerAndListReservations, unpaidCommissionSummary; AGENT-061), not exposed via gateway/MCP
DIAGNOSTICS_UI: ClaudeAgentConnectionScreen + ViewModel (route claude_agent_connection registered, not linked from any menu; never rendered on device)
UNIT_TESTS: 248 (agentapi.* + ui.screens.agentapi.*), 0 failures
RELEASE_READINESS: NOT READY (see RELEASE-READINESS.md); acceptance A-L fixture-only (ACCEPTANCE-CHECKLIST.md)
RISKS:
  - Cloud writes lack server business validation
  - No delete tombstones in sync
  - sync_queue not UID-scoped / may duplicate dirty rows
  - Debug APK shares production applicationId
  - Claude Mobile cannot use app localhost
BLOCKERS:
  - No safe non-prod applicationId/Firebase flavor yet (design only)
  - No on-device listener/relay, TLS, persistent token store or production session binder (gateway is JVM/fixture-tested only)
  - terms.load.effective / reservation.terms.effective blocked: repository uses global CurrentUserProvider (see READ-ELIGIBILITY.md)
NEXT_ACTION: Real device transport (FGS listener or outbound relay) + Keystore token store + production TrustedSessionBinder + dev Firebase flavor; keep writes disabled
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
| Real device transport / Claude Code connection | Not started |
| Write operations | Disabled |

## Git policy reminder

- Work only on `feature/claude-agent-api`
- Never merge to `main` automatically
- Never force-push
- No YZ Dev Bridge
