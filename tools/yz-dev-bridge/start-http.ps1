param(
    [int]$Port = 8787,
    [string]$HostAddress = '127.0.0.1',
    [string]$Token = ''
)

$ErrorActionPreference = 'Stop'
$env:BRIDGE_PORT = "$Port"
$env:BRIDGE_HOST = $HostAddress
if ($Token) {
    $env:BRIDGE_AUTH_TOKEN = $Token
}

node "$PSScriptRoot\src\http.js"
