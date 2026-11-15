# AGENT-016 — Fleet Reads

Implements `yard.fleet.list` and `yard.fleet.filter` through `FleetReadPort`.
Fixture tests cover status/query filtering, pagination, authorization, and
error handling.

Only local read models are returned. Yard writes, publishing actions, and cloud
execution remain outside this slice.
