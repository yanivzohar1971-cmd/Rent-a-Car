# AGENT-121..135 — From working Claude MCP to real-data readiness

**Date:** 2026-11-18 · **Branch:** `feature/claude-agent-api`
**Rule:** no real customer data was accessed; all live tests used the AgentDev emulator (synthetic Room
fixtures) or the Firebase Emulator Suite (`demo-rentacar-agent`, synthetic documents).

Milestone vocabulary: IMPLEMENTED · UNIT_TESTED · EMULATOR_TESTED · CLAUDE_TESTED · LIVE_DATA_CONNECTED · PRODUCTION_READY.

## Status by task

| Task | Result | Highest milestone reached |
|------|--------|---------------------------|
| AGENT-121 MCP startup/recovery | Host never exits on offline device; `connection.status` tool; business tools exposed only while executable; `DEVICE_UNAVAILABLE` (no retry); health polling + `tools/list_changed`; token re-read from file; 401 retry only with a *different* reloaded token | EMULATOR_TESTED (+ CLAUDE_TESTED for native calls) |
| AGENT-122 Emulator/ADB lifecycle | PS 5.1 NativeCommandError fixed (node via `Start-Process` + file redirection); TEST MODE keeps pre-existing forwards; `stop-rentcar-claude.ps1` removes only owned resources | EMULATOR_TESTED |
| AGENT-123 One-command startup | `tools/agentapi/start-rentcar-claude.ps1` — 15 steps, idempotent, `session.json` ownership, readiness report | EMULATOR_TESTED |
| AGENT-124 Real data inventory | `AGENT-124-REAL-DATA-INVENTORY.md` | IMPLEMENTED (doc) |
| AGENT-125 Production-compatible component | `agentapi/production/ProductionAgentGateway` — disabled by default, never constructed in AgentDev, read-only, existing repositories/Room only, no socket | UNIT_TESTED (not wired into the normal APK UI/runtime) |
| AGENT-126 Session binding | Live-session re-check per call: sign-out → `NOT_SIGNED_IN`; account switch → `SESSION_MISMATCH` + token revoked; reserved AgentDev uid refused | UNIT_TESTED |
| AGENT-127 Pairing lifecycle / UI | Existing: `DevicePairingService` (pair/revoke/expiry), Keystore HMAC provider, `ClaudeAgentConnectionScreen` (Hebrew). **Gap:** production source still `NotPairedConnectionSource`; no enable toggle persisted in the app yet | UNIT_TESTED (pre-existing) |
| AGENT-128 Remote transport | Existing abstraction + `OutboundRelayTransport` **stub (no network code)**; replay guard, request expiry, presence exist. **Not implemented:** TLS relay client/server | IMPLEMENTED (abstraction only) |
| AGENT-129 Cloud reads | `tools/cloud-dev` read gateway over Firebase emulators; real `firestore.rules`; collections/fields mirror `CloudDeltaSyncWorker` | EMULATOR_TESTED (Firebase emulator) — **not** live Firebase |
| AGENT-130 Source routing | Every response carries `source`, `syncStatus`, `resultCompleteness`, `lastSuccessfulSyncEpochMs`, `deviceAvailability`, `warnings`, `connector.dataEnvironment`; cloud never claims completeness; Android `ExecutionTargetRouter` (pre-existing) unchanged | EMULATOR_TESTED |
| AGENT-131 Business reads | Rental commission labelled `CALCULATED_EXPECTED_COMMISSION`/`paymentStatusTracked=false`; car-sale balances `PAYMENT_TRACKED_BALANCE`. No new operation ids (registry still 204) | UNIT_TESTED + EMULATOR_TESTED |
| AGENT-132 Claude Code connectors | `rentcar-emulator` kept; new `rentcar-cloud-dev` (local scope); `[DEVELOPMENT_DATA]` labels on tools/results/serverInfo | CLAUDE_TESTED (`rentcar-emulator`) |
| AGENT-133 Claude Android | Documented below; no mobile connection made | IMPLEMENTED (doc) |
| AGENT-134 Security/regression | See tests table | — |
| AGENT-135 Integrated acceptance | See acceptance table | — |

## Tests (actual runs, 2026-11-18)

| Suite | Result | Kind |
|-------|--------|------|
| App unit tests `:app:testStandardDebugUnitTest` | 896 pass / 0 fail (90 classes; agentapi 403 incl. 7 new) | JVM |
| MCP host `node --test` | 13 pass (5 new recovery tests) | local fake gateway |
| Cloud-dev `npm test` | 6 pass | **real Firebase Auth + Firestore emulators**, real `firestore.rules` |
| Emulator E2E `run-emulator-e2e.ps1` | 18/18, exit 0, forward preserved | **real AgentDev Room on emulator** |
| Restart acceptance (one host process) | 11/11 | **real emulator kill + restart** |
| Native Claude tool call | `mcp__rentcar-emulator__supplier_list` -> 3 AgentDev suppliers | **Claude Code** |

## Acceptance A-L

| Test | Result | Evidence |
|------|--------|----------|
| A Supplier -> Room | PASS | E2E-001/002, native Claude call |
| B Reservations -> Room | PASS | E2E-005/006, restart run |
| C Customers -> Room | PASS | E2E-003/004, restart run |
| D Financial logic -> Room | PASS | labels verified live (282.05 = CALCULATED_EXPECTED_COMMISSION; car-sale open balance 1800 = PAYMENT_TRACKED_BALANCE) |
| E MCP -> isolated cloud | PASS | cloud-dev TEST E (Firebase emulator) |
| F MCP -> authenticated *remote* device gateway | **NOT EXECUTED** | no TLS relay exists; only the ADB loopback gateway is authenticated and tested |
| G Device unavailable | PASS | live: emulator killed -> `DEVICE_UNAVAILABLE`, `data:null`, only `connection.status` listed |
| H Stale/incomplete cloud | PASS | cloud responses `PARTIAL`/`UNKNOWN`/null sync time + warnings; emulator-down connector stays up with no data |
| I Unauthorized access | PASS | E2E-010/011; ProductionAgentGateway tests; firestore.rules 403 cross-user |
| J Write via read-only MCP | PASS | E2E-009; cloud-dev TEST J; `WRITE_NOT_ALLOWED` unit test |
| K Production untouched | PASS | no diff outside tools/, docs/agent-api, agentapi sources/tests since 249daa6; no rules/firebase.json/functions diff; origin/main = f60512d; only `com.rentacar.app.agentdev` on the emulator; no physical device attached; no deploy run |
| L Repeat after restart | PASS | 11/11 restart run + E2E 18/18 after restart |

## Connectors

| MCP name | Launcher | Data environment | Backend |
|----------|----------|------------------|---------|
| `rentcar-emulator` | `tools/mcp-host/run-emulator-stdio.mjs` | `DEVELOPMENT_DATA` | AgentDev APK Room on emulator via ADB forward 18765 |
| `rentcar-cloud-dev` | `tools/cloud-dev/run-cloud-dev-stdio.mjs` | `DEVELOPMENT_DATA` | Firestore/Auth emulators, project `demo-rentacar-agent` (start with `npm run emulators` + `npm run seed` in `tools/cloud-dev`) |
| *(future)* `rentcar-device` / `rentcar-cloud` | — | `REAL_LOCAL_DATA` / `REAL_CLOUD_DATA` | requires owner authorization (see Next steps) |

The data environment is set per registration and can never be inferred from the backend, so a
development connector cannot present itself as real data.

## AGENT-133 — Claude Android (verified 2026-11-18 from Anthropic support docs)

- Custom connectors are **remote MCP servers reached from Anthropic's cloud**; they must be publicly
  reachable over HTTPS (port 443). Local stdio servers (our current connectors) cannot be used from mobile.
- Auth options: OAuth (Client ID Metadata Document, Dynamic Client Registration, or own client id) or fixed headers.
- Connectors are documented for Claude Mobile, but adding *custom* connectors is described for web/Desktop,
  and mobile connector install is described as beta. Whether OAuth sign-in for a custom connector completes on Android
  is **not confirmed** by the docs → must be tested once an endpoint exists.
- Voice-mode tool execution with custom MCP tools is **not documented**; do not assume it.
- Therefore: mobile stays **NOT CONNECTED**. Prerequisite: an owner-authorized public HTTPS remote MCP
  endpoint (Streamable HTTP) with OAuth, in front of the cloud read gateway and/or the device relay.

Sources: support.claude.com/en/articles/11175166, support.claude.com/en/articles/11176164, claude.com/docs/connectors/custom/remote-mcp.

## Next steps to reach REAL data (minimum)

1. **Owner decision:** authorize either (a) live Firestore reads of the owner's own `users/{uid}` mirror, or
   (b) enabling Agent access inside the normal app on the owner's phone, or both.
2. For (a): a server-side read path authenticated as the owner (Firebase Auth ID token, never a service
   account with blanket access), reusing `tools/cloud-dev/cloud-gateway.mjs` logic with project = the real
   project, registered as a separate `rentcar-cloud` connector labelled `REAL_CLOUD_DATA`.
3. For (b): wire `ProductionAgentGateway` into the normal app behind a persisted opt-in toggle on
   `ClaudeAgentConnectionScreen`, with `FirebaseTrustedSessionBinder` + `PersistentDeviceTokenStore` +
   Keystore signer; then build the TLS outbound relay (AGENT-128) — the phone must never listen publicly.
4. For mobile: deploy an authorized public HTTPS MCP endpoint with OAuth; then test on the Claude Android app.
