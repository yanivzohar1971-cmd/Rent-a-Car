# PROGRESS — Claude Agent API

```
CURRENT_PHASE: 2 (AGENT-020 MCP FOUNDATION COMPLETE)
CURRENT_BRANCH: feature/claude-agent-api
BASELINE_COMMIT: f60512d714050643129eeea533374c8a785fd738
PHASE0_DOCS_COMMIT: 1a0e8cd
AGENT_001_COMMIT: 552d2ac
AGENT_010_COMMIT: e5b57d6
AGENT_012_COMMIT: 5af222d
OPERATIONS_RECONCILED: 204 (105 READ / 99 WRITE)
REGISTERED_OPERATIONS: 204
IMPLEMENTED_OPERATIONS: 31 read operations
EXECUTABLE_LOCAL_OPERATIONS: 31 (when RentCarAgentAPI.forAndroidLocalReads wires all ports)
EXECUTABLE_CLOUD_OPERATIONS: 0
EXECUTABLE_WRITE_OPERATIONS: 0
REMAINING_UNIMPLEMENTED: 173 (74 reads / 99 writes)
ARCHITECTURE_STATUS: 31 local reads plus in-process read-only MCP adapter; no real Android/Claude transport
RISKS:
  - Cloud writes lack server business validation
  - No delete tombstones in sync
  - sync_queue not UID-scoped / may duplicate dirty rows
  - Debug APK shares production applicationId
  - Claude Mobile cannot use app localhost
BLOCKERS:
  - No safe non-prod applicationId/Firebase flavor yet (design only)
  - Authenticated device gateway and Claude Code transport not implemented
NEXT_ACTION: Design authenticated gateway/device transport; keep writes disabled
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
| Authenticated remote MCP/device gateway | Not started |
| Write operations | Disabled |

## Git policy reminder

- Work only on `feature/claude-agent-api`
- Never merge to `main` automatically
- Never force-push
- No YZ Dev Bridge
