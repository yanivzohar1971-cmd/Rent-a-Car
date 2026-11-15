# AGENT-111 / 113 / 114 - AgentDev gated Room writes

Production writes stay **disabled**. A confirmed command only reaches real Room storage when the build is AgentDev.

## Gate and pipeline

`AgentDevWriteGate.roomWritesEnabled() = BuildConfig.AGENT_DEV_MODE` (`false` in `standard`, `true` in `agentdev`; no runtime override).

`PreparingWriteCommandPipeline.commit` order (after owner, expiry and confirmation-token checks):

1. `roomCommitter != null && roomWritesEnabled()` -> Room commit. Receipt: `outcome=ROOM_COMMITTED`, `productionWritePerformed=false`, `sandboxOnly=false`, `developmentOnly=true`, plus `committedEntityType/Id`. Audit record carries the same three flags.
2. else sandbox present -> in-memory sandbox (`sandboxOnly=true`).
3. else `WRITE_DISABLED`.

`AgentDevRoomWriteCommitter` also refuses (`WRITE_DISABLED`) by itself if its own gate is closed. Data access is through `AgentDevWritePorts`; `RepositoryAgentDevWritePorts` adapts `CustomerRepository`, `SupplierRepository`, `RequestRepository`, `ReservationRepository` and DAOs. The ports are **not wired into the app/gateway yet** (no caller constructs the pipeline with a committer).

## Supported operations (registered WRITE ops from the catalog)

| Operation | Spec | Notes |
|---|---|---|
| `customer.create`, `supplier.create`, `request.create` | `SandboxWriteSpecs` | `supplier.create` rejects an existing name (the DAO upsert would overwrite it). |
| `reservation.create` | `ReservationWriteSpecs` | Requires customerId, supplierId, branchId, carTypeId, dateFrom < dateTo, agreedPrice, kmIncluded, requiredHoldAmount. Always `Draft`. References must exist for the user; branch must belong to the supplier. `commissionPercentUsed` is never set (existing logic owns commission). |
| `reservation.update` | `ReservationWriteSpecs` | Requires reservationId + at least one mutable field; customerId/supplierId/status/isClosed/commission are not updatable. Dates are re-checked against the stored row; closed reservations rejected; blank text clears a field. |
| `carSale.commissionPayment.add` | `CommissionPaymentWriteSpecs` | carSaleId, amount, paymentDate. Commit uses `CommissionPaymentSafety` -> existing `CarSaleCommissionPaymentLogic` (UNPAID/PARTIAL/PAID/NO_COMMISSION, `MONEY_EPS`); over-payment and no-commission sales are rejected; the sale row is never modified. |

`AgentDevWriteSpecs.all()` combines all specs.

## Idempotency

In-memory ledger in the committer (per process, per user, per operation; no schema change):

- same `idempotencyKey` + same command hash -> original result replayed (`idempotentReplay=true`), nothing written;
- same `idempotencyKey`, different hash -> `CONFLICT`;
- same command hash, any/no key -> `CONFLICT` (duplicate), nothing written;
- only successful commits are recorded (failed commands can be corrected and retried).

Limits: the ledger is lost on restart. Commission payments additionally have a persisted guard (same amount + date on the same sale -> `CONFLICT`). Other entity creates have no persisted dedupe; a durable idempotency table would need a migration (deferred).

## Tests

`AgentDevRoomWriteTest`, `ReservationWriteTest`, `CommissionPaymentWriteTest`, `SyncHardeningTest` (fake ports, JVM only). Existing `WriteCommandPipelineTest` / `WritePrepareSandboxTest` are unchanged and still pass.
