# Admin Debug Search + Yard Approval Visibility Implementation

**Date:** 2026-01-19  
**Status:** ✅ COMPLETE

## Overview

Implemented server-side CONTAINS search with minimum character requirements for admin debug tools, and ensured yard approval immediately exposes seller details in publicCars.

---

## Part A: Server-side Search (Debug Only)

### Changes Made

#### 1. Cars Search (`adminDebugSearchCars`)

**File:** `functions/src/admin/adminDebugSearch.ts`

**Implementation:**
- ✅ Min 4 chars requirement enforced
- ✅ CONTAINS search (string.includes) on:
  - `plateNumber` (licensePlatePartial)
  - `externalId` (externalId, stockNumber)
  - `carId` (document ID)
- ✅ Search sources:
  1. `publicCars` collection
  2. `users/{yardUid}/carSales` (MASTER) - searches all yards
- ✅ Max 50 results limit
- ✅ Returns minimal fields:
  - `carId`
  - `plateNumber`
  - `title` (brand + model + year)
  - `yardUid`
  - `source` ('publicCars' | 'carSales')
  - `isPublished`

**Behavior:**
- Returns empty results if query < 4 characters
- Case-insensitive search
- Deduplicates results (if car exists in both sources, only show once)
- Sorts by plateNumber or title

#### 2. Yards Search (`adminDebugSearchYards`)

**File:** `functions/src/admin/adminDebugSearch.ts`

**Implementation:**
- ✅ Min 3 chars requirement enforced
- ✅ CONTAINS search (string.includes) on:
  - `displayName` (and aliases: fullName, yardName, businessName, etc.)
  - `email`
  - `phone` (and aliases: phoneNumber, mobile)
  - `city`
- ✅ Search sources:
  - `users` collection where `isYard=true` OR `primaryRole='YARD'`
- ✅ Max 20 results limit
- ✅ Returns minimal fields:
  - `uid`
  - `displayName`
  - `city`
  - `status`
  - `roleStatus`

**Behavior:**
- Returns empty results if query < 3 characters
- Case-insensitive search
- Sorts by displayName alphabetically
- Searches both isYard flag and primaryRole for comprehensive coverage

---

## Part B: Yard Approval → Public Visibility

### Changes Made

#### 1. Enhanced Trigger for Yard Approval

**File:** `functions/src/cars/publicCarSyncTrigger.ts`

**Implementation:**
- ✅ Updated `onYardProfileChangeUpdatePublicCars` trigger to monitor:
  - `roleStatus` (triggers on approval)
  - `status` (triggers on status change)
  - `primaryRole` (triggers on role assignment)
  - `isYard` (triggers on yard flag change)
  - Plus existing fields: displayName, phone, logoUrl, city, address

**Behavior:**
When a yard is approved:
1. Trigger detects `roleStatus` changed to `APPROVED`
2. Finds all published cars from that yard
3. Re-runs `upsertPublicCarFromMaster` for each car
4. This refreshes seller snapshot in publicCars:
   - `sellerDisplayName` / `yardName`
   - `sellerPhone` / `yardPhone`
   - `sellerWhatsappPhone` / `yardWhatsappPhone`
   - `sellerLogoUrl` / `yardLogoUrl`
   - `sellerCity`
   - `sellerAddress`
5. Processes in batches of 10 to prevent quota explosions

#### 2. Existing Projection Logic (Verified)

**File:** `functions/src/cars/publicCarProjection.ts`

**Verified behavior:**
- ✅ `loadPublicSellerProfile` loads yard profile from:
  1. `yards/{sellerUid}` (if exists)
  2. `users/{sellerUid}` (fallback)
- ✅ `loadAdminSellerExposure` defaults to exposing all fields:
  - `showNameInBadge: true`
  - `showLogo: true`
  - `showPhone: true`
  - `showWhatsapp: true`
  - `showCity: true`
  - `showAddress: false` (safer default)
- ✅ When adminSellerExposure doc doesn't exist, all fields are shown by default
- ✅ Seller snapshot is written to publicCars with proper field names
- ✅ Phone numbers are normalized to E164 format for WhatsApp

---

## Part C: Safety & Security

### Verification

✅ **Admin-only access:**
- All debug callables check `isAdmin()` helper
- Checks both custom claim `admin=true` AND `config/admins` collection
- Returns 403 permission-denied if not admin

✅ **Sanitization:**
- All writes use Firestore's built-in sanitization
- No raw user input written to database
- Uses `admin.firestore.FieldValue.serverTimestamp()` for timestamps

✅ **Payload sizes:**
- Cars search: max 50 results
- Yards search: max 20 results
- Minimal fields only (no full documents)

✅ **No admin-only flags leak:**
- publicCars only contains public-safe fields
- adminSellerExposure flags control what's exposed
- No internal UIDs or private data in public projection

---

## Acceptance Criteria

✅ **Searching cars with <4 chars returns nothing**
- Enforced in `adminDebugSearchCarsHandler` line ~217

✅ **Searching yards with <3 chars returns nothing**
- Enforced in `adminDebugSearchYardsHandler` line ~76

✅ **Public cars from MASTER appear via PUBLIC/ALL**
- Search covers both publicCars AND carSales collections
- Results deduplicated by carId

✅ **After yard approval, public car pages show seller details**
- Trigger fires on roleStatus=APPROVED
- Updates all publicCars for that yard
- Seller snapshot includes name, phone, whatsapp, logo, city
- Default exposure allows all fields unless admin overrides

---

## Testing Recommendations

### 1. Test Cars Search

```typescript
// Should return empty
adminDebugSearchCars({ q: 'abc' }) // 3 chars

// Should return results
adminDebugSearchCars({ q: '1234' }) // 4 chars, plate search
adminDebugSearchCars({ q: 'toyota' }) // brand search
adminDebugSearchCars({ q: 'ABC123' }) // plate search
```

### 2. Test Yards Search

```typescript
// Should return empty
adminDebugSearchYards({ q: 'ab' }) // 2 chars

// Should return results
adminDebugSearchYards({ q: 'tel' }) // 3 chars, city search
adminDebugSearchYards({ q: 'cohen' }) // name search
adminDebugSearchYards({ q: '054' }) // phone search
```

### 3. Test Yard Approval Flow

```typescript
// 1. Create yard with role request
// 2. Publish some cars from that yard
// 3. Check publicCars - seller fields should be null or default
// 4. Approve yard (set roleStatus=APPROVED)
// 5. Wait for trigger to complete
// 6. Check publicCars - seller fields should be populated with:
//    - sellerDisplayName
//    - sellerPhone
//    - sellerWhatsappPhone
//    - sellerLogoUrl
//    - sellerCity
```

---

## Deployment Notes

### Files Changed

1. `functions/src/admin/adminDebugSearch.ts`
   - Updated `adminDebugSearchYardsHandler` (min 3 chars, CONTAINS, new fields)
   - Updated `adminDebugSearchCarsHandler` (min 4 chars, CONTAINS, dual source)

2. `functions/src/cars/publicCarSyncTrigger.ts`
   - Updated `onYardProfileChangeUpdatePublicCars` trigger
   - Added monitoring for roleStatus, status, primaryRole, isYard fields
   - Enhanced logging for yard approval events

### Deployment Command

```bash
cd functions
npm run build
firebase deploy --only functions:adminDebugSearchYards,functions:adminDebugSearchCars,functions:onYardProfileChangeUpdatePublicCars
```

### No Breaking Changes

- All changes are additive
- Existing behavior preserved
- No schema changes required
- No client-side changes needed

---

## Summary

✅ All requirements implemented  
✅ All acceptance criteria met  
✅ Safety checks in place  
✅ Ready for deployment

The implementation ensures:
1. Server-side search with minimum character requirements
2. CONTAINS search on specified fields
3. Dual-source search (publicCars + carSales)
4. Minimal payload fields
5. Immediate seller exposure on yard approval
6. No admin-only data leaks to public

**Status:** Ready for production deployment
