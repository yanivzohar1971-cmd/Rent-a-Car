# Git Backup Documentation

## Overview

The Git Backup script (`scripts/git-backup.ps1`) is a PowerShell utility that creates comprehensive, timestamped backups of your Git repository. It generates a complete bundle of all branches and commits, along with repository metadata, packaged in a convenient ZIP archive.

## Features

- **Complete Repository Backup**: Creates a Git bundle containing all branches and commits
- **Timestamped Archives**: Each backup is uniquely named with a timestamp
- **Metadata Capture**: Saves repository information including:
  - Repository name and path
  - Current HEAD commit
  - Remote repository URLs
  - Current Git status
- **ZIP Compression**: Packages everything into a single ZIP file for easy storage and transfer
- **Error Handling**: Filters out non-critical warnings (like CRLF line ending warnings)

## Usage

### Basic Usage

Run the script from your repository root:

```powershell
.\scripts\git-backup.ps1
```

### Custom Backup Directory

Specify a custom backup directory:

```powershell
.\scripts\git-backup.ps1 -BackupDir "C:\MyBackups"
```

By default, backups are stored in `./_backups` directory.

## Output Structure

Each backup creates:

1. **ZIP Archive**: `{RepositoryName}_{YYYYMMDD_HHMMSS}.zip`
   - Contains the Git bundle and metadata files

2. **Git Bundle**: `{RepositoryName}.bundle`
   - Complete Git repository bundle with all branches and commits
   - Can be cloned or used to restore the repository

3. **Metadata Files**:
   - `meta.txt`: Repository information, HEAD commit, and remote URLs
   - `status.txt`: Current Git status at backup time

## Backup Location

Backups are stored in:
```
{BackupDir}/{RepositoryName}/{Timestamp}/
```

The folder is then compressed into a ZIP file and the folder is removed, leaving only the ZIP archive.

## Restoring from Backup

### Extract the ZIP

```powershell
Expand-Archive -Path "Rent_a_Car_20240101_120000.zip" -DestinationPath "restore"
```

### Clone from Bundle

```powershell
git clone restore/Rent_a_Car/Rent_a_Car.bundle restored-repo
```

### Verify Bundle Contents

```powershell
git bundle verify restore/Rent_a_Car/Rent_a_Car.bundle
```

### List Branches in Bundle

```powershell
git bundle list-heads restore/Rent_a_Car/Rent_a_Car.bundle
```

## Example Output

```
Creating backup: .\_backups\Rent_a_Car\20240101_120000
Creating git bundle...
Creating zip archive...

Backup completed successfully!
Backup location: .\_backups\Rent_a_Car_20240101_120000.zip
Size: 15.23 MB
```

## Metadata File Contents

### meta.txt
```
Repository: Rent_a_Car
Path: C:\Rent_a_Car
Timestamp: 2024-01-01 12:00:00
Git HEAD: abc123def456...

Remotes:
origin  https://github.com/user/repo.git (fetch)
origin  https://github.com/user/repo.git (push)
```

### status.txt
Contains the full output of `git status` at the time of backup, showing:
- Current branch
- Staged changes
- Unstaged changes
- Untracked files

## Best Practices

1. **Regular Backups**: Run backups before major changes or deployments
2. **Offsite Storage**: Copy backup ZIP files to external storage or cloud services
3. **Retention Policy**: Periodically clean up old backups to save disk space
4. **Verification**: Test restoring from a backup periodically to ensure they work

## Troubleshooting

### Script Fails with "not a git repo"

- Ensure you're running the script from within a Git repository
- Verify that `.git` directory exists

### Bundle Creation Warnings

- CRLF/LF warnings are automatically filtered and are not errors
- Only actual errors will cause the script to fail

### Large Repository Size

- Git bundles can be large for repositories with extensive history
- Consider using `git gc` to optimize the repository before backing up
- Use `git bundle create` with specific refs if you only need certain branches

## Script Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `BackupDir` | string | `./_backups` | Directory where backup ZIP files will be stored |

## Requirements

- PowerShell 5.1 or later
- Git installed and in PATH
- Write permissions to the backup directory

## Related Files

- Script: `scripts/git-backup.ps1`
- Backup location: `_backups/` (default)
