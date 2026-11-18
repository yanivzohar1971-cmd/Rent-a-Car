<#
.SYNOPSIS
  AGENT-123: one idempotent command that brings up the Claude <-> Rent a Car AgentDev development
  session and leaves it running (DEVELOPMENT SESSION MODE). Safe to run repeatedly.

.DESCRIPTION
  1  verify repository           9  read device token -> build/agentapi-e2e/token.env (never printed)
  2  verify development branch   10 ADB forward tcp:18765 (only created if missing; kept afterwards)
  3  detect Android SDK          11 MCP host startup (exact Claude Code launcher)
  4  start RentacarAgentDev      12 MCP tool discovery
  5  wait for boot               13 one real read-only Room query (supplier.list, counts only)
  6  verify AgentDev APK         14 Claude Code MCP registration (registers if missing and CLI present)
  7  launch AgentDev (if needed) 15 readiness report + build/agentapi-e2e/session.json
  8  verify AgentDev Room DB

  Never installs on, or forwards to, a physical device. Never wipes emulator data. Never prints the
  token. Resources this script creates are recorded in session.json so stop-rentcar-claude.ps1 removes
  only those.

.PARAMETER Build
  Build :app:assembleAgentdevDebug when the APK is missing (otherwise the script fails with a clear message).
.PARAMETER Reinstall
  Reinstall the existing AgentDev APK even if already installed (emulator only).
.PARAMETER NoRegister
  Do not register the MCP server with Claude Code when it is missing.

Exit codes: 0 ready | 10 SDK/adb | 11 emulator | 12 APK | 13 app/DB | 14 gateway | 15 token | 16 MCP | 17 repo
#>
[CmdletBinding()]
param(
  [string]$AvdName = "RentacarAgentDev",
  [int]$Port = 18765,
  [switch]$Build,
  [switch]$Reinstall,
  [switch]$NoRegister,
  [string]$ExpectedBranch = "feature/claude-agent-api",
  [string]$McpName = "rentcar-emulator"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "AgentDevCommon.ps1")

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$OutDir = Join-Path $RepoRoot "build\agentapi-e2e"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$SessionFile = Join-Path $OutDir "session.json"
$Gateway = "http://127.0.0.1:$Port"

# Previous session state (to keep ownership across repeated runs).
$prev = $null
if (Test-Path $SessionFile) { try { $prev = Get-Content $SessionFile -Raw | ConvertFrom-Json } catch {} }
$session = [ordered]@{
  startedAt = (Get-Date).ToString("o"); serial = $null; avd = $AvdName; port = $Port
  forwardOwned = [bool]($prev -and $prev.forwardOwned)
  emulatorStartedBySession = [bool]($prev -and $prev.emulatorStartedBySession)
  adbServerPid = $(if ($prev) { $prev.adbServerPid } else { $null })
}
$report = New-Object System.Collections.ArrayList
function Step([string]$name, [string]$status, [string]$detail = "") {
  [void]$report.Add([ordered]@{ step = $name; status = $status; detail = $detail })
  $color = switch ($status) { "OK" { "Green" } "WARN" { "Yellow" } "SKIP" { "DarkGray" } default { "Red" } }
  Write-Host ("[{0,-4}] {1,-22} {2}" -f $status, $name, $detail) -ForegroundColor $color
}
function Save-Session { $session | ConvertTo-Json -Depth 5 | Set-Content $SessionFile -Encoding utf8 }
function Fail([int]$code, [string]$name, [string]$detail) {
  Step $name "FAIL" $detail
  Save-Session
  Write-Host "`nNOT READY (exit $code)" -ForegroundColor Red
  exit $code
}

# 1-2 repository and branch -----------------------------------------------------------------------
$git = Invoke-AgentDevNative "git" @("-C", $RepoRoot, "rev-parse", "--show-toplevel")
if ($git.ExitCode -ne 0) { Fail 17 "repository" "not a git repository: $RepoRoot" }
if (-not (Test-Path (Join-Path $RepoRoot "tools\mcp-host\run-emulator-stdio.mjs"))) { Fail 17 "repository" "MCP launcher missing" }
Step "repository" "OK" $RepoRoot
$branch = ((Invoke-AgentDevNative "git" @("-C", $RepoRoot, "branch", "--show-current")).StdOut | Out-String).Trim()
if ($branch -eq $ExpectedBranch) { Step "branch" "OK" $branch }
else { Step "branch" "WARN" "on '$branch' (expected $ExpectedBranch); continuing with the checked-out code" }

# 3 SDK / adb ---------------------------------------------------------------------------------------
$Sdk = Find-AgentDevSdk $RepoRoot
if (-not $Sdk) { Fail 10 "android-sdk" "Android SDK with platform-tools\adb.exe not found" }
$Adb = Join-Path $Sdk "platform-tools\adb.exe"
$Emulator = Join-Path $Sdk "emulator\emulator.exe"
try {
  $pid0 = Start-AgentDevAdbServerIfNeeded $Adb
  if ($pid0) { $session.adbServerPid = $pid0 }
} catch { Fail 10 "adb-server" $_.Exception.Message }
Step "android-sdk" "OK" $Sdk

# 4-5 emulator ------------------------------------------------------------------------------------
$serial = $null
foreach ($s in (Get-AgentDevOnlineEmulators $Adb)) {
  if ((Get-AgentDevAvdName $Adb $s) -eq $AvdName) { $serial = $s; break }
}
if (-not $serial) {
  if (-not (Test-Path (Join-Path $env:USERPROFILE ".android\avd\$AvdName.avd"))) {
    Fail 11 "emulator" "AVD '$AvdName' does not exist (run tools\agentapi\run-emulator-e2e.ps1 -StartEmulator once to create it)"
  }
  Start-Process -FilePath $Emulator -ArgumentList @("-avd", $AvdName, "-netdelay", "none", "-netspeed", "full", "-no-snapshot-save", "-no-boot-anim", "-gpu", "auto") -WindowStyle Minimized | Out-Null
  $session.emulatorStartedBySession = $true
  $deadline = (Get-Date).AddMinutes(5)
  while (-not $serial -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    foreach ($s in (Get-AgentDevOnlineEmulators $Adb)) { if ((Get-AgentDevAvdName $Adb $s) -eq $AvdName) { $serial = $s; break } }
  }
  if (-not $serial) { Fail 11 "emulator" "AVD $AvdName did not come online within 5 minutes" }
  Step "emulator" "OK" "started $AvdName as $serial"
} else {
  Step "emulator" "OK" "reusing running $AvdName ($serial)"
}
if ($serial -notlike "emulator-*") { Fail 11 "emulator" "refusing non-emulator serial $serial" }
$session.serial = $serial
$booted = ""
$bootDeadline = (Get-Date).AddMinutes(3)
do {
  # During early boot adbd may not answer at all: a timeout here means "not booted yet", not failure.
  try { $booted = (Invoke-AgentDevAdb -Adb $Adb -AdbArgs @("-s", $serial, "shell", "getprop", "sys.boot_completed") -AllowFail -TimeoutSec 15).Trim() }
  catch { $booted = "" }
  if ($booted -ne "1") { Start-Sleep -Seconds 3 }
} while ($booted -ne "1" -and (Get-Date) -lt $bootDeadline)
if ($booted -ne "1") { Fail 11 "boot" "$serial has not finished booting" }
Step "boot" "OK" "sys.boot_completed=1"

# 6 APK ---------------------------------------------------------------------------------------------
$Apk = Join-Path $RepoRoot "app\build\outputs\apk\agentdev\debug\app-agentdev-debug.apk"
$installed = (Invoke-AgentDevAdb -Adb $Adb -AdbArgs @("-s", $serial, "shell", "pm", "path", $AgentDevPackage) -AllowFail) -match [regex]::Escape($AgentDevPackage)
if (-not $installed -or $Reinstall) {
  if (-not (Test-Path $Apk)) {
    if (-not $Build) { Fail 12 "agentdev-apk" "APK not built: $Apk (re-run with -Build)" }
    $g = Invoke-AgentDevNative (Join-Path $RepoRoot "gradlew.bat") @(":app:assembleAgentdevDebug", "--console=plain") -TimeoutSec 1800
    if ($g.ExitCode -ne 0 -or -not (Test-Path $Apk)) { Fail 12 "agentdev-apk" "Gradle build failed (exit $($g.ExitCode))" }
  }
  try { Invoke-AgentDevAdb -Adb $Adb -AdbArgs @("-s", $serial, "install", "-r", "-t", $Apk) -TimeoutSec 180 | Out-Null }
  catch { Fail 12 "agentdev-apk" $_.Exception.Message }
  Step "agentdev-apk" "OK" "installed $AgentDevPackage on $serial"
} else {
  Step "agentdev-apk" "OK" "$AgentDevPackage already installed"
}

# 10 (early) forward: needed to probe the gateway --------------------------------------------------
if (Test-AgentDevForward $Adb $serial $Port) {
  $forwardDetail = "existing tcp:$Port kept"
} else {
  Invoke-AgentDevAdb -Adb $Adb -AdbArgs @("-s", $serial, "forward", "tcp:$Port", "tcp:$Port") | Out-Null
  $session.forwardOwned = $true
  $forwardDetail = "created tcp:$Port (owned by this session)"
}

# 7 launch app only if the gateway is not already answering ----------------------------------------
if (Test-AgentDevGatewayHealthy $Gateway 2) {
  Step "agentdev-app" "OK" "already running"
} else {
  Invoke-AgentDevAdb -Adb $Adb -AdbArgs @("-s", $serial, "shell", "am", "start", "-n", $AgentDevActivity) | Out-Null
  if (-not (Test-AgentDevGatewayHealthy $Gateway 45)) {
    Invoke-AgentDevAdb -Adb $Adb -AdbArgs @("-s", $serial, "shell", "am", "force-stop", $AgentDevPackage) -AllowFail | Out-Null
    Start-Sleep -Seconds 2
    Invoke-AgentDevAdb -Adb $Adb -AdbArgs @("-s", $serial, "shell", "am", "start", "-n", $AgentDevActivity) | Out-Null
    if (-not (Test-AgentDevGatewayHealthy $Gateway 60)) { Save-Session; Fail 14 "gateway" "no healthy gateway at $Gateway (adb -s $serial logcat -s AgentDev)" }
  }
  Step "agentdev-app" "OK" "launched"
}

# 8 Room DB (AgentDev package only) -----------------------------------------------------------------
$dbs = Invoke-AgentDevAdb -Adb $Adb -AdbArgs @("-s", $serial, "exec-out", "run-as", $AgentDevPackage, "ls", "databases") -AllowFail
if ($dbs -match [regex]::Escape($AgentDevDbName)) { Step "room-db" "OK" "$AgentDevPackage/databases/$AgentDevDbName" }
else { Fail 13 "room-db" "$AgentDevDbName not found in AgentDev app data" }

Step "gateway" "OK" "$Gateway healthy"
Step "adb-forward" "OK" $forwardDetail
Save-Session

# 9 token -------------------------------------------------------------------------------------------
$token = Get-AgentDevToken $Adb $serial
if (-not $token) { Fail 15 "device-token" "AgentDev token not readable (run-as/logcat)" }
$tokenFile = Join-Path $OutDir "token.env"
$existing = if (Test-Path $tokenFile) { (Get-Content $tokenFile -Raw).Trim() } else { "" }
if ($existing -ne $token) { Set-Content -Path $tokenFile -Value $token -Encoding ascii; $tokDetail = "refreshed token.env (not printed)" }
else { $tokDetail = "token.env current (not printed)" }
Remove-Variable token, existing
Step "device-token" "OK" $tokDetail

# 11-14 MCP -----------------------------------------------------------------------------------------
$smoke = Invoke-AgentDevNative "node" @((Join-Path $PSScriptRoot "mcp-smoke.mjs")) -Environment @{ RENTACAR_MCP_NAME = $McpName } -TimeoutSec 120
$s = $null
try { $s = ($smoke.StdOut.Trim() -split "`r?`n")[-1] | ConvertFrom-Json } catch {}
if (-not $s) { Fail 16 "mcp-host" "smoke client produced no summary (exit $($smoke.ExitCode))" }
if (-not $s.mcpHostStarted) { Fail 16 "mcp-host" ($s.errors -join "; ") }
Step "mcp-host" "OK" "protocol $($s.protocolVersion), env $($s.dataEnvironment), connection $($s.connection)"
if ($s.businessToolCount -lt 1) { Fail 16 "mcp-tools" "only $($s.toolCount) tool(s); connection $($s.connection)" }
Step "mcp-tools" "OK" "$($s.businessToolCount) business tools + connection.status"
if (-not $s.readQuery.ok) { Fail 16 "room-query" ($s.errors -join "; ") }
Step "room-query" "OK" "supplier.list -> $($s.readQuery.count) rows, source=$($s.readQuery.source), target=$($s.readQuery.executionTarget)"

if ($s.claudeCodeRegistration.registered) {
  if ($s.claudeCodeRegistration.launcherMatches) { Step "claude-registration" "OK" "$McpName ($($s.claudeCodeRegistration.scope) scope)" }
  else { Step "claude-registration" "WARN" "$McpName registered but points at a different launcher" }
} elseif ($NoRegister) {
  Step "claude-registration" "WARN" "$McpName not registered (-NoRegister)"
} else {
  $claude = Get-Command claude -ErrorAction SilentlyContinue
  if (-not $claude) { Step "claude-registration" "WARN" "$McpName not registered and 'claude' CLI not on PATH" }
  else {
    $node = (Get-Command node).Source
    $launcher = Join-Path $RepoRoot "tools\mcp-host\run-emulator-stdio.mjs"
    Push-Location $RepoRoot
    try { $r = Invoke-AgentDevNative $claude.Source @("mcp", "add", "--scope", "local", $McpName, "--", $node, $launcher) -TimeoutSec 60 }
    finally { Pop-Location }
    if ($r.ExitCode -eq 0) { Step "claude-registration" "OK" "registered $McpName (local scope, no token in config)" }
    else { Step "claude-registration" "WARN" "claude mcp add failed (exit $($r.ExitCode))" }
  }
}

Save-Session
Write-Host ""
Write-Host "READY - Claude can query the AgentDev emulator (DEVELOPMENT_DATA, synthetic fixtures)." -ForegroundColor Green
Write-Host "Session kept running. Stop with: tools\agentapi\stop-rentcar-claude.ps1" -ForegroundColor Green
$report | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $OutDir "readiness.json") -Encoding utf8
exit 0
