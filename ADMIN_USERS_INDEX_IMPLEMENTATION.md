# Admin Users Index Implementation - Fix Customer Management "Role Salad"

## Overview

This implementation fixes the "role salad" problem in Admin Customer Management where the same user (same email/uid) appears in multiple tabs (PRIVATE + YARD). 

The solution creates a canonical `adminUsersIndex/{uid}` collection that maintains a single source of truth for user roles and `primaryRole`, ensuring each UID appears in exactly one tab.

## Problem

- Same user appears in both "לקוחות פרטיים" and "מגרשים" tabs
- PRIVATE list queries `users` where `canSell === true`
- YARD list queries `users` where `isYard === true`
- A user can have both flags set, causing duplicates

## Solution

### Data Model: `adminUsersIndex/{uid}`

```typescript
{
  uid: string,
  email: string | null,
  displayName: string | null,
  phone: string | null,
  roles: string[],               // e.g. ["PRIVATE", "YARD"]
  primaryRole: "YARD" | "AGENT" | "PRIVATE",
  plan: string | null,           // FREE, PLUS, PRO, etc.
  updatedAt: Timestamp
}
```

**Rules:**
- `roles` may contain multiple (e.g., `["YARD", "PRIVATE"]`)
- `primaryRole` computed with priority: **YARD > AGENT > PRIVATE**
- If `roles` missing, default: `roles=["PRIVATE"]`, `primaryRole="PRIVATE"`

## Files Changed

### Functions (Cloud Functions)

1. **functions/src/admin/adminUsersIndex.ts** (NEW)
   - `onUserWriteUpdateAdminUsersIndex` trigger: Maintains index when `users/{uid}` changes
   - `backfillAdminUsersIndex` callable: Admin-only backfill function
   - `extractRolesFromUser()`: Extracts roles from user document
   - `computePrimaryRole()`: Computes primaryRole with priority

2. **functions/src/index.ts**
   - Exported new functions: `onUserWriteUpdateAdminUsersIndex`, `backfillAdminUsersIndex`

### Web (Frontend)

3. **web/src/api/adminUsersIndexApi.ts** (NEW)
   - `fetchYardsFromIndex()`: Query `adminUsersIndex` where `primaryRole == "YARD"`
   - `fetchAgentsFromIndex()`: Query `adminUsersIndex` where `primaryRole == "AGENT"`
   - `fetchPrivateSellersFromIndex()`: Query `adminUsersIndex` where `primaryRole == "PRIVATE"`
   - `fetchAllUsersFromIndex()`: Query all users (for deals tab)

4. **web/src/pages/AdminCustomersPage.tsx**
   - Replaced `fetchAllYardsForAdmin()` with `fetchYardsFromIndex()`
   - Replaced `fetchAllAgentsForAdmin()` with `fetchAgentsFromIndex()`
   - Replaced `fetchAllSellersForAdmin()` with `fetchPrivateSellersFromIndex()`
   - Updated deals tab to use `fetchAllUsersFromIndex()` (no duplicates)

### Firestore Rules

5. **firestore.rules**
   - Added rules for `adminUsersIndex/{uid}`: Admin read-only, write denied (server-only)
   - Added rules for `adminSellerExposure/{sellerUid}`: Admin read/write

## Deploy Commands

### Deploy Functions

```bash
cd functions
npm install  # If dependencies changed
firebase deploy --only functions
```

Or deploy specific functions:
```bash
firebase deploy --only functions:onUserWriteUpdateAdminUsersIndex,functions:backfillAdminUsersIndex
```

### Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

### Deploy Hosting (Web)

```bash
cd web
npm install  # If dependencies changed
npm run build
firebase deploy --only hosting
```

### Full Deploy

```bash
firebase deploy
```

## Backfill Instructions

After deployment, run backfill to create `adminUsersIndex` documents for all existing users:

1. **Via Firebase Console (Callable Function)**
   - Go to Firebase Console → Functions
   - Find `backfillAdminUsersIndex` function
   - Call it with admin authentication

2. **Via Firebase CLI (if callable)**
   ```bash
   firebase functions:shell
   backfillAdminUsersIndex()
   ```

**Note:** The trigger `onUserWriteUpdateAdminUsersIndex` will automatically maintain the index for new/updated users going forward.

## Manual Verification Steps

### Case 1: User with YARD role appears only in YARD tab

**Setup:**
- User has `isYard === true` in `users/{uid}`
- User may also have `canSell === true`

**Expected Result:**
- User appears **ONLY** in "מגרשים" tab
- User does **NOT** appear in "לקוחות פרטיים" tab
- `adminUsersIndex/{uid}` has `primaryRole: "YARD"`, `roles: ["YARD", "PRIVATE"]` (if canSell=true)

**Verification:**
1. Run backfill: `backfillAdminUsersIndex()`
2. Open Admin → ניהול לקוחות
3. Check "מגרשים" tab: User should appear
4. Check "לקוחות פרטיים" tab: User should **NOT** appear

### Case 2: User transitions PRIVATE → YARD

**Setup:**
- User starts as PRIVATE (`canSell === true`, `isYard === false`)
- Admin sets `isYard === true` (or `primaryRole === "YARD"`)

**Expected Result:**
- Within trigger time (~few seconds), `adminUsersIndex/{uid}` updates
- `primaryRole` changes from "PRIVATE" to "YARD"
- User moves from "לקוחות פרטיים" tab to "מגרשים" tab
- User no longer appears in "לקוחות פרטיים"

**Verification:**
1. Find a PRIVATE user in "לקוחות פרטיים" tab
2. Note their UID
3. Update `users/{uid}`: Set `isYard: true` (or `primaryRole: "YARD"`)
4. Wait ~5-10 seconds for trigger
5. Refresh Admin → ניהול לקוחות
6. Check "מגרשים" tab: User should appear
7. Check "לקוחות פרטיים" tab: User should **NOT** appear
8. Verify `adminUsersIndex/{uid}` has `primaryRole: "YARD"`

### Case 3: No duplicates across tabs

**Setup:**
- Multiple users with various role combinations

**Expected Result:**
- Each UID appears in exactly ONE tab
- No user appears in both "מגרשים" and "לקוחות פרטיים"
- No user appears in both "סוכנים" and "לקוחות פרטיים"

**Verification:**
1. Open Admin → ניהול לקוחות
2. Collect all UIDs from "מגרשים" tab
3. Collect all UIDs from "סוכנים" tab
4. Collect all UIDs from "לקוחות פרטיים" tab
5. Verify: No UID appears in multiple lists

## Role Priority Logic

The `computePrimaryRole()` function uses this priority:

1. **YARD** (highest priority)
   - If `roles` includes "YARD" → `primaryRole = "YARD"`

2. **AGENT** (medium priority)
   - If `roles` includes "AGENT" (and not "YARD") → `primaryRole = "AGENT"`

3. **PRIVATE** (default)
   - Otherwise → `primaryRole = "PRIVATE"`

**Example:**
- User with `roles: ["YARD", "PRIVATE"]` → `primaryRole = "YARD"`
- User with `roles: ["AGENT", "PRIVATE"]` → `primaryRole = "AGENT"`
- User with `roles: ["PRIVATE"]` → `primaryRole = "PRIVATE"`

## Security Notes

1. **Admin-Only Access**: The `adminUsersIndex` collection is only readable by admins (enforced by Firestore rules).

2. **Server-Only Writes**: Client writes to `adminUsersIndex` are denied. Only Cloud Functions (using Admin SDK) can write to the index.

3. **Backward Compatibility**: Existing `users` documents continue to work. The index is a read-only projection for admin UI.

## Testing Checklist

- [ ] Deploy functions
- [ ] Deploy Firestore rules
- [ ] Deploy web hosting
- [ ] Run backfill: `backfillAdminUsersIndex()`
- [ ] Verify Case 1: YARD user appears only in YARD tab
- [ ] Verify Case 2: PRIVATE → YARD transition works
- [ ] Verify Case 3: No duplicates across tabs
- [ ] Verify trigger updates index when user changes
- [ ] Verify admin can read `adminUsersIndex` (check Network tab)
- [ ] Verify non-admin cannot read `adminUsersIndex` (should get permission-denied)

## Future Enhancements

- Real-time updates: Use Firestore listeners for live updates in admin UI
- Role history: Track role changes over time
- Bulk role updates: Admin UI to change multiple users' roles at once

