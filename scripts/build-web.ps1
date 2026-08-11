# PowerShell script to build web app (CWD-safe)
# Works from any directory

$ErrorActionPreference = "Stop"

# Get repo root via git
try {
    $repoRoot = git rev-parse --show-toplevel 2>$null
    if (-not $repoRoot) {
        throw "Not a git repo / cannot determine repo root"
    }
} catch {
    Write-Error "Failed to determine repo root: $_"
    exit 1
}

# Verify web directory exists
$webPath = Join-Path $repoRoot "web"
$packageJson = Join-Path $webPath "package.json"
if (-not (Test-Path $packageJson)) {
    Write-Error "web/package.json not found at: $packageJson"
    exit 1
}

# Build web app
Write-Host "Building web app from: $webPath"
Push-Location $webPath
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "npm run build failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

Write-Host "✓ Web build complete"
