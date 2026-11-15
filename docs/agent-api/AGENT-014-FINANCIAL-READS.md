# AGENT-014 — Financial Reads

Implements four local reads: commission installment list, commission summary
totals, payout-month filtering, and alignment preview. `FinanceReadPort`
provides the repository boundary; executor tests use fixtures for filtering,
pagination, authorization, and failures.

Results reflect local data with unknown sync freshness. Cloud execution and all
financial writes remain disabled.
