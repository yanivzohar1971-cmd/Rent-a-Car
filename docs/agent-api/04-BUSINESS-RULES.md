# 04 — Business Rules & Financial Logic

**Verified:** 2026-11-15 from Android sources. Agent API must **reuse** these classes — never reimplement divergent formulas.

## 1. Source-of-truth map

| Concern | Source of truth | Path |
|---------|-----------------|------|
| Reservation CRUD / holds defaults | `ReservationRepository` + `ReservationViewModel` | `data/Repositories.kt`, `ui/vm/*` |
| Supplier commission day tiers / default hold | `Supplier` fields (`commissionDays1to6`, `7to23`, `24plus`, `defaultHold`, `fixedHold`) | synced supplier payload in `CloudDeltaSyncWorker.syncSupplier` |
| Car-sale commission payment status | `CarSaleCommissionPaymentLogic` | `data/CarSaleCommissionPaymentLogic.kt` |
| Commission reconciliation comparison | `CommissionReconciliationService`, `CommissionComparisonMapper` | `commission/*` |
| Settlement statuses | `CommissionEnums` / reconciliation DAOs | `commission/domain/CommissionEnums.kt` |
| Supplier report parsing (Shagrir etc.) | `emailimport/*` parsers | order/invoice/commission columns |
| Customer terms rendering | `CustomerTermsRepository` / terms editor logic | terms screens |
| Filters affecting totals | ViewModels (e.g. `CommissionReconciliationViewModel` filter enums) | UI-scoped unless explicitly “all” |

## 2. Reservation rules

**Create / update (Android):**

- Required associations: customer, supplier (and typically dates / car type) enforced in editor ViewModel before repo write.
- Holds may derive from supplier `defaultHold` / `fixedHold`.
- Status transitions live in reservation UI/repo — **must be inventoried per field in Phase 1 schemas**.
- Offline creates are valid locally; cloud visibility delayed until dirty sync.

**Risk:** HIGH for Agent writes (financial + operational side effects).

**Confirmation:** Required for create/update/cancel-like status changes in Agent API.

## 3. Car-sale commission statuses (verified)

`CarSaleCommissionPaymentLogic.PaymentStatus`:

| Status | Rule |
|--------|------|
| `UNPAID` | `paid <= 0` |
| `PARTIAL` | `0 < paid < commissionPrice - MONEY_EPS` |
| `PAID` | `paid >= commissionPrice - MONEY_EPS` |

Also exposes OPEN vs closed grouping (OPEN = UNPAID ∪ PARTIAL).

**Zero / tiny residuals:** `MONEY_EPS` prevents false PARTIAL from float noise.

**Agent rule:** Call the same logic (or extract shared pure function used by both UI and Agent). Do not invent new thresholds.

## 4. Supplier commission reconciliation

**Matching keys:** supplier order number, invoice number, customer name, revenue, commission percent — parsers in `ShagrirCommissionReportParser` / clipboard / HTML table parsers.

**Directions:** `PaymentDifferenceDirection.UNDERPAID` / `OVERPAID` / matched / other in `CommissionComparisonMapper`.

**Filters:** `CommissionReconFilter` including UNDERPAID/OVERPAID — **totals on screen can be filter-scoped**. Agent financial reports must declare scope:

- `scope=FILTERED` vs `scope=ALL_FOR_SUPPLIER` vs `scope=PERIOD`

**Settlement events / overrides:** `CommissionSettlementEvent`, `CommissionTrackingOverride` — LOCAL_ONLY entities. Cloud Agent cannot safely settle without device path.

**Statuses in DAO queries:** e.g. `APPROVED`, `PAID` string filters in reconciliation DAOs.

**Risk:** CRITICAL for autonomous settle/pay commands.

## 5. Partial payments & outstanding balances

| Module | Behavior |
|--------|----------|
| Car sale commissions | Sum of payment rows vs `commissionPrice` via `CarSaleCommissionPaymentLogic` |
| Reservation payments | `Payment` child entities; outstanding depends on reservation pricing fields — compute in repo/VM |
| Reconciliation | Difference = expected commission − paid (mapper) |

Agent must return both **raw components** and **derived status** from shared logic.

## 6. Supplier assignment & imports

- Supplier import runs (`SupplierImportRun*`) mutate reservations/monthly deals locally.
- Price list imports affect quotes — LOCAL_ONLY headers/items.
- Import side effects are **batch writes** — treat as transactional + confirmable.

**Risk:** HIGH / CRITICAL.

## 7. Commands requiring transactions

| Command class | Why |
|---------------|-----|
| Record commission payment + status refresh | Multi-row consistency |
| Reconciliation settle / override | Event + item updates |
| Reservation create with payments/card stubs | Parent/child |
| Import commit | Many rows |
| Backup restore | Global DB replace |

Room `@Transaction` usage should be preferred inside existing repos; Agent executor must call those methods, not piecemeal DAOs.

## 8. Commands requiring explicit confirmation

| Level | Examples |
|-------|----------|
| NONE | Pure reads/searches |
| SOFT | Create draft customer |
| HARD | Create/update reservation; record payment; change commission override |
| CRITICAL | Delete reservation; settle reconciliation; restore backup; bulk import commit; role/admin changes |

## 9. Irreversible / high-impact changes

- Backup restore overwrites local DB
- Deletes (and cloud may retain orphans — see sync audit)
- Settlement marking PAID
- Bulk import applying supplier monthly deals
- Admin role changes (`AdminRoleManagement`)

## 10. Initial risk classification

| Area | Risk |
|------|------|
| Catalog reads (suppliers, car types) | LOW |
| Customer read/search | LOW |
| Reservation read | LOW–MEDIUM (PII) |
| Reservation write | HIGH |
| Payment / card stub write | HIGH |
| Car sale commission payment | HIGH |
| Commission reconciliation settle | CRITICAL |
| Import commit | CRITICAL |
| Backup restore | CRITICAL |
| Cloud raw Firestore write bypassing Android rules | CRITICAL |
| Admin / role mutation | CRITICAL |

## 11. Agent API design constraints

1. **One rules engine** — extract/share pure functions already used by UI.
2. **Never trust model-side arithmetic** for money status.
3. **Declare data scope** on every aggregate.
4. **Reject cloud execution** for LOCAL_ONLY financial pipelines until synced or device-routed.
5. **Idempotency + confirmation tokens** for HIGH/CRITICAL writes (Phase 9).
