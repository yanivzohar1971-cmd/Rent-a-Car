# Installs debug + androidTest APKs with -r (keeps app data) and runs UIAutomator
# without Gradle connectedAndroidTest uninstall side-effects.
# Never uses uninstall / clear / pm clear.

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path $adb)) { throw "adb not found at $adb" }

$serial = (& $adb devices | Select-String "\tdevice$" | ForEach-Object { ($_ -split "\s+")[0] } | Select-Object -First 1)
if (-not $serial) { throw "No connected device" }

Write-Host "Device: $serial (keep-data install -r only)"
Push-Location $root
.\gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest
if ($LASTEXITCODE -ne 0) { throw "assemble failed" }

$appApk = Join-Path $root "app\build\outputs\apk\debug\app-debug.apk"
$testApk = Join-Path $root "app\build\outputs\apk\androidTest\debug\app-debug-androidTest.apk"
& $adb -s $serial install -r $appApk
if ($LASTEXITCODE -ne 0) { throw "app install -r failed" }
& $adb -s $serial install -r $testApk
if ($LASTEXITCODE -ne 0) { throw "androidTest install -r failed" }

& $adb -s $serial shell mkdir -p /sdcard/Download/rentacar_email_import_ui
& $adb -s $serial logcat -c

$instrumentOut = Join-Path $root "debug\uiautomator-instrument.txt"
& $adb -s $serial shell am instrument -w -r `
  -e class com.rentacar.app.emailimport.CommissionEmailImportUiAutomatorTest `
  com.rentacar.app.test/androidx.test.runner.AndroidJUnitRunner 2>&1 |
  Tee-Object -FilePath $instrumentOut

Write-Host "Pulling evidence (UTF-8)..."
$evidenceHost = Join-Path $root "debug\ui_evidence"
New-Item -ItemType Directory -Force -Path $evidenceHost | Out-Null
& $adb -s $serial pull /sdcard/Download/rentacar_email_import_ui $evidenceHost

# Logcat as UTF-8 (do not rely on Windows console default encoding)
$logcatPath = Join-Path $root "debug\email-import-logcat.txt"
$logText = & $adb -s $serial logcat -d -v time -s RentCarEmailImport:I
[System.IO.File]::WriteAllText($logcatPath, ($logText -join "`n"), [System.Text.UTF8Encoding]::new($false))

# Pull latest debug JSON via run-as (UTF-8 bytes)
$jsonHost = Join-Path $root "debug\email-import-debug-latest.json"
$remoteJson = "/data/data/com.rentacar.app/cache/email_import_debug/email-import-debug-latest.json"
$tmpJson = "/sdcard/Download/email-import-debug-latest.json"
& $adb -s $serial shell "run-as com.rentacar.app cat $remoteJson > $tmpJson" 2>$null
& $adb -s $serial pull $tmpJson $jsonHost 2>$null
if (Test-Path $jsonHost) {
    # Normalize to UTF-8 without BOM for host tools
    $bytes = [System.IO.File]::ReadAllBytes($jsonHost)
    $text = [System.Text.Encoding]::UTF8.GetString($bytes)
    [System.IO.File]::WriteAllText($jsonHost, $text, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Debug JSON pulled to $jsonHost"
} else {
    Write-Host "Debug JSON not found under app cache (preview may not have run)"
}

Write-Host "Done. App data preserved (install -r only)."
Pop-Location
