# AGENT-107 / AGENT-108 — Cloud Reads & Source Router

**Status:** IMPLEMENTED against isolated in-memory cloud port; **live Firebase BLOCKED**

## AGENT-107

- `CloudReadPort.read(...)` when `activated`
- `CloudAgentReadExecutor` allowlist: `supplier.list/get`, `customer.list/get`, `reservation.list.manage/get`
- Metadata: `source=CLOUD`, `syncStatus=UNKNOWN`, completeness COMPLETE/PARTIAL
- Inactive port → `EXECUTION_DISABLED` (no network)
- Tests use `InMemoryIsolatedCloudReadPort` only — **not** production Firebase

## AGENT-108

- `ExecutionTargetRouter` for `ANDROID_LOCAL` / `CLOUD` / `AUTO`
- Optional wiring on `DispatchingAgentOperationExecutor`
- Default path unchanged when cloud executor absent
- Device unavailable / unsupported target → structured errors; no silent merge

## Remaining for live cloud

- Isolated non-prod Firebase project authorization
- Firestore-backed `CloudReadPort`
- Indexes / security rules verification
- Do not point AgentDev at production Firebase
