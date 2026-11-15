# AGENT-019 — Shared Read Infrastructure

`LocalReadSupport` centralizes authorization, local/AUTO target validation,
pagination, positive-ID parsing, structured success/failure responses, and
local response metadata for Android read executors.

Executors remain explicitly selected by `DispatchingAgentOperationExecutor`.
An operation is executable only when it is in `AgentExecutableAllowlist`, its
domain executor is wired, and the request passes catalog validation and
permission checks. Domain ports provide the narrow repository/DAO boundary and
keep UID-scoped access visible and testable.

The supplier, reservation, and customer executors now share these helpers while
preserving their domain-specific messages, warnings, filters, DTOs, ordering,
and authorized port calls.

This work did **not** add a generic SQL/query engine, reflection-based DAO
exposure, write support, or a network endpoint. Authentication and required
permissions remain mandatory.
