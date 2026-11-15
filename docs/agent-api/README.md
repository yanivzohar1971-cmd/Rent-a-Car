# Rent a Car — Claude Agent API

**Phase:** 2 — AGENT-013 Android customer local reads (**COMPLETE**)  
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
- Executable local: **6** · Executable cloud: **0** · Writes: **disabled**
- No MCP server / Claude connection yet.

Details: [AGENT-013-ANDROID-CUSTOMER-READ.md](./AGENT-013-ANDROID-CUSTOMER-READ.md)

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

**AGENT-012** — Android local reservation reads (await explicit approval).

## Safety

- Work only on `feature/claude-agent-api`
- Never auto-merge to `main`
- Never force-push
- Never treat Git isolation as Firebase/Room/APK isolation
- Independent of YZ Dev Bridge
