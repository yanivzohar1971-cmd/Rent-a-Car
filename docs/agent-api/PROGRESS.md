# PROGRESS — Claude Agent API

```
CURRENT_PHASE: 2 (AGENT-010 COMPLETE — awaiting approval for next task)
CURRENT_BRANCH: feature/claude-agent-api
BASELINE_COMMIT: f60512d714050643129eeea533374c8a785fd738
PHASE0_DOCS_COMMIT: 1a0e8cd
AGENT_001_COMMIT: 552d2ac
OPERATIONS_RECONCILED: 204 (105 READ / 99 WRITE)
REGISTERED_OPERATIONS: 204
IMPLEMENTED_OPERATIONS: 2 (supplier.list, supplier.get)
EXECUTABLE_LOCAL_OPERATIONS: 2 (when RentCarAgentAPI.forAndroidLocalSupplierReads is wired)
EXECUTABLE_CLOUD_OPERATIONS: 0
EXECUTABLE_WRITE_OPERATIONS: 0
REMAINING_UNIMPLEMENTED: 202
ARCHITECTURE_STATUS: Dual-executor Remote MCP selected; local supplier reads live
RISKS:
  - Cloud writes lack server business validation
  - No delete tombstones in sync
  - sync_queue not UID-scoped / may duplicate dirty rows
  - Debug APK shares production applicationId
  - Claude Mobile cannot use app localhost
BLOCKERS:
  - No safe non-prod applicationId/Firebase flavor yet (design only)
  - MCP / Claude wiring not started
NEXT_ACTION: Extend Android local reads to reservation.get/list and customer.get/list (await explicit approval)
```

## Phase checklist

| Item | Status |
|------|--------|
| Phase 0 documentation | Done |
| AGENT-001 API contract + registry | Done |
| AGENT-010 supplier.list / supplier.get local reads | Done |
| MCP server | Not started |
| Write operations | Disabled |

## Git policy reminder

- Work only on `feature/claude-agent-api`
- Never merge to `main` automatically
- Never force-push
- No YZ Dev Bridge
