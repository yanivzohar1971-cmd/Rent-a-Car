# AGENT-061 — Read-only workflow stubs

**Status:** DONE (JVM / fixtures). **Writes: none. Room v44 unchanged.**

Package: `com.rentacar.app.agentapi.workflows`

## Engine

`AgentWorkflowEngine(api: RentCarAgentAPI, workflows = defaultWorkflows())`

- `run(workflowId, parameters, auth, requestId?) : WorkflowResult`
- `workflowIds()`, `describe()`
- Guards:
  - `auth.userUid` required (`UNAUTHORIZED`); identity is never read from workflow parameters (`userUid` etc. are simply not allowed parameters → `INVALID_ARGUMENT`).
  - SQL / arbitrary-method screening via `AgentRequestValidator.detectForbiddenParameters`.
  - Unknown parameters rejected per workflow (`allowedParameters`).
  - At construction every operation a workflow declares must be a **registered READ** and on `AgentExecutableAllowlist`; otherwise `IllegalArgumentException`.
  - At run time `WorkflowContext.call` only permits operations the workflow declared; anything else throws and the engine returns `INTERNAL_ERROR` (no step executed).
  - Every step goes through the normal `RentCarAgentAPI.execute` path (`ANDROID_LOCAL`, auth context, per-step request ids, shared correlation id), so all executor-level checks (uid scoping, pagination, validators) still apply.
- `WorkflowResult`: `success`, `data`, `steps` (operation / success / errorCode / itemCount only – no business data in steps), `error`, `warnings`, `readOnly = true`.
- A failing step aborts the workflow and returns that step's error (`data = null`).

In production the `auth` must be the gateway's token-bound identity; the engine is **not** wired to any UI, gateway route or MCP tool yet.

## Workflows

### `workflow.findCustomerAndListReservations`

`customer.list(query, limit)` → `reservation.list.byCustomer(customerId)` for each match.

- Params: `query` (required, non-blank), `maxCustomers` (optional int, 1..10, default 5).
- Returns `matches[] = { customer, reservations, reservationCount }`, `customerCount`, `totalMatchingCustomers`.
- Never picks a customer: multiple matches are all returned (grouped) with a warning; more matches than `maxCustomers` produces a truncation warning; no match → success with empty list and a warning.

### `workflow.unpaidCommissionSummary`

`commission.summary.totals(payoutMonth, supplierId?)` + `carSale.commission.totals(commissionFilter="OPEN")`.

- Params: `payoutMonth` (required, `YYYY-MM`), `supplierId` (optional, reservations only).
- Returns `reservationCommission { totalCommission, distinctReservationCount }` and `carSaleCommissionOpen { count, sumCommissionPrice, sumPaid, sumRemaining }`.
- The two figures are intentionally **not summed**: reservation commissions have no paid/unpaid tracking in the read model (the total is the payout-month total), only car-sale commissions have a real remaining amount, and the car-sale figure covers all open sales, not only the month. Both caveats are returned as `warnings`.

## Tests

`AgentWorkflowEngineTest` (15): grouping/ordering, single/no match, per-user isolation, match cap, parameter validation, step-failure propagation (unwired reservation port), commission composition with fixtures (open sale 100 / paid 20 → remaining 80; fully paid sale excluded), supplier filter pass-through, payout-month validation, engine guards (identity, unknown workflow, smuggled `userUid`, SQL), allowlist/READ construction checks, undeclared-operation call blocked, default workflow set, fixtures not mutated.

## Not done

- No MCP/gateway exposure of workflows (would need a deliberate tool-surface decision).
- No workflow persistence, scheduling, or write steps (any future write workflow must go through the command pipeline with human confirmation).
