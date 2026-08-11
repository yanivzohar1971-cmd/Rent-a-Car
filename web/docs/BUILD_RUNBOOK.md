# Build Runbook - Stable Commands for Cursor

**Date:** 2025-12-17  
**Issue:** `Select-Object -First 50` cancels build processes  
**Solution:** Use `Tee-Object` for logging without pipeline termination

## Root Cause

Using `Select-Object -First 50` in PowerShell pipelines terminates the pipeline after 50 lines, which closes stdout and causes upstream processes (npm/vite/tsc) to be interrupted/cancelled. This is expected PowerShell pipeline behavior.

**❌ DO NOT USE:**
```powershell
npm run build 2>&1 | Select-Object -First 50  # This cancels the build!
```

## Stable Build Commands

### 1. Setup (One-time)
```powershell
cd c:\Rent_a_Car\web
if (!(Test-Path .\logs)) { New-Item -ItemType Directory -Path .\logs | Out-Null }
```

### 2. Run Build with Full Logging
```powershell
cd c:\Rent_a_Car\web
npm run build 2>&1 | Tee-Object -FilePath .\logs\build-full.log
```

**Notes:**
- `Tee-Object` keeps the process alive and logs everything
- Output appears in terminal AND is saved to log file
- Build completes successfully without cancellation

### 3. View Log After Build
```powershell
# Last 50 lines
Get-Content .\logs\build-full.log -Tail 50

# Last 120 lines (more context)
Get-Content .\logs\build-full.log -Tail 120

# Live follow (tail -f style)
Get-Content .\logs\build-full.log -Tail 50 -Wait
```

### 4. If Build Appears "Stuck" (Diagnostics)

**Before interrupting, collect proof:**

```powershell
# Check if processes are running
Get-Process node,vite,tsc -ErrorAction SilentlyContinue | Select-Object Name,Id,CPU,StartTime

# Check last 200 lines of log
Get-Content .\logs\build-full.log -Tail 200
```

## Build Result (2025-12-17)

**Status:** ✅ SUCCESS  
**Build Time:** 10.35s  
**Log File:** `c:\Rent_a_Car\web\logs\build-full.log`

**Key Findings:**
- Main bundle: `index-DDW-pS3S.js` = **1,469.03 kB** (396.40 kB gzipped)
- CSS bundle: `index-Dh5jscMC.css` = **223.59 kB** (32.81 kB gzipped)
- Warning: Chunk size exceeds 500 kB (needs code-splitting for performance)

## Cursor Execution Guidance

- **If Cursor shows "Connection Error / Cancelled command":** Do NOT re-run with `Select-Object` filters
- **Prefer:** Run commands in integrated terminal using `Tee-Object` logging
- **Always include in output:**
  - Exact command used
  - Where log file was written
  - Last 50 lines of log (if relevant)

## Commands Reference

| Task | Command |
|------|---------|
| Build | `npm run build 2>&1 \| Tee-Object -FilePath .\logs\build-full.log` |
| Dev Server | `npm run dev` |
| Preview Build | `npm run preview` |
| View Last 50 Lines | `Get-Content .\logs\build-full.log -Tail 50` |
| Live Follow | `Get-Content .\logs\build-full.log -Tail 50 -Wait` |

---

**Remember:** `Select-Object -First 50` cancels the build; use `Tee-Object` instead.
