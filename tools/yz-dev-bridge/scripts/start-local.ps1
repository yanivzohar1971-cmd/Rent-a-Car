param(
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$BridgeRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $BridgeRoot 'package.json'))) {
    throw "Could not resolve YZ Dev Bridge root from $PSScriptRoot"
}

Set-Location $BridgeRoot
if (-not $SkipInstall -and -not (Test-Path (Join-Path $BridgeRoot 'node_modules'))) {
    npm install
}

Write-Host "Starting YZ Dev Bridge MCP stdio server from $BridgeRoot"
Write-Host "Cursor should attach via .cursor/mcp.json; this process is the same entrypoint."
node (Join-Path $BridgeRoot 'src\stdio.js')
