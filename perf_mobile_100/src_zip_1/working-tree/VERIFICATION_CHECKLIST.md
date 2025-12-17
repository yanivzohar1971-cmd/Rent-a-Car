# Verification Checklist - Admin Errors & Promotion Flow

## Quick Verification Steps

### 1. Test Admin Error Handling

#### A. Open DevTools Console
- Press F12 → Console tab
- Navigate to any Admin page
- Look for error logs with format:
  ```
  Admin<PAGE_NAME> load error: ...
  Error code: ...
  Error message: ...
  Full error: ...
  ```

#### B. Check Error Banners
- Error banners should **NOT** appear by default
- They should **ONLY** appear when:
  - Real Firestore permission errors occur
  - Network failures occur
  - Actual data loading fails

#### C. Test Permission Errors (Optional)
- Log in as non-admin user
- Try to access `/admin/promotion-products`
- Should redirect to `/account` (not show error banner)
- If error appears, check console for `permission-denied` code

### 2. Test Promotion Flow (End-to-End)

#### A. Admin: Create Promotion Product
1. Log in as Admin user
2. Navigate to `/admin/promotion-products`
3. Click "+ הוספת מבצע חדש"
4. Fill form:
   - קוד פנימי: `TEST_CAR_BOOST`
   - שם עברי: `קידום בדיקה`
   - סוג מבצע: `BOOST`
   - מחיר: `100`
   - משך (ימים): `7`
   - Scope (via tab): `PRIVATE_SELLER_AD` or `YARD_CAR`
5. Click "שמור"
6. ✅ Verify: Product appears in table

#### B. Seller: Purchase Promotion (If PRIVATE_SELLER_AD)
1. Log in as Private Seller
2. Navigate to `/sell`
3. Fill car ad form
4. Scroll to promotion section
5. ✅ Verify: Promotion product created above appears in list
6. Select promotion and complete ad creation
7. ✅ Verify: Order created successfully

#### C. Yard: Purchase Promotion (If YARD_CAR or YARD_BRAND)
1. Log in as Yard user
2. Navigate to `/yard/promotions` (for YARD_BRAND)
   OR `/yard/fleet` → Click promotion on car (for YARD_CAR)
3. ✅ Verify: Promotion products appear
4. Select and purchase promotion
5. ✅ Verify: Success message appears

#### D. Admin: View Orders
1. Log in as Admin
2. Navigate to `/admin/promotion-orders`
3. ✅ Verify: Orders from step B/C appear in list
4. Click "סמן כשולם" on an order
5. ✅ Verify: Order status changes to PAID

### 3. Check Firestore Collections

#### Verify Collections Exist:
- `promotionProducts` - Should contain test product from step 2A
- `promotionOrders` - Should contain orders from steps 2B/2C
- `users` - Should contain user profiles with `isAdmin: true` for admin users

#### Verify User Profile:
- Open Firestore Console
- Navigate to `/users/{your-uid}`
- ✅ Verify: `isAdmin: true` field exists and is `true`

### 4. Check Firebase Project

#### Verify Project Configuration:
- Open `web/src/firebase/firebaseClient.ts`
- ✅ Verify: `projectId: "carexpert-94faa"` (or your correct project ID)
- ✅ Verify: Config matches Firebase Console settings

### 5. Common Issues & Solutions

#### Issue: Error banner appears immediately on page load
**Solution**: Check console for error code. If `permission-denied`, verify:
- User has `isAdmin: true` in Firestore `/users/{uid}`
- Firestore security rules allow Admin read access

#### Issue: Promotion products don't appear in client-side selector
**Solution**: Check:
- Product `isActive: true`
- Product `isArchived: false` (or field doesn't exist)
- Product `scope` matches selector scope:
  - `PRIVATE_SELLER_AD` for sellers
  - `YARD_CAR` for yard car promotions
  - `YARD_BRAND` for yard brand promotions

#### Issue: Orders don't appear in Admin orders page
**Solution**: Check:
- Order was created successfully (check Firestore `promotionOrders` collection)
- Order `userId` matches logged-in user
- Admin has read access to `promotionOrders` collection

#### Issue: Build errors or TypeScript errors
**Solution**: Run:
```bash
cd web
npm run build
```
Check output for specific error messages and fix accordingly.

## Expected Behavior Summary

✅ **Error Banners**: Only show on real failures, not by default
✅ **Console Logs**: Detailed error information for debugging
✅ **Promotion Flow**: End-to-end works (Admin creates → Client purchases → Admin views)
✅ **Navigation**: All Admin pages accessible from `/account` when logged in as admin
✅ **Error Messages**: Clear, helpful messages (especially for permission issues)

## If Issues Persist

1. **Check Console Logs**: Detailed error information is now logged
2. **Check Firestore Rules**: Verify Admin users have read/write access
3. **Check User Profile**: Verify `isAdmin: true` field exists
4. **Check Collections**: Verify required collections exist in Firestore
5. **Check Network**: Verify Firebase connection is working

---

**Note**: This checklist should be used after deploying the fixes to verify everything works correctly in production.

