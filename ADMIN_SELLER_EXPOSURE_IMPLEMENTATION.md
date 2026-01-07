# Admin-Managed Seller Exposure Implementation

## Overview

This implementation adds a production-grade Admin-controlled "Seller Exposure" system that allows admins to control what each seller (yard/agent) exposes publicly:
- Show seller name in badge
- Show seller logo
- Show seller phone
- Show seller WhatsApp
- Show city/address

These controls are projected by Cloud Functions into `publicCars` seller snapshot fields, and the public web UI reads ONLY from `publicCars` and renders accordingly.

## Files Changed

### Functions (Cloud Functions)

1. **functions/src/cars/publicCarProjection.ts**
   - Added `loadAdminSellerExposure()` helper function
   - Updated `upsertPublicCarFromMaster()` to load and apply admin exposure flags
   - Seller fields are only written when exposure flags allow AND value exists (null-overwrite protection)

2. **functions/src/cars/publicCarSyncTrigger.ts**
   - Added `onAdminSellerExposureChangeUpdatePublicCars` trigger
   - Updates all relevant `publicCars` documents when admin exposure flags change
   - Uses batched updates (batch size 100) with progress logging

3. **functions/src/index.ts**
   - Exported new trigger `onAdminSellerExposureChangeUpdatePublicCars`

### Web (Frontend)

4. **web/src/types/cars.ts**
   - Added new fields to `PublicCar` interface:
     - `sellerPhone`, `sellerWhatsappPhone`, `sellerCity`, `sellerAddress`
     - `showSellerLogo`, `showSellerPhone`, `showSellerWhatsapp`

5. **web/src/components/yard/YardCard.tsx**
   - Updated to accept and use exposure flags (`showSellerLogo`, `showSellerPhone`, `showSellerWhatsapp`)
   - Logo, phone, and WhatsApp buttons respect exposure flags
   - Never hides entire card (fail-safe behavior)

6. **web/src/pages/CarDetailsPage.tsx**
   - Updated to pass exposure flags from `publicCars` to `YardCard` component

7. **web/src/pages/AdminSellerExposurePage.tsx** (NEW)
   - Admin page for managing seller exposure flags
   - Search seller by UID
   - Edit exposure flags with checkboxes
   - Quick presets (Show All, Hide Name, Hide Logo, Hide Phone, Hide WhatsApp)
   - Save button updates `adminSellerExposure/{sellerUid}` document

8. **web/src/pages/AdminSellerExposurePage.css** (NEW)
   - Styling for admin seller exposure page

9. **web/src/router.tsx**
   - Added route `/admin/sellers/exposure` for `AdminSellerExposurePage`

10. **web/src/pages/AccountPage.tsx**
    - Added tile "חשיפת מוכרים" in `AdminDashboardView` linking to `/admin/sellers/exposure`

## Data Model

### Collection: `adminSellerExposure/{sellerUid}`

Document structure:
```typescript
{
  sellerUid: string,
  sellerType?: "YARD" | "AGENT",
  showNameInBadge?: boolean,    // default: true when missing
  showLogo?: boolean,           // default: true when missing
  showPhone?: boolean,          // default: true when missing
  showWhatsapp?: boolean,      // default: true when missing
  showCity?: boolean,           // default: true when missing
  showAddress?: boolean,        // default: false when missing (safer)
  updatedAt?: Timestamp
}
```

### Collection: `publicCars/{carId}` (Updated Fields)

New fields added:
```typescript
{
  // ... existing fields ...
  sellerPhone?: string | null,
  sellerWhatsappPhone?: string | null,
  sellerCity?: string | null,
  sellerAddress?: string | null,
  showSellerLogo?: boolean,     // false = hide, undefined/null = show
  showSellerPhone?: boolean,    // false = hide, undefined/null = show
  showSellerWhatsapp?: boolean, // false = hide, undefined/null = show
}
```

## Deploy Commands

### Deploy Functions

```bash
cd functions
npm install  # If dependencies changed
firebase deploy --only functions
```

Or deploy specific functions:
```bash
firebase deploy --only functions:onAdminSellerExposureChangeUpdatePublicCars
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

After deployment, run backfill to apply admin exposure rules to existing `publicCars` documents:

1. **Via Firebase Console (Callable Function)**
   - Go to Firebase Console → Functions
   - Find `backfillPublicCars` function
   - Call it with admin authentication

2. **Via Admin UI (if available)**
   - Navigate to admin dashboard
   - Use backfill tool if available

3. **Via Firebase CLI (if callable)**
   ```bash
   firebase functions:shell
   backfillPublicCars()
   ```

**Note:** The `backfillPublicCars` function automatically applies admin exposure rules because it calls `upsertPublicCarFromMaster()`, which now includes the exposure logic.

## Manual Verification Cases

### Case 1: Yard Default (No Admin Doc)
**Setup:**
- Create a yard with profile (name, logo, phone, WhatsApp)
- Ensure NO document exists in `adminSellerExposure/{yardUid}`
- Publish a car from this yard

**Expected Result (Incognito):**
- Badge shows yard name (not "מגרש")
- Logo displays in seller card
- Call button shows (if phone exists)
- WhatsApp button shows (if WhatsApp exists)

**Verification:**
- Open car details page in incognito
- Check seller badge text = yard name
- Check seller card has logo
- Check call/WhatsApp buttons visible

### Case 2: Yard with Admin Flags Set to Hide Name/Logo
**Setup:**
- Use Case 1 yard
- Create `adminSellerExposure/{yardUid}` document:
  ```json
  {
    "sellerUid": "<yardUid>",
    "sellerType": "YARD",
    "showNameInBadge": false,
    "showLogo": false,
    "showPhone": true,
    "showWhatsapp": true,
    "showCity": true,
    "showAddress": false,
    "updatedAt": <timestamp>
  }
  ```
- Wait for trigger to update `publicCars` (or manually trigger backfill)

**Expected Result (Incognito):**
- Badge shows "מגרש" (not yard name)
- Logo placeholder shown (no logo image)
- Call button shows (if phone exists and `showPhone: true`)
- WhatsApp button shows (if WhatsApp exists and `showWhatsapp: true`)

**Verification:**
- Open car details page in incognito
- Check seller badge text = "מגרש"
- Check seller card shows placeholder (no logo)
- Check call/WhatsApp buttons visible

### Case 3: Agent with Name Hidden
**Setup:**
- Create an agent with profile (name, phone)
- Create `adminSellerExposure/{agentUid}` document:
  ```json
  {
    "sellerUid": "<agentUid>",
    "sellerType": "AGENT",
    "showNameInBadge": false,
    "showLogo": true,
    "showPhone": true,
    "showWhatsapp": true,
    "showCity": true,
    "showAddress": false,
    "updatedAt": <timestamp>
  }
  ```
- Publish a car from this agent
- Wait for trigger/backfill

**Expected Result (Incognito):**
- Badge shows "סוכן" (not agent name)
- Logo shows if exists and `showLogo: true`
- Call/WhatsApp buttons show if `showPhone: true` / `showWhatsapp: true`

**Verification:**
- Open car details page in incognito
- Check seller badge text = "סוכן"
- Check seller card respects exposure flags

## Security Notes

1. **No Public Reads from `users/`**: Public pages read ONLY from `publicCars` collection. No anonymous users can read `users/{uid}` documents.

2. **Admin-Only Access**: The `adminSellerExposure` collection is only writable by admins (enforced by Firestore security rules - ensure rules are set).

3. **Null-Overwrite Protection**: The projection logic never overwrites existing `publicCars` seller fields with `null`. Fields are only written when:
   - Value exists (non-empty)
   - Exposure flag allows it

4. **Backward Compatibility**: Existing `publicCars` documents without new fields continue to work (defaults apply).

## Testing Checklist

- [ ] Deploy functions
- [ ] Deploy web hosting
- [ ] Verify admin page loads at `/admin/sellers/exposure`
- [ ] Test Case 1: Yard default (no admin doc)
- [ ] Test Case 2: Yard with flags set to hide name/logo
- [ ] Test Case 3: Agent with name hidden
- [ ] Verify trigger updates `publicCars` when admin exposure changes
- [ ] Verify backfill applies exposure rules
- [ ] Verify no public reads from `users/` (check Network tab in incognito)
- [ ] Verify badge text resolution works correctly
- [ ] Verify seller card respects all exposure flags

## Future Enhancements

- Package billing integration: Automatically set exposure flags based on subscription plan
- Bulk operations: Update exposure flags for multiple sellers at once
- Search by name: Allow searching sellers by display name (not just UID)
- Exposure history: Track changes to exposure flags over time

