# ACCEPTANCE CHECKLIST — Claude Agent API

Official TEST A–L from the master integration mission.  
**Do not claim real Claude/device acceptance from fixture-only results.**

Evidence (branch `feature/claude-agent-api`):
- `.\gradlew :app:testDebugUnitTest --tests "com.rentacar.app.agentapi.*"` — BUILD SUCCESSFUL
- `node --test` in `tools/mcp-host` — 6/6 pass (fake gateway)

| Test | Scenario | Fixture / unit | Real Claude / device |
|------|----------|----------------|----------------------|
| **A** | Claude requests supplier information | **PASSED** (`supplier.list` / `supplier.get` + MCP/gateway fixtures) | **NOT EXECUTED** |
| **B** | Claude searches reservations | **PASSED** (reservation list/filter executors) | **NOT EXECUTED** |
| **C** | Claude requests outstanding commissions | **PASSED** (commission + carSale commission totals) | **NOT EXECUTED** |
| **D** | Claude retrieves a customer | **PASSED** (`customer.get` / list) | **NOT EXECUTED** |
| **E** | Claude prepares a new reservation | **PARTIAL** — write prepare sandbox exists for create ops; reservation.create prepare not yet specialized | **NOT EXECUTED** |
| **F** | Authorized human confirms the reservation | **PARTIAL** — confirmation token pipeline exists; no production UI confirmation bridge | **NOT EXECUTED** / **NOT IMPLEMENTED** for real commits |
| **G** | Reservation created and persisted in isolated test env | **NOT IMPLEMENTED** (sandbox only; Room writes still disabled) | **NOT EXECUTED** |
| **H** | Claude retrieves the newly created reservation | Blocked by G | **NOT EXECUTED** |
| **I** | Local record read despite pending cloud sync | **PARTIAL** — local reads return `source=LOCAL`, `syncStatus=UNKNOWN` | **NOT EXECUTED** on device |
| **J** | Cloud marked incomplete when device has unsynced changes | **NOT IMPLEMENTED** (cloud executor stub disabled) | **NOT EXECUTED** |
| **K** | Duplicate command delivery does not duplicate financial/reservation records | **PARTIAL** — idempotency/replay guards on gateway + sandbox; no Room write path | **NOT EXECUTED** |
| **L** | Unauthorized access rejected | **PASSED** (token/auth/isolation/security hardening tests) | **NOT EXECUTED** on production-like env |

## Supporting automated coverage

| Area | Result |
|------|--------|
| Device pairing / gateway / replay / TTL | PASSED (unit) |
| Windows MCP host vs fake gateway | PASSED (Node) |
| All 99 writes `WRITE_DISABLED` on Agent API | PASSED (unit) |
| Connection diagnostics ViewModel | PASSED (unit) |
| Compose diagnostics screen on device | NOT EXECUTED |
| Room v44 / sync / production APK | Untouched |

## Sign-off

Acceptance requires a **non-production** device/Firebase flavor, real Claude Code MCP connection, and regression suite green. Until then, every PASSED above is fixture-verified only.
