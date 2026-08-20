param(
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$BridgeRoot = Split-Path -Parent $PSScriptRoot
$RepoRoot = Split-Path -Parent (Split-Path -Parent $BridgeRoot)

if (-not (Test-Path (Join-Path $BridgeRoot 'package.json'))) {
    throw "Could not resolve YZ Dev Bridge root from $PSScriptRoot"
}

Set-Location $BridgeRoot
if (-not $SkipInstall -and -not (Test-Path (Join-Path $BridgeRoot 'node_modules'))) {
    npm install
}

Write-Host "=== YZ Dev Bridge tests ($BridgeRoot) ==="
npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$FunctionsRoot = Join-Path $RepoRoot 'functions'
if (Test-Path (Join-Path $FunctionsRoot 'package.json')) {
    Write-Host "=== Firebase Functions yzBridge tests ($FunctionsRoot) ==="
    Push-Location $FunctionsRoot
    try {
        npm run test:yz-bridge
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
        Pop-Location
    }
}

Write-Host "All requested YZ Dev Bridge and Firebase relay tests completed."
