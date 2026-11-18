<#
.SYNOPSIS
  AGENT-101 emulator end-to-end runner: ensure ADB server, start dedicated AVD if needed,
  build/install AgentDev APK on the emulator only, forward loopback gateway, run REAL Room MCP tests.

.PARAMETER Serial
  adb serial of the emulator (e.g. emulator-5554). Required when more than one emulator is running;
  auto-detected when exactly one is online. Physical devices are refused.

.PARAMETER SkipBuild
  Reuse the existing app-agentdev-debug.apk.

.PARAMETER StartEmulator
  If no emulator is online, start AVD RentacarAgentDev (create it if missing).
  Default: true when no -Serial is passed and no emulator is online.

.PARAMETER SkipStartEmulator
  Never auto-start an AVD.

.PARAMETER ResultsPath
  Where the MCP results JSON is written (default build/agentapi-e2e/results.json).

.PARAMETER VerdictPath
  Machine-readable PASS/FAIL report (default build/agentapi-e2e/verdict.json).

Exit codes: 0 ok | 1 test failures | 10 SDK/adb missing | 11 no/ambiguous emulator | 12 build failed
            13 install failed | 14 gateway not reachable | 15 token not found
#>
[CmdletBinding()]
param(
  [string]$Serial,
  [switch]$SkipBuild,
  [switch]$StartEmulator,
  [switch]$SkipStartEmulator,
  [string]$AvdName = "RentacarAgentDev",
  [string]$ResultsPath,
  [string]$VerdictPath,
  [int]$Port = 18765,
  [int]$AdbTimeoutSec = 30
)

$ErrorActionPreference = "Stop"
$RepoRoot   = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Package    = "com.rentacar.app.agentdev"
$Activity   = "$Package/com.rentacar.app.MainActivity"
$TokenFile  = "agentdev_token.txt"
$OutDir     = Join-Path $RepoRoot "build\agentapi-e2e"
$ownedForward = $false
$ownedAdbServerPid = $null
if (-not $ResultsPath) { $ResultsPath = Join-Path $OutDir "results.json" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

if (-not $VerdictPath) { $VerdictPath = Join-Path $OutDir "verdict.json" }
$summary = [ordered]@{
  startedAt = (Get-Date).ToString("o")
  package = $Package
  port = $Port
  agent = "AGENT-102"
  steps = @()
  physicalDeviceRefused = $true
}
function Step([string]$name, [string]$status, [string]$detail = "") {
  $summary.steps += [ordered]@{ name = $name; status = $status; detail = $detail }
  Write-Host ("[{0}] {1} {2}" -f $status, $name, $detail)
}
function Write-Verdict([string]$verdict, [int]$code) {
  $summary.exitCode = $code
  $summary.finishedAt = (Get-Date).ToString("o")
  $summary.verdict = $verdict
  $summary.resultsPath = $ResultsPath
  $payload = [ordered]@{
    verdict = $verdict
    exitCode = $code
    serial = $summary.serial
    package = $Package
    port = $Port
    startedAt = $summary.startedAt
    finishedAt = $summary.finishedAt
    steps = $summary.steps
    resultsPath = $ResultsPath
    physicalDeviceRefused = $true
    notes = "Real Room-backed MCP E2E; no fixture fallback in EMULATOR_REAL_ROOM"
  }
  $summary | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $OutDir "run-summary.json") -Encoding utf8
  $payload | ConvertTo-Json -Depth 6 | Set-Content $VerdictPath -Encoding utf8
}
function Fail([int]$code, [string]$name, [string]$detail) {
  Step $name "FAIL" $detail
  if ($ownedForward -and $Serial) {
    try { Invoke-Adb @("-s", $Serial, "forward", "--remove", "tcp:$Port") -AllowFail | Out-Null } catch {}
  }
  Write-Verdict "FAIL" $code
  exit $code
}

# --- 1. SDK / adb -------------------------------------------------------------------------------
function Find-Sdk {
  $candidates = @($env:ANDROID_SDK_ROOT, $env:ANDROID_HOME)
  $lp = Join-Path $RepoRoot "local.properties"
  if (Test-Path $lp) {
    $line = Select-String -Path $lp -Pattern '^\s*sdk\.dir\s*=\s*(.+)$' | Select-Object -First 1
    if ($line) { $candidates += ($line.Matches[0].Groups[1].Value.Trim() -replace '\\:', ':' -replace '\\\\', '\') }
  }
  $candidates += (Join-Path $env:LOCALAPPDATA "Android\Sdk")
  foreach ($c in $candidates) { if ($c -and (Test-Path (Join-Path $c "platform-tools\adb.exe"))) { return $c } }
  return $null
}
$Sdk = Find-Sdk
if (-not $Sdk) { Fail 10 "find-sdk" "Android SDK with platform-tools\adb.exe not found (set ANDROID_SDK_ROOT)" }
$Adb = Join-Path $Sdk "platform-tools\adb.exe"
$Emulator = Join-Path $Sdk "emulator\emulator.exe"
$AvdManager = Join-Path $Sdk "cmdline-tools\latest\bin\avdmanager.bat"
Step "find-sdk" "OK" $Sdk

# On some Windows hosts `adb start-server` hangs in SYN_SENT. Prefer an existing listener on
# 127.0.0.1:5037; otherwise start `adb nodaemon server` and track that PID for ownership.
function Ensure-AdbServer {
  $listening = netstat -ano | Select-String '127\.0\.0\.1:5037\s+.*LISTENING'
  if ($listening) { return }
  $proc = Start-Process -FilePath $Adb -ArgumentList @("nodaemon", "server") -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 2
  $still = netstat -ano | Select-String '127\.0\.0\.1:5037\s+.*LISTENING'
  if (-not $still) {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
    throw "Could not start adb nodaemon server (127.0.0.1:5037 not listening)"
  }
  $script:ownedAdbServerPid = $proc.Id
}

function Invoke-Adb([string[]]$AdbArgs, [int]$TimeoutSec = $AdbTimeoutSec, [switch]$AllowFail) {
  $outFile = [IO.Path]::GetTempFileName(); $errFile = [IO.Path]::GetTempFileName()
  try {
    $p = Start-Process -FilePath $Adb -ArgumentList $AdbArgs -NoNewWindow -PassThru `
         -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    if (-not $p.WaitForExit($TimeoutSec * 1000)) {
      try { $p.Kill() } catch {}
      throw "adb $($AdbArgs -join ' ') timed out after ${TimeoutSec}s"
    }
    $text = (Get-Content $outFile -Raw -ErrorAction SilentlyContinue)
    # Start-Process sometimes leaves ExitCode $null on success on Windows; treat null as 0.
    $code = if ($null -eq $p.ExitCode) { 0 } else { [int]$p.ExitCode }
    if ($code -ne 0 -and -not $AllowFail) {
      throw "adb $($AdbArgs -join ' ') failed ($code): $(Get-Content $errFile -Raw)"
    }
    if ($null -eq $text) { return "" }
    return ($text | Out-String).TrimEnd()
  } finally { Remove-Item $outFile, $errFile -ErrorAction SilentlyContinue }
}

try { Ensure-AdbServer } catch { Fail 10 "adb-server" $_.Exception.Message }
Step "adb-server" "OK" ($(if ($ownedAdbServerPid) { "nodaemon pid=$ownedAdbServerPid" } else { "reused existing" }))

# --- 2. Emulator serial -------------------------------------------------------------------------
function Get-OnlineDeviceSerials {
  $devices = Invoke-Adb @("devices")
  $serials = @()
  foreach ($line in ($devices -split "`r?`n")) {
    if ($line -match '^(emulator-\d+)\s+device\b') {
      $serials += $Matches[1]
    } elseif ($line -match '^(\S+)\s+device\b') {
      $id = $Matches[1]
      if ($id -and $id -ne "List") { $serials += $id }
    }
  }
  return $serials
}
function Get-OnlineEmulators {
  @(Get-OnlineDeviceSerials) | Where-Object { $_ -like "emulator-*" }
}

$emulators = Get-OnlineEmulators
$shouldStart = (-not $SkipStartEmulator) -and ($StartEmulator -or (($emulators.Count -eq 0) -and (-not $Serial)))
if ($emulators.Count -eq 0 -and $shouldStart) {
  if (-not (Test-Path $Emulator)) { Fail 11 "start-emulator" "emulator.exe missing under $Sdk" }
  $avdDir = Join-Path $env:USERPROFILE ".android\avd\$AvdName.avd"
  if (-not (Test-Path $avdDir)) {
    if (-not (Test-Path $AvdManager)) { Fail 11 "create-avd" "avdmanager.bat missing; create AVD '$AvdName' manually" }
    $img = "system-images;android-34;google_apis;x86_64"
    $imgPath = Join-Path $Sdk "system-images\android-34\google_apis\x86_64"
    if (-not (Test-Path $imgPath)) { Fail 11 "create-avd" "System image not installed: $img" }
    "no" | & $AvdManager create avd -n $AvdName -k $img -d "pixel_6" --force 2>&1 | Out-Null
    if (-not (Test-Path $avdDir)) { Fail 11 "create-avd" "Failed to create AVD $AvdName" }
    Step "create-avd" "OK" $AvdName
  }
  Start-Process -FilePath $Emulator -ArgumentList @(
    "-avd", $AvdName, "-netdelay", "none", "-netspeed", "full", "-no-snapshot-save", "-no-boot-anim", "-gpu", "auto"
  ) -WindowStyle Normal | Out-Null
  Step "start-emulator" "OK" $AvdName
  $deadline = (Get-Date).AddMinutes(5)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    $emulators = Get-OnlineEmulators
    if ($emulators.Count -ge 1) { break }
  }
}

try { $null = Invoke-Adb @("devices") } catch { Fail 11 "adb-devices" $_.Exception.Message }
$emulators = @(Get-OnlineEmulators)
$allOnline = @(Get-OnlineDeviceSerials)
if ($Serial) {
  if ($Serial -notlike "emulator-*") { Fail 11 "verify-emulator" "Refusing non-emulator serial '$Serial' (AgentDev must not touch real devices)" }
  if ($allOnline -notcontains $Serial) { Fail 11 "verify-emulator" "Serial '$Serial' is not online. Online: $($allOnline -join ', ')" }
} elseif ($emulators.Count -eq 1) {
  $Serial = [string]$emulators[0]
} elseif ($emulators.Count -eq 0) {
  Fail 11 "verify-emulator" "No running emulator. Re-run with -StartEmulator, or start AVD '$AvdName' first."
} else {
  Fail 11 "verify-emulator" "Several emulators online ($($emulators -join ', ')); pass -Serial"
}
if ($Serial -notlike "emulator-*") {
  Fail 11 "verify-emulator" "Resolved serial '$Serial' is not an emulator-*; refusing physical/ambiguous targets"
}
$booted = Invoke-Adb @("-s", $Serial, "shell", "getprop", "sys.boot_completed") -AllowFail
$bootDeadline = (Get-Date).AddMinutes(3)
while ($booted.Trim() -ne "1" -and (Get-Date) -lt $bootDeadline) {
  Start-Sleep -Seconds 3
  $booted = Invoke-Adb @("-s", $Serial, "shell", "getprop", "sys.boot_completed") -AllowFail
}
if ($booted.Trim() -ne "1") { Fail 11 "verify-emulator" "$Serial has not finished booting (sys.boot_completed='$booted')" }
Step "verify-emulator" "OK" $Serial
$summary.serial = $Serial

# --- 3. Build -----------------------------------------------------------------------------------
$Apk = Join-Path $RepoRoot "app\build\outputs\apk\agentdev\debug\app-agentdev-debug.apk"
if (-not $SkipBuild) {
  Push-Location $RepoRoot
  try {
    & (Join-Path $RepoRoot "gradlew.bat") ":app:assembleAgentdevDebug" "--console=plain"
    if ($LASTEXITCODE -ne 0) { Fail 12 "build" ":app:assembleAgentdevDebug exited $LASTEXITCODE" }
  } finally { Pop-Location }
}
if (-not (Test-Path $Apk)) { Fail 12 "build" "APK not found: $Apk" }
Step "build" "OK" $Apk

# --- 4. Install + launch (emulator serial ONLY) -------------------------------------------------
try {
  Invoke-Adb @("-s", $Serial, "install", "-r", "-t", $Apk) -TimeoutSec 180 | Out-Null
  Invoke-Adb @("-s", $Serial, "shell", "am", "start", "-n", $Activity) | Out-Null
  $path = Invoke-Adb @("-s", $Serial, "shell", "pm", "path", $Package) -AllowFail
  if ($path -notmatch [regex]::Escape($Package)) { Fail 13 "install" "Package $Package not present after install" }
} catch { Fail 13 "install" $_.Exception.Message }
Step "install+launch" "OK" $Package

# --- 5. Forward + wait for gateway (with one app relaunch recovery) ------------------------------
$gateway = "http://127.0.0.1:$Port"
function Wait-GatewayHealthy([string]$Url, [int]$Seconds = 60) {
  for ($i = 0; $i -lt $Seconds; $i++) {
    try {
      $h = Invoke-RestMethod -Uri "$Url/v1/health" -TimeoutSec 2
      if ($h.status -eq "ok") { return $true }
    } catch { Start-Sleep -Seconds 1 }
  }
  return $false
}
# AGENT-122: TEST MODE owns (and later removes) the forward only if it created it. A forward that
# already exists (e.g. a live start-rentcar-claude.ps1 session serving Claude) is reused and kept.
$existingForwards = Invoke-Adb @("forward", "--list") -AllowFail
if ($existingForwards -match ("(?m)^" + [regex]::Escape($Serial) + "\s+tcp:$Port\s+tcp:$Port\s*$")) {
  Step "adb-forward" "OK" "reusing existing tcp:$Port (not owned; will be kept)"
} else {
  Invoke-Adb @("-s", $Serial, "forward", "tcp:$Port", "tcp:$Port") | Out-Null
  $ownedForward = $true
  Step "adb-forward" "OK" "created tcp:$Port (owned by test run; removed at the end)"
}
$healthy = Wait-GatewayHealthy $gateway 45
if (-not $healthy) {
  Step "gateway-recovery" "RETRY" "relaunching AgentDev activity"
  Invoke-Adb @("-s", $Serial, "shell", "am", "force-stop", $Package) -AllowFail | Out-Null
  Start-Sleep -Seconds 2
  Invoke-Adb @("-s", $Serial, "shell", "am", "start", "-n", $Activity) | Out-Null
  $healthy = Wait-GatewayHealthy $gateway 60
}
if (-not $healthy) { Fail 14 "gateway-health" "No healthy gateway at $gateway after recovery (check: adb -s $Serial logcat -s AgentDev)" }
Step "gateway-health" "OK" $gateway

# --- 6. Token (written by the app at startup; never printed) -----------------------------------
$token = $null
$viaRunAs = Invoke-Adb @("-s", $Serial, "exec-out", "run-as", $Package, "cat", "files/$TokenFile") -AllowFail
if ($viaRunAs -match '^rac1\.') { $token = $viaRunAs.Trim() }
if (-not $token) {
  $local = Join-Path $OutDir $TokenFile
  Invoke-Adb @("-s", $Serial, "pull", "/sdcard/Android/data/$Package/files/$TokenFile", $local) -AllowFail | Out-Null
  if (Test-Path $local) { $t = (Get-Content $local -Raw).Trim(); if ($t -match '^rac1\.') { $token = $t }; Remove-Item $local -Force }
}
if (-not $token) {
  $log = Invoke-Adb @("-s", $Serial, "logcat", "-d", "-s", "AgentDev:I") -AllowFail
  $m = [regex]::Matches($log, 'AGENTDEV_TOKEN=(rac1\.\S+)')
  if ($m.Count -gt 0) { $token = $m[$m.Count - 1].Groups[1].Value }
}
if (-not $token) { Fail 15 "token" "Could not read $TokenFile (run-as, external pull and logcat all failed)" }
Step "token" "OK" "obtained (not printed)"
# Persist token for Claude stdio launcher (gitignored under build/)
Set-Content -Path (Join-Path $OutDir "token.env") -Value $token -Encoding ascii

# --- 6b. Fixture idempotency (seed broadcast must not duplicate suppliers) ---------------------
Invoke-Adb @("-s", $Serial, "shell", "am", "broadcast", "-a", "com.rentacar.app.agentdev.SEED",
  "-n", "$Package/com.rentacar.app.agentdev.AgentDevCommandReceiver") -AllowFail | Out-Null
Start-Sleep -Seconds 2
try {
  $headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
  $body = '{"operation":"supplier.list","parameters":{"limit":50},"requestId":"idempotency-check"}'
  $r = Invoke-RestMethod -Uri "$gateway/v1/execute" -Method POST -Headers $headers -Body $body -TimeoutSec 15
  $count = @($r.data.items).Count
  if ($count -ne 3) { Fail 1 "fixture-idempotency" "Expected 3 suppliers after re-seed, got $count" }
  Step "fixture-idempotency" "OK" "supplier.count=$count"
} catch {
  Fail 1 "fixture-idempotency" $_.Exception.Message
}

# --- 7. MCP protocol tests against the real gateway ---------------------------------------------
$env:RENTACAR_EXECUTION_MODE = "EMULATOR_REAL_ROOM"
$env:RENTACAR_GATEWAY_URL    = $gateway
$env:RENTACAR_DEVICE_TOKEN   = $token
$env:E2E_RESULTS_PATH        = $ResultsPath
try {
  # AGENT-122: emulator-e2e.mjs reports progress on stderr. Under $ErrorActionPreference=Stop,
  # Windows PowerShell 5.1 turns redirected native stderr into a terminating NativeCommandError,
  # so run it via Start-Process with file redirection and echo the output afterwards.
  . (Join-Path $PSScriptRoot "AgentDevCommon.ps1")
  $run = Invoke-AgentDevNative "node" @((Join-Path $PSScriptRoot "emulator-e2e.mjs")) -TimeoutSec 600
  if ($run.StdErr) { Write-Host $run.StdErr.TrimEnd() }
  if ($run.StdOut) { Write-Host $run.StdOut.TrimEnd() }
  $code = $run.ExitCode
} finally {
  Remove-Item Env:\RENTACAR_DEVICE_TOKEN -ErrorAction SilentlyContinue
  # Cleanup only forwards we created; do not kill unrelated adb/emulator processes.
  if ($ownedForward) {
    try { Invoke-Adb @("-s", $Serial, "forward", "--remove", "tcp:$Port") -AllowFail | Out-Null } catch {}
    $ownedForward = $false
  }
}
Step "mcp-e2e" ($(if ($code -eq 0) { "OK" } else { "FAIL" })) $ResultsPath
Write-Verdict ($(if ($code -eq 0) { "PASS" } else { "FAIL" })) $code
exit $code
