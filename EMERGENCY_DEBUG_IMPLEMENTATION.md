# Emergency Public DEBUG Button - Implementation Summary

## Problem
After 14 days, public users still cannot see yard/seller details on Car Details pages. We need a deterministic on-screen debug tool to diagnose the publicCars seller snapshot issue.

## Solution
Implemented an emergency debug button controlled by an admin toggle, allowing anyone to inspect seller snapshot data from publicCars in real-time without requiring authentication or redeployment.

---

## Files Modified/Created

### A) Firestore Rules
**File**: `firestore.rules`

Added public config collection with read access for everyone, write access for admins only:

```firestore
match /publicConfig/{docId} {
  allow read: if docId == 'features';
  allow write: if isAdmin();
}
```

**Action Required**: Deploy updated Firestore Rules via Firebase Console.

### B) Admin Feature Flags Page
**Files Created**:
- `web/src/pages/admin/AdminFeatureFlagsPage.tsx`
- `web/src/pages/admin/AdminFeatureFlagsPage.css`

**Route**: `/admin/feature-flags`

Admin-only page with toggles for:
- `enablePublicCarDebugButton` - Shows debug button on public Car Details page
- `enablePublicCarDebugOverlay` - (Optional) Shows inline indicators on YardCard

### C) Car Details Debug Button & Overlay
**Files Modified**:
- `web/src/pages/CarDetailsPage.tsx` - Added debug button, overlay, and diagnostics
- `web/src/pages/CarDetailsPage.css` - Added debug UI styles

**Features**:
- Fixed-position debug button (bottom-left, orange) when feature flag enabled
- Full debug overlay showing:
  - Current carId
  - Raw publicCars data (seller snapshot fields)
  - Computed diagnostics (snapshot present/missing, what YardCard will show)
  - Timestamps and document existence
- Copy debug JSON to clipboard
- Force refetch from Firestore
- Real-time feature flag subscription (updates without page refresh)

### D) Router
**File Modified**: `web/src/router.tsx`

Added route for Admin Feature Flags page at `/admin/feature-flags`.

---

## Usage Instructions

### Step 1: Deploy Firestore Rules
1. Copy contents of `firestore.rules` file
2. Go to Firebase Console → Firestore Database → Rules tab
3. Paste and click "Publish"

### Step 2: Enable Debug Button (Admin)
1. Login as Admin
2. Navigate to `/admin/feature-flags`
3. Toggle "Emergency Debug Button (Car Details)" to **ENABLED**
4. Changes take effect immediately for all users

### Step 3: Debug on Public Page
1. Open any car details page: `/cars/{carId}`
2. Look for orange "DEBUG מוכר/מגרש" button (bottom-left corner)
3. Click to open debug overlay
4. Inspect seller snapshot fields:
   - **yardUid, yardName, yardPhone, yardLogoUrl, yardCity**
   - Check "Seller snapshot present?" status
   - See what YardCard will display
5. Use "Copy debug JSON" to capture diagnostics
6. Use "Force refetch" to reload latest data from Firestore

### Step 4: Disable When Done
1. Return to `/admin/feature-flags`
2. Toggle "Emergency Debug Button" to **DISABLED**
3. Button disappears immediately for all users

---

## Diagnostics Displayed

The debug overlay shows:

### Core Fields
- `yardUid` - Seller/yard Firebase UID
- `yardName` - Seller display name
- `yardPhone` - Primary phone number
- `yardWhatsappPhone` - WhatsApp phone (E164 format)
- `yardLogoUrl` - Seller logo URL
- `yardCity` - Seller city location
- `isPublished` - Publication status flag
- `source` - Data source indicator

### Computed Diagnostics
- **Seller snapshot present?** - YES/NO based on presence of name/phone/logo/city
- **YardCard will show** - Computed string showing what will render
- **Document exists** - Confirmation that publicCars/{carId} exists
- **Timestamps** - createdAt, updatedAt in Israeli locale

### Actions
- **Copy debug JSON** - Full snapshot + metadata for sharing with developers
- **Force refetch** - Re-queries Firestore publicCars/{carId} and updates display
- **Close** - Dismiss overlay

---

## Security Notes

✅ **Safe Public Access**:
- Debug button reads ONLY from public `publicCars` collection
- No authentication required (by design for buyer debugging)
- No access to `users/{uid}` or any private collections
- No privileged callable functions invoked
- Feature flag controls visibility (can be disabled instantly)

✅ **Admin Control**:
- Feature flags writable only by admins (Firestore Rules enforced)
- Toggle changes propagate via real-time Firestore snapshot
- No redeployment needed to enable/disable

✅ **No Data Leakage**:
- Debug JSON includes only publicCars fields
- No user profiles, emails, or sensitive data exposed
- Respects existing Firestore Rules

---

## Expected Findings

### If Seller Data Missing
Debug overlay will show:
- `yardName`: **null**
- `yardPhone`: **null**
- `yardLogoUrl`: **null**
- **Seller snapshot present?** ✗ NO (missing)
- **YardCard will show**: לא צוין | לא זמין | Logo: No

**Root Cause**: publicCars document lacks seller snapshot fields.

**Solution**: Trigger backfill via:
1. Auto-heal (already implemented in CarDetailsPage)
2. Manual backfill callable: `backfillPublicCarById({ carId })`
3. Rebuild yard: `rebuildPublicCarsForYard()`

### If Seller Data Present
Debug overlay will show:
- `yardName`: "שם המגרש"
- `yardPhone`: "050-1234567"
- `yardLogoUrl`: "https://..."
- **Seller snapshot present?** ✓ YES
- **YardCard will show**: שם המגרש | 050-1234567 | Logo: Yes

**Root Cause**: Data exists but may not be rendering due to UI bug.

---

## Cleanup / Removal

When debugging is complete and issue is resolved:

1. **Disable via Admin Toggle** (recommended):
   - Go to `/admin/feature-flags`
   - Disable all debug toggles
   - Feature remains in code but hidden from users

2. **Remove from Code** (optional, after confirmed fix):
   - Remove debug button/overlay from `CarDetailsPage.tsx`
   - Remove `AdminFeatureFlagsPage.tsx` and route
   - Remove publicConfig rules from `firestore.rules`

---

## Testing Checklist

- [ ] Admin can access `/admin/feature-flags` page
- [ ] Admin can toggle debug button on/off
- [ ] Public user sees debug button when enabled (no auth required)
- [ ] Debug overlay shows correct publicCars data
- [ ] Copy JSON button works and produces valid JSON
- [ ] Force refetch updates displayed data
- [ ] Debug button disappears immediately when admin disables flag
- [ ] No permission-denied errors in browser console
- [ ] No reads to `users/{uid}` collection from debug code

---

## Deployment

1. **Commit changes**:
   ```bash
   git add firestore.rules web/src/
   git commit -m "feat: Add emergency public debug button for seller snapshot diagnosis"
   ```

2. **Deploy Firestore Rules**:
   - Firebase Console → Firestore → Rules → Publish

3. **Deploy Web**:
   ```bash
   cd web
   npm run build
   firebase deploy --only hosting
   ```

4. **Initialize Feature Flag** (via Firebase Console or code):
   - Collection: `publicConfig`
   - Document: `features`
   - Fields:
     ```json
     {
       "enablePublicCarDebugButton": false,
       "enablePublicCarDebugOverlay": false,
       "lastUpdatedAt": <serverTimestamp>,
       "updatedBy": "admin@example.com"
     }
     ```

---

## Support

If the debug button doesn't appear after enabling:
1. Check browser console for errors
2. Verify Firestore Rules deployed correctly
3. Confirm `publicConfig/features` document exists with correct field
4. Hard-refresh browser (Ctrl+Shift+R / Cmd+Shift+R)
5. Check feature flag subscription in Network tab (should see Firestore onSnapshot)

If debug overlay shows errors:
1. Copy debug JSON and share with developers
2. Check Firestore Rules allow read access to `publicCars/{carId}`
3. Verify car exists in publicCars collection (not just carSales master)

---

## Implementation Date
January 19, 2026

## Author
Emergency debug tool for diagnosing seller visibility issue after 14 days of investigation.
