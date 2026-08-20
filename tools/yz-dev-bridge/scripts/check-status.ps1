$ErrorActionPreference = 'Stop'
$BridgeRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $BridgeRoot 'package.json'))) {
    throw "Could not resolve YZ Dev Bridge root from $PSScriptRoot"
}

Set-Location $BridgeRoot
node (Join-Path $BridgeRoot 'src\cli.js') status
