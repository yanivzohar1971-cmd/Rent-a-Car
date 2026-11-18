# AGENT-139 — Physical-device readiness (NOT installed on any phone)

**Date:** 2026-11-18 · **Branch:** `feature/claude-agent-api`
**Verdict:** READY FOR ISOLATED DEVELOPMENT. **Not** ready for physical-device installation until the
blocking items below are resolved with the owner.

## Package compatibility (static audit)

| Item | Finding | Impact |
|------|---------|--------|
| applicationId (standard) | `com.rentacar.app` (unchanged) | an update replaces the installed app |
| Test builds | `com.rentacar.app.agentdev`, `com.rentacar.app.agentstage` | separate apps, cannot touch production data |
| versionCode / versionName | `1` / `"1.0"` | a sideloaded update with the same versionCode installs with `adb install -r`; a store/updater flow needs a higher versionCode |
| Signing | **no `signingConfig` in Gradle** | **BLOCKER:** the key that signed the owner's installed APK is unknown. A different key cannot update it (Android refuses); uninstall+install would DELETE Room data. |
| Room | schema **v44** unchanged; migrations 18→44 unchanged | no migration runs on update |
| Destructive fallback | `fallbackToDestructiveMigration()` **when `BuildConfig.DEBUG`** | **RISK:** if the phone runs a *debug* build, any future schema mismatch wipes local data. This branch causes no schema change. |
| Backup | `android:allowBackup="false"` | no OS backup/restore — the owner must back up before any update |
| Data-layer diff vs main | `AuthProvider`/`CurrentUserProvider` (AgentDev-only branches), unused `SyncQueueDeduper`/`SyncRetryPolicy` | no runtime change in `standard` |
| App behaviour diff vs main (standard) | Settings entry "Claude AI — חיבור ושליטה"; splash-hang fix (`AuthViewModel`, `NavGraph`); Agent service/receiver declared but inert (no relay URL) | Agent stays OFF by default |

## Security/privacy audit

- Exported components: `MainActivity` (launcher); `DebugSyncTriggerReceiver` (exported, enabled only in
  debug builds — pre-existing; any app could trigger a sync on a debug build). New components are
  **not exported** (`AgentRelayService`, `AgentBootReceiver` receive only system broadcasts).
- PendingIntents: all new ones `FLAG_IMMUTABLE`.
- Secrets: device tokens Keystore-HMAC-signed, stored in EncryptedSharedPreferences; relay/client
  secrets and channel keys in EncryptedSharedPreferences; nothing secret in plain prefs or logs.
- Notification: no business data, private visibility, "השבת" action.
- Logcat: Agent logs contain state/exception class names only (verified by scans in the emulator runs).
- Git: no keystores, keys, certificates, tokens or pairing codes tracked (`.gitignore` covers dev cert).

## Release-readiness checklist (owner actions marked ⚑)

1. ⚑ Identify the installed build on the phone (no data access needed):
   `adb shell dumpsys package com.rentacar.app | findstr "versionCode versionName signatures flags=.*DEBUGGABLE"`
2. ⚑ Locate the signing keystore used for that APK. Compare certificates:
   `apksigner verify --print-certs installed.apk` vs `apksigner verify --print-certs candidate.apk` — SHA-256 must match.
3. Build the release candidate with that key (signing config kept outside Git), versionCode ≥ installed,
   `AGENT_RELAY_URL` = approved relay.
4. ⚑ Back up before updating: in-app JSON backup + copy of the backup file off the phone; confirm a
   cloud sync completed (Settings → data check).
5. Upgrade validation on the emulator first: install the *currently installed* APK, create synthetic data,
   `adb install -r` the candidate, verify every entity count + settings unchanged.
6. ⚑ Install the candidate on the phone with `adb install -r` (never uninstall first).
7. Smoke: open app, reservations/customers/suppliers screens unchanged; Agent toggle OFF by default.
8. ⚑ Opt-in: Settings → "Claude AI — חיבור ושליטה" → enable → allow notification.
9. ⚑ Pair: "צמד לקוח Claude חדש" → on the PC
   `node tools/relay/pair.mjs <code> --relay https://<relay> --name rentcar-phone --data-environment REAL_LOCAL_DATA`.
10. Revocation: "בטל" next to the client, or toggle OFF, or notification "השבת" — all immediate.
11. Rollback: toggle OFF (instant). If the app misbehaves, reinstall the previous APK **with the same
    key** using `adb install -r -d` (downgrade keeps data only when signatures match).
12. Staged rollout: one device (owner's phone), read-only, observe for a week before anything else.

## What is NOT done

- No physical-device test of any kind (by mandate).
- Signing key not verified (owner).
- Upgrade test from the exact installed APK not possible without it.
