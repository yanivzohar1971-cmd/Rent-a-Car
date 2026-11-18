<#
.SYNOPSIS
  AGENT-122: stop the AgentDev development session started by start-rentcar-claude.ps1.
  Removes ONLY resources recorded as owned in build/agentapi-e2e/session.json:
    - the ADB forward tcp:<port> (if this session created it)
    - the emulator (only with -StopEmulator AND only if this session started it; graceful
      'emu kill', snapshot not saved, user data NOT wiped)
    - the adb nodaemon server (only with -StopAdbServer AND only if this session started it)
  Never touches physical devices or unrelated processes.
#>
[CmdletBinding()]
param([switch]$StopEmulator, [switch]$StopAdbServer)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "AgentDevCommon.ps1")
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$SessionFile = Join-Path $RepoRoot "build\agentapi-e2e\session.json"
if (-not (Test-Path $SessionFile)) { Write-Host "No session.json - nothing owned to stop."; exit 0 }
$s = Get-Content $SessionFile -Raw | ConvertFrom-Json
$Sdk = Find-AgentDevSdk $RepoRoot
if (-not $Sdk) { Write-Host "Android SDK not found"; exit 10 }
$Adb = Join-Path $Sdk "platform-tools\adb.exe"

if ($s.serial -and $s.serial -notlike "emulator-*") { Write-Host "Refusing non-emulator serial $($s.serial)"; exit 11 }

if ($s.forwardOwned -and $s.serial) {
  Invoke-AgentDevAdb -Adb $Adb -AdbArgs @("-s", $s.serial, "forward", "--remove", "tcp:$($s.port)") -AllowFail | Out-Null
  Write-Host "[OK] removed owned forward tcp:$($s.port) on $($s.serial)"
  $s.forwardOwned = $false
} else { Write-Host "[SKIP] forward not owned by this session" }

if ($StopEmulator) {
  if ($s.emulatorStartedBySession -and $s.serial) {
    if ((Get-AgentDevAvdName $Adb $s.serial) -eq $s.avd) {
      Invoke-AgentDevAdb -Adb $Adb -AdbArgs @("-s", $s.serial, "emu", "kill") -AllowFail | Out-Null
      Write-Host "[OK] emulator $($s.avd) ($($s.serial)) stopped (data preserved)"
      $s.emulatorStartedBySession = $false
    } else { Write-Host "[SKIP] $($s.serial) is no longer AVD $($s.avd)" }
  } else { Write-Host "[SKIP] emulator was not started by this session" }
}

if ($StopAdbServer -and $s.adbServerPid) {
  $p = Get-Process -Id $s.adbServerPid -ErrorAction SilentlyContinue
  if ($p -and $p.ProcessName -eq "adb") { Stop-Process -Id $p.Id; Write-Host "[OK] stopped owned adb server pid $($p.Id)" }
  $s.adbServerPid = $null
}

$s | ConvertTo-Json -Depth 5 | Set-Content $SessionFile -Encoding utf8
exit 0
