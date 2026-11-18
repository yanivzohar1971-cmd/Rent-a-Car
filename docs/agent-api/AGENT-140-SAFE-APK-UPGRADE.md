# AGENT-140 — Safe APK upgrade of the EXISTING Rent a Car app

**Date:** 2026-11-18 · **Branch:** `feature/claude-agent-api`
**Verdict:** `NOT_READY_FOR_PHYSICAL_INSTALLATION` — signing compatibility with the installed APK is
`SIGNING_COMPATIBILITY_NOT_YET_VERIFIED` (requires reading the phone, owner approval).
Nothing was installed on the phone; production Firebase and real Room data were not touched.

## A. Existing application identity (evidence)

| Fact | Evidence |
|------|----------|
| Package `com.rentacar.app` | `app/build.gradle` defaultConfig; `standard` flavor has no suffix; debug build type has no suffix |
| Installed build is a **debuggable standard build installed with `adb install -r`** | `debug/run_uiautomator_keep_data.ps1` (`assembleDebug` → `install -r app-debug.apk`, `run-as com.rentacar.app`), `docs/firebase-auth-config.md` (debug keystore fingerprints) |
| Since AGENT-101 the artifact is `apk/standard/debug/app-standard-debug.apk` (old `apk/debug/app-debug.apk` path no longer produced) | Gradle outputs |
| versionCode 1 / versionName 1.0 | `aapt2 dump badging` |

## B. Signing

| Item | Value |
|------|-------|
| Gradle `signingConfig` | none → debug builds use `%USERPROFILE%\.android\debug.keystore` (created 2026-05-20) |
| Candidate APK cert | SHA-256 `58dc2c1e…52141ae3`, SHA-1 `902d0f3c…ac16ec81` (`apksigner verify --print-certs`) |
| Firebase-registered certs for com.rentacar.app | `902d0f3c…` (= this PC's debug key) **and** `6b3fbd3f…` (another key) |
| Status | **SIGNING_COMPATIBILITY_NOT_YET_VERIFIED** — the phone's installed APK must be compared (procedure in `CURSOR-INSTALLATION-HANDOFF.md` §2). Strong but not conclusive evidence: Cursor updates from this PC work and this key is registered in Firebase. |

## C/D. Room preservation

| Check | Result |
|-------|--------|
| Version | 44 on main and feature |
| Room identity hash (generated `AppDatabase_Impl`) | main `4f1a80524cf0df63641ae400372b48ed` = feature `4f1a80524cf0df63641ae400372b48ed` → **no migration runs on update** |
| Migrations 18→44 | unchanged |
| Entity / DAO changes vs main | none (data-layer diff: AgentDev-only branches in auth providers; unused sync helpers) |
| Destructive fallback | was enabled for **every DEBUG build** — i.e. ON for the owner's production install. **Fixed:** now only `agentdev`/`agentstage` debug (`allowDestructiveFallback`, `DestructiveFallbackPolicyTest` 2/2). No `deleteDatabase`/`clearAllTables` calls. |
| Synthetic in-place upgrade (`RoomUpgradePreservationTest`, file DB, update's real `DatabaseModule.provideDatabase`) | PASS — version 44, hash unchanged, per-table count+SHA-256 identical: Supplier 3, Customer 3, Reservation 6, Branch 3, CarType 2, CarSale 3, car_sale_commission_payment 3, sync_queue 2 (unsynced); outstanding car-sale commission 1800 before = after |
| Real-device data preservation | NOT TESTED (requires owner approval) |

## E/G. Standard build checks (`app-standard-debug.apk`)

- applicationId `com.rentacar.app`, versionCode 1, debuggable, targetSdk 34.
- Agent: default OFF (persisted flag default false); `AGENT_RELAY_URL=""` → no relay connection, pairing
  disabled with message; service/receiver declared but inert; no network security override.
- No `10.0.2.2` relay/emulator config, no `demo-rentacar-agent`, no test passwords, no dev certificate,
  no tokens/keys packaged (dex/resource scan; the only string hits are a library PEM marker, an Apache POI
  byte sequence and the `rac1` format prefix).
- AgentDev fixture *code* is present in the standard APK but unreachable (guarded by `AGENT_DEV_MODE=false`; R8 disabled).
- Production writes: 0 executable; `ProductionAgentGateway` refuses WRITE before execution.

## Acceptance matrix

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| A | Existing app identity established | PASS | §A |
| B | Signing compatibility | **BLOCKED** (not yet verified) | §B — needs phone read |
| C | Room version + migrations checked | PASS | v44, identical identity hash |
| D | Synthetic in-place upgrade preserves all records | PASS | RoomUpgradePreservationTest |
| E | Standard app compiles | PASS | assembleStandardDebug + assembleStandardRelease |
| F | Standard app starts normally | NOT_TESTED on standard (would contact production Firebase); same code path PASS in agentstage startup smoke 9/9 |
| G | Agent defaults to disabled | PASS | UI test (toggle OFF on fresh install), code default |
| H | AgentStage pairing works | PASS | acceptance S0, T7 |
| I | AgentStage background connectivity | PASS (emulator) | T2/T3/T14, FGS |
| J | Relay-down handled safely | PASS | T5, smoke |
| K | Revocation blocks immediately | PASS | T7, T9 |
| L | Unauthorized writes blocked | PASS | T10, unit + relay tests |
| M | Production Firebase untouched | PASS | only demo-* emulator project used; no deploy |
| N | Physical phone untouched | PASS | no device other than emulator-5554 used |
| O | Native MCP reads (isolated) | **BLOCKED now** (adb transport on this host degraded after hours of testing); earlier today native `mcp__rentcar-emulator__supplier_list` returned Room rows; relay path verified via MCP client 32/33 |
| P | No test credentials / keys packaged | PASS | APK scan |
| Q | Cursor handoff ready | PASS | `CURSOR-INSTALLATION-HANDOFF.md` |
| R | Blockers documented | PASS | below |

## Tests (actual, 2026-11-18)

- `:app:testStandardDebugUnitTest`: **912 / 912**, 0 skipped (95 classes) — includes AuthNavigationStateTest 3,
  ClaudeAgentPairingCodeRefreshTest 2, DestructiveFallbackPolicyTest 2, RoomUpgradePreservationTest 1, RelayDeviceTest 8, ProductionAgentGatewayTest 7.
- Builds: standardDebug, standardRelease (unsigned), agentdevDebug, agentstageDebug — all succeed.
- Relay `node --test`: 10/10 (real TLS). MCP host: 13/13. Cloud-dev: 6/6 (earlier today).
- Emulator acceptance: 32/33 (+ T6 manual PASS); startup smoke 9/9.

## Blockers / approvals required

1. ⚑ Read-only comparison of the phone's installed signing certificate (handoff §2).
2. ⚑ Approval to install `app-standard-debug.apk` with `adb install -r` after backup (handoff §3–4).
3. ⚑ For real remote access: domain + hosting account for the relay (≈ €4–6/mo VPS or ~$2/mo Fly.io), approval to deploy, then a build with `AGENT_RELAY_URL`.
4. Physical-device background behaviour (Doze/OEM battery) unverified.
5. Claude mobile: public remote MCP endpoint with OAuth not implemented.
