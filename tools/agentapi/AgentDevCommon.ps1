# AGENT-122/123: shared helpers for the AgentDev emulator scripts (dot-source this file).
# Windows PowerShell 5.1 compatible. ASCII only. Never touches physical devices; never prints tokens.

$script:AgentDevPackage  = "com.rentacar.app.agentdev"
$script:AgentDevActivity = "$script:AgentDevPackage/com.rentacar.app.MainActivity"
$script:AgentDevTokenFileName = "agentdev_token.txt"
$script:AgentDevDbName   = "rentacar.db"

function Find-AgentDevSdk([string]$RepoRoot) {
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

# Runs adb with a hard timeout. Output files avoid PowerShell 5.1 turning stderr into ErrorRecords.
function Invoke-AgentDevAdb {
  param([string]$Adb, [string[]]$AdbArgs, [int]$TimeoutSec = 30, [switch]$AllowFail)
  $outFile = [IO.Path]::GetTempFileName(); $errFile = [IO.Path]::GetTempFileName()
  try {
    $p = Start-Process -FilePath $Adb -ArgumentList $AdbArgs -NoNewWindow -PassThru `
         -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    if (-not $p.WaitForExit($TimeoutSec * 1000)) {
      try { $p.Kill() } catch {}
      throw "adb $($AdbArgs -join ' ') timed out after ${TimeoutSec}s"
    }
    $text = Get-Content $outFile -Raw -ErrorAction SilentlyContinue
    $code = if ($null -eq $p.ExitCode) { 0 } else { [int]$p.ExitCode }
    if ($code -ne 0 -and -not $AllowFail) {
      throw "adb $($AdbArgs -join ' ') failed ($code): $(Get-Content $errFile -Raw)"
    }
    if ($null -eq $text) { return "" }
    return ($text | Out-String).TrimEnd()
  } finally { Remove-Item $outFile, $errFile -ErrorAction SilentlyContinue }
}

# Returns $null when an adb server already listens, else the PID of the nodaemon server we started.
function Start-AgentDevAdbServerIfNeeded([string]$Adb) {
  if (netstat -ano | Select-String '127\.0\.0\.1:5037\s+.*LISTENING') { return $null }
  $proc = Start-Process -FilePath $Adb -ArgumentList @("nodaemon", "server") -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 2
  if (-not (netstat -ano | Select-String '127\.0\.0\.1:5037\s+.*LISTENING')) {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
    throw "Could not start adb nodaemon server (127.0.0.1:5037 not listening)"
  }
  return $proc.Id
}

function Get-AgentDevOnlineEmulators([string]$Adb) {
  $devices = Invoke-AgentDevAdb -Adb $Adb -AdbArgs @("devices")
  $list = @()
  foreach ($line in ($devices -split "`r?`n")) { if ($line -match '^(emulator-\d+)\s+device\b') { $list += $Matches[1] } }
  return ,$list
}

# Maps a running emulator serial to its AVD name (emu avd name), or $null.
function Get-AgentDevAvdName([string]$Adb, [string]$Serial) {
  $raw = Invoke-AgentDevAdb -Adb $Adb -AdbArgs @("-s", $Serial, "emu", "avd", "name") -AllowFail -TimeoutSec 10
  if (-not $raw) { return $null }
  return (($raw -split "`r?`n")[0]).Trim()
}

function Test-AgentDevForward([string]$Adb, [string]$Serial, [int]$Port) {
  $list = Invoke-AgentDevAdb -Adb $Adb -AdbArgs @("forward", "--list") -AllowFail
  return [bool]($list -match ("(?m)^" + [regex]::Escape($Serial) + "\s+tcp:$Port\s+tcp:$Port\s*$"))
}

function Test-AgentDevGatewayHealthy([string]$Url, [int]$Seconds = 1) {
  for ($i = 0; $i -lt $Seconds; $i++) {
    try {
      $h = Invoke-RestMethod -Uri "$Url/v1/health" -TimeoutSec 2
      if ($h.status -eq "ok") { return $true }
    } catch {}
    if ($i -lt $Seconds - 1) { Start-Sleep -Seconds 1 }
  }
  return $false
}

# Reads the token written by AgentDevBootstrap. Returns $null if unavailable. Never prints it.
function Get-AgentDevToken([string]$Adb, [string]$Serial) {
  $viaRunAs = Invoke-AgentDevAdb -Adb $Adb -AdbArgs @("-s", $Serial, "exec-out", "run-as", $script:AgentDevPackage, "cat", "files/$script:AgentDevTokenFileName") -AllowFail
  if ($viaRunAs -match '^rac1\.') { return $viaRunAs.Trim() }
  $log = Invoke-AgentDevAdb -Adb $Adb -AdbArgs @("-s", $Serial, "logcat", "-d", "-s", "AgentDev:I") -AllowFail
  $m = [regex]::Matches($log, 'AGENTDEV_TOKEN=(rac1\.\S+)')
  if ($m.Count -gt 0) { return $m[$m.Count - 1].Groups[1].Value }
  return $null
}

# Runs a native command without PowerShell 5.1 converting its stderr into terminating errors.
# Returns @{ ExitCode; StdOut; StdErr }.
function Invoke-AgentDevNative([string]$FilePath, [string[]]$ArgumentList, [hashtable]$Environment = @{}, [int]$TimeoutSec = 300) {
  $outFile = [IO.Path]::GetTempFileName(); $errFile = [IO.Path]::GetTempFileName()
  $saved = @{}
  foreach ($k in $Environment.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k, "Process"); [Environment]::SetEnvironmentVariable($k, $Environment[$k], "Process") }
  try {
    $quoted = $ArgumentList | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }
    $p = Start-Process -FilePath $FilePath -ArgumentList $quoted -NoNewWindow -PassThru `
         -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    if (-not $p.WaitForExit($TimeoutSec * 1000)) { try { $p.Kill() } catch {}; throw "$FilePath timed out after ${TimeoutSec}s" }
    $code = if ($null -eq $p.ExitCode) { 0 } else { [int]$p.ExitCode }
    return @{ ExitCode = $code; StdOut = (Get-Content $outFile -Raw -ErrorAction SilentlyContinue); StdErr = (Get-Content $errFile -Raw -ErrorAction SilentlyContinue) }
  } finally {
    foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k], "Process") }
    Remove-Item $outFile, $errFile -ErrorAction SilentlyContinue
  }
}
