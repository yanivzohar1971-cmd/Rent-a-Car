# AGENT-142 — Physical in-place update of the existing app (DONE)

**Date:** 2026-11-18 · **Branch:** `feature/claude-agent-api` @ `a7e92ed` (APK built from `57dbae7`; no `app/` changes since)

| Milestone | Status |
|-----------|--------|
| APP_UPDATED_SUCCESSFULLY | **YES** |
| REAL_DATA_PRESERVED | **YES** — counts, financial totals, integrity and schema identical; the only change is the app's own existing `user_uid` backfill on 19 + 19 legacy rows (see below) |
| AGENT_UI_AVAILABLE | **YES** — "Claude AI — חיבור ושליטה" in Settings, switch OFF |
| REMOTE_CLAUDE_CONNECTED | **NO** — no relay deployed / configured (by design) |

## Target and artifact

| Item | Value |
|------|-------|
| Device | Samsung SM-S938B, serial `R5CYA0H4Y7L`, Android 17 (SDK 37) |
| Package | `com.rentacar.app`, versionCode 1 → 1, `firstInstallTime` 2026-08-19 (unchanged → same installation) |
| APK | `app/build/outputs/apk/standard/debug/app-standard-debug.apk`, SHA-256 `c64110009bc0d47b1b22bf1d8a70273127e67f2459dae5190f4e45bd8df931ab` |
| Signing cert SHA-256 (installed = APK) | `58dc2c1ee056fc2a3e6ad472eeb4bb2b1d6cbd5f3d08aba9868b7e6e52141ae3` |
| Command | `adb -s R5CYA0H4Y7L install -r app\build\outputs\apk\standard\debug\app-standard-debug.apk` |

## Installation log

1. Attempt 1 (15:39:07): client did not return in 300 s, no output. Phone check: package still the old
   one (`lastUpdateTime` 2026-08-24), screen on the Samsung launcher (no confirmation dialog), no install
   session left. Cause: **host adb transport hangs** (≈50 % of trivial adb calls timing out, also seen all day).
   The stuck host client was stopped (uncommitted sessions are atomic → no change on the phone).
2. Transport fixed: adb server restarted (`nodaemon` mode), the test emulator shut down (it shared the
   degraded server); phone link then 13/15 fast.
3. Attempt 2 (15:49:15 → 15:49:17): `Performing Streamed Install` → **`Success`**. `lastUpdateTime` 2026-11-18 15:49:16.

## Safety gate (all PASS before attempt 1 and re-confirmed before attempt 2)

Device, package, full certificate, versionCode, variant/not stale, Room identity hash `4f1a8052…48ed`
(also on the real-data copy), destructive fallback off (`FLAVOR=standard`), backup checksums = manifest,
live DB byte-identical to the backup (nothing changed since AGENT-141), pre-install snapshot
(integrity ok, 0 FK violations, unique PKs), `google-services.json` = main, no dev credentials/endpoints,
Agent OFF by default, no business writes.

## Data verification

**Immediately after install (app not started):** `rentacar.db`, `-wal`, `-shm` and DataStore
**byte-identical (SHA-256)** to the pre-install state.

**After launching the app** (Room opened; snapshot of a fresh read-only copy, compared to pre-install):

| Check | Before | After |
|-------|--------|-------|
| integrity_check / user_version / identity hash | ok / 44 / 4f1a8052… | same |
| Tables | 34 | 34 |
| Customer / Reservation / Supplier / Branch | 120 / 126 / 6 / 34 | same |
| CarSale / car_sale_commission_payment / CardStub / Request | 19 / 21 / 104 / 84 | same |
| All other tables (34 total) | counts | same |
| Foreign-key violations / PK uniqueness | 0 / ok | same |
| sync_queue (supplier: 3 dirty, 0 failed, 4 total) | 4 | same |
| Financial totals (payments, commissions, outstanding, reservation prices) | stored privately | **same** |
| Content checksums | — | identical for 32 tables; Customer & Reservation differ **only** in `user_uid` |
| NULL `user_uid` | Customer 19, Reservation 19 | **0 / 0** |

**Explanation of the `user_uid` change (not data loss):** on every launch after login, `NavGraph` calls
`UserUidBackfill.backfillUserUidForCurrentUser` (`UPDATE … SET user_uid = <current uid> WHERE user_uid IS NULL`).
This code is **identical on `main`**; the previously installed build (2026-08-24) apparently predated it.
Column-level diff: same row ids, no other column changed, the filled value equals the single existing
owner uid. Effect: these 38 records are now visible in the app and included in future JSON backups;
`sync_queue` unchanged (not queued for upload). The original NULL state is preserved in the pre-install
raw backup; reverting would need separate owner approval.

## Application checks

| Check | Result |
|-------|--------|
| Launch, no crash (crash buffer 0, no FATAL) | PASS |
| No infinite splash, no login prompt (`Existing user found`) | PASS |
| Dashboard ("מסך ראשי") | PASS |
| Room opened without migration (only the app's existing pre-open safety backup ran) | PASS |
| Settings opens; "Claude AI — חיבור ושליטה" present | PASS |
| Agent switch OFF; relay "לא הוגדר בגרסה זו"; background "כבוי"; no Agent notification/service | PASS |
| Suppliers / customers / reservations / sales / commission screens | NOT_VERIFIED by automation (not opened, to avoid accidental actions); data presence proven at DB level |

## Backups (unencrypted, as requested; local, private, outside Git)

- Pre-install: `C:\Users\Yaniv\RentACar-Backups\2026-11-18_pre-agent-update\` (unchanged; `BACKUP-MANIFEST.txt`, `pre-install-snapshot.json`).
- Post-install: `C:\Users\Yaniv\RentACar-Backups\2026-11-18_post-install\` (raw Room copy + `post-install-snapshot.json`).
- The app additionally created its own pre-open copy `files/RentACar/Backups/db/rentacar_20261118_154942.db` on the phone (existing behaviour).

## Next steps toward REMOTE_CLAUDE_CONNECTED

1. Owner approval + hosting/domain for the relay (`AGENT-138-SECURE-RELAY.md`), deploy with a real certificate.
2. Build with `AGENT_RELAY_URL=https://<relay>` (same package, same signing key), install the same way.
3. Owner enables access in the app and pairs (`pair.mjs … --data-environment REAL_LOCAL_DATA`).
4. Verify background behaviour on this Android 17 phone (Doze / Samsung battery optimisation).
