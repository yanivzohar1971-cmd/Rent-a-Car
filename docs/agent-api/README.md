# Rent a Car — Claude Agent API

**Phase:** 3 — connectivity foundation (AGENT-021..030) + Batch C command foundation (AGENT-041) (**COMPLETE as foundations; not connected to a real device or Claude Code**)
**Branch:** `feature/claude-agent-api`  
**Baseline:** `f60512d714050643129eeea533374c8a785fd738`  
**Date:** 2026-11-15

## Objective

Expose Rent a Car’s existing authorized business capabilities to Claude through a structured, secure Agent API — not a chatbot and not screen automation.

## Current status

- Phase 0 audit documentation complete.
- **AGENT-001** contract + registry for **204** operations.
- **AGENT-010** local reads: `supplier.list`, `supplier.get`.
- **AGENT-012** local reads: `reservation.list.manage`, `reservation.get`.
- **AGENT-013** local reads: `customer.list`, `customer.get` (privacy-minimized DTO).
- **AGENT-014–018**: 25 financial, sales, fleet, reporting, catalog, and reservation reads.
- **AGENT-019**: shared, allowlist-gated read infrastructure.
- **AGENT-020**: in-process MCP tool registry/adapter, fixture-tested.
- **Batch B partial**: `agent.history.reservations`, `import.log.list`; remaining reads classified in [READ-ELIGIBILITY.md](./READ-ELIGIBILITY.md).
- **AGENT-022..025**: token-authenticated gateway (`agentapi.transport`) — identity only from a token-bound session, request TTL, replay protection, presence.
- **AGENT-026**: Node stdio MCP host in `tools/mcp-host` (tested against a fake gateway).
- **AGENT-028**: cloud read stub (always disabled). **AGENT-029**: Claude Mobile connector docs only.
- **AGENT-041**: write command prepare/preview foundation; commits disabled.
- Implemented/executable local when fully wired: **33** · Remaining: **171** (72 reads / 99 writes)
- Executable cloud: **0** · Writes: **disabled**
- No on-device gateway listener/relay, real-device connection, or verified Claude Code session yet. The loopback HTTP server is development-only and lives in the unit-test source set.

Details: [AGENT-020-MCP-FOUNDATION.md](./AGENT-020-MCP-FOUNDATION.md), [AGENT-021-MCP-AUDIT.md](./AGENT-021-MCP-AUDIT.md),
[AGENT-022-025-DEVICE-TRANSPORT.md](./AGENT-022-025-DEVICE-TRANSPORT.md)

## Architecture decision (summary)

**Recommended:** Capability-registry Agent API with dual executors (Cloud + Device), exposed through a **public HTTPS Remote MCP** server.

Details: [10-TARGET-ARCHITECTURE.md](./10-TARGET-ARCHITECTURE.md)

## Documentation index

| Doc | Contents |
|-----|----------|
| [AGENT-001-API-CONTRACT.md](./AGENT-001-API-CONTRACT.md) | Contract/registry implementation report |
| [AGENT-010-ANDROID-SUPPLIER-READ.md](./AGENT-010-ANDROID-SUPPLIER-READ.md) | Local supplier.list / supplier.get |
| [AGENT-012-ANDROID-RESERVATION-READ.md](./AGENT-012-ANDROID-RESERVATION-READ.md) | Local reservation.list.manage / reservation.get |
| [AGENT-013-ANDROID-CUSTOMER-READ.md](./AGENT-013-ANDROID-CUSTOMER-READ.md) | Local customer.list / customer.get |
| [AGENT-014-FINANCIAL-READS.md](./AGENT-014-FINANCIAL-READS.md) | Financial read batch |
| [AGENT-015-SALES-READS.md](./AGENT-015-SALES-READS.md) | Sales read batch |
| [AGENT-016-FLEET-READS.md](./AGENT-016-FLEET-READS.md) | Fleet read batch |
| [AGENT-017-REPORTING-READS.md](./AGENT-017-REPORTING-READS.md) | Reporting read |
| [AGENT-018-CATALOG-RESERVATION-READS.md](./AGENT-018-CATALOG-RESERVATION-READS.md) | Catalog/reservation read batch |
| [AGENT-019-READ-INFRASTRUCTURE.md](./AGENT-019-READ-INFRASTRUCTURE.md) | Shared local read helpers and boundaries |
| [AGENT-020-MCP-FOUNDATION.md](./AGENT-020-MCP-FOUNDATION.md) | In-process read-only MCP adapter |
| [AGENT-021-MCP-AUDIT.md](./AGENT-021-MCP-AUDIT.md) | MCP adapter audit + connectivity gaps |
| [AGENT-022-025-DEVICE-TRANSPORT.md](./AGENT-022-025-DEVICE-TRANSPORT.md) | Device tokens, gateway, presence, replay, dev loopback (DEVELOPMENT ONLY) |
| [AGENT-026-WINDOWS-MCP-HOST.md](./AGENT-026-WINDOWS-MCP-HOST.md) | Windows stdio MCP host (`tools/mcp-host`) |
| [AGENT-028-CLOUD-READ-FOUNDATION.md](./AGENT-028-CLOUD-READ-FOUNDATION.md) | Cloud read stub (isolated-dev-only, disabled) |
| [AGENT-029-CLAUDE-MOBILE-CONNECTOR.md](./AGENT-029-CLAUDE-MOBILE-CONNECTOR.md) | Claude Mobile / Remote MCP requirements |
| [AGENT-041-WRITE-COMMAND-FOUNDATION.md](./AGENT-041-WRITE-COMMAND-FOUNDATION.md) | Prepare/preview write pipeline (no production writes) |
| [READ-ELIGIBILITY.md](./READ-ELIGIBILITY.md) | ELIGIBLE vs NOT_ELIGIBLE classification of remaining reads |
| [00-SYSTEM-AUDIT.md](./00-SYSTEM-AUDIT.md) | Modules, Gradle, Room v44, DI, workers |
| [01-ENTITY-INVENTORY.md](./01-ENTITY-INVENTORY.md) | All Room entities + sync classification |
| [02-OPERATION-INVENTORY.md](./02-OPERATION-INVENTORY.md) | Screen/route → ViewModel → repo operations |
| [03-SYNC-ARCHITECTURE.md](./03-SYNC-ARCHITECTURE.md) | Dirty queue, upload/restore, conflicts, gaps |
| [04-BUSINESS-RULES.md](./04-BUSINESS-RULES.md) | Commission, holds, statuses, financial rules |
| [05-SECURITY-AUDIT.md](./05-SECURITY-AUDIT.md) | Auth, UID isolation, rules gaps |
| [06-ANDROID-AGENT-DESIGN.md](./06-ANDROID-AGENT-DESIGN.md) | Local executor feasibility |
| [07-REMOTE-ANDROID-ACCESS.md](./07-REMOTE-ANDROID-ACCESS.md) | Device reachability strategy |
| [08-CLOUD-AGENT-DESIGN.md](./08-CLOUD-AGENT-DESIGN.md) | Cloud executor feasibility |
| [09-CLAUDE-MCP-COMPATIBILITY.md](./09-CLAUDE-MCP-COMPATIBILITY.md) | Claude Code / Mobile MCP requirements |
| [10-TARGET-ARCHITECTURE.md](./10-TARGET-ARCHITECTURE.md) | Selected architecture + alternatives |
| [ROADMAP.md](./ROADMAP.md) | Phases 0–12 + task IDs |
| [OPERATION-COVERAGE.md](./OPERATION-COVERAGE.md) | Coverage matrix + counts |
| [TEST-STRATEGY.md](./TEST-STRATEGY.md) | Unit/integration/E2E/regression plan |
| [DEV-ENVIRONMENT-SAFETY.md](./DEV-ENVIRONMENT-SAFETY.md) | Safe test isolation |
| [PROGRESS.md](./PROGRESS.md) | Live progress snapshot |

## Inventory reconciliation

| Source | Total | Read | Write |
|--------|------:|-----:|------:|
| Phase 0 summary claim | 196 | 98 | 98 |
| **AGENT-001 row parse** | **204** | **105** | **99** |

## Next milestone

Real device transport (on-device listener or outbound relay), persistent token store and production session binder for the authenticated gateway; no writes.

## Safety

- Work only on `feature/claude-agent-api`
- Never auto-merge to `main`
- Never force-push
- Never treat Git isolation as Firebase/Room/APK isolation
- Independent of YZ Dev Bridge
