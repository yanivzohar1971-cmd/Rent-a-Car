# Admin Manager Tiles Status Report

> **Generated:** December 8, 2025  
> **Analyst:** Code Analysis based on `web/src/pages/AccountPage.tsx` and related files

---

## Overview

- The **System Manager personal area** is rendered by the `AdminDashboardView` component in `web/src/pages/AccountPage.tsx` (lines 245-288).
- It is displayed **only when** `userProfile?.isAdmin === true` (line 137).
- All 8 tiles are rendered as `<Link to="...">` components, providing navigation to dedicated admin pages.
- Each tile navigates to a route defined in `web/src/router.tsx`, where all admin routes are registered under the `/admin/*` path pattern.
- **All 8 features are IMPLEMENTED** with real Firestore integration, complete UI, and working business logic.

---

## Detailed Tile Status

| Hebrew Title (Tile) | Component Rendering the Tile | Click Action / Route Path | Target Component | Status | Short Notes |
|---------------------|------------------------------|---------------------------|------------------|--------|-------------|
| **ניהול לקוחות** | `AdminDashboardView` | `<Link to="/admin/customers">` | `AdminCustomersPage` | ✅ **Implemented** | Lists yards, agents, private sellers with tabs. Edit customer plans (FREE/PLUS/PRO), manage custom billing deals (deal name, validity, custom quotas, pricing). Full Firestore CRUD. Side panel for editing. |
| **לידים** | `AdminDashboardView` | `<Link to="/admin/leads">` | `AdminLeadsPage` | ✅ **Implemented** | Two tabs: Yards and Private Sellers. Shows lead statistics per entity: monthly leads, free quota, billable leads, all-time totals by status (new, in-progress, closed, lost). Real-time Firestore queries. |
| **חבילות ותכניות** | `AdminDashboardView` | `<Link to="/admin/plans">` | `AdminPlansPage` | ✅ **Implemented** | Manage billing plans by role (YARD, AGENT, PRIVATE_SELLER). Create/edit plans with: code (FREE/PLUS/PRO), display name, description, free lead quota, lead price, fixed monthly fee, currency. Set default plans. Modal form for editing. |
| **חיוב ודוחות** | `AdminDashboardView` | `<Link to="/admin/billing">` | `AdminBillingPage` | ✅ **Implemented** | Monthly billing dashboard showing all yards/sellers with: leads count, free quota, billable leads, lead price, fixed fee, amount to charge. CSV export. "Close billing period" button creates billing snapshots. Filter by type. |
| **דשבורד הכנסות (סגירת חודשים)** | `AdminDashboardView` | `<Link to="/admin/revenue">` | `AdminRevenuePage` | ✅ **Implemented** | Revenue dashboard from **closed billing periods**. View modes: month/quarter/year. KPI cards (total revenue, billable leads, fixed fees, paying yards/sellers). Top customers table with drill-down. Requires periods to be closed first. |
| **דשבורד הכנסות - זמן אמת** | `AdminDashboardView` | `<Link to="/admin/revenue-dashboard">` | `AdminRevenueDashboardPage` | ✅ **Implemented** | **Real-time** revenue from: (1) Promotion orders by month, (2) Yard leads billing. Two tabs. Date range filters (this month, last month, 3 months, year, custom). CSV export for yard leads billing. KPI summary cards. |
| **מוצרי קידום** | `AdminDashboardView` | `<Link to="/admin/promotion-products">` | `AdminPromotionProductsPage` | ✅ **Implemented** | Full CRUD for promotion products. 3 scope tabs: Private Seller, Yard Car, Yard Brand. Status filters (active/inactive/archived). Create/edit form with: code, Hebrew/English labels, descriptions, type (BOOST/HIGHLIGHT/MEDIA_PLUS/etc.), price, duration, bumps, sort order, featured flag. Archive functionality. |
| **הזמנות קידום** | `AdminDashboardView` | `<Link to="/admin/promotion-orders">` | `AdminPromotionOrdersPage` | ✅ **Implemented** | Lists all promotion orders with: date, user, car, items, amount, status. Filter by scope. Actions: "Mark as Paid", "Re-apply Promotion". Reads from `promotionOrders` Firestore collection. |

---

## Routing Notes

### Registered Admin Routes (in `web/src/router.tsx`, lines 125-157)

All 8 tiles have their routes properly registered:

| Route | Component | Used by Tile |
|-------|-----------|--------------|
| `/admin/leads` | `AdminLeadsPage` | לידים |
| `/admin/plans` | `AdminPlansPage` | חבילות ותכניות |
| `/admin/customers` | `AdminCustomersPage` | ניהול לקוחות |
| `/admin/billing` | `AdminBillingPage` | חיוב ודוחות |
| `/admin/revenue` | `AdminRevenuePage` | דשבורד הכנסות (סגירת חודשים) |
| `/admin/revenue-dashboard` | `AdminRevenueDashboardPage` | דשבורד הכנסות - זמן אמת |
| `/admin/promotion-products` | `AdminPromotionProductsPage` | מוצרי קידום |
| `/admin/promotion-orders` | `AdminPromotionOrdersPage` | הזמנות קידום |

### Unused / Partially Wired Admin Routes

**None found.** All registered admin routes are reachable from the System Manager tiles.

---

## Feature Implementation Details

### 1. ניהול לקוחות (`AdminCustomersPage`)
**File:** `web/src/pages/AdminCustomersPage.tsx` (652 lines)

**Features:**
- 4 tabs: מגרשים (Yards), סוכנים (Agents), לקוחות פרטיים (Private Sellers), דילים (Deals)
- Customer table with: name, email, phone, user type, plan badge, deal badge
- Click row → Opens side panel to edit:
  - Subscription plan (FREE/PLUS/PRO)
  - Custom deal: name, validity date, custom free quota, custom lead price, custom fixed fee, currency
- Save / Clear deal functionality
- Firestore integration: `fetchAllYardsForAdmin`, `fetchAllAgentsForAdmin`, `fetchAllSellersForAdmin`, `updateUserSubscriptionAndDeal`

### 2. לידים (`AdminLeadsPage`)
**File:** `web/src/pages/AdminLeadsPage.tsx` (457 lines)

**Features:**
- 2 tabs: מגרשים, מוכרים פרטיים
- Per-entity stats: monthly leads, free quota, billable leads, all-time totals
- Status breakdown: new, in-progress, closed, lost
- Color-coded badges for plan types and status
- Firestore integration: `fetchLeadStatsForYard`, `fetchLeadMonthlyStatsForYardCurrentMonth`, etc.

### 3. חבילות ותכניות (`AdminPlansPage`)
**File:** `web/src/pages/AdminPlansPage.tsx` (763 lines)

**Features:**
- Plan management tabs: plans-yards, plans-agents, plans-sellers
- User assignment tabs: yards, sellers (change user's plan directly)
- Plan CRUD with modal form: code, display name, description, free quota, lead price, fixed fee, currency, active status
- Set default plan for each role
- Firestore integration: `fetchBillingPlansByRole`, `createBillingPlan`, `updateBillingPlan`, `setDefaultBillingPlan`

### 4. חיוב ודוחות (`AdminBillingPage`)
**File:** `web/src/pages/AdminBillingPage.tsx` (641 lines)

**Features:**
- Monthly billing summary for all users
- Columns: name, type, plan, deal, monthly leads, free quota, billable leads, lead price, fixed fee, amount to charge
- Filter by type (all/yards/private sellers)
- CSV export with all billing data
- "Close billing period" → Creates billing snapshots for revenue dashboard
- Mobile-responsive with card layout
- Firestore integration: Real-time billing calculation from user plans and lead stats

### 5. דשבורד הכנסות - סגירת חודשים (`AdminRevenuePage`)
**File:** `web/src/pages/AdminRevenuePage.tsx` (467 lines)

**Features:**
- Requires billing periods to be closed first (via AdminBillingPage)
- View modes: month, 3 months (quarter), 12 months (year)
- KPI cards: total revenue, billable leads, fixed fees, paying yards count, paying sellers count
- Top customers table sorted by revenue
- Mobile-responsive with card layout
- Firestore integration: `fetchBillingPeriods`, `fetchBillingSnapshotsForPeriod`

### 6. דשבורד הכנסות - זמן אמת (`AdminRevenueDashboardPage`)
**File:** `web/src/pages/AdminRevenueDashboardPage.tsx` (549 lines)

**Features:**
- 2 tabs: הכנסות מקידומי מבצעים, בילינג לפי לידים למגרשים
- Date presets: this month, last month, 3 months, year, custom range
- Promotion revenue: total, order count, by scope (CAR/YARD)
- Yard leads billing: per-yard breakdown with free/billable leads
- CSV export for yard leads billing
- Firestore integration: `getPromotionRevenueByMonth`, `getYardLeadsBillingForMonth`

### 7. מוצרי קידום (`AdminPromotionProductsPage`)
**File:** `web/src/pages/AdminPromotionProductsPage.tsx` (596 lines)

**Features:**
- 3 scope tabs: PRIVATE_SELLER_AD, YARD_CAR, YARD_BRAND
- Status filters: all, active, inactive, archived
- Product table: code, Hebrew name, type, price, duration, sort order, status
- Featured badge indicator
- CRUD modal with: code, Hebrew/English labels, descriptions, type, price, currency, duration, bumps, max cars, highlight level, sort order, featured flag
- Toggle active/inactive, archive functionality
- Firestore integration: `fetchAllPromotionProducts`, `createPromotionProduct`, `updatePromotionProduct`, `archivePromotionProduct`

### 8. הזמנות קידום (`AdminPromotionOrdersPage`)
**File:** `web/src/pages/AdminPromotionOrdersPage.tsx` (215 lines)

**Features:**
- Filter by scope: all, private sellers, yard cars, yard brand
- Order table: date, user, car, items, amount, status
- Status badges (DRAFT, PAID, etc.)
- Actions: "Mark as Paid" → updates order status; "Re-apply" → applies promotion to car again
- Firestore integration: Direct query to `promotionOrders` collection

---

## Conclusion

**All 8 System Manager tiles are FULLY IMPLEMENTED** with:
- Complete UI with tables, filters, forms, and modals
- Real Firestore/Firebase integration
- Admin access control (`isAdmin` check)
- Error handling and loading states
- Mobile-responsive layouts
- Hebrew RTL support

No placeholders or stub implementations were found. The admin dashboard is production-ready.

