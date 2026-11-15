# AGENT-001 — Shared API Contract & Capability Registry

**Status:** COMPLETE  
**Branch:** `feature/claude-agent-api`  
**API version:** `1.0`  
**Catalog version:** `1.0.0`  
**Date:** 2026-11-15

## 1. Implemented architecture

Logical product name: **RentCarAgentAPI**

Package: `com.rentacar.app.agentapi`

| Component | Role |
|-----------|------|
| `RentCarAgentAPI` | Façade (discovery + disabled execute) |
| `AgentCapabilityRegistry` | In-memory registry over catalog JSON |
| `OperationCatalogLoader` | Loads `agentapi/operations-v1.json` from classpath |
| `GeneratedOperationCatalog` | Expected totals constants |
| `AgentCapabilityDiscovery` | MCP-ready discovery document (non-executable ads) |
| `DisabledAgentOperationExecutor` | Validates requests; refuses all business execution |
| `AgentRequestValidator` | Schema / forbidden-parameter checks |
| `AgentApiJson` | Gson serialize/deserialize helpers |
| Model types | Request/response/error/enums/metadata |

No new Gradle module. Reuses existing Gson dependency. No Room/Firestore/MCP/network.

## 2. Contract version

- `apiVersion`: **1.0**
- `catalogVersion`: **1.0.0**
- Resource: `app/src/main/resources/agentapi/operations-v1.json`
- Generator: `tools/agentapi/parse_ops.py` (from `02-OPERATION-INVENTORY.md`)

## 3. Registry design

Each operation includes: id, module/entity, description, READ/WRITE, input/output schema maps, permissions, risk, confirmation policy, execution targets, sync notes, source file references, `implementationStatus=REGISTERED`, `executable=false`.

## 4. Operation inventory mapping

| Source | TOTAL | READ | WRITE |
|--------|------:|-----:|------:|
| Phase 0 summary claim | 196 | 98 | 98 |
| **Reconciled OPERATION_ID rows** | **204** | **105** | **99** |

Registry and tests use reconciled counts. See inventory §D reconciliation note.

| Status | Count |
|--------|------:|
| REGISTERED_OPERATIONS | **204** |
| IMPLEMENTED_OPERATIONS | **0** |
| EXECUTABLE_OPERATIONS | **0** |
| TESTED_OPERATIONS (business executors) | **0** |

## 5. Request schema

```json
{
  "apiVersion": "1.0",
  "operation": "reservation.get",
  "requestId": "unique-request-id",
  "target": "AUTO",
  "parameters": { "id": 5 },
  "auth": { "userUid": "...", "roles": [], "permissions": [] },
  "correlationId": "...",
  "idempotencyKey": "...",
  "confirmationToken": "..."
}
```

Targets: `ANDROID_LOCAL` | `CLOUD` | `AUTO`.

Forbidden parameters: SQL keys/strings, arbitrary method/reflection keys.

## 6. Response schema

```json
{
  "success": false,
  "apiVersion": "1.0",
  "operation": "supplier.list",
  "requestId": "...",
  "data": null,
  "metadata": {
    "source": "UNKNOWN",
    "syncStatus": "UNKNOWN",
    "resultCompleteness": "UNKNOWN",
    "lastSuccessfulSyncEpochMs": null,
    "warnings": ["..."]
  },
  "error": { "code": "EXECUTION_DISABLED", "message": "..." }
}
```

Sync timestamps are never invented.

## 7. Error model

Codes include: `INVALID_REQUEST`, `INVALID_ARGUMENT`, `UNKNOWN_OPERATION`, `NOT_IMPLEMENTED`, `EXECUTION_DISABLED`, `WRITE_DISABLED`, `SQL_NOT_ALLOWED`, `ARBITRARY_METHOD_NOT_ALLOWED`, plus the Phase-1 planned set (`UNAUTHORIZED`, `DEVICE_UNAVAILABLE`, …).

## 8. Security metadata

- Permissions list per operation (`AUTHENTICATED`, `ADMIN`, `DEBUG`, `NOT_ELIGIBLE_FOR_AGENT` for debug).
- Risk: LOW/MEDIUM/HIGH/CRITICAL.
- Confirmation: NONE/SOFT/HARD/CRITICAL.
- Future phases: `AgentCommandPhase` PREPARE→…→AUDIT enum present; not executed.

## 9. Execution target model

Declared per operation from local/cloud inventory columns. Router not implemented. Disabled executor never selects a live data source.

## 10. Confirmation model

Policy metadata only. Model-provided confirmation tokens are **not** treated as human authorization.

## 11. Examples

Discovery:

```kotlin
val api = RentCarAgentAPI()
val doc = api.discover() // executableOperations == 0
```

Execute (always non-success in AGENT-001):

```kotlin
api.execute(
  AgentRequest(
    apiVersion = "1.0",
    operation = "supplier.list",
    requestId = "demo-1"
  )
)
```

## 12. Test results

| Suite | Result |
|-------|--------|
| `com.rentacar.app.agentapi.AgentApiContractTest` | **PASSED** |
| `:app:testDebugUnitTest` (full unit suite) | **PASSED** (`BUILD SUCCESSFUL`) |
| Device / instrumented | **NOT EXECUTED** (not required for AGENT-001; no APK install) |

## 13. Known limitations

- No business executors.
- Parameter schemas are lightweight declarations, not full JSON Schema validation engines.
- Inventory summary historically claimed 196; registry uses 204.
- No MCP server, no device channel, no cloud writes.

## 14. Next dependencies

- **AGENT-002 / Phase 2:** Android local read executor for a vertical slice (e.g. `supplier.list` / `supplier.get`) using existing repositories — still behind auth and without enabling writes.
