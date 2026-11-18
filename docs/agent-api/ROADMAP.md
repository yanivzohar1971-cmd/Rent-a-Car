# ROADMAP — Claude Agent API Implementation

**Baseline branch:** `feature/claude-agent-api`  
**Baseline commit:** `f60512d714050643129eeea533374c8a785fd738`  
**Phase 0 status:** COMPLETE (documentation)  
**Phase 1 / AGENT-001 status:** COMPLETE (contract + registry)  
**Phase 2 / AGENT-010 status:** COMPLETE (`supplier.list` / `supplier.get` local reads)  
**Phase 2 / AGENT-012 status:** COMPLETE (`reservation.list.manage` / `reservation.get` local reads)  
**Phase 2 / AGENT-013 status:** COMPLETE (`customer.list` / `customer.get` local reads)
**Phase 2 / AGENT-014–018 status:** COMPLETE (25 additional Android local reads)
**Phase 2 / AGENT-019 status:** COMPLETE (shared read infrastructure)
**Phase 2 / AGENT-020 status:** COMPLETE (in-process read-only MCP foundation)
**Phase 3 / AGENT-021–030 status:** FOUNDATION COMPLETE (authenticated gateway, loopback dev router, Windows MCP host, cloud read stub, connector docs) — **not connected to a real Android device or Claude Code**
**Batch B partial:** `agent.history.reservations`, `import.log.list` implemented; remaining reads classified in `READ-ELIGIBILITY.md`
**Batch C start / AGENT-041:** write command foundation (prepare/preview only; writes still disabled)
**Batch D partial / AGENT-051:** `customer.create`, `supplier.create`, `request.create` PREPARE+PREVIEW with in-memory sandbox commit only (`AGENT-051-SANDBOX-WRITE-PREPARE.md`); catalog writes remain non-executable
**Batch E partial / AGENT-061:** read-only workflow engine + 2 workflows (`AGENT-061-WORKFLOWS.md`)
**Batch F partial:** Claude connection diagnostics screen/ViewModel (route `claude_agent_connection`; not linked from menus)
**Batch G partial:** `AgentApiSecurityHardeningTest` (token/identity/isolation/MCP/SQL/confirmation-forgery)
**Batch H partial:** `ACCEPTANCE-CHECKLIST.md` (TEST A–L, fixture-only) and `RELEASE-READINESS.md` (**NOT READY**)
**AGENT-101:** PARTIAL — isolated `agentdev` APK + emulator Room + ADB loopback + MCP `EMULATOR_REAL_ROOM` **verified**; Claude Code MCP registered locally; **Claude NL blocked** (`CLAUDE_CODE_LOGIN_REQUIRED`). See `AGENT-101-EMULATOR-INTEGRATION.md`.
**AGENT-121..135:** DONE (readiness) - resilient MCP host, one-command dev session, real-data inventory, read-only `ProductionAgentGateway` (unit-tested, not wired), Firebase-emulator cloud reads + `rentcar-cloud-dev` connector, financial labels; real data NOT connected pending owner authorization. See `AGENT-121-135-REAL-DATA-READINESS.md`.
**AGENT-102..115:** PARTIAL batch — E2E hardening, session/Keystore APIs, remote transport stubs, isolated cloud reads+router, AgentDev-gated Room writes, sync helpers; live Firebase / Claude NL / mobile / production writes still blocked. See `AGENT-115-INTEGRATED-ACCEPTANCE.md`.

> **Task-ID note:** the autonomous-batch IDs (AGENT-021…030, 041) used in the implementation docs differ from
> the original Phase 3–5 placeholder numbering in the tables below. Mapping: 021 = MCP audit; 022–025 =
> device pairing/token, gateway DTOs, presence, request TTL/replay; 026 = Windows MCP host; 027 = E2E tests;
> 028 = cloud read stub; 029 = Claude Mobile connector (docs); 030 = connectivity docs/regression; 041 = command pipeline.

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
| Modules | `:app` `com.rentacar.app.agentapi` |
| Security | Explicit `auth.userUid` + `AUTHENTICATED`; deny cloud/writes |

### Tasks

| ID | Task | Status | Depends |
|----|------|--------|---------|
| AGENT-010 | Android local supplier reads (`supplier.list` / `supplier.get`) | **DONE** | AGENT-001 |
| AGENT-011 | (Absorbed into AGENT-010) supplier list/get local | **DONE** | AGENT-010 |
| AGENT-012 | `reservation.list.manage` / `reservation.get` local | **DONE** | AGENT-010 |
| AGENT-013 | `customer.list` / `customer.get` local | **DONE** | AGENT-010 |
| AGENT-014 | Financial reads (4 operations) | **DONE** | AGENT-013 |
| AGENT-015 | Sales reads (3 operations) | **DONE** | AGENT-014 |
| AGENT-016 | Fleet reads (2 operations) | **DONE** | AGENT-015 |
| AGENT-017 | Reporting read (1 operation) | **DONE** | AGENT-016 |
| AGENT-018 | Catalog/reservation extension reads (15 operations) | **DONE** | AGENT-017 |
| AGENT-019 | Shared local read infrastructure | **DONE** | AGENT-014–018 |
| AGENT-020 | In-process read-only MCP foundation | **DONE (fixtures)** | AGENT-019 |

**Acceptance (AGENT-010):** Wired local API returns repository-backed supplier data; 202 other ops remain disabled.

**Acceptance (AGENT-012):** Wired local API returns repository-backed reservation data; supplier ops preserved; 200 other ops remain disabled; 0 cloud / 0 writes.

**Acceptance (AGENT-013):** Wired local API returns privacy-minimized customer data; supplier + reservation ops preserved; 198 other ops remain disabled; 0 cloud / 0 writes.

---

## PHASE 3 — Secure Android device access

| Field | Value |
|-------|-------|
| Dependencies | Phase 2 |
| Modules | Android FGS + cloud Device Gateway |

### Tasks (original placeholders; see implementation status in the table below)

| ID | Task |
|----|------|
| AGENT-021 | Device pairing + token issuance |
| AGENT-022 | Outbound WebSocket/HTTPS channel |
| AGENT-023 | Command TTL + idempotency |
| AGENT-024 | Presence integration |
| AGENT-025 | `DEVICE_UNAVAILABLE` behavior tests |

### Implemented autonomous batch A (connectivity vertical slice)

| ID | Deliverable | Status |
|----|-------------|--------|
| AGENT-021 | `AGENT-021-MCP-AUDIT.md` | **DONE** |
| AGENT-022–025 | `agentapi.transport`: identity, HMAC device tokens, pairing/revoke/validate, gateway DTOs, `AuthenticatedAgentGateway`, presence, request TTL, replay guard | **DONE (JVM/fixtures)** |
| AGENT-026 | `tools/mcp-host` Node stdio MCP host | **DONE (tested vs fake gateway)** |
| AGENT-027 | `DevicePairingAndGatewayTest`, `LoopbackGatewayHttpTest`, Node `host.test.mjs` | **DONE** |
| AGENT-028 | `CloudAgentReadExecutor` stub (always `EXECUTION_DISABLED`) | **DONE (stub)** |
| AGENT-029 | Claude Mobile connector requirements | **DONE (docs only)** |
| AGENT-030 | Connectivity docs + regression | **DONE** |
| — | Real device listener/relay, TLS, persistent token store, production session binder | **NOT STARTED** |

**Acceptance (not yet met):** Windows lab can invoke device executor on paired emulator/device without exposing Room publicly.
Met so far: Windows host → authenticated gateway → fixture API, over loopback in tests.

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

## Next implementation task after approval

Real device transport for `AuthenticatedAgentGateway`: an Android-side listener (foreground service) or an
outbound relay, a Keystore-backed persistent token store, a production `TrustedSessionBinder` over the
in-app session, TLS, and an isolated non-production Firebase/applicationId flavor for device testing.
Do not expose an unauthenticated server and do not enable writes.

Then (see `RELEASE-READINESS.md` blockers): wire the diagnostics screen to the real pairing service, run acceptance
TEST A–L on a non-production flavor, and only afterwards design the real (transactional) write commit path.
