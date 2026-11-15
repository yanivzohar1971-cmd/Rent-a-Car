# ROADMAP — Claude Agent API Implementation

**Baseline branch:** `feature/claude-agent-api`  
**Baseline commit:** `f60512d714050643129eeea533374c8a785fd738`  
**Phase 0 status:** COMPLETE (documentation)  
**Phase 1 / AGENT-001 status:** COMPLETE (contract + registry; 0 executable ops)

---

## Vertical slices (shortest path to real results)

| Slice | Path | First win |
|-------|------|-----------|
| **SLICE 1** | Claude Code → MCP → Cloud Executor → synced **suppliers** | Real cloud reads |
| **SLICE 2** | Claude → MCP → Device Gateway → Room **reservations** (incl. unsynced) | Real local reads |
| **SLICE 3** | Claude → confirmed command → Android repository write | Validated mutation |
| **SLICE 4** | Device/cloud write → dirty sync → consistency checks | Sync-safe loop |

---

## PHASE 0 — System audit

| Field | Value |
|-------|-------|
| Status | **COMPLETE** |
| Objective | Source-verified inventory + architecture + roadmap |
| Dependencies | None |
| Tasks | AGENT-000a docs set under `docs/agent-api/` |
| Acceptance | All Phase 0 deliverables present; git docs-only commit |
| Risks | Audit drift if code changes on main |

---

## PHASE 1 — Shared Agent API contract

| Field | Value |
|-------|-------|
| Status | **AGENT-001 COMPLETE** (foundation landed in `:app`) |
| Objective | Stable schemas for operations, auth envelopes, results, coverage metadata |
| Dependencies | Phase 0 |
| Expected modules | `com.rentacar.app.agentapi` + classpath catalog JSON |
| Security | No secrets in schemas; confirmation enums; correlation IDs; execution disabled |

### Tasks

| ID | Task | Status | Acceptance |
|----|------|--------|------------|
| AGENT-001 | Shared contract + full capability registry + disabled executor + discovery | **DONE** | See `AGENT-001-API-CONTRACT.md` |
| AGENT-002 | (Absorbed into AGENT-001) Result/coverage/sync metadata types | **DONE** | Types in `AgentResponseMetadata` |
| AGENT-003 | (Absorbed into AGENT-001) Registry + catalog generator | **DONE** | `operations-v1.json` + `parse_ops.py` |
| AGENT-004 | (Absorbed into AGENT-001) Error code catalog + serialization tests | **DONE** | `AgentErrorCode` + unit tests |
| AGENT-005 | (Absorbed into AGENT-001) Auth context contract fields | **DONE** | `AgentAuthContext` (enforcement later) |

**Phase acceptance:** Contract + registry + tests complete; **0** executable business operations.

**Inventory reconciliation:** Phase 0 summary claimed 196/98/98; AGENT-001 authoritative parse = **204/105/99**.

---

## PHASE 2 — Android local executor

| Field | Value |
|-------|-------|
| Dependencies | Phase 1 |
| Modules | `:app` `agentapi/executor` |
| Security | UID from `CurrentUserProvider`; deny debug ops |

### Tasks

| ID | Task | Depends |
|----|------|---------|
| AGENT-010 | Executor skeleton + registry wiring via `DatabaseModule` | AGENT-003 |
| AGENT-011 | `suppliers.search` / `suppliers.get` local | AGENT-010 |
| AGENT-012 | `reservations.search` / `reservations.get` local | AGENT-010 |
| AGENT-013 | `customers.*` read set | AGENT-010 |
| AGENT-014 | Unit tests for handlers | AGENT-011..013 |
| AGENT-015 | Extract 1–2 VM-embedded validators only if blocking | as needed |

**Acceptance:** In-process calls return real Room data for Slice 2 reads.

---

## PHASE 3 — Secure Android device access

| Field | Value |
|-------|-------|
| Dependencies | Phase 2 |
| Modules | Android FGS + cloud Device Gateway |

### Tasks

| ID | Task |
|----|------|
| AGENT-020 | Device pairing + token issuance |
| AGENT-021 | Outbound WebSocket/HTTPS channel |
| AGENT-022 | Command TTL + idempotency |
| AGENT-023 | Presence integration |
| AGENT-024 | `DEVICE_UNAVAILABLE` behavior tests |

**Acceptance:** Windows lab can invoke device executor on paired emulator/device without exposing Room publicly.

---

## PHASE 4 — Cloud agent executor

| Field | Value |
|-------|-------|
| Dependencies | Phase 1 (reads); command API before writes |
| Modules | Cloud Run/Functions |

### Tasks

| ID | Task |
|----|------|
| AGENT-030 | Cloud read executor for 12 synced collections |
| AGENT-031 | `coverage=CLOUD_PARTIAL` metadata |
| AGENT-032 | Deny LOCAL_ONLY operations |
| AGENT-033 | Design-only freeze on writes until AGENT-034 |
| AGENT-034 | Server command API for safe writes (post Slice 1) |

**Acceptance:** Slice 1 suppliers reads work with user token.

---

## PHASE 5 — Remote MCP server

| ID | Task |
|----|------|
| AGENT-040 | Streamable HTTP MCP host :443 |
| AGENT-041 | OAuth or approved auth bridge |
| AGENT-042 | Tool list from registry |
| AGENT-043 | Map tools → Cloud/Device router |

**Acceptance:** `claude mcp add --transport http` connects; tools listed.

---

## PHASE 6 — Claude Code Windows integration

| ID | Task |
|----|------|
| AGENT-050 | Document `.mcp.json` / add commands for this project |
| AGENT-051 | E2E Slice 1 test script |
| AGENT-052 | Optional adb device lab path |

---

## PHASE 7 — Claude Mobile integration

| ID | Task |
|----|------|
| AGENT-060 | Add custom connector on claude.ai |
| AGENT-061 | Verify Mobile tool calls hit same MCP |
| AGENT-062 | Device path E2E when phone online |

---

## PHASE 8 — Full business operation coverage

Expand registry to all eligible ops from `02-OPERATION-INVENTORY.md` / `OPERATION-COVERAGE.md`.  
Track with AGENT-1xx per module batches (reservations, commissions, imports, yard, admin deny-list).

---

## PHASE 9 — Safe command execution

| ID | Task |
|----|------|
| AGENT-200 | Confirmation tokens for HIGH/CRITICAL |
| AGENT-201 | Idempotency store |
| AGENT-202 | Transactions for multi-row cmds |
| AGENT-203 | Audit log query API |
| AGENT-204 | Replay protection |

---

## PHASE 10 — Sync & conflict validation

| ID | Task |
|----|------|
| AGENT-210 | Offline create → sync → cloud visible |
| AGENT-211 | Device write vs cloud stale |
| AGENT-212 | Delete policy tests (expect gaps until tombstones) |
| AGENT-213 | Document residual sync risks |

---

## PHASE 11 — Security & production hardening

| ID | Task |
|----|------|
| AGENT-220 | Penetration-style review of MCP + gateway |
| AGENT-221 | Rate limits |
| AGENT-222 | Credential rotation drill |
| AGENT-223 | Prompt-injection tool-allowlist review |
| AGENT-224 | Dev/prod Firebase isolation verification |

---

## PHASE 12 — Final end-to-end acceptance

| ID | Task |
|----|------|
| AGENT-230 | Windows cloud + device matrix |
| AGENT-231 | Mobile connector matrix |
| AGENT-232 | App regression (reservations, sync, backup, commissions) |
| AGENT-233 | Release checklist / no main merge without approval |

---

## First implementation task after approval

**AGENT-010** — Android local executor skeleton + `supplier.list` / `supplier.get` read handlers (Phase 2).  
Do not start until explicit user approval.  
Do not enable writes.
