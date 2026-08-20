param(
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$BridgeRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $BridgeRoot 'package.json'))) {
    throw "Could not resolve YZ Dev Bridge root from $PSScriptRoot"
}

$envFile = Join-Path $BridgeRoot '.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) { return }
        $eq = $line.IndexOf('=')
        if ($eq -lt 1) { return }
        $name = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim()
        if ($value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        if (-not [string]::IsNullOrWhiteSpace($name) -and -not [Environment]::GetEnvironmentVariable($name)) {
            Set-Item -Path "Env:$name" -Value $value
        }
    }
}

if (-not $env:YZ_BRIDGE_FIREBASE_API_URL -or -not $env:YZ_BRIDGE_API_TOKEN) {
    throw "Set YZ_BRIDGE_FIREBASE_API_URL and YZ_BRIDGE_API_TOKEN (environment or $envFile). Do not put tokens in this script."
}

Set-Location $BridgeRoot
if (-not $SkipInstall -and -not (Test-Path (Join-Path $BridgeRoot 'node_modules'))) {
    npm install
}

Write-Host "Starting YZ Dev Bridge Firebase relay from $BridgeRoot"
Write-Host "API URL: $env:YZ_BRIDGE_FIREBASE_API_URL"
Write-Host "Project: $($env:YZ_BRIDGE_PROJECT)"
Write-Host "Token is configured (value not printed)."
node (Join-Path $BridgeRoot 'src\relay.js')
