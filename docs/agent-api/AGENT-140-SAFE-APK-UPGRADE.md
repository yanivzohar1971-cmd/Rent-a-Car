# AGENT-140 — Safe APK upgrade of the EXISTING Rent a Car app

**Date:** 2026-11-18 · **Branch:** `feature/claude-agent-api`
**Verdict (AGENT-141):** `READY_FOR_OWNER_INSTALLATION_APPROVAL` (was READY_FOR_OWNER_REVIEW) — signing
compatibility VERIFIED; installation still requires backup + explicit owner approval.
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
| B | Signing compatibility | **PASS** | phone check below: identical SHA-256 |
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

## Owner-approved read-only phone check (2026-11-18)

Device `R5CYA0H4Y7L` (Samsung SM-S938B), Android 17 / SDK 37. Nothing installed, no data read.

| Field | Installed on phone | Candidate `app-standard-debug.apk` |
|-------|--------------------|------------------------------------|
| Package | `com.rentacar.app` | `com.rentacar.app` |
| versionCode / versionName | 1 / 1.0 | 1 / 1.0 |
| Flags | DEBUGGABLE, installer = none (adb) | debuggable |
| First install / last update | 2026-08-19 / 2026-08-24 | — |
| Cert DN | CN=Android Debug, O=Android, C=US | same |
| Cert SHA-256 | `58dc2c1ee056fc2a3e6ad472eeb4bb2b1d6cbd5f3d08aba9868b7e6e52141ae3` | **identical** |
| Cert SHA-1 | `902d0f3cc7fa8491d7d22544de533808ac16ec81` | **identical** |

**Signing compatibility: VERIFIED** — an in-place `adb install -r` from this PC is signature-compatible.
The pulled base.apk copy (app code only) was deleted after the comparison.
New fact: the phone runs **Android 17**; background-service behaviour was only tested on API 34 (emulator).
POST_NOTIFICATIONS is currently not granted for the app (relevant only when the owner enables Claude access).

## AGENT-141 — Verified pre-update backup (AGENT-141, 2026-11-18)

**Location (private, local only, outside Git, not OneDrive-redirected):**
`C:\Users\Yaniv\RentACar-Backups\2026-11-18_pre-agent-update\` — contains REAL business data; do not upload, share or commit.
Manifest with checksums and counts: `BACKUP-MANIFEST.txt` in that folder.

| File | Bytes | SHA-256 |
|------|-------|---------|
| `room-raw/rentacar.db` | 577 536 | `521a847239e206f598306b56826ed552b97620e3697d1c89b907eaef48a21abb` |
| `room-raw/rentacar.db-wal` | 491 520 | `c7dbbcdd4c4b539ff4af3119e52d4da41a0fd140401a9b80965abfd3d9c608fc` |
| `room-raw/rentacar.db-shm` | 32 768 | `1f53a4b842848eaed74e9733f82a957dd55160aa196c15b1aefd4037a85e1778` |
| `datastore/settings.preferences_pb` | 25 | `84ce24fe98de7f863ac2e10cfa526ef70c09473163ba1959c87a3bf429fb1afb` |
| `json/23-10-2026_22-45-12.ICE` (newest existing app JSON backup) | 190 209 | `134f9e078f4e613a66f60ee8125b90515cc52d120c98f8b13bffa7eb9215699e` |

Method: read-only `adb exec-out run-as com.rentacar.app cat` of the Room files (db + WAL + SHM, sizes
matched the phone), app not running; existing JSON copied read-only. The app's own backup was NOT
triggered (it prunes older backup files). Verification on a separate working copy: SQLite
`integrity_check = ok`, `user_version = 44`, Room identity hash `4f1a80524cf0df63641ae400372b48ed`
(= the new APK's schema hash).

**Record-integrity checkpoints (row counts, from the verified copy):**
Customer 120 · Reservation 126 · Supplier 6 · Branch 34 · CarSale 19 · car_sale_commission_payment 21 ·
CardStub 104 · Request 84 · Agent 1 · CarType 1 · supplier_customer_term 7 · supplier_customer_terms_customization 1 ·
supplier_commission_import_config 1 · supplier_import_run 1 · supplier_import_run_entry 37 ·
supplier_monthly_header 1 · supplier_monthly_deal 19 · sync_queue 4 (16 other tables empty).

**Coverage findings:**
- The raw Room copy covers **all 34 tables**, including rows the app's JSON backup cannot see.
- The app's JSON backup (export v7) is **incomplete**: it misses 19 customers and 19 reservations whose
  `user_uid` is NULL (legacy rows; JSON has 101/107 vs Room 120/126), the `sync_queue`, price lists,
  supplier templates, monthly reports, import runs, car catalog and app settings.
- Not backed up on purpose: Firebase auth session and mailbox credentials (`shared_prefs`; re-login /
  re-enter), Firestore local cache (re-downloadable), the in-app `files/RentACar/Backups/db` copies and the
  433 `.ICE` files (they stay on the phone, untouched).

**Synchronization risks (from the copy, counts only):**
- `sync_queue`: 3 **dirty** supplier changes not yet uploaded (0 failed) → Firebase lacks them.
- 19 customers + 19 reservations with NULL `user_uid` are invisible to uid-scoped queries/sync →
  probably absent from Firebase; they exist only in Room (protected by the raw copy).
- Local-only data present: supplier import runs (1 + 37 entries), monthly header/deals (1 + 19),
  commission import config (1). Firebase is **not** a complete backup of Room.

## Tests (actual, 2026-11-18)

- `:app:testStandardDebugUnitTest`: **912 / 912**, 0 skipped (95 classes) — includes AuthNavigationStateTest 3,
  ClaudeAgentPairingCodeRefreshTest 2, DestructiveFallbackPolicyTest 2, RoomUpgradePreservationTest 1, RelayDeviceTest 8, ProductionAgentGatewayTest 7.
- Builds: standardDebug, standardRelease (unsigned), agentdevDebug, agentstageDebug — all succeed.
- Relay `node --test`: 10/10 (real TLS). MCP host: 13/13. Cloud-dev: 6/6 (earlier today).
- Emulator acceptance: 32/33 (+ T6 manual PASS); startup smoke 9/9.

## Blockers / approvals required

1. ~~Read-only certificate comparison~~ — DONE, identical (2026-11-18).
2. ⚑ Approval to install `app-standard-debug.apk` with `adb install -r` after backup (handoff §3–4).
3. ⚑ For real remote access: domain + hosting account for the relay (≈ €4–6/mo VPS or ~$2/mo Fly.io), approval to deploy, then a build with `AGENT_RELAY_URL`.
4. Physical-device background behaviour (Doze/OEM battery) unverified.
5. Claude mobile: public remote MCP endpoint with OAuth not implemented.
