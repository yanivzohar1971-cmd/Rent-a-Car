# AGENT-015 — Sales Reads

Implements `carSale.list`, `carSale.commission.totals`, and `request.list`
through `SalesReadPort`. Fixture tests cover filtering, deterministic paging,
authorization, structured responses, and repository failures.

The slice is read-only and Android-local. It does not expose cloud execution,
commission payment, request mutation, or car-sale mutation.
