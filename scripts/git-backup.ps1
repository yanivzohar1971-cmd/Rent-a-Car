# Git Backup Script
# Creates a timestamped bundle backup of the repository

param(
    [string]$BackupDir = "./_backups"
)

$ErrorActionPreference = "Stop"

# Get repository name from current directory
$repoName = Split-Path -Leaf (Get-Location)
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFolder = Join-Path (Join-Path $BackupDir $repoName) $timestamp

# Create backup directory
New-Item -ItemType Directory -Force -Path $backupFolder | Out-Null

Write-Host "Creating backup: $backupFolder" -ForegroundColor Cyan

# Get repository metadata
$repoPath = (Get-Location).Path
$gitHead = git rev-parse HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
    $gitHead = "N/A (not a git repo or no commits)"
}
$gitRemotes = git remote -v 2>$null
if ($LASTEXITCODE -ne 0) {
    $gitRemotes = "N/A"
}
$gitStatus = git status 2>&1 | Out-String

# Write metadata files
$metaPath = Join-Path $backupFolder "meta.txt"
@"
Repository: $repoName
Path: $repoPath
Timestamp: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Git HEAD: $gitHead

Remotes:
$gitRemotes
"@ | Out-File -FilePath $metaPath -Encoding UTF8

$statusPath = Join-Path $backupFolder "status.txt"
$gitStatus | Out-File -FilePath $statusPath -Encoding UTF8

# Create git bundle (ignore CRLF warnings, they're not errors)
Write-Host "Creating git bundle..." -ForegroundColor Yellow
$bundlePath = Join-Path $backupFolder "$repoName.bundle"

# Capture stderr separately to filter out CRLF warnings
$bundleOutput = git bundle create $bundlePath --all 2>&1
$bundleExitCode = $LASTEXITCODE

# Filter out CRLF warnings (they're not real errors)
$realErrors = $bundleOutput | Where-Object { 
    $_ -notmatch "CRLF will be replaced by LF" -and 
    $_ -notmatch "LF will be replaced by CRLF" -and
    $_ -notmatch "warning:"
}

if ($realErrors.Count -gt 0) {
    Write-Host "Git bundle warnings/errors:" -ForegroundColor Yellow
    $realErrors | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
}

if ($bundleExitCode -ne 0) {
    Write-Host "Error: git bundle failed with exit code $bundleExitCode" -ForegroundColor Red
    exit $bundleExitCode
}

# Create working tree archive (includes untracked and modified files)
Write-Host "Creating working tree archive (includes untracked/modified files)..." -ForegroundColor Yellow
$workingTreePath = Join-Path $backupFolder "working-tree"

# Get list of untracked files (filter out CRLF warnings)
$ErrorActionPreference = "Continue"
$untrackedOutput = git ls-files --others --exclude-standard 2>&1
$untrackedFiles = $untrackedOutput | Where-Object { 
    $_ -notmatch "CRLF will be replaced by LF" -and 
    $_ -notmatch "LF will be replaced by CRLF" -and
    $_ -notmatch "warning:" -and
    $_.Trim() -ne ""
}

# Get modified files (filter out CRLF warnings)
$modifiedOutput = git diff --name-only 2>&1
$modifiedFiles = $modifiedOutput | Where-Object { 
    $_ -notmatch "CRLF will be replaced by LF" -and 
    $_ -notmatch "LF will be replaced by CRLF" -and
    $_ -notmatch "warning:" -and
    $_.Trim() -ne ""
}

# Get staged files (filter out CRLF warnings)
$stagedOutput = git diff --cached --name-only 2>&1
$stagedFiles = $stagedOutput | Where-Object { 
    $_ -notmatch "CRLF will be replaced by LF" -and 
    $_ -notmatch "LF will be replaced by CRLF" -and
    $_ -notmatch "warning:" -and
    $_.Trim() -ne ""
}
$ErrorActionPreference = "Stop"

# Create working tree directory
New-Item -ItemType Directory -Force -Path $workingTreePath | Out-Null

# Copy entire working tree, excluding .git and backup directories
Write-Host "  Copying working directory files..." -ForegroundColor Gray
$sourcePath = (Get-Location).Path
$excludeDirs = @('.git', '_backups', 'node_modules', '.vite', '.next', 'dist', 'build', 'lib', '.turbo')

# Function to copy directory tree excluding certain directories
function Copy-WorkingTree {
    param(
        [string]$Source,
        [string]$Dest,
        [string[]]$Exclude
    )
    
    $items = Get-ChildItem -Path $Source -Force
    foreach ($item in $items) {
        $shouldExclude = $false
        foreach ($excl in $Exclude) {
            if ($item.Name -eq $excl) {
                $shouldExclude = $true
                break
            }
        }
        
        if ($shouldExclude) {
            continue
        }
        
        $destPath = Join-Path $Dest $item.Name
        if ($item.PSIsContainer) {
            New-Item -ItemType Directory -Force -Path $destPath | Out-Null
            Copy-WorkingTree -Source $item.FullName -Dest $destPath -Exclude $Exclude
        } else {
            Copy-Item -Path $item.FullName -Destination $destPath -Force
        }
    }
}

# Copy working tree
Copy-WorkingTree -Source $sourcePath -Dest $workingTreePath -Exclude $excludeDirs

# Create a manifest of untracked and modified files
$manifestPath = Join-Path $backupFolder "file-manifest.txt"
$manifest = @"
# File Manifest
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

## Untracked Files:
$($untrackedFiles -join "`n")

## Modified Files (unstaged):
$($modifiedFiles -join "`n")

## Staged Files:
$($stagedFiles -join "`n")
"@
$manifest | Out-File -FilePath $manifestPath -Encoding UTF8

Write-Host "  Working tree archive created" -ForegroundColor Gray

# Create zip archive
$zipPath = Join-Path $BackupDir "${repoName}_${timestamp}.zip"
Write-Host "Creating zip archive..." -ForegroundColor Yellow

# Remove zip if it exists
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

# Create zip using .NET compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($backupFolder, $zipPath)

# Clean up the folder (keep only the zip)
Remove-Item -Recurse -Force $backupFolder

Write-Host "`nBackup completed successfully!" -ForegroundColor Green
Write-Host "Backup location: $zipPath" -ForegroundColor Cyan
Write-Host "Size: $([math]::Round((Get-Item $zipPath).Length / 1MB, 2)) MB" -ForegroundColor Cyan

exit 0
