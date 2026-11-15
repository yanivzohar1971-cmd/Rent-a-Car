# PROGRESS — Claude Agent API

```
CURRENT_PHASE: 2 (AGENT-013 COMPLETE — awaiting approval for next task)
CURRENT_BRANCH: feature/claude-agent-api
BASELINE_COMMIT: f60512d714050643129eeea533374c8a785fd738
PHASE0_DOCS_COMMIT: 1a0e8cd
AGENT_001_COMMIT: 552d2ac
AGENT_010_COMMIT: e5b57d6
AGENT_012_COMMIT: 5af222d
OPERATIONS_RECONCILED: 204 (105 READ / 99 WRITE)
REGISTERED_OPERATIONS: 204
IMPLEMENTED_OPERATIONS: 6 (supplier.list/get, reservation.list.manage/get, customer.list/get)
EXECUTABLE_LOCAL_OPERATIONS: 6 (when RentCarAgentAPI.forAndroidLocalReads wires all ports)
EXECUTABLE_CLOUD_OPERATIONS: 0
EXECUTABLE_WRITE_OPERATIONS: 0
REMAINING_UNIMPLEMENTED: 198
ARCHITECTURE_STATUS: Dual-executor Remote MCP selected; local supplier + reservation + customer reads live
RISKS:
  - Cloud writes lack server business validation
  - No delete tombstones in sync
  - sync_queue not UID-scoped / may duplicate dirty rows
  - Debug APK shares production applicationId
  - Claude Mobile cannot use app localhost
BLOCKERS:
  - No safe non-prod applicationId/Firebase flavor yet (design only)
  - MCP / Claude wiring not started
NEXT_ACTION: Prefer high-value read-only business capabilities (commission balances / sales summaries / supplier financial reads) — await explicit approval
```

## Phase checklist

| Item | Status |
|------|--------|
| Phase 0 documentation | Done |
| AGENT-001 API contract + registry | Done |
| AGENT-010 supplier.list / supplier.get local reads | Done |
| AGENT-012 reservation.list.manage / reservation.get local reads | Done |
| AGENT-013 customer.list / customer.get local reads | Done |
| MCP server | Not started |
| Write operations | Disabled |

## Git policy reminder

- Work only on `feature/claude-agent-api`
- Never merge to `main` automatically
- Never force-push
- No YZ Dev Bridge
