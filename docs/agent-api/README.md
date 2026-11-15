# Rent a Car — Claude Agent API

**Phase:** 0 — System Audit & Implementation Roadmap (COMPLETE)  
**Branch:** `feature/claude-agent-api`  
**Baseline:** `f60512d714050643129eeea533374c8a785fd738`  
**Date:** 2026-11-15  
**Mode:** Analysis + documentation only (no application implementation)

## Objective

Expose Rent a Car’s existing authorized business capabilities to Claude through a structured, secure Agent API — not a chatbot and not screen automation.

Claude must eventually:

- Read, search, filter, and calculate business data
- Create/update records and run authorized workflows
- Access synchronized cloud data **and** unsynchronized Android Room data when the device is available
- Operate from Claude Code (Windows) and Claude Mobile (via remote MCP connectors)

## Architecture decision (summary)

**Recommended:** Capability-registry Agent API with dual executors (Cloud + Device), exposed through a **public HTTPS Remote MCP** server.

- Claude clients never talk to Room or Firestore directly.
- Cloud path uses authenticated Firebase UID scoping; write commands must move behind server-validated command APIs before production Agent writes.
- Device path uses an authenticated outbound device channel (not Android localhost from Claude Mobile).
- Git branch isolation does **not** isolate Firebase, Room, or installed APK data.

Details: [10-TARGET-ARCHITECTURE.md](./10-TARGET-ARCHITECTURE.md)

## Documentation index

| Doc | Contents |
|-----|----------|
| [00-SYSTEM-AUDIT.md](./00-SYSTEM-AUDIT.md) | Modules, Gradle, Room v44, DI, workers |
| [01-ENTITY-INVENTORY.md](./01-ENTITY-INVENTORY.md) | All Room entities + sync classification |
| [02-OPERATION-INVENTORY.md](./02-OPERATION-INVENTORY.md) | Screen/route → ViewModel → repo operations |
| [03-SYNC-ARCHITECTURE.md](./03-SYNC-ARCHITECTURE.md) | Dirty queue, delta/restore, conflicts, gaps |
| [04-BUSINESS-RULES.md](./04-BUSINESS-RULES.md) | Commission, holds, statuses, financial rules |
| [05-SECURITY-AUDIT.md](./05-SECURITY-AUDIT.md) | Auth, UID isolation, rules gaps |
| [06-ANDROID-AGENT-DESIGN.md](./06-ANDROID-AGENT-DESIGN.md) | Local executor feasibility |
| [07-REMOTE-ANDROID-ACCESS.md](./07-REMOTE-ANDROID-ACCESS.md) | Device reachability strategy |
| [08-CLOUD-AGENT-DESIGN.md](./08-CLOUD-AGENT-DESIGN.md) | Cloud executor feasibility |
| [09-CLAUDE-MCP-COMPATIBILITY.md](./09-CLAUDE-MCP-COMPATIBILITY.md) | Claude Code / Mobile MCP requirements |
| [10-TARGET-ARCHITECTURE.md](./10-TARGET-ARCHITECTURE.md) | Selected architecture + alternatives |
| [ROADMAP.md](./ROADMAP.md) | Phases 0–12 + task IDs AGENT-xxx |
| [OPERATION-COVERAGE.md](./OPERATION-COVERAGE.md) | Coverage matrix + counts |
| [TEST-STRATEGY.md](./TEST-STRATEGY.md) | Unit/integration/E2E/regression plan |
| [DEV-ENVIRONMENT-SAFETY.md](./DEV-ENVIRONMENT-SAFETY.md) | Safe test isolation from production APK/data |
| [PROGRESS.md](./PROGRESS.md) | Live Phase 0 progress snapshot |

## Current blockers (for later phases)

1. Core rental Firestore writes have **no server-side business validation**.
2. Local deletes are **not** propagated to cloud (no tombstones).
3. Dirty queue (`sync_queue`) is **not UID-scoped** and may accumulate duplicate dirty rows.
4. Sync is upload worker + separate restore (not one bidirectional delta); conflict rules are weak.
5. No product flavors / `applicationIdSuffix` — debug APK shares production package `com.rentacar.app`.
6. Claude Mobile cannot call a peer Android app’s localhost; needs public remote MCP + device channel.
7. App Check is **not** wired; no verified Android presence heartbeat for device availability.

## Next milestone

**Phase 1 — Shared Agent API contract** (schemas, capability registry, auth envelopes, result formats).  
Do **not** start until explicit user approval.

## Safety

- Work only on `feature/claude-agent-api`
- Never auto-merge to `main`
- Never force-push
- Never treat Git isolation as Firebase/Room/APK isolation
- Independent of YZ Dev Bridge
