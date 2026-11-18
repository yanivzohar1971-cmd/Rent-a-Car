# Cursor installation handoff — Rent a Car with Claude Agent (AGENT-140)

> **STATUS: INSTALLED 2026-11-18 15:49 by Claude Code (AGENT-142) — see AGENT-142-PHYSICAL-INSTALLATION.md.**
> Previous status: READY_FOR_OWNER_INSTALLATION_APPROVAL — signing verified, verified backup taken (2026-11-18).
> Installation still requires the owner's explicit approval. Cursor must not install automatically.
> Do **not** run any step that touches the phone until the owner explicitly approves it in writing.
> Cursor must not execute this automatically. Never uninstall the app, never clear its data, never use
> a different applicationId.

## 1. What to install

| Item | Value |
|------|-------|
| Branch | `feature/claude-agent-api` |
| Commit | `57dbae7` or later on `feature/claude-agent-api` (verify `git rev-parse HEAD`) |
| APK SHA-256 (build 2026-11-18 15:17) | `c64110009bc0d47b1b22bf1d8a70273127e67f2459dae5190f4e45bd8df931ab` — rebuilds produce a different file hash; the certificate must still match |
| Gradle task | `.\gradlew.bat :app:assembleStandardDebug` |
| APK | `app\build\outputs\apk\standard\debug\app-standard-debug.apk` |
| applicationId | `com.rentacar.app` (must match the installed app) |
| Signing | this PC's debug keystore `%USERPROFILE%\.android\debug.keystore` |
| Expected cert SHA-256 | `58:DC:2C:1E:E0:56:FC:2A:3E:6A:D4:72:EE:B4:BB:2B:1D:6C:BD:5F:3D:08:AB:A9:86:8B:7E:6E:52:14:1A:E3` |
| Expected cert SHA-1 | `90:2D:0F:3C:C7:FA:84:91:D7:D2:25:44:DE:53:38:08:AC:16:EC:81` (registered in Firebase for com.rentacar.app) |
| versionCode / versionName | `1` / `1.0` (same as before; `install -r` accepts it) |

**Path change:** since AGENT-101 the build has product flavors. The old path
`app\build\outputs\apk\debug\app-debug.apk` is no longer produced; use the `standard\debug` path above.
`agentdev` / `agentstage` APKs are test apps with other package names — never install them on the phone.

## 2. Pre-installation checks (read-only on the phone)

Run with the phone connected; replace `<serial>` with the phone's serial from `adb devices`.

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$bt  = (Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\build-tools" | Sort-Object Name | Select-Object -Last 1).FullName

# a) the installed app: version, debuggable flag, location of its APK
& $adb -s <serial> shell dumpsys package com.rentacar.app | Select-String "versionCode|versionName|flags=|codePath"
& $adb -s <serial> shell pm path com.rentacar.app

# b) copy the INSTALLED APK (read-only copy) and print its signing certificate
& $adb -s <serial> pull <path-from-pm-path>/base.apk installed-base.apk
& "$bt\apksigner.bat" verify --print-certs installed-base.apk

# c) the candidate APK's certificate
& "$bt\apksigner.bat" verify --print-certs app\build\outputs\apk\standard\debug\app-standard-debug.apk
```

**STOP if** the two `Signer #1 certificate SHA-256 digest` values differ. (Firebase also lists a second
certificate `6b3fbd3f…`; if the phone shows that one, this PC's key cannot update it.)
**STOP if** `dumpsys` shows a package other than `com.rentacar.app`, or a versionCode greater than 1.

Verified 2026-11-18 on device R5CYA0H4Y7L: installed and candidate certificates are identical (SHA-256 `58dc2c1e…52141ae3`). Re-run section 2 anyway if a new APK is built on another PC.

## Verified pre-update backup (AGENT-141, 2026-11-18)

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

## 3. Backup (required before installing)

1. In the app: Settings → data management → create a JSON backup; copy the backup file to the PC.
2. Run "Sync now" and confirm it completes (cloud mirror up to date).
3. Optional, read-only, works because the installed app is debuggable:
   `& $adb -s <serial> exec-out run-as com.rentacar.app cat databases/rentacar.db > rentacar-before.db`
   (also copy `rentacar.db-wal` if present). Keep this file private — it contains real business data.

## 4. In-place update

```powershell
& $adb -s <serial> install -r app\build\outputs\apk\standard\debug\app-standard-debug.apk
```

`-r` keeps all app data. Never use `uninstall`, `pm clear`, or `install` without `-r`.

## 5. Post-update checks

1. Open the app — same account, no login prompt beyond the usual.
2. Customers / suppliers / reservations / sales / commissions screens show the same data as before
   (compare counts with the backup if needed).
3. Settings → "Claude AI — חיבור ושליטה": the switch is **OFF**; "שרת ממסר: לא הוגדר בגרסה זו".
   No notification "גישת Claude פעילה" appears.
4. Room schema is unchanged (v44, identity hash `4f1a80524cf0df63641ae400372b48ed`), so no migration runs.

## Post-install integrity check (read-only)

After `install -r`, without opening anything else:
1. `adb exec-out run-as com.rentacar.app cat databases/rentacar.db` (+ `-wal`, `-shm`) into a NEW private folder.
2. On a working copy: `PRAGMA integrity_check` = ok, `user_version` = 44, identity hash = `4f1a8052…48ed`,
   and every row count equals the checkpoints above (Customer 120, Reservation 126, …, sync_queue 4).
3. Open the app: same account, customers/reservations/sales/commissions visible as before;
   Settings → "Claude AI — חיבור ושליטה" switch OFF, "שרת ממסר: לא הוגדר בגרסה זו".

## Immediate-stop conditions

- APK certificate ≠ `58dc2c1e…52141ae3`, package ≠ `com.rentacar.app`, or install output ≠ `Success`.
- Any message mentioning uninstall / `INSTALL_FAILED_UPDATE_INCOMPATIBLE`.
- Post-install integrity_check ≠ ok, user_version ≠ 44, identity hash changed, or any row count lower.
- App shows a login loop, missing data or a crash → stop using the app; restore from the raw copy
  (the previous APK + `run-as` copy-back procedure is documented separately and requires approval).

## 6. Rollback / recovery

- The Agent is off by default; nothing to disable.
- To return to the previous build: reinstall the previous APK **signed with the same key** using
  `adb install -r -d <previous.apk>` (keeps data). Never uninstall to "fix" a signature problem.
- Data recovery: in-app restore from the JSON backup, or the cloud restore path.

## 7. Conditions that require stopping

- Certificate mismatch (section 2).
- Any prompt suggesting uninstall / "INSTALL_FAILED_UPDATE_INCOMPATIBLE".
- Install output other than `Success`.
- After the update the app shows missing data → stop, do not use the app further, restore from backup.

## 8. Enabling Claude access later (separate approval)

Requires an owner-approved public relay (see `AGENT-138-SECURE-RELAY.md`), a build with
`AGENT_RELAY_URL` set, then: enable the switch → "צמד לקוח Claude חדש" → on the PC
`node tools\relay\pair.mjs <code> --relay https://<relay> --name rentcar-phone --data-environment REAL_LOCAL_DATA`.

## Lessons from the 2026-11-18 installation

- If `adb install -r` prints nothing for minutes: check `dumpsys package com.rentacar.app` (`lastUpdateTime`)
  and the screen focus before anything else. On this PC the hang was the adb transport, not the phone:
  restart the adb server in `nodaemon` mode, disconnect/stop emulators, retry once.
- On the first launch after an update the app's existing `UserUidBackfill` fills NULL `user_uid` values with
  the signed-in owner's uid (same code as main). Compare counts and financial totals, not raw checksums, after launch.

