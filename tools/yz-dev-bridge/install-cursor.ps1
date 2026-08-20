param(
    [Parameter(Mandatory=$true)]
    [string]$WorkspacePath
)

$ErrorActionPreference = 'Stop'
$BridgeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BridgeEntry = Join-Path $BridgeRoot 'src\stdio.js'
$CursorDir = Join-Path $WorkspacePath '.cursor'
$RulesDir = Join-Path $CursorDir 'rules'
$McpFile = Join-Path $CursorDir 'mcp.json'
$RuleSource = Join-Path $BridgeRoot '.cursor\rules\yz-dev-bridge.mdc'
$RuleTarget = Join-Path $RulesDir 'yz-dev-bridge.mdc'

if (-not (Test-Path $WorkspacePath)) {
    throw "Workspace path does not exist: $WorkspacePath"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 20+ is required but node was not found in PATH.'
}

if (-not (Test-Path (Join-Path $BridgeRoot 'node_modules'))) {
    Write-Host 'Installing YZ Dev Bridge npm dependencies...'
    Push-Location $BridgeRoot
    try { npm install } finally { Pop-Location }
}

New-Item -ItemType Directory -Force -Path $CursorDir | Out-Null
New-Item -ItemType Directory -Force -Path $RulesDir | Out-Null

$serverEntry = [PSCustomObject]@{
    command = 'node'
    args = @($BridgeEntry)
}

if (Test-Path $McpFile) {
    $backup = "$McpFile.bak"
    Copy-Item $McpFile $backup -Force
    try {
        $config = Get-Content $McpFile -Raw | ConvertFrom-Json
    } catch {
        throw "Existing Cursor MCP config is invalid JSON. It was NOT overwritten. File: $McpFile"
    }
    if ($null -eq $config.mcpServers) {
        $config | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue ([PSCustomObject]@{})
    }
    $config.mcpServers | Add-Member -NotePropertyName 'yz-dev-bridge' -NotePropertyValue $serverEntry -Force
} else {
    $config = [PSCustomObject]@{
        mcpServers = [PSCustomObject]@{
            'yz-dev-bridge' = $serverEntry
        }
    }
}

$config | ConvertTo-Json -Depth 20 | Set-Content -Path $McpFile -Encoding UTF8
Copy-Item $RuleSource $RuleTarget -Force

$CliConfigScript = Join-Path $BridgeRoot 'scripts\ensure-project-cli-config.mjs'
if (Test-Path $CliConfigScript) {
    Write-Host 'Ensuring project Agent CLI trusted MCP allowlist...'
    Push-Location $BridgeRoot
    try {
        node $CliConfigScript $WorkspacePath | Out-String | Write-Host
    } finally {
        Pop-Location
    }
}

Write-Host "Installed/updated YZ Dev Bridge in: $McpFile"
Write-Host "Installed Cursor rule in: $RuleTarget"
Write-Host 'Existing MCP servers were preserved. A .bak backup is created when mcp.json already exists.'
Write-Host 'Restart Cursor or refresh MCP servers.'
