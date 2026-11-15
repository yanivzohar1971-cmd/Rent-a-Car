# AGENT-017 — Reporting Reads

Implements `report.monthly.view` through `ReportingReadPort`, with validated
supplier/year/month input and UID-scoped local data. Fixture tests cover the
successful report, invalid parameters, authorization, and failures.

This is a local read projection only; report imports, exports, mutations, and
cloud execution are not enabled.
