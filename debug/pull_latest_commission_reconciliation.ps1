# Pull the latest commission reconciliation diagnostic JSON from a connected device.
# Does not require root. Does not print credentials. Preserves UTF-8 bytes.
#
# Device path:
#   cache/commission_reconciliation/commission-reconciliation-latest.json
# ApplicationId (debug):
#   com.rentacar.app
#
# Example:
#   powershell -File debug/pull_latest_commission_reconciliation.ps1

$ErrorActionPreference = 'Stop'

$adbCandidates = @(
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    "$env:ANDROID_HOME\platform-tools\adb.exe",
    "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe",
    'adb'
)
$adb = $adbCandidates | Where-Object {
    if ($_ -eq 'adb') { return $true }
    Test-Path $_
} | Select-Object -First 1

if (-not $adb) {
    throw 'adb not found. Install Android platform-tools or set ANDROID_HOME.'
}

$packageId = 'com.rentacar.app'
$remotePath = 'cache/commission_reconciliation/commission-reconciliation-latest.json'
$outDir = Join-Path $PSScriptRoot 'out'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$outFile = Join-Path $outDir 'commission-reconciliation-latest.json'

$devicesOutput = & $adb devices
$serial = $devicesOutput |
    Select-Object -Skip 1 |
    ForEach-Object { ($_ -split '\s+')[0] } |
    Where-Object { $_ -and $_ -ne 'List' } |
    Select-Object -First 1

if (-not $serial) {
    throw 'No connected Android device. Attach the Samsung device and enable USB debugging.'
}

Write-Host "Device: $serial"
Write-Host "Package: $packageId"
Write-Host "Remote: $remotePath"

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $adb
$psi.Arguments = "-s $serial exec-out run-as $packageId cat $remotePath"
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
[void]$proc.Start()
$buffer = New-Object System.IO.MemoryStream
$proc.StandardOutput.BaseStream.CopyTo($buffer)
$stderr = $proc.StandardError.ReadToEnd()
$proc.WaitForExit()
if ($proc.ExitCode -ne 0) {
    throw "Failed to pull $remotePath via run-as (exit $($proc.ExitCode)). $stderr Install a debug APK with adb install -r and run reconciliation first."
}

$bytes = $buffer.ToArray()
if ($bytes.Length -le 2) {
    throw "Pulled file is missing or empty: $outFile"
}
$offset = 0
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    $offset = 3
}
$text = [System.Text.Encoding]::UTF8.GetString($bytes, $offset, $bytes.Length - $offset)
if ($text -notmatch '"schemaVersion"') {
    throw "Pulled file does not look like a reconciliation JSON report."
}
[System.IO.File]::WriteAllText($outFile, $text, [System.Text.UTF8Encoding]::new($false))

Write-Host "Saved UTF-8 JSON:"
Write-Host $outFile
Write-Host ("Bytes: {0}" -f (Get-Item $outFile).Length)
