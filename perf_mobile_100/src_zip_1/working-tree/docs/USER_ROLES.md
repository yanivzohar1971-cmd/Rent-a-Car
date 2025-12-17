# User Roles Management

## Overview

The Rent_a_Car app supports multiple user roles and capabilities:
- **AGENT**: Business user (agent) - requires approval
- **YARD**: Business user (car dealer/yard) - requires approval
- **BUYER**: Private user who wants to search for cars to buy
- **SELLER**: Private user who wants to post cars for sale

User roles are stored in Firestore under `/users/{uid}` as boolean capability flags:
- `isAgent`: Boolean - true if user is an agent
- `isYard`: Boolean - true if user is a yard/dealer
- `canBuy`: Boolean - true if user can search for cars to buy
- `canSell`: Boolean - true if user can post cars for sale
- `isPrivateUser`: Boolean - automatically derived from `canBuy || canSell`
- `status`: String - "ACTIVE", "PENDING_APPROVAL", or "SUSPENDED"

## Backward Compatibility

The app maintains backward compatibility with existing users:
- Legacy users without the new role fields default to:
  - `isAgent = false`
  - `isYard = false`
  - `canBuy = false`
  - `canSell = false`
  - `isPrivateUser = false`
  - `status = "ACTIVE"`
- If a legacy user has `role == "AGENT"`, it is automatically mapped to `isAgent = true` and `status = "ACTIVE"`

## Setting Roles for Existing Users (One-Time Operation)

### Method 1: Manual Update via Firebase Console (Recommended)

This is the safest method and does not require any code changes or Firestore rule modifications.

#### Steps:

1. **Open Firebase Console**
   - Go to https://console.firebase.google.com
   - Select your project
   - Navigate to **Firestore Database** in the left sidebar

2. **Locate the User Document**
   - Open the `users` collection
   - Find the document with the user's UID (you can find the UID from Firebase Authentication > Users)
   - Click on the document to open it

3. **Update Role Fields**
   - Click **"Add field"** or edit existing fields
   - Add/update the following boolean fields as needed:
     - `isAgent`: Set to `true` if the user is an agent
     - `isYard`: Set to `true` if the user is a yard/dealer
     - `canBuy`: Set to `true` if the user can search for cars to buy
     - `canSell`: Set to `true` if the user can post cars for sale
   - **Important**: Set `status` field:
     - For agents or yards: Set to `"PENDING_APPROVAL"` (requires admin approval)
     - For regular users: Set to `"ACTIVE"` (immediate access)
   - The `isPrivateUser` field will be automatically calculated by the app (`canBuy || canSell`)

4. **Example Document Structure**
   ```json
   {
     "uid": "user123",
     "email": "user@example.com",
     "displayName": "John Doe",
     "isAgent": true,
     "isYard": false,
     "canBuy": false,
     "canSell": false,
     "isPrivateUser": false,
     "status": "ACTIVE"
   }
   ```

5. **Save Changes**
   - Click **"Update"** to save the changes

6. **Refresh Profile in App**
   - The user needs to log out and log back in, OR
   - Call `authViewModel.refreshUserProfile()` from the app (if you add a refresh button in Settings)

### Method 2: Using Cloud Function (Optional - Future Enhancement)

If you need to set roles programmatically for multiple users, you can create a Cloud Function. This requires:
- Firebase Admin SDK setup
- Proper authentication/authorization (admin-only access)
- Deployment of the Cloud Function

**Note**: This method is not implemented by default. If needed, it can be added as a separate enhancement.

## Using UserRoleResolver in Code

The app provides a centralized `UserRoleResolver` helper for role checks:

```kotlin
import com.rentacar.app.data.auth.UserRoleResolver

// Check if user is an agent
if (UserRoleResolver.isAgent(profile)) {
    // Show agent-only features
}

// Check if user can buy
if (UserRoleResolver.canBuy(profile)) {
    // Show car search features
}

// Check if user is active
if (UserRoleResolver.isActive(profile)) {
    // Allow access
}

// Check multiple roles
if (UserRoleResolver.hasAnyRole(profile, "AGENT", "YARD")) {
    // Show business user features
}

// Get all roles
val roles = UserRoleResolver.getRoles(profile)
```

## Profile Refresh

After updating roles in Firebase Console, users need to refresh their profile:

1. **Automatic**: Profile is refreshed on next login
2. **Manual**: Call `authViewModel.refreshUserProfile()` from the app

## Firestore Document Path

- **Collection**: `users`
- **Document ID**: User's Firebase Auth UID
- **Full Path**: `/users/{uid}`

## Security Notes

- **Firestore Rules**: The current implementation does NOT allow client-side cross-user writes. Only the user can update their own profile (or admins via Firebase Console).
- **Admin Access**: Role updates should only be done by administrators via Firebase Console or a secure Cloud Function.
- **Status Field**: The `status` field controls account access:
  - `"ACTIVE"`: Full access
  - `"PENDING_APPROVAL"`: Limited access (for agents/yards awaiting approval)
  - `"SUSPENDED"`: No access

## Troubleshooting

### User doesn't see role changes after update
- Ensure the user logs out and logs back in
- Or call `authViewModel.refreshUserProfile()` to force a refresh

### Legacy user not recognized as agent
- Check if the user document has `role == "AGENT"` field
- The app automatically maps this to `isAgent = true` for backward compatibility
- For new role system, explicitly set `isAgent = true` in Firestore

### Profile fields missing
- The app handles missing fields gracefully with default values
- All new fields default to `false` or `"ACTIVE"` for backward compatibility

