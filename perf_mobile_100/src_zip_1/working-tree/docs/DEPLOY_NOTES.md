# Deployment Notes

## Git Backup

To create a backup of the repository:

```powershell
# Using the git alias (recommended)
git backup

# Or directly
powershell -ExecutionPolicy Bypass -File scripts/git-backup.ps1
```

The backup creates a timestamped zip file in `./_backups/` containing:
- Git bundle with all branches and history
- Repository metadata (HEAD, remotes)
- Current git status

The script ignores CRLF/LF warnings (they're not errors) and only fails on real git errors.

## Rental Companies Logos - Rules Hardening Deployment

**Date:** 2025-12-14  
**Deployed by:** Automated deployment  
**Branch:** hotfix/revert-scopecreep

### What Was Deployed

1. **Firestore Rules** (`firestore.rules`)
   - Added `isVisible == true` check for public reads
   - Added field validation for `nameHe`, `websiteUrl`, `displayType`, `sortOrder`
   - Added `updatedAt` and `updatedByUid` validation
   - Admin-only write/update/delete enforcement

2. **Storage Rules** (`storage.rules`)
   - Changed to require authentication for write/delete
   - Added filename pattern validation (`logo.*`)
   - Enforced 2MB max size and specific content types
   - Path restriction to `rentalCompanies/{companyId}/logo.*`

### Deployment Commands

```bash
# Pre-deploy validation
firebase deploy --only firestore:rules --dry-run
firebase deploy --only storage --dry-run

# Actual deployment
firebase deploy --only firestore:rules
firebase deploy --only storage
```

### Rollback Plan

If rollback is needed:

1. **Firestore Rules:**
   ```bash
   git checkout HEAD~1 firestore.rules
   firebase deploy --only firestore:rules
   ```

2. **Storage Rules:**
   ```bash
   git checkout HEAD~1 storage.rules
   firebase deploy --only storage
   ```

**Previous commit:** `36dc1a5` (Bugfix: Buyer search refresh + car details crash + city filter for private ads)

### Verification Checklist

- [x] Rules compile successfully (dry-run passed)
- [x] Rules deployed successfully
- [ ] Public rendering works (RentalCompanyLogosSection visible on homepage)
- [ ] Hidden companies (isVisible=false) are not readable publicly
- [ ] Admin can create/update/delete companies
- [ ] Field validation works (empty nameHe, invalid URL, etc. are rejected)
- [ ] Logo upload works with cache control metadata
- [ ] Logo replacement deletes old file
- [ ] Storage rules reject non-logo.* filenames

### Notes

- Storage rules require authentication but rely on Firestore rules for admin enforcement
- Logo files use stable naming: `rentalCompanies/{companyId}/logo.{ext}`
- Cache control metadata: `public, max-age=31536000, immutable`
