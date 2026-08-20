Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$env:YZ_BRIDGE_AGENT_AUTO_LAUNCH = if ($env:YZ_BRIDGE_AGENT_AUTO_LAUNCH) { $env:YZ_BRIDGE_AGENT_AUTO_LAUNCH } else { 'true' }
$env:YZ_BRIDGE_AGENT_WINDOW_KEEP_OPEN = if ($env:YZ_BRIDGE_AGENT_WINDOW_KEEP_OPEN) { $env:YZ_BRIDGE_AGENT_WINDOW_KEEP_OPEN } else { 'false' }
Write-Host 'Starting YZ Dev Bridge GitHub relay (visible local Cursor Agent auto-launch uses YZ_BRIDGE_AGENT_AUTO_LAUNCH).'
npm run github-relay
