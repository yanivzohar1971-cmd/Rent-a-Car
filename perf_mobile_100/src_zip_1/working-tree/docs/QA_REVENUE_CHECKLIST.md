# QA Checklist – Revenue, Billing & Promotions

## 1. Overview

This checklist covers manual QA scenarios for all revenue and billing flows in the Rent a Car web application. It verifies that:

- Promotion purchases (private seller + yard) are correctly tracked and billed
- Billing plans (FREE/PLUS/PRO) quotas and pricing work as configured
- Revenue aggregation in Admin Dashboard matches actual transactions
- Usage warnings appear at correct thresholds
- CSV export contains accurate revenue data
- Role separation is maintained (Admin sees all, Yard/Private see only their own)

**Scope**: This checklist focuses on financial flows and does not cover general UI/UX testing unless it relates to billing or promotions.

**Prerequisites**: 
- Access to Firebase Console for data verification
- Test users for each role (Admin, Yard FREE/PLUS/PRO, Private Seller FREE/PLUS/PRO)
- Admin access to view revenue dashboard

---

## 2. Roles & Test Data

### Required Test Users

1. **Admin User**
   - Role: `isAdmin: true`
   - Access: Full admin dashboard, revenue dashboard, promotion products/orders management

2. **Yard Users** (3 accounts needed)
   - **Yard FREE**: `subscriptionPlan: 'FREE'`, `isYard: true`
   - **Yard PLUS**: `subscriptionPlan: 'PLUS'`, `isYard: true`
   - **Yard PRO**: `subscriptionPlan: 'PRO'`, `isYard: true`

3. **Private Seller Users** (3 accounts needed)
   - **Private FREE**: `subscriptionPlan: 'FREE'`, `canSell: true`, `isYard: false`
   - **Private PLUS**: `subscriptionPlan: 'PLUS'`, `canSell: true`, `isYard: false`
   - **Private PRO**: `subscriptionPlan: 'PRO'`, `canSell: true`, `isYard: false`

### Recommended Seed Data

- **For Yard Users**: 5-10 cars per yard (mix of published/unpublished)
- **For Private Sellers**: 1-3 car listings per seller
- **Promotion Products**: At least 3 active products per scope (PRIVATE_SELLER_AD, YARD_CAR, YARD_BRAND)
- **Test Leads**: 
  - Current month: Vary usage to test quota warnings (e.g., 8/10 for FREE, 45/50 for PLUS)
  - Previous month: Some leads to test date range filtering
- **Promotion Orders**: Mix of PAID and DRAFT orders across different dates

### Billing Configuration Reference

Current quotas (from `billingConfig.ts`):

**YARD Plans:**
- FREE: 10 free leads/month, 15 ₪ per billable lead
- PLUS: 50 free leads/month, 10 ₪ per billable lead
- PRO: 999 free leads/month (effectively unlimited), 0 ₪ per lead

**PRIVATE Plans:**
- FREE: 5 free leads/month, 12 ₪ per billable lead
- PLUS: 25 free leads/month, 8 ₪ per billable lead
- PRO: 999 free leads/month (effectively unlimited), 0 ₪ per lead

**Warning Threshold**: 80% usage (`UPGRADE_WARN_THRESHOLD = 0.8`)

---

## 3. Private Seller Promotions

### 3.1 Create & Promote a New Listing

**Steps:**
1. Login as Private Seller (FREE plan)
2. Navigate to `/sell` (SellCarPage)
3. Fill out car listing form completely
4. In the promotion step, select a promotion product (e.g., BOOST, HIGHLIGHT)
5. Review order summary (should show product name, price)
6. Complete the listing creation

**Expected Results:**

**UI:**
- Listing appears in seller's account page (`/seller/account`)
- Listing shows promotion badge/indicator in seller's view
- In search (`/cars`), promoted listing appears with:
  - Visual highlight (if HIGHLIGHT product)
  - Boosted position (if BOOST product)
  - Badge indicating promotion

**Admin Revenue Dashboard (`/admin/revenue-dashboard`):**
- Filter: Current month, Scope = PRIVATE
- Should show a line item:
  - Source: `PROMOTION_PRIVATE`
  - Entity ID: Seller's user ID
  - Display Name: Seller's full name/email
  - Count: 1
  - Unit Price: Product price from promotion product
  - Total Amount: Product price

**Promotion Orders (`/admin/promotion-orders`):**
- Order should appear with:
  - Status: `PAID` (if simulated payment)
  - Scope: `PRIVATE_SELLER_AD`
  - Total Amount: Product price
  - Items: Array with product details

**CSV Export:**
- Export from Admin Revenue Dashboard
- Should include row with promotion data matching dashboard line item

---

### 3.2 Promote an Existing Listing

**Steps:**
1. Login as Private Seller
2. Navigate to `/seller/account` (SellerAccountPage)
3. Find an existing car listing (published)
4. Click "Promote" or similar action button (if available)
5. Select promotion product from dialog
6. Confirm purchase

**Expected Results:**

**Dialog Behavior:**
- Dialog shows available promotion products for `PRIVATE_SELLER_AD` scope
- Products show name, description, price
- Order summary shows total before confirmation

**After Purchase:**
- Listing shows updated promotion status
- Promotion effects apply in search (badges, positioning)

**Revenue Tracking:**
- New order appears in `/admin/promotion-orders`
- Revenue dashboard shows new line item for current period
- CSV export includes the new transaction

**Edge Cases:**
- If listing is unpublished, promotion should still apply when listing is published
- If seller has multiple promotions, all should stack correctly

---

## 4. Yard Promotions

### 4.1 Yard Brand Promotion

**Steps:**
1. Login as Yard user (PLUS or PRO plan recommended)
2. Navigate to `/yard/promotions` (YardPromotionsPage)
3. View "Brand-Level Promotion Products" section
4. Select a YARD_BRAND promotion product (e.g., "מגרש מומלץ")
5. Click "רכש קידום" (Purchase Promotion)
6. Confirm the purchase

**Expected Results:**

**Yard Promotions Page:**
- After purchase, "Current Promotion" section shows:
  - Badge: "מגרש מומלץ" or similar
  - Expiration date (if durationDays set)
  - Status indicator

**Search & Public Yard Page:**
- Yard name appears with "מגרש מומלץ" badge
- Yard appears in recommended/featured strips (if `featuredInStrips: true`)
- Yard's cars may appear in featured positions

**Admin Revenue Dashboard:**
- Filter: Current month, Scope = YARD
- Line item:
  - Source: `PROMOTION_YARD`
  - Entity ID: Yard's user ID
  - Display Name: Yard's name
  - Count: 1
  - Unit Price: Product price
  - Total Amount: Product price

**Promotion Orders:**
- Order in `/admin/promotion-orders`:
  - Status: `PAID`
  - Scope: `YARD_BRAND`
  - `carId: null` (brand promotions don't apply to specific cars)

---

### 4.2 Per-Car Promotion from YardFleet

**Steps:**
1. Login as Yard user
2. Navigate to `/yard/fleet` (YardFleetPage)
3. Find a published car in the fleet list
4. Click "Promote" button (if available)
5. Select YARD_CAR promotion product (e.g., BOOST for car)
6. Complete purchase

**Expected Results:**

**Yard Fleet Page:**
- Car shows promotion indicator/badge
- Promotion status visible in car row

**Search Results:**
- Promoted car appears with:
  - Boosted position
  - Highlight styling (if applicable)
  - Promotion badge

**Admin Revenue Dashboard:**
- Line item:
  - Source: `PROMOTION_YARD`
  - Entity ID: Yard's user ID
  - Count: 1
  - Note: Car ID may be in order but revenue is attributed to yard

**Promotion Orders:**
- Order shows:
  - Scope: `YARD_CAR`
  - `carId`: Specific car ID
  - Items: Array with car-specific promotion product

**Edge Cases:**
- Unpublishing car: Promotion should remain but not apply until republished
- Multiple cars: Each car promotion creates separate order/revenue line item

---

## 5. Billing Plans & Quotas (BILLING_CONFIG)

### 5.1 YARD Plans

#### FREE Plan Quota Testing

**Setup:**
- Yard user with `subscriptionPlan: 'FREE'`
- Current month has exactly 10 leads (at quota limit)
- Or 11 leads (over quota)

**Scenario 5.1.1: Usage < 80% (< 8 leads)**

**Steps:**
1. Ensure yard has 5-7 leads in current month
2. Navigate to `/yard/promotions` or `/yard/leads`
3. Check for warning banner

**Expected:**
- No warning banner appears
- Dashboard shows: "X מתוך 10 בחינם" (where X < 8)

**Scenario 5.1.2: Usage 80-100% (8-10 leads)**

**Steps:**
1. Ensure yard has 8-10 leads in current month
2. Navigate to `/yard/promotions`
3. Check for warning banner

**Expected:**
- Warning banner appears with:
  - Level: `WARN`
  - Color: Orange/warning style
  - Message: "אתה מתקרב למכסת הלידים החינמית שלך לחודש זה (X מתוך 10)..."
  - Recommended Plan: `PLUS`
  - "שדרג חבילה" button visible
- Banner does NOT block actions
- All page functionality remains available

**Scenario 5.1.3: Usage > 100% (> 10 leads)**

**Steps:**
1. Ensure yard has 11+ leads in current month
2. Navigate to `/yard/promotions` or `/yard/leads`

**Expected:**
- Warning banner with:
  - Level: `CRITICAL`
  - Color: Red/critical style
  - Message: "עברת את מכסת הלידים החינמית שלך לחודש זה (X מתוך 10). לידים נוספים יחויבו."
  - Recommended Plan: `PRO`

**Revenue Calculation:**
- In Admin Revenue Dashboard:
  - Filter: Current month, Scope = YARD, Entity = this yard's ID
  - Line item for leads:
    - Count: X - 10 (billable leads only)
    - Unit Price: 15 ₪ (from `BILLING_CONFIG.yard.FREE.pricing.leadUnitPrice`)
    - Total Amount: (X - 10) × 15 ₪

#### PLUS Plan Quota Testing

**Setup:** Yard with `subscriptionPlan: 'PLUS'`

**Scenario 5.1.4: PLUS Plan Usage**

**Steps:**
1. Ensure 40-45 leads (below 80%), then 45-50 leads (80-100%), then 51+ leads (>100%)
2. Check warning banners at each stage

**Expected:**
- Below 40 leads: No warning
- 40-50 leads: WARN banner recommending PRO plan
- 51+ leads: CRITICAL banner
- Billable leads priced at 10 ₪ each (from config)

#### PRO Plan Quota Testing

**Setup:** Yard with `subscriptionPlan: 'PRO'`

**Steps:**
1. Check yard with any number of leads (even 100+)
2. Navigate to `/yard/promotions`

**Expected:**
- No warning banner appears (PRO has unlimited leads)
- Revenue Dashboard: No billable leads line item (unit price is 0)
- Only promotion revenue appears (if any)

---

### 5.2 Private Seller Plans

**Similar to Yard plans but with different quotas:**

**FREE Plan:**
- 5 free leads/month
- Warning at 4+ leads (80% of 5 = 4)
- Billable leads: 12 ₪ each

**PLUS Plan:**
- 25 free leads/month
- Warning at 20+ leads
- Billable leads: 8 ₪ each

**PRO Plan:**
- 999 free leads (unlimited)
- No warnings
- 0 ₪ per lead

**Test Scenarios:**
- Repeat scenarios from 5.1 but use Private Seller account
- Verify warnings appear in `/seller/account` or during promotion flow
- Check revenue aggregation shows PRIVATE scope correctly

---

## 6. Usage Warnings (UpgradeWarningBanner)

### 6.1 YardPromotionsPage (`/yard/promotions`)

**Setup:**
- Yard user with FREE plan
- Current month leads: Vary to test thresholds

**Scenario 6.1.1: WARN Level Banner**

**Steps:**
1. Set yard's current month leads to 8 (80% of 10)
2. Login as this yard
3. Navigate to `/yard/promotions`
4. Check banner appearance

**Expected:**
- Banner appears at top of page (after header, before main content)
- Banner class: `upgrade-warning-banner warn`
- Background: Orange/warning color
- Icon: ⚠️
- Message: "אתה מתקרב למכסת הלידים החינמית שלך לחודש זה (8 מתוך 10)..."
- "שדרג חבילה" button visible
- Button click navigates to `/account`

**Actions Remain Available:**
- Can still purchase promotions
- Can navigate to other pages
- No blocking overlay or popup

**Scenario 6.1.2: CRITICAL Level Banner**

**Steps:**
1. Set yard's current month leads to 12 (over quota)
2. Navigate to `/yard/promotions`

**Expected:**
- Banner class: `upgrade-warning-banner critical`
- Background: Red/critical color
- Message mentions exceeding quota
- All actions still available

**Scenario 6.1.3: No Banner (Low Usage)**

**Steps:**
1. Set leads to 5 (50% of quota)
2. Navigate to `/yard/promotions`

**Expected:**
- No banner appears
- Page functions normally

---

### 6.2 Yard Dashboard (`/account` when yard user)

**Setup:** Same as 6.1

**Steps:**
1. Login as yard user
2. Navigate to `/account`
3. View YardDashboard component
4. Check for warning banner

**Expected:**
- Banner appears above "Plan & Quota Card" section
- Same behavior as YardPromotionsPage
- Banner integrates smoothly with existing plan/quota display

**Verification:**
- Banner message matches quota from `BILLING_CONFIG`
- Banner level (WARN/CRITICAL) matches usage ratio
- "שדרג חבילה" button works

---

### 6.3 Yard Leads Page (`/yard/leads`)

**Steps:**
1. Login as yard user
2. Navigate to `/yard/leads`
3. Check for warning banner (if usage is high)

**Expected:**
- Banner appears after page header
- Same warning logic as other pages
- Banner does not interfere with leads table

---

### 6.4 Banner Dismissal (Future Feature)

**Note:** Current implementation does not support dismissal. If added:

**Steps:**
1. Show banner
2. Click dismiss button (×)
3. Banner should disappear
4. Refresh page

**Expected:**
- Banner reappears (no persistence of dismissal)
- Or: Dismissal persists in localStorage (if implemented)

---

## 7. Admin Revenue Dashboard & CSV

### 7.1 Filters & Aggregation

**Route:** `/admin/revenue-dashboard`

**Prerequisites:**
- Admin user login
- Seed data: Mix of leads and promotion orders across multiple months

#### Scenario 7.1.1: This Month Filter

**Steps:**
1. Login as Admin
2. Navigate to `/admin/revenue-dashboard`
3. Select date preset: "חודש נוכחי" (THIS_MONTH)
4. Scope: ALL
5. Grouping: MONTHLY

**Expected:**
- Summary cards show:
  - Total Revenue: Sum of all revenue line items
  - Revenue from Leads: Sum of LEAD source items
  - Revenue from Private Promotions: Sum of PROMOTION_PRIVATE items
  - Revenue from Yard Promotions: Sum of PROMOTION_YARD items
- Table shows one row (current month)
- Line items include:
  - Only leads/promotions from current month
  - Correct grouping by month

**Verification:**
- Manually sum line items → should match summary totals
- Check date range in Firestore Console matches displayed period

#### Scenario 7.1.2: Last Month Filter

**Steps:**
1. Select date preset: "חודש שעבר" (LAST_MONTH)
2. Keep other filters default

**Expected:**
- Only last month's data appears
- Summary totals reflect last month only
- Table shows last month's period label

#### Scenario 7.1.3: Last 3 Months Filter

**Steps:**
1. Select "3 חודשים אחרונים" (LAST_3_MONTHS)
2. Grouping: MONTHLY

**Expected:**
- Table shows 3 rows (one per month)
- Each row shows correct month label
- Totals aggregate across all 3 months
- Expandable rows show line items per month

#### Scenario 7.1.4: Quarterly Grouping

**Steps:**
1. Date range: Last 6 months
2. Grouping: QUARTERLY

**Expected:**
- Table shows rows like "2024-Q1", "2024-Q2"
- Line items grouped by quarter
- Totals sum correctly per quarter

#### Scenario 7.1.5: Scope Filter = YARD

**Steps:**
1. Scope filter: YARD
2. Date: This month

**Expected:**
- Summary cards show only YARD revenue
- Table shows only YARD line items:
  - Source: LEAD (where sellerType = YARD) or PROMOTION_YARD
- No PRIVATE items appear

#### Scenario 7.1.6: Scope Filter = PRIVATE

**Steps:**
1. Scope filter: PRIVATE

**Expected:**
- Only PRIVATE revenue shown
- Sources: LEAD (PRIVATE seller) or PROMOTION_PRIVATE

#### Scenario 7.1.7: Entity Filter

**Steps:**
1. Scope: ALL
2. Use entity filter (if available in UI) or verify in CSV export
3. Filter by specific yard/seller ID

**Expected:**
- Only that entity's revenue appears
- Line items show correct entity ID and display name

#### Scenario 7.1.8: Empty State

**Steps:**
1. Select date range with no data (e.g., future month)
2. Or: Use test environment with no revenue data

**Expected:**
- Summary cards show ₪0 or empty
- Table shows empty state message (not error)
- No crashes or console errors

---

### 7.2 CSV Export

**Route:** `/admin/revenue-dashboard`

#### Scenario 7.2.1: Export Current Month

**Steps:**
1. Set filters: This month, Scope = ALL, Grouping = MONTHLY
2. Wait for data to load
3. Click "Export CSV" button
4. Download file
5. Open in Excel/Google Sheets

**Expected CSV Structure:**

**Columns (in order):**
1. Period (תקופה) - e.g., "2024-01"
2. Scope (היקף) - "YARD" or "PRIVATE"
3. Source (מקור) - "LEAD", "PROMOTION_PRIVATE", "PROMOTION_YARD"
4. Entity ID (מזהה ישות)
5. Entity Name (שם ישות) - Display name or email
6. Count (כמות)
7. Unit Price (מחיר יחידה) - in ₪
8. Total Amount (סכום כולל) - in ₪

**Content:**
- Hebrew characters display correctly (UTF-8 with BOM)
- Each line item from dashboard appears as row
- Totals match dashboard summary
- Dates formatted correctly

**Spot Checks:**
- Pick 3 random rows from dashboard
- Find corresponding rows in CSV
- Verify: Entity ID, Count, Unit Price, Total Amount match

#### Scenario 7.2.2: Export Filtered View

**Steps:**
1. Filter: Last 3 months, Scope = YARD, Grouping = QUARTERLY
2. Export CSV

**Expected:**
- CSV contains only filtered data
- Periods show quarter format (2024-Q1, etc.)
- Only YARD scope items
- No PRIVATE items

#### Scenario 7.2.3: CSV with Multiple Entities

**Steps:**
1. Filter: This month, Scope = ALL
2. Ensure data includes multiple yards and sellers
3. Export CSV

**Expected:**
- CSV shows all entities
- Rows grouped by entity (or sorted consistently)
- Each entity's revenue items appear together

#### Scenario 7.2.4: CSV Edge Cases

**Empty Data:**
- Export with no data → CSV should be empty or show header only

**Large Dataset:**
- Export 1 year of data → CSV should contain all rows (no truncation)

**Special Characters:**
- Entity names with Hebrew/English mix → Display correctly in CSV

---

## 8. Negative / Edge Cases

### 8.1 No Promotions at All

**Steps:**
1. Use environment with zero promotion orders
2. Navigate to `/admin/revenue-dashboard`
3. Set filters to period with no promotions

**Expected:**
- Dashboard loads without errors
- Summary cards show ₪0 for promotion revenue
- Revenue from Leads still shows (if leads exist)
- CSV export works (empty or header-only)

---

### 8.2 Yards with PRO Plan (Unlimited Leads)

**Setup:** Yard with `subscriptionPlan: 'PRO'`, 100+ leads in current month

**Steps:**
1. Navigate to `/yard/promotions` as this yard
2. Check for warnings

**Expected:**
- No warning banner appears (PRO has unlimited quota)
- Yard dashboard shows: "X מתוך 999 בחינם" (or similar)

**Admin Revenue Dashboard:**
- Filter: This yard, This month
- No billable leads line item (or count = 0, unit price = 0)
- Only promotion revenue appears (if any)

---

### 8.3 Time Ranges with No Data

**Steps:**
1. Select date range: Future month (e.g., next month)
2. Or: Very old date range (before system launch)

**Expected:**
- Dashboard shows clean empty state
- No error messages
- Summary cards: ₪0 or empty
- Table: Empty state message
- CSV export: Empty or header-only

---

### 8.4 Invalid/Corrupted Data

**Edge Cases to Consider:**

**Missing User Profile:**
- Lead exists but seller user profile deleted
- Promotion order exists but user profile missing

**Expected:**
- Revenue aggregation handles gracefully:
  - Skips items with missing profiles
  - Shows "Unknown" or entity ID only in display name
  - No crashes

**Missing Promotion Product:**
- Order references product ID that no longer exists

**Expected:**
- Order still appears in revenue (uses order.totalAmount)
- Product name may show as ID or "Unknown"

**Negative Amounts:**
- If refund logic exists, negative orders

**Expected:**
- Dashboard handles negative amounts correctly
- CSV shows negative values with minus sign

---

### 8.5 Concurrent Usage Warnings

**Scenario:** Yard has both high lead usage AND full promotion slots

**Steps:**
1. Yard with 9/10 leads (WARN level)
2. Yard using all promotion slots (if applicable)
3. Navigate to `/yard/promotions`

**Expected:**
- Only one banner appears (strongest level: CRITICAL > WARN > INFO)
- Or: Banner shows combined message
- Current implementation: Shows lead usage warning (promotion warnings not yet implemented)

---

### 8.6 Role Separation Violations

**Yard User:**
- Attempt to access `/admin/revenue-dashboard` → Redirected to `/account`
- Cannot see other yards' revenue

**Private Seller:**
- Cannot see revenue data at all
- Can only see own leads/promotions

**Admin:**
- Can see all revenue
- Can filter by any entity

**Verification:**
- Test each role's access to admin routes
- Verify redirects work correctly

---

## 9. References

### Key Files

**Configuration:**
- `web/src/config/billingConfig.ts` - Central billing configuration (`BILLING_CONFIG`)
- `web/src/types/BillingPlan.ts` - Billing plan type definitions

**Revenue Aggregation:**
- `web/src/api/revenueApi.ts` - Revenue aggregation logic (`aggregateRevenue()`, `aggregateLeads()`, `aggregatePromotionOrders()`)
- `web/src/types/Revenue.ts` - Revenue type definitions

**Usage Warnings:**
- `web/src/utils/usageWarnings.ts` - Warning generation logic (`generateUsageWarning()`, `generatePromotionUsageWarning()`)
- `web/src/components/UpgradeWarningBanner.tsx` - Warning banner UI component
- `web/src/components/UpgradeWarningBanner.css` - Banner styles

**Admin UI:**
- `web/src/pages/AdminRevenueDashboardPage.tsx` - Main revenue dashboard
- `web/src/pages/AdminRevenueDashboardPage.css` - Dashboard styles
- `web/src/pages/AdminPromotionOrdersPage.tsx` - Promotion orders management

**Yard UI:**
- `web/src/pages/YardPromotionsPage.tsx` - Yard promotions page
- `web/src/components/yard/YardDashboard.tsx` - Yard dashboard (shows warnings)
- `web/src/pages/YardLeadsPage.tsx` - Yard leads page (shows warnings)
- `web/src/pages/YardFleetPage.tsx` - Fleet management (per-car promotions)

**Private Seller UI:**
- `web/src/pages/SellCarPage.tsx` - Sell car flow (includes promotion step)
- `web/src/pages/SellerAccountPage.tsx` - Seller account page

**Promotion System:**
- `web/src/api/promotionApi.ts` - Promotion API functions
- `web/src/types/Promotion.ts` - Promotion type definitions
- `docs/promotion_system_implementation.md` - Detailed promotion system docs

**Leads:**
- `web/src/api/leadsApi.ts` - Lead fetching functions (`fetchLeadMonthlyStatsForYardCurrentMonth()`, etc.)

**Routing:**
- `web/src/router.tsx` - Application routes

### Firestore Collections

- `leads` - Lead documents (revenue source)
- `promotionOrders` - Promotion order documents (revenue source)
- `promotionProducts` - Promotion product definitions
- `users` - User profiles (contain `subscriptionPlan`, billing info)
- `yardProfiles` - Yard-specific profile data (contains `promotion` state)

### Configuration Constants

**From `billingConfig.ts`:**
- `BILLING_CONFIG` - Central configuration object
- `UPGRADE_WARN_THRESHOLD = 0.8` - Warning threshold (80% usage)

### Testing Routes

- `/admin/revenue-dashboard` - Admin revenue dashboard
- `/admin/promotion-orders` - Promotion orders list
- `/yard/promotions` - Yard promotions page
- `/yard/leads` - Yard leads page
- `/account` - Account page (shows YardDashboard for yards)
- `/seller/account` - Seller account page

---

## 10. Test Execution Log

**Date:** _______________

**Tester:** _______________

**Environment:** [ ] Development  [ ] Staging  [ ] Production

### Test Results Summary

| Section | Status | Notes |
|---------|--------|-------|
| 3.1 Private Seller - New Listing | [ ] Pass [ ] Fail | |
| 3.2 Private Seller - Existing Listing | [ ] Pass [ ] Fail | |
| 4.1 Yard Brand Promotion | [ ] Pass [ ] Fail | |
| 4.2 Yard Per-Car Promotion | [ ] Pass [ ] Fail | |
| 5.1 YARD Plans Quotas | [ ] Pass [ ] Fail | |
| 5.2 Private Plans Quotas | [ ] Pass [ ] Fail | |
| 6.1-6.3 Usage Warnings | [ ] Pass [ ] Fail | |
| 7.1 Revenue Dashboard Filters | [ ] Pass [ ] Fail | |
| 7.2 CSV Export | [ ] Pass [ ] Fail | |
| 8.1-8.6 Edge Cases | [ ] Pass [ ] Fail | |

**Overall Status:** [ ] Pass [ ] Fail

**Issues Found:**
1. ________________________________________________
2. ________________________________________________
3. ________________________________________________

**Additional Notes:**
________________________________________________
________________________________________________

---

**Document Version:** 1.0  
**Last Updated:** 2024  
**Maintainer:** Development Team

