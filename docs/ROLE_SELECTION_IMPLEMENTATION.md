# Role Selection Implementation

## Overview

This document describes the implementation of single-role selection, legacy user handling, and admin role management in the Rent_a_Car app.

## Role Model

### Primary Roles (Security/Permissions)

Users have exactly **one primary role**:

- **PRIVATE_USER** (default) - Regular user who can buy and sell cars
- **AGENT** (privileged, requires approval) - Car agent
- **YARD** (privileged, requires approval) - Car yard/dealer
- **ADMIN** (privileged, admin-only) - System administrator

### Capabilities (Not Roles)

Buying and selling are **capabilities**, not roles:

- `canBuy: Boolean` (default: `true`) - User can search for cars to buy
- `canSell: Boolean` (default: `true`) - User can post cars for sale

**All users** (PRIVATE_USER, AGENT, YARD) can buy and sell by default. These are capabilities, not role restrictions.

### Legacy Roles (Deprecated)

- **BUYER** - Migrated to `PRIVATE_USER` with `canBuy=true`
- **SELLER** - Migrated to `PRIVATE_USER` with `canSell=true`

These roles are kept in the enum for backward compatibility but are not shown in the UI.

## Changes Made

### 1. Single Role Selection (Radio Buttons)

**Before**: Multi-select checkboxes allowing users to select multiple roles (canBuy, canSell, isAgent, isYard)

**After**: Single-select radio buttons requiring exactly one primary role selection:
- PRIVATE_USER (default)
- AGENT (requires approval)
- YARD (requires approval)

**Files Modified**:
- `app/src/main/java/com/rentacar/app/ui/auth/AuthScreen.kt` - Replaced checkboxes with radio buttons, shows only selectable roles
- `app/src/main/java/com/rentacar/app/data/auth/PrimaryRole.kt` - Added PRIVATE_USER, kept BUYER/SELLER for backward compatibility
- `app/src/main/java/com/rentacar/app/data/auth/UserProfile.kt` - Added `primaryRole`, `requestedRole`, `roleStatus` fields
- `app/src/main/java/com/rentacar/app/ui/auth/AuthViewModel.kt` - Updated signup to accept single `PrimaryRole`
- `app/src/main/java/com/rentacar/app/data/auth/AuthRepository.kt` - Updated signup logic for single role

### 2. Legacy User Handling (Blocking Screen)

**Implementation**: Legacy users (users without `primaryRole` field or with legacy BUYER/SELLER roles) are **blocked** from accessing the app until they select a role.

**Migration Logic**:
- Legacy `role == "BUYER"` or `"SELLER"` → Migrated to `primaryRole = "PRIVATE_USER"` with `canBuy=true`, `canSell=true`
- Legacy `role == "AGENT"` → Migrated to `primaryRole = "AGENT"` (if already approved)
- Legacy `role == "YARD"` → Migrated to `primaryRole = "YARD"` (if already approved)
- No role indication → Forces `SelectRoleScreen`

**Files Created**:
- `app/src/main/java/com/rentacar/app/ui/auth/SelectRoleScreen.kt` - Blocking screen for role selection

**Files Modified**:
- `app/src/main/java/com/rentacar/app/ui/navigation/NavGraph.kt` - Checks for legacy users and shows SelectRoleScreen
- `app/src/main/java/com/rentacar/app/ui/auth/AuthViewModel.kt` - Added `needsRoleSelection()` and `setPrimaryRole()` methods
- `app/src/main/java/com/rentacar/app/data/auth/AuthRepository.kt` - Added `setPrimaryRole()` method and migration logic in `ensureBackwardCompatibility()`

### 3. Approval Flow for Privileged Roles (SECURITY)

**Implementation**: When users select AGENT or YARD roles (during signup OR legacy role selection):
- **SECURITY**: Self-escalation is prevented
- `primaryRole` is set to "PRIVATE_USER" (safe default)
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
2. User selects **one** role from:
   - PRIVATE_USER (immediate access)
   - AGENT (pending approval)
   - YARD (pending approval)
3. If PRIVATE_USER: `primaryRole = "PRIVATE_USER"`, `canBuy=true`, `canSell=true`, `status="ACTIVE"`
4. If AGENT/YARD: `primaryRole = "PRIVATE_USER"`, `requestedRole = "AGENT"/"YARD"`, `roleStatus="PENDING"`, `status="PENDING_APPROVAL"`
5. User profile saved to Firestore
6. User proceeds to main app (with limited access if pending)

### Legacy User Login

1. User logs in
2. System checks `primaryRole` field
3. If missing or legacy BUYER/SELLER:
   - Migration logic runs:
     - BUYER/SELLER → PRIVATE_USER with `canBuy=true`, `canSell=true`
     - AGENT/YARD (if approved) → AGENT/YARD
     - No role → `primaryRole = null`
4. If `primaryRole == null`: **Blocked** → `SelectRoleScreen` shown
5. User must select PRIVATE_USER, AGENT, or YARD
6. After selection, user proceeds to main app

### Admin Approval Flow

1. Admin opens Admin Panel (Settings → Admin Panel)
2. Admin sees "Pending Requests" tab with users who have `roleStatus == "PENDING"`
3. Admin clicks "Approve" or "Reject"
4. Cloud Function `resolveRoleRequest` is called:
   - **APPROVE**: `primaryRole = requestedRole`, `requestedRole = null`, `roleStatus = "APPROVED"`, `status = "ACTIVE"`
   - **REJECT**: `requestedRole = null`, `roleStatus = "REJECTED"`, `primaryRole` stays as PRIVATE_USER
5. User's profile updated in Firestore
6. User sees updated role on next login/refresh

## Firestore Schema

### User Profile Document (`/users/{uid}`)

```typescript
{
  // ... existing fields ...
  
  // Primary role (single choice)
  primaryRole: "PRIVATE_USER" | "AGENT" | "YARD" | "ADMIN" | null,
  
  // Requested role (for pending approval)
  requestedRole: "AGENT" | "YARD" | null,
  
  // Role status
  roleStatus: "NONE" | "PENDING" | "APPROVED" | "REJECTED",
  
  // Capabilities (not roles)
  canBuy: boolean,  // Default: true
  canSell: boolean, // Default: true
  
  // Legacy fields (backward compatibility)
  isPrivateUser: boolean,  // true if primaryRole == "PRIVATE_USER"
  isAgent: boolean,         // true if primaryRole == "AGENT"
  isYard: boolean,          // true if primaryRole == "YARD"
  role: string,             // Legacy: "USER", "AGENT", etc.
  status: "ACTIVE" | "PENDING_APPROVAL" | "SUSPENDED",
  
  // Audit fields
  roleUpdatedAt: Timestamp | null,
  roleUpdatedByUid: string | null,
  roleUpdateReason: string | null
}
```

## Cloud Functions

### `setUserRole`

Admin-only function to set a user's primary role directly.

**Parameters**:
- `targetUid: string` - UID of user to update
- `primaryRole: "PRIVATE_USER" | "AGENT" | "YARD" | "ADMIN"` - New primary role
- `reason: string?` - Optional reason for role change

**Behavior**:
- Validates `primaryRole` is one of: PRIVATE_USER, AGENT, YARD, ADMIN
- Sets `primaryRole` directly
- Updates `canBuy=true`, `canSell=true` (all users can buy/sell)
- Updates legacy fields (`isAgent`, `isYard`, `isPrivateUser`)
- Clears `requestedRole` and sets `roleStatus="APPROVED"`

### `resolveRoleRequest`

Admin-only function to approve or reject a pending role request.

**Parameters**:
- `targetUid: string` - UID of user with pending request
- `action: "APPROVE" | "REJECT"` - Action to take
- `reason: string?` - Optional reason

**Behavior**:
- **APPROVE**: Sets `primaryRole = requestedRole`, clears `requestedRole`, sets `roleStatus="APPROVED"`, `status="ACTIVE"`
- **REJECT**: Clears `requestedRole`, sets `roleStatus="REJECTED"`, keeps `primaryRole` as-is (e.g., PRIVATE_USER)

## Security

1. **Self-escalation prevention**: Users cannot set their own `primaryRole` to AGENT/YARD/ADMIN. These must go through approval flow or admin action.
2. **Cloud Functions**: All cross-user role modifications happen via Cloud Functions using Admin SDK, not client-side writes.
3. **Firestore Rules**: Client-side rules prevent users from writing to other users' profiles. Only Cloud Functions can modify roles.

## Migration Notes

### For Existing Users

- Users with `role == "BUYER"` → `primaryRole = "PRIVATE_USER"`, `canBuy=true`, `canSell=true`
- Users with `role == "SELLER"` → `primaryRole = "PRIVATE_USER"`, `canBuy=true`, `canSell=true`
- Users with `role == "AGENT"` and `isAgent=true` → `primaryRole = "AGENT"` (if already approved)
- Users with `role == "YARD"` or `isYard=true` → `primaryRole = "YARD"` (if already approved)
- Users with no role indication → `primaryRole = null` → Forces `SelectRoleScreen`

### Backward Compatibility

- Legacy `role` field is kept and updated for backward compatibility
- Legacy `canBuy`/`canSell` fields are migrated to defaults (`true` for all users)
- Legacy `isPrivateUser` is derived from `primaryRole == "PRIVATE_USER"`

## Testing Checklist

- [x] New user signup with PRIVATE_USER → immediate access
- [x] New user signup with AGENT → pending approval, limited access
- [x] New user signup with YARD → pending approval, limited access
- [x] Legacy user with BUYER → migrated to PRIVATE_USER, can access app
- [x] Legacy user with SELLER → migrated to PRIVATE_USER, can access app
- [x] Legacy user with no role → forced to SelectRoleScreen
- [x] Admin approves AGENT request → user becomes AGENT
- [x] Admin rejects YARD request → user stays PRIVATE_USER
- [x] All users can buy and sell (capabilities, not roles)
