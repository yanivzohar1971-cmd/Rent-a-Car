# Multi-Tenancy Manual Test Plan

## Scope

This test plan verifies that all user-scoped data in the Rent-a-Car application is properly isolated per Firebase user. The goal is to ensure:

- **Data Isolation**: Each Firebase user can only see and modify their own data
- **No Cross-User Leakage**: Data created by User A is never visible or accessible to User B
- **Import Pipeline Safety**: All import operations (Excel imports, price lists, monthly reports) are scoped to the current user
- **Legacy Data Handling**: Existing data from pre-multi-tenant versions is correctly assigned to the first logged-in user via `UserUidBackfill`

### Areas Covered

- Core business data: Suppliers, Branches, Customers, Reservations, Payments, Agents, Car Types, Commission Rules, Requests, Car Sales
- Import data: Supplier Templates, Monthly Import Headers, Monthly Import Deals, Import Run Logs, Import Run Entries
- Price list data: Price List Headers, Price List Items

---

## Preconditions

### Required Setup

1. **Firebase Users**: Create at least 2 (preferably 3) test Firebase users:
   - **User A**: `user-a@test.com` (or equivalent)
   - **User B**: `user-b@test.com` (or equivalent)
   - **User C** (optional): `user-c@test.com` (or equivalent)

2. **Test Devices**:
   - Option A: Use 2-3 physical devices (one per user)
   - Option B: Use a single device with multiple app installations (debug + release, or use app cloning)
   - Option C: Use a single device and logout/login between users (less ideal but acceptable)

3. **Test Data**:
   - Sample Excel files for price list imports
   - Sample Excel files for monthly supplier imports (if available)
   - Backup files from pre-version-33 builds (for upgrade testing)

4. **Tools**:
   - Debug build of the app
   - Access to Android Logcat (via Android Studio or `adb logcat`)
   - Optional: Firebase Console access to verify user accounts
   - Optional: SQLite browser tool to inspect database directly (requires root or debug build with database export)

### Test Environment

- **Clean Install Scenario**: Fresh app installation with no existing data
- **Upgrade Scenario**: Install older build (pre-version-33), create data, then upgrade to current build

---

## Test Scenarios

### Group 1: Login and Baseline Isolation

#### MT-01: User A - Initial Data Creation

**Purpose**: Verify that User A can create core business data and it is stored with `user_uid`.

**Steps**:
1. Install the app (clean install or fresh data)
2. Log in as **User A**
3. Create the following data:
   - 2-3 Suppliers (e.g., "Supplier A1", "Supplier A2")
   - 1-2 Branches for each supplier
   - 2-3 Customers (e.g., "Customer A1", "Customer A2")
   - 1-2 Reservations linked to the above
   - 1 Agent (e.g., "Agent A1")
   - 1 Car Type (e.g., "Economy")
4. Navigate through all screens and verify data appears correctly
5. Take screenshots of key screens (Suppliers list, Customers list, Reservations list)

**Expected Result**:
- All created data is visible to User A
- Data appears in lists and detail screens
- No errors in Logcat related to `user_uid` or multi-tenancy

**Logcat Check**:
- Search for: `CurrentUserProvider`, `user_uid`, `UserUidBackfill`
- Verify no errors about missing `user_uid`

---

#### MT-02: User B - Empty State Verification

**Purpose**: Verify that User B sees no data from User A (complete isolation).

**Steps**:
1. **Option A (Different Device)**: Install app on a different device and log in as **User B**
   **Option B (Same Device)**: Log out from User A, log in as **User B**
2. Navigate to all main screens:
   - Suppliers list
   - Customers list
   - Reservations list
   - Agents list
   - Branches list (via Suppliers)
3. Check each list for any data

**Expected Result**:
- All lists are **empty** (no data from User A visible)
- No suppliers, customers, reservations, agents, or branches appear
- App does not crash or show errors

**Logcat Check**:
- Search for: `getAll`, `WHERE user_uid =`
- Verify queries include `user_uid` filtering

---

#### MT-03: User B - Create Own Data

**Purpose**: Verify that User B can create their own data independently.

**Steps**:
1. While logged in as **User B**, create:
   - 2 Suppliers (e.g., "Supplier B1", "Supplier B2")
   - 1 Branch for one supplier
   - 2 Customers (e.g., "Customer B1", "Customer B2")
   - 1 Reservation
   - 1 Agent (e.g., "Agent B1")
2. Verify all data appears correctly for User B

**Expected Result**:
- User B sees only their own data
- Data created by User B does not appear when switching back to User A

---

#### MT-04: User A - Verify Isolation After User B Activity

**Purpose**: Verify that User A's data remains isolated after User B has created data.

**Steps**:
1. Switch back to **User A** (logout User B, login User A)
2. Navigate through all screens:
   - Suppliers list (should show only User A's suppliers)
   - Customers list (should show only User A's customers)
   - Reservations list (should show only User A's reservations)
   - Agents list (should show only User A's agents)
3. Verify counts match what User A created (e.g., if User A created 3 suppliers, list shows exactly 3)

**Expected Result**:
- User A sees **only** their own data
- No data from User B is visible
- Counts match User A's original data creation

---

### Group 2: Price List Import (Excel)

#### MT-10: User A - Import Price List

**Purpose**: Verify that User A can import a supplier price list and it is stored with `user_uid`.

**Steps**:
1. Log in as **User A**
2. Navigate to a Supplier (e.g., "Supplier A1")
3. Open the price list management screen
4. Import a price list Excel file:
   - Select "Import Price List" or equivalent action
   - Choose a valid Excel file (`.xlsx` format)
   - Confirm import
5. Wait for import to complete
6. Verify the price list appears in the supplier's price lists
7. Open the price list details screen
8. Verify items are displayed correctly

**Expected Result**:
- Import completes successfully
- Price list header and items are visible
- Import log entry is created (if import logs are accessible in UI)

**Logcat Check**:
- Search for: `PriceListImportDispatcher`, `insertHeader`, `insertItems`
- Verify log entries show `user_uid` being set

---

#### MT-11: User A - Verify Import Logs

**Purpose**: Verify that import logs are created and scoped to User A.

**Steps**:
1. While logged in as **User A**, navigate to import logs (if available in UI)
2. Verify the price list import from MT-10 appears in the logs
3. Check log details:
   - Import timestamp
   - File name
   - Rows processed/created
   - Supplier ID matches the supplier used in MT-10

**Expected Result**:
- Import log entry exists for User A's price list import
- Log details are accurate

---

#### MT-12: User B - Verify No Access to User A's Price Lists

**Purpose**: Verify that User B cannot see User A's price lists.

**Steps**:
1. Log in as **User B**
2. Navigate to suppliers list
3. If User B has created suppliers, navigate to one
4. Check price lists for that supplier
5. Navigate to import logs (if available)

**Expected Result**:
- **If User B has no price lists**: Lists are empty
- **If User B has their own price lists**: Only User B's price lists appear
- **No price lists from User A are visible**
- Import logs (if accessible) show only User B's imports

---

#### MT-13: User B - Import Own Price List

**Purpose**: Verify that User B can import their own price list independently.

**Steps**:
1. While logged in as **User B**, navigate to a supplier (create one if needed)
2. Import a price list Excel file (can be the same file as User A used, or different)
3. Verify import completes
4. Verify price list appears for User B

**Expected Result**:
- Import succeeds for User B
- Price list is visible only to User B
- User A's price lists remain unaffected

---

#### MT-14: User A - Verify Isolation After User B Import

**Purpose**: Verify that User A's price lists remain isolated after User B imports.

**Steps**:
1. Switch back to **User A**
2. Navigate to the supplier used in MT-10
3. Verify the price list from MT-10 is still present
4. Verify no price lists from User B appear

**Expected Result**:
- User A's price lists are intact
- No cross-contamination from User B's imports

---

### Group 3: Monthly Deals / Headers Imports

#### MT-20: User A - Import Monthly Supplier Data

**Purpose**: Verify that User A can import monthly header/deal data and it is scoped correctly.

**Steps**:
1. Log in as **User A**
2. Navigate to a supplier (e.g., "Supplier A1")
3. Open import dialog (monthly Excel import)
4. Select a valid monthly supplier Excel file
5. Configure import settings (if applicable):
   - Select function code (1, 2, 3, etc.)
   - Select template (if required)
   - Specify year/month if needed
6. Execute import
7. Wait for import to complete
8. Verify import success message
9. Navigate to monthly reports or import summary (if available)

**Expected Result**:
- Import completes successfully
- Monthly headers and deals are created
- Import log entry is created
- Data appears in monthly reports/summaries for User A

**Logcat Check**:
- Search for: `ImportDispatcher`, `importFromSupplier`, `insertRun`, `insertEntry`
- Verify `user_uid` is set on all inserted entities

---

#### MT-21: User A - Verify Monthly Report Data

**Purpose**: Verify that monthly reports show only User A's imported data.

**Steps**:
1. While logged in as **User A**, navigate to monthly reports (if available)
2. Select the supplier and period used in MT-20
3. Verify report shows:
   - Correct number of headers/deals
   - Correct totals
   - Data matches the imported Excel file

**Expected Result**:
- Monthly report displays only User A's imported data
- Counts and totals are accurate

---

#### MT-22: User B - Verify No Access to User A's Monthly Imports

**Purpose**: Verify that User B cannot see User A's monthly import data.

**Steps**:
1. Log in as **User B**
2. Navigate to monthly reports (if available)
3. If User B has suppliers, check monthly reports for those suppliers
4. Check import logs (if accessible)

**Expected Result**:
- **If User B has no monthly imports**: Reports are empty or show "No data"
- **If User B has their own imports**: Only User B's data appears
- **No monthly import data from User A is visible**

---

#### MT-23: User B - Import Own Monthly Data

**Purpose**: Verify that User B can import monthly data independently.

**Steps**:
1. While logged in as **User B**, navigate to a supplier
2. Import monthly supplier Excel file
3. Verify import completes
4. Check monthly reports for User B

**Expected Result**:
- Import succeeds for User B
- Monthly data is visible only to User B
- User A's monthly data remains unaffected

---

### Group 4: Rollback and Delete Operations

#### MT-30: User A - Perform Import Rollback

**Purpose**: Verify that rollback operations only affect User A's data.

**Steps**:
1. Log in as **User A**
2. Perform a monthly import (if not already done in MT-20)
3. Note the number of headers/deals created
4. Navigate to import management (if rollback UI exists) or use a test action to trigger rollback
5. Execute rollback for the imported period/supplier
6. Verify data is deleted

**Expected Result**:
- Rollback succeeds
- Only User A's imported data is deleted
- Import logs reflect the rollback

**Logcat Check**:
- Search for: `rollbackImport`, `deleteByImport`
- Verify `user_uid` is used in delete queries

---

#### MT-31: User B - Verify No Impact from User A's Rollback

**Purpose**: Verify that User B's data is unaffected by User A's rollback.

**Steps**:
1. After MT-30, log in as **User B**
2. Navigate to monthly reports or import data
3. Verify User B's data (if any) is still intact

**Expected Result**:
- User B's data is unaffected
- No data loss for User B

---

#### MT-32: User A - Delete/Clear Operations

**Purpose**: Verify that delete/clear operations are scoped to the current user.

**Steps**:
1. Log in as **User A**
2. Create some test data (suppliers, customers, or imports)
3. Perform delete operations:
   - Delete a supplier
   - Delete a customer
   - Delete import logs (if UI supports it)
4. Verify only User A's data is deleted

**Expected Result**:
- Delete operations succeed
- Only User A's selected data is deleted
- User B's data remains untouched

---

### Group 5: Cloud Delta / Backup / Restore Checks

#### MT-40: User A - Cloud Delta Sync Verification

**Purpose**: Verify that cloud sync operations are user-scoped.

**Steps**:
1. Log in as **User A**
2. Note the counts of:
   - Suppliers
   - Customers
   - Reservations
   - Import runs
3. Trigger cloud delta sync (if available in UI or via test action)
4. Wait for sync to complete
5. Verify sync logs (if accessible) show counts matching User A's local data

**Expected Result**:
- Sync completes successfully
- Sync counts match User A's local data only
- No data from other users is synced

**Logcat Check**:
- Search for: `CloudDeltaSyncWorker`, `DataSyncCheckRepository`
- Verify queries filter by `user_uid`

---

#### MT-41: User A - Backup and Restore

**Purpose**: Verify that backup/restore operations preserve `user_uid` association.

**Steps**:
1. Log in as **User A**
2. Create test data (suppliers, customers, reservations, imports)
3. Perform a backup (export to file)
4. Note the backup file location
5. **Option A**: Clear app data or uninstall/reinstall app
   **Option B**: Log out and log in as a different user, then switch back
6. Restore from the backup file created in step 3
7. Log in as **User A**
8. Verify all restored data is visible to User A
9. Verify data counts match pre-backup state

**Expected Result**:
- Backup file is created successfully
- Restore completes successfully
- All restored data is visible to User A
- Restored data has `user_uid` set correctly (check via Logcat or direct DB inspection if possible)

**Logcat Check**:
- Search for: `UserUidBackfill`, `backfillUserUidForCurrentUser`
- Verify backfill runs after restore if needed

---

#### MT-42: User B - Verify No Impact from User A's Restore

**Purpose**: Verify that User B's data is unaffected by User A's restore operation.

**Steps**:
1. After MT-41, log in as **User B**
2. Verify User B's data (if any) is still intact
3. Verify no data from User A's restore appears for User B

**Expected Result**:
- User B's data remains unaffected
- No cross-contamination from User A's restore

---

### Group 6: Upgrade & Legacy Data

#### MT-50: Pre-Upgrade - Create Legacy Data

**Purpose**: Create data in a pre-version-33 build to test upgrade behavior.

**Steps**:
1. Install an older build of the app (version with DB schema 32 or earlier)
2. **Do NOT log in** (or log in with a test account if required)
3. Create test data:
   - 2-3 Suppliers
   - 2-3 Customers
   - 1-2 Reservations
   - If possible, perform an import (may not be available in older builds)
4. Note the data counts
5. **Do NOT log out** (keep the app state)

**Expected Result**:
- Data is created successfully in the old build
- Data exists in the database without `user_uid` (this is expected for pre-version-33)

---

#### MT-51: Upgrade to Current Build

**Purpose**: Verify that the upgrade process adds `user_uid` columns and triggers backfill.

**Steps**:
1. Upgrade the app to the current build (version with DB schema 33)
2. **Do NOT uninstall** - perform an in-place upgrade
3. Open the app
4. Log in as **User A** (the first user to log in after upgrade)
5. Wait for app to fully load
6. Check Logcat for migration and backfill messages

**Expected Result**:
- App opens without crashing
- Migration 32→33 executes successfully
- `UserUidBackfill` runs after login
- No errors in Logcat

**Logcat Check**:
- Search for: `Migration`, `Starting migration 32->33`, `UserUidBackfill`, `backfillUserUidForCurrentUser`
- Verify migration completes and backfill runs

---

#### MT-52: User A - Verify Legacy Data After Upgrade

**Purpose**: Verify that legacy data is correctly assigned to User A.

**Steps**:
1. While logged in as **User A** (after MT-51), navigate through all screens
2. Verify all data created in MT-50 is visible:
   - Suppliers list shows the suppliers from MT-50
   - Customers list shows the customers from MT-50
   - Reservations list shows the reservations from MT-50
3. Verify counts match MT-50 data

**Expected Result**:
- All legacy data is visible to User A
- Data counts match pre-upgrade state
- No data is missing

---

#### MT-53: User B - Verify No Access to Legacy Data

**Purpose**: Verify that User B cannot see legacy data that was assigned to User A.

**Steps**:
1. Log out from **User A**
2. Log in as **User B** (a different Firebase user)
3. Navigate through all screens
4. Verify lists are empty (or show only User B's own data if they created any)

**Expected Result**:
- User B sees **no data** from the legacy pre-upgrade data
- Legacy data remains associated only with User A
- No cross-user leakage

---

#### MT-54: User B - Create Data After Upgrade

**Purpose**: Verify that User B can create new data normally after upgrade.

**Steps**:
1. While logged in as **User B**, create:
   - 1-2 Suppliers
   - 1-2 Customers
   - 1 Reservation
2. Verify data appears correctly for User B

**Expected Result**:
- User B can create data normally
- New data is scoped to User B
- User A's legacy data remains unaffected

---

## Logging and Troubleshooting

### Key Logcat Filters

Use the following filters in Logcat to monitor multi-tenancy behavior:

1. **User Authentication**:
   ```
   CurrentUserProvider
   requireCurrentUid
   getCurrentUid
   ```

2. **Database Operations**:
   ```
   user_uid
   WHERE user_uid
   ```

3. **Import Operations**:
   ```
   ImportDispatcher
   PriceListImportDispatcher
   ExcelImportService
   insertRun
   insertEntry
   ```

4. **Migration and Backfill**:
   ```
   Migration
   MIGRATION_32_33
   UserUidBackfill
   backfillUserUidForCurrentUser
   ```

5. **DAO Queries** (verify filtering):
   ```
   getAll
   getById
   findBySupplier
   ```

### What to Capture if a Failure is Found

If a test case fails, capture the following information:

1. **Screenshots**:
   - Screenshot of the failing screen
   - Screenshot showing unexpected data
   - Screenshot of user account (to confirm which user is logged in)

2. **Logcat Output**:
   - Full logcat output from the time of the failure
   - Filter for the keywords listed above
   - Save logcat to a file: `adb logcat > test_failure.log`

3. **Test Data**:
   - Which users were involved (User A, User B, etc.)
   - What data was created by each user
   - Sample Excel files used for imports (if applicable)
   - Database version before and after upgrade (if testing upgrade scenario)

4. **Steps to Reproduce**:
   - Exact sequence of steps that led to the failure
   - Device/OS information
   - App version/build number

5. **Database Inspection** (if possible):
   - Export database file (requires root or debug build with export capability)
   - Check `user_uid` values in affected tables
   - Verify queries are filtering correctly

### Common Issues and Solutions

**Issue**: User B sees data from User A
- **Check**: Verify `CurrentUserProvider` is returning the correct UID
- **Check**: Verify DAO queries include `WHERE user_uid = :currentUid`
- **Check**: Verify entities have `user_uid` set before insert

**Issue**: Import fails with "No user logged in" error
- **Check**: Verify user is logged in before import
- **Check**: Verify `CurrentUserProvider.requireCurrentUid()` is called

**Issue**: Legacy data not visible after upgrade
- **Check**: Verify `UserUidBackfill` ran after login
- **Check**: Verify migration 32→33 completed successfully
- **Check**: Verify `user_uid` column exists in tables

**Issue**: Rollback affects wrong user's data
- **Check**: Verify rollback queries include `user_uid` filtering
- **Check**: Verify `ImportTransactionDao.rollbackImport()` receives correct `userUid`

---

## Pass/Fail Criteria

### Overall Pass Criteria

The multi-tenancy implementation is considered **PASSED** if:

1. ✅ **Complete Data Isolation**: 
   - No scenario exists where User A can see or access data created by User B
   - No scenario exists where User B can see or access data created by User A
   - All lists, detail screens, and reports show only the current user's data

2. ✅ **Import Pipeline Safety**:
   - All price list imports are scoped to the current user
   - All monthly import operations (headers, deals, logs) are scoped to the current user
   - Import logs are user-specific and not visible across users

3. ✅ **Delete/Rollback Safety**:
   - All delete operations affect only the current user's data
   - Rollback operations affect only the current user's imported data
   - No cross-user data deletion occurs

4. ✅ **Upgrade Safety**:
   - Legacy data (pre-version-33) is correctly assigned to the first logged-in user
   - `UserUidBackfill` runs correctly after login
   - Legacy data is not visible to other users after upgrade

5. ✅ **Backup/Restore Safety**:
   - Backup files contain only the current user's data
   - Restored data is correctly associated with the restoring user
   - Restore operations do not affect other users' data

6. ✅ **No Data Leakage**:
   - No SQL queries execute without `user_uid` filtering on user-scoped tables
   - No entities are inserted without `user_uid` set
   - No cross-user data appears in any UI screen

### Overall Fail Criteria

The multi-tenancy implementation is considered **FAILED** if:

1. ❌ **Any Cross-User Data Visibility**:
   - User A can see data created by User B (or vice versa)
   - Import logs show entries from other users
   - Reports or summaries include data from other users

2. ❌ **Cross-User Data Modification**:
   - User A can delete or modify data created by User B
   - Rollback operations affect other users' data
   - Import operations overwrite or affect other users' data

3. ❌ **Missing User Scoping**:
   - Any DAO query on user-scoped tables executes without `user_uid` filtering
   - Any entity is inserted without `user_uid` set
   - Logcat shows queries without `WHERE user_uid` clause

4. ❌ **Upgrade/Backfill Failures**:
   - Legacy data is not assigned to any user after upgrade
   - `UserUidBackfill` does not run or fails silently
   - Legacy data becomes visible to all users (not just the first logged-in user)

5. ❌ **Backup/Restore Issues**:
   - Backup files contain data from multiple users
   - Restored data is not correctly associated with the restoring user
   - Restore operations affect other users' data

### Test Execution Summary

After completing all test cases, document:

- **Total Test Cases**: Number of test cases executed
- **Passed**: Number of test cases that passed
- **Failed**: Number of test cases that failed
- **Blocked**: Number of test cases that could not be executed (with reason)
- **Overall Result**: PASS / FAIL

**Final Decision**: 
- If **all test cases pass** → Multi-tenancy implementation is **VERIFIED**
- If **any test case fails** → Multi-tenancy implementation has **GAPS** that must be addressed before release

---

## Appendix: Quick Reference

### Test User Accounts

- **User A**: `user-a@test.com` (or equivalent)
- **User B**: `user-b@test.com` (or equivalent)
- **User C**: `user-c@test.com` (optional)

### Key Screens to Verify

- Suppliers list
- Customers list
- Reservations list
- Agents list
- Branches list (via Suppliers)
- Price lists (via Suppliers)
- Monthly reports (if available)
- Import logs (if available)

### Critical Logcat Keywords

- `CurrentUserProvider`
- `user_uid`
- `WHERE user_uid`
- `UserUidBackfill`
- `ImportDispatcher`
- `PriceListImportDispatcher`
- `MIGRATION_32_33`

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-XX  
**Test Plan Owner**: QA Team / Development Team  
**Related Documentation**: 
- [Database Migrations](MIGRATIONS.md)
- [Multi-Tenancy Overview](MULTITENANCY_OVERVIEW.md)
- [Migration Safety Analysis](MIGRATION_SAFETY_ANALYSIS.md)

