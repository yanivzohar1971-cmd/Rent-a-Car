# Cursor installation handoff — Rent a Car with Claude Agent (AGENT-140)

> **STATUS: NOT APPROVED FOR PHYSICAL INSTALLATION** (signing verified compatible on 2026-11-18; install still needs explicit owner approval after backup).
> Do **not** run any step that touches the phone until the owner explicitly approves it in writing.
> Cursor must not execute this automatically. Never uninstall the app, never clear its data, never use
> a different applicationId.

## 1. What to install

| Item | Value |
|------|-------|
| Branch | `feature/claude-agent-api` |
| Commit | the commit named in `AGENT-140-SAFE-APK-UPGRADE.md` (verify `git rev-parse HEAD`) |
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
