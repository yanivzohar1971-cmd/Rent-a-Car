# AGENT-018 — Catalog and Reservation Reads

Implements 15 local reads for agents, branches, supplier picking, price lists,
reservation/customer/supplier/agent/branch views and filters, payments,
dashboard open reservations, customer history, and customer details.
`CatalogAndReservationExtReadPort` is the narrow DAO/repository boundary.

Fixture tests cover operation routing, parameter validation, paging,
authorization, and failures. The projections are local-only with unknown sync
freshness; no generic joins, arbitrary DAO access, writes, or cloud path were
added.
