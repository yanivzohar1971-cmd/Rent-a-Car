# 04 — Business Rules & Financial Logic

**Verified:** 2026-11-15. Agent API must **reuse** these classes — never reimplement divergent formulas.  
**Follow-up:** Corrected SoT paths; distinguished car-sale vs rental installment vs reconciliation status models; filter-scoped totals documented.

## 1. Source-of-truth map

| Concern | Prefer |
|---------|--------|
| Reservation field validation | UI `NewReservationScreen` / `Screens.kt` `canSave` (not repo) |
| Reservation persistence | `ReservationRepository` + UID stamp + dirty mark |
| List status ACTIVE/CLOSED/CANCELLED | `ReservationListStatusClassifier` |
| Rental commission math | `CommissionCalculationService`, `domain/CommissionCalculator.kt`, `CommissionBusinessDates` |
| Supplier % overrides | `Supplier.commissionDays1to6|7to23|24plus` / `SupplierCommissionTerms` |
| Car-sale payment status | `CarSaleCommissionPaymentLogic` |
| Car-sale save + payments | `CarSaleRepository.saveSaleWithCommissionPayments` (`withTransaction`) |
| Alignment (“יישור קו”) | `CarSaleCommissionAlignmentLogic` + Settings confirm |
| Reconciliation match | `CommissionReconciliationService` + repository |
| Reconciliation approve | `CommissionReconciliationApprovalService` |
| Recon presentation/totals | `CommissionComparisonMapper`, `MoneyDecimal` |
| Customer terms | `CustomerTermsRepository` + `CustomerTermsEditorLogic` |

**Not found / do not cite:** `CommissionStatusResolver`.

## 2. Reservation create / update

**UI gate (`canSave`):** supplier required; branch required unless `airportMode`; `agreedPrice > 0`; `kmIncluded > 0`; `requiredHoldAmount > 0`; car type; dates; `periodTypeDays`.

**VM/Repo:** require Firebase UID; **no field validation** on create/update — only persistence + dirty.

**Statuses (`ReservationStatus`):** Draft, SentToSupplier, SentToCustomer, Confirmed, Paid, Cancelled. Cancel/restore use UI confirm dialogs.

**Risk:** MEDIUM–HIGH for Agent writes (must re-host UI validation).

## 3. Rental commission calculation

| Rule | Detail |
|------|--------|
| Default tiers | 1–6 → 15%, 7–23 → 10%, 24+ → 7% (`CommissionCalculator`) |
| Calendar | Asia/Jerusalem; return = `actualReturnDate` calendar date |
| Monthly | `periodTypeDays` ∈ {30, 24 legacy} |
| Cancelled | Excluded |
| Ex-VAT base | If `includeVat`, divide by `(1 + vatPercent/100)` (default 17%) |
| Installment id | `CommissionInstallment.generateId(orderId, start, end)` |

**Commission mode totals** on reservations manage: computed from **full** reservation list with supplier + payout month filters — **date/status UI filters ignored** (unlike orders mode summary).

In-memory `CommissionStatus` UNPAID/PAID/HOLD: default UNPAID; **no verified writer flips PAID/HOLD** in persistence — do not confuse with car-sale or recon enums.

## 4. Car-sale commission statuses (verified)

`CarSaleCommissionPaymentLogic.PaymentStatus`:

| Status | Rule |
|--------|------|
| `NO_COMMISSION` | `commissionPrice <= 0` |
| `UNPAID` | `paid <= 0` |
| `PARTIAL` | `0 < paid < commissionPrice - MONEY_EPS` |
| `PAID` | `paid >= commissionPrice - MONEY_EPS` |

`MONEY_EPS = 1e-4`. Sales manage totals respect **filtered** list (OPEN/CLOSED/ALL).

Payment writes validate amount > 0, date, sum ≤ commission; cannot lower commission below paid.

## 5. Supplier commission reconciliation

- Matching via parsers (`emailimport/*`) — order/invoice/customer/revenue/commission columns.
- Directions: UNDERPAID / OVERPAID / matched via `CommissionComparisonMapper`.
- `paymentTotals()` uses **all presentations**, not the active filter (filter affects list counts only).
- Approve path: Room transaction; safe bulk only FULL_MATCH / CUSTOMER_NAME_WARNING.
- Entities LOCAL_ONLY — Device Executor required.
- **Risk:** CRITICAL for settle/approve.

## 6. Holds (do not conflate)

| Concept | Meaning |
|---------|---------|
| Customer credit hold | `Reservation.requiredHoldAmount` + supplier `defaultHold`/`fixedHold` |
| Recon `HELD` | `ReconciliationApprovalState` — enum present; full UX path partially UNVERIFIED |
| `CommissionStatus.HOLD` | In-memory installment enum — not the credit hold |

## 7. Transactional / confirmation / irreversible

| Command | Confirm | Tx? | Risk |
|---------|---------|-----|------|
| Reservation create/update | No (UI gate only) | Single upsert | MEDIUM |
| Cancel / restore reservation | Yes | Status update | MEDIUM |
| Add reservation payment | No | Upsert | MEDIUM |
| Save car sale + payments | Validation throws | `withTransaction` | HIGH |
| Align all sale commissions | Yes (Settings) | Transaction | CRITICAL |
| Recon approve selected | Selection + safety | `withTransaction` | CRITICAL |
| Historical baseline override | Cap date | Override upsert | HIGH |
| Export snapshot import | Critical | Bulk upsert | CRITICAL |
| Cloud restore | Confirm | Restore path | HIGH |
| Debug DB / admin roles | — | — | CRITICAL / NOT_ELIGIBLE early |

## 8. Agent constraints

1. One shared rules engine — extract UI `canSave` before cloud/device writes.  
2. Never trust model-side money arithmetic.  
3. Declare aggregate **scope** (filtered vs all vs period).  
4. Reject cloud execution for LOCAL_ONLY finance pipelines.  
5. HIGH/CRITICAL → confirmation + idempotency (Phase 9).
