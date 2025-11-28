# Role Selection Implementation

## Overview

This document describes the implementation of single-role selection, legacy user handling, and admin role management in the Rent_a_Car app.

## Changes Made

### 1. Single Role Selection (Radio Buttons)

**Before**: Multi-select checkboxes allowing users to select multiple roles (canBuy, canSell, isAgent, isYard)

**After**: Single-select radio buttons requiring exactly one primary role selection

**Files Modified**:
- `app/src/main/java/com/rentacar/app/ui/auth/AuthScreen.kt` - Replaced checkboxes with radio buttons
- `app/src/main/java/com/rentacar/app/data/auth/PrimaryRole.kt` - New enum for role types
- `app/src/main/java/com/rentacar/app/data/auth/UserProfile.kt` - Added `primaryRole`, `requestedRole`, `roleStatus` fields
- `app/src/main/java/com/rentacar/app/ui/auth/AuthViewModel.kt` - Updated signup to accept single `PrimaryRole`
- `app/src/main/java/com/rentacar/app/data/auth/AuthRepository.kt` - Updated signup logic for single role

### 2. Legacy User Handling (Blocking Screen)

**Implementation**: Legacy users (users without `primaryRole` field) are **blocked** from accessing the app until they select a role.

**Files Created**:
- `app/src/main/java/com/rentacar/app/ui/auth/SelectRoleScreen.kt` - Blocking screen for role selection

**Files Modified**:
- `app/src/main/java/com/rentacar/app/ui/navigation/NavGraph.kt` - Checks for legacy users and shows SelectRoleScreen
- `app/src/main/java/com/rentacar/app/ui/auth/AuthViewModel.kt` - Added `needsRoleSelection()` and `setPrimaryRole()` methods
- `app/src/main/java/com/rentacar/app/data/auth/AuthRepository.kt` - Added `setPrimaryRole()` method

### 3. Approval Flow for Privileged Roles (SECURITY)

**Implementation**: When users select AGENT or YARD roles (during signup OR legacy role selection):
- **SECURITY**: Self-escalation is prevented
- `primaryRole` is set to "BUYER" (safe default)
- `requestedRole` is set to "AGENT" or "YARD"
- `roleStatus` is set to "PENDING"
- `status` is set to "PENDING_APPROVAL"
- User must wait for admin approval before gaining privileged access

**Files Modified**:
- `app/src/main/java/com/rentacar/app/data/auth/AuthRepository.kt` - Signup and setPrimaryRole logic handles privileged roles
- `app/src/main/java/com/rentacar/app/ui/auth/SelectRoleScreen.kt` - Shows warning about approval requirement

## User Flow

### New User Signup
1. User fills signup form
2. User **must** select exactly one role (radio buttons)
3. If AGENT/YARD selected → role request is created (pending approval)
4. If BUYER/SELLER selected → role is set immediately (active)

### Legacy User Login
1. User logs in successfully
2. System checks if `primaryRole` is missing
3. If missing → **SelectRoleScreen** is shown (blocking)
4. User **must** select a role to continue
5. Role is saved to Firestore
6. User can now access the app

### Admin Approval (Future)
- Admins can approve/reject role requests via Admin Panel
- Cloud Functions handle the approval process securely

## Data Model

### UserProfile Fields

```kotlin
data class UserProfile(
    // ... existing fields ...
    
    // New single-role system
    val primaryRole: String? = null,        // "BUYER" | "SELLER" | "AGENT" | "YARD"
    val requestedRole: String? = null,       // Same enum - role user requested (for approval)
    val roleStatus: String = "NONE",         // "NONE" | "PENDING" | "APPROVED" | "REJECTED"
    val roleUpdatedAt: Long? = null,         // Timestamp when role was last updated
    val roleUpdatedByUid: String? = null,     // UID of admin who updated the role
    val roleUpdateReason: String? = null     // Optional reason for role change
)
```

## Backward Compatibility

The implementation maintains backward compatibility:

1. **Legacy fields preserved**: `isAgent`, `isYard`, `canBuy`, `canSell`, `role` fields are still updated for compatibility
2. **Automatic migration**: Legacy users are prompted to select a role on first login
3. **Derived fields**: `primaryRole` is derived from legacy fields if missing (for reading old data)

## Security

- **No self-escalation**: Users cannot set themselves as AGENT/YARD directly
- **Approval required**: Privileged roles require admin approval
- **Client-side writes**: Users can only update their own profile (via `setPrimaryRole` for legacy migration)
- **Admin operations**: All admin role changes go through Cloud Functions (see Admin Management docs)

## Testing Checklist

- [ ] New user signup with BUYER role
- [ ] New user signup with SELLER role
- [ ] New user signup with AGENT role (should create pending request)
- [ ] New user signup with YARD role (should create pending request)
- [ ] Legacy user login (should show SelectRoleScreen)
- [ ] Legacy user selects role and continues
- [ ] User cannot proceed without selecting a role
- [ ] Validation error shows when trying to submit without selection

### 4. Admin Role Management

**Implementation**: Complete admin panel for managing user roles.

**Files Created**:
- `app/src/main/java/com/rentacar/app/ui/admin/AdminRoleManagementScreen.kt` - Admin UI with tabs for pending requests and user search
- `app/src/main/java/com/rentacar/app/ui/admin/AdminViewModel.kt` - ViewModel for admin operations
- `app/src/main/java/com/rentacar/app/data/auth/AdminRepository.kt` - Repository for admin checks
- `functions/src/index.ts` - Cloud Functions for secure role management

**Files Modified**:
- `app/src/main/java/com/rentacar/app/ui/screens/SettingsReportsScreens.kt` - Added "Admin Panel" button (visible only to admins)
- `app/src/main/java/com/rentacar/app/ui/navigation/NavGraph.kt` - Added AdminRoleManagement route

**Features**:
- **Pending Requests Tab**: Lists users with `roleStatus == "PENDING"`, allows Approve/Reject
- **User Search Tab**: Search users by email/phone/UID, view profile, set role manually
- **Security**: All cross-user writes go through Cloud Functions (Admin SDK), no client-side writes
- **Admin Verification**: Uses Firestore `/config/admins` document with UID allowlist

## Admin Setup

### Setting Up Admins

1. **Create Admin Config Document in Firestore**:
   - Collection: `config`
   - Document ID: `admins`
   - Field: `uids` (Array of strings)
   - Example:
     ```json
     {
       "uids": ["admin-uid-1", "admin-uid-2"]
     }
     ```

2. **Deploy Cloud Functions**:
   ```bash
   cd functions
   npm install
   npm run build
   firebase deploy --only functions
   ```

### Using Admin Panel

1. **Access**: Settings screen → "ניהול תפקידים - מנהל" button (only visible to admins)
2. **Pending Requests**: View and approve/reject role requests
3. **User Search**: Search for users and manually set their roles
4. **All Changes**: Logged with `roleUpdatedByUid`, `roleUpdatedAt`, and `roleUpdateReason`

## Firestore Document Structure

### User Profile (`/users/{uid}`)

```json
{
  "uid": "user123",
  "email": "user@example.com",
  "primaryRole": "BUYER",           // Current active role
  "requestedRole": "AGENT",          // Requested role (if pending)
  "roleStatus": "PENDING",           // "NONE" | "PENDING" | "APPROVED" | "REJECTED"
  "roleUpdatedAt": 1234567890,       // Timestamp
  "roleUpdatedByUid": "admin-uid",   // Admin who made the change
  "roleUpdateReason": "Approved for business use",  // Optional reason
  "status": "PENDING_APPROVAL"       // "ACTIVE" | "PENDING_APPROVAL" | "SUSPENDED"
}
```

## Next Steps

1. Test the approval flow end-to-end
2. Deploy Cloud Functions to production
3. Set up admin UIDs in Firestore `/config/admins`

