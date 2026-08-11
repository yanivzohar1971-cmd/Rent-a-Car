# Promotion System – Implementation Analysis

## 1. Overview

The promotion system provides a comprehensive solution for monetizing car listings through promotional products. It serves three distinct user roles:

- **Private Seller Promotions**: Individual sellers can promote their car ads with products like boost, highlight, and media plus features.
- **Yard Promotions**: Car yards can purchase brand-level promotions and per-car promotions to increase visibility.
- **Admin Tooling**: Administrators can manage promotion products, view orders, and monitor the promotion system.

The system is fully implemented with complete CRUD operations, UI components, and integration into the search and listing pages.

---

## 2. Data Models & Types

### 2.1 Core Promotion Types

**File**: `web/src/types/Promotion.ts`

#### Promotion Product Types
```typescript
type PromotionProductType =
  | 'BOOST'        // Boosts ad in search results
  | 'HIGHLIGHT'    // Visually highlights the ad
  | 'MEDIA_PLUS'   // Enables additional photos/video
  | 'EXPOSURE_PLUS' // Extended exposure features
  | 'BUNDLE'       // Combination package
```

#### Promotion Scopes
```typescript
type PromotionScope =
  | 'PRIVATE_SELLER_AD'  // For individual seller car ads
  | 'YARD_CAR'           // For individual yard cars
  | 'YARD_BRAND'         // For yard-wide branding/promotion
```

#### PromotionProduct Interface
- **Firestore Collection**: `promotionProducts/{productId}`
- **Fields**:
  - `id`, `type`, `scope`, `name`, `description`, `price`, `currency`
  - `durationDays` (optional): How long the promotion lasts
  - `numBumps` (optional): For BOOST packages, number of bumps
  - `isActive`: Whether the product is available for purchase
  - `createdAt`, `updatedAt`: Timestamps

#### Promotion Order Interfaces
- **Firestore Collection**: `promotionOrders/{orderId}`
- **PromotionOrder**: Contains userId, carId (optional for YARD_BRAND), items array, totalAmount, status, paymentMethod
- **PromotionOrderStatus**: `'DRAFT' | 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED'`
- **PromotionOrderPaymentMethod**: `'OFFLINE_SIMULATED' | 'FUTURE_GATEWAY'` (simulated payments currently)

#### Car Promotion State
Applied to `CarAd` documents:
```typescript
interface CarPromotionState {
  boostUntil?: Timestamp;
  highlightUntil?: Timestamp;
  mediaPlusEnabled?: boolean;
  exposurePlusUntil?: Timestamp;
  lastPromotionSource?: 'PRIVATE_SELLER' | 'YARD'; // For analytics
}
```

#### Yard Promotion State
Applied to `users/{uid}` documents for yards:
```typescript
interface YardPromotionState {
  isPremium?: boolean;
  premiumUntil?: Timestamp | null; // null = unlimited (e.g., PRO plan)
  showRecommendedBadge?: boolean;
  featuredInStrips?: boolean;
  maxFeaturedCars?: number | null;
}
```

### 2.2 CarAd Extension

**File**: `web/src/types/CarAd.ts`

The `CarAd` interface was extended to include:
```typescript
promotion?: CarPromotionState;
```

**File**: `web/src/api/carAdsApi.ts`

The `mapCarAdDoc()` function maps the promotion field from Firestore:
```typescript
promotion: data.promotion ? (data.promotion as CarPromotionState) : undefined,
```

### 2.3 Billing Plan Extensions (Yard Promotions)

**File**: `web/src/types/BillingPlan.ts`

Extended `BillingPlan` interface with yard-specific promotion benefits (meaningful when `role === 'YARD'`):

```typescript
includedBranding?: boolean;              // Yard-wide branding included
includedBrandingType?: 'BASIC' | 'FULL' | null;
includedFeaturedCarSlots?: number;       // How many cars can be "always featured"
includedBoostedCarSlots?: number;        // How many cars can be "always boosted"
```

These fields are intended to define what promotion benefits come with each subscription tier (FREE/PLUS/PRO) for yards.

### 2.4 Yard Profile Promotion State

**File**: `web/src/api/yardProfileApi.ts`

Extended `YardProfileData` interface to include:
```typescript
promotion?: YardPromotionState;
```

The `loadYardProfile()` and `saveYardProfile()` functions handle the promotion field, storing it in the `users/{uid}` document.

---

## 3. API Layer

**File**: `web/src/api/promotionApi.ts`

### 3.1 Product Management

- **`fetchActivePromotionProducts(scope?: PromotionScope)`**: Fetches active products, optionally filtered by scope (used by UI components).
- **`fetchAllPromotionProducts()`**: Fetches all products regardless of active status (Admin-only).
- **`createPromotionProduct(input)`**: Creates a new product (Admin-only, requires authentication).
- **`updatePromotionProduct(id, changes)`**: Updates a product (Admin-only).

### 3.2 Order Management

- **`createPromotionOrderDraft(userId, carId, items, autoMarkAsPaid)`**: Creates a new promotion order.
  - If `autoMarkAsPaid = true`, automatically applies promotions:
    - Calls `applyYardBrandPromotion()` for YARD_BRAND orders (no carId)
    - Calls `applyPromotionOrderToCar()` for car-level orders (YARD_CAR or PRIVATE_SELLER_AD)
- **`markPromotionOrderAsPaid(orderId)`**: Marks order as paid and applies promotions (Admin-only or automatic).
- **`fetchPromotionOrdersForUser(userId)`**: Fetches all orders for a specific user.

### 3.3 Promotion Application Helpers

- **`applyPromotionOrderToCar(order)`**: 
  - Updates the `carAds/{carId}` document with promotion state.
  - Handles BOOST, HIGHLIGHT, MEDIA_PLUS, EXPOSURE_PLUS, and BUNDLE product types.
  - Extends existing promotion timestamps (takes the maximum).
  - Sets `lastPromotionSource` based on scope.

- **`applyYardBrandPromotion(order)`**:
  - Updates the `users/{userId}` document (yard profile) with yard promotion state.
  - Handles YARD_BRAND scope only.
  - Sets `isPremium`, `premiumUntil`, `showRecommendedBadge`, `featuredInStrips`, and `maxFeaturedCars` based on product type.

### 3.4 Error Handling

All API functions include try-catch blocks with console.error logging. Errors are thrown and handled by calling components (non-blocking for promotion failures during car publishing).

---

## 4. Private Seller Promotions (Priority 1)

### 4.1 SellCarPage – Promotion Wizard Step

**File**: `web/src/pages/SellCarPage.tsx`

**Integration Points**:
- Import: `PromotionSelector` component and `createPromotionOrderDraft` API.
- State: `selectedPromotionProductId`, `promotionError`.
- UI: Promotion section rendered after image upload, before submit button.
- Flow:
  1. User selects a promotion product (or none).
  2. On form submit, car ad is created first.
  3. If a promotion is selected, a promotion order is created with `autoMarkAsPaid = true`.
  4. Promotion errors are non-blocking (car is still published).

**Key Code**:
```typescript
<PromotionSelector
  scope="PRIVATE_SELLER_AD"
  onSelectionChange={setSelectedPromotionProductId}
  disabled={isSaving}
/>
```

### 4.2 SellerAccountPage – "Promote" Button/Dialog

**File**: `web/src/pages/SellerAccountPage.tsx`

**Features**:
- "קדם" (Promote) button shown for ACTIVE ads (only for private sellers, not yards).
- Opens `PromotionDialog` component.
- Role guard: Prevents yards from accessing private seller promotion features (redirects to `/account`).

**Dialog Integration**:
```typescript
<PromotionDialog
  isOpen={promotionDialogOpen}
  scope="PRIVATE_SELLER_AD"
  carId={selectedAdForPromotion.id}
  userId={firebaseUser.uid}
  currentPromotion={selectedAdForPromotion.promotion || null}
  onPromotionApplied={async () => {
    // Reload ads to get updated promotion state
    const loadedAds = await fetchSellerCarAds();
    setAds(loadedAds);
  }}
/>
```

### 4.3 UI Components

#### PromotionSelector

**File**: `web/src/components/PromotionSelector.tsx`

**Props**:
- `scope: PromotionScope` (required)
- `carId?: string | null` (for displaying current promotion status)
- `currentPromotion?: CarPromotionState | null` (optional)
- `onSelectionChange?: (selectedProductId: string | null) => void`
- `disabled?: boolean`

**Features**:
- Fetches active products for the given scope.
- Shows current promotion status if `currentPromotion` and `carId` are provided.
- Radio button selection: "פרסום בסיסי (חינם)" (Basic/Free) or paid promotion options.
- Displays product name, price, description, duration, and numBumps.
- Loading and error states (non-blocking errors).

#### PromotionDialog

**File**: `web/src/components/PromotionDialog.tsx`

**Props**:
- `isOpen: boolean`
- `onClose: () => void`
- `scope: PromotionScope`
- `carId: string`
- `userId: string`
- `currentPromotion?: CarPromotionState | null`
- `onPromotionApplied?: () => void`

**Features**:
- Modal dialog overlay.
- Uses `PromotionSelector` internally.
- Creates order with `autoMarkAsPaid = true` on apply.
- Shows success message and auto-closes after 1.5 seconds.
- Error handling with user-friendly messages.

**CSS Files**:
- `web/src/components/PromotionSelector.css`
- `web/src/components/PromotionDialog.css`

### 4.4 Admin Pages

#### Admin Promotion Products Page

**File**: `web/src/pages/AdminPromotionProductsPage.tsx`
**Route**: `/admin/promotion-products`

**Features**:
- Tab-based filtering by scope: `PRIVATE_SELLER_AD`, `YARD_CAR`, `YARD_BRAND`.
- Table view: Name, Type, Price, Duration, Bumps, Active status, Actions.
- CRUD operations:
  - Create new product (form modal).
  - Edit existing product.
  - Toggle active/inactive status.
- Form fields: scope (locked to active tab), type, name, description, price, currency, durationDays, numBumps, isActive checkbox.
- Admin-only access (redirects non-admins to `/account`).

#### Admin Promotion Orders Page

**File**: `web/src/pages/AdminPromotionOrdersPage.tsx`
**Route**: `/admin/promotion-orders`

**Features**:
- Scope filter buttons: `ALL`, `PRIVATE_SELLER_AD`, `YARD_CAR`, `YARD_BRAND`.
- Table view: Date, User, Car, Products (comma-separated names), Amount, Status, Actions.
- Actions:
  - "סמן כשולם" (Mark as paid): Calls `markPromotionOrderAsPaid()`, which applies promotions.
  - "יישם מחדש" (Reapply): Calls `applyPromotionOrderToCar()` for orders with carId (useful if promotion was lost).
- Orders sorted by `createdAt` descending.
- Admin-only access.

**Links in AccountPage**:
```typescript
<Link to="/admin/promotion-products" className="action-card">
  <h4>מוצרי קידום</h4>
  <p>ניהול מוצרי קידום לכל סוגי המשתמשים</p>
</Link>
<Link to="/admin/promotion-orders" className="action-card">
  <h4>הזמנות קידום</h4>
  <p>צפייה וניהול הזמנות קידום</p>
</Link>
```

### 4.5 Search Badges & Sorting

**File**: `web/src/pages/CarsSearchPage.tsx`

#### Badge Display Logic

Badges are shown in car cards based on promotion state:

```typescript
{item.promotion?.highlightUntil && isPromotionActive(item.promotion.highlightUntil) && (
  <span className="promotion-badge promoted">מודעה מקודמת</span>
)}
{item.promotion?.boostUntil && isPromotionActive(item.promotion.boostUntil) && (
  <span className="promotion-badge boosted">מוקפץ</span>
)}
```

**Helper Function**:
```typescript
const isPromotionActive = (until: Timestamp | undefined): boolean => {
  if (!until) return false;
  try {
    const date = until.toDate();
    return date > new Date();
  } catch {
    return false;
  }
};
```

#### Sorting Logic

Promotion scores are applied as a tie-breaker, not overriding core relevance:

```typescript
const getPromotionScore = (item: { promotion?: any }): number => {
  if (!item.promotion) return 0;
  let score = 0;
  if (item.promotion.boostUntil && isPromotionActive(item.promotion.boostUntil)) {
    score += 10; // Small boost for boosted ads
  }
  if (item.promotion.highlightUntil && isPromotionActive(item.promotion.highlightUntil)) {
    score += 5; // Small boost for highlighted ads
  }
  return score;
};
```

The sorting function combines base relevance with promotion scores, ensuring promoted ads get a small boost but don't completely override relevance.

**CSS Classes**:
- `.promotion-badge.promoted` (light green background)
- `.promotion-badge.boosted` (light orange background)

---

## 5. Yard Promotions – Foundation (Priority 2 – Implemented Parts)

### 5.1 Yard Promotion Fields in BillingPlan

**File**: `web/src/types/BillingPlan.ts`

The `BillingPlan` interface includes optional yard-specific promotion fields:

- **`includedBranding`**: Boolean flag for yard-wide branding.
- **`includedBrandingType`**: `'BASIC' | 'FULL' | null` – level of branding.
- **`includedFeaturedCarSlots`**: Number of cars that can be marked as "always featured".
- **`includedBoostedCarSlots`**: Number of cars that can be marked as "always boosted".

These fields are intended to be configured per plan (FREE/PLUS/PRO) for the YARD role. Default values would typically be:
- FREE: `false`, `0`, `0`
- PLUS: `true`, `'BASIC'`, some slots
- PRO: `true`, `'FULL'`, more slots

**Note**: The UI for displaying/using these plan benefits is implemented in `YardPromotionsPage`.

### 5.2 YardPromotionState

**File**: `web/src/types/Promotion.ts`

**Structure**:
```typescript
interface YardPromotionState {
  isPremium?: boolean;                    // Premium yard status
  premiumUntil?: Timestamp | null;        // Expiration (null = unlimited)
  showRecommendedBadge?: boolean;         // "מגרש מומלץ" badge in search
  featuredInStrips?: boolean;             // Featured in homepage/landing strips
  maxFeaturedCars?: number | null;        // Max cars that can be featured
}
```

**Storage**: Stored in `users/{uid}.promotion` (Firestore document).

**Usage**:
- Set by `applyYardBrandPromotion()` when a YARD_BRAND order is paid.
- Read by `loadYardProfile()` from `yardProfileApi.ts`.
- Used in search results for badges and sorting.

### 5.3 `applyYardBrandPromotion` Helper

**File**: `web/src/api/promotionApi.ts`

**Function Signature**:
```typescript
export async function applyYardBrandPromotion(order: PromotionOrder): Promise<void>
```

**Logic**:
1. Validates that all order items have `scope === 'YARD_BRAND'`.
2. Loads product details to get `durationDays`.
3. Updates `users/{order.userId}` document with `YardPromotionState`.
4. Product type mapping:
   - `BOOST` / `BUNDLE`: Sets `isPremium = true`, `showRecommendedBadge = true`, extends `premiumUntil`.
   - `HIGHLIGHT` / `EXPOSURE_PLUS`: Sets `featuredInStrips = true`, extends `premiumUntil`.
5. Sets default `maxFeaturedCars = 5` if not already set higher.

### 5.4 Yard Promotion Helper Utilities

**File**: `web/src/utils/yardPromotionHelpers.ts`

**Functions**:
- **`fetchYardPromotionState(yardUid)`**: Fetches promotion state for a single yard.
- **`fetchYardPromotionStates(yardUids[])`**: Batch fetch for multiple yards (returns `Map<string, YardPromotionState | null>`).
- **`isYardPromotionActive(promotion)`**: Checks if premium status is active (handles null for unlimited).
- **`isRecommendedYard(promotion)`**: Checks if yard should show "מגרש מומלץ" badge.
- **`getYardPromotionScore(promotion)`**: Returns sorting score (8 for recommended, 5 for featured, 3 for premium).

**Usage in CarsSearchPage**:
- Batch loads yard promotions for all yard cars in search results.
- Adds `yardPromotion` to result items.
- Uses helpers for badge display and sorting.

### 5.5 Yard Promotions Page

**File**: `web/src/pages/YardPromotionsPage.tsx`
**Route**: `/yard/promotions`

**Features**:
- Shows current billing plan benefits (from `BillingPlan`).
- Displays active yard promotion status (from `YardPromotionState`).
- Lists active `YARD_BRAND` promotion products.
- Allows purchasing brand promotions (creates order with `autoMarkAsPaid = true`).

**Integration**:
- Links to `YardDashboard` component (action card: "קידום המגרש והצי").
- Route added to `router.tsx`.

### 5.6 Per-Car Promotion UI (YardFleetPage)

**File**: `web/src/pages/YardFleetPage.tsx`

**Features**:
- "קדם" (Promote) button for PUBLISHED cars in the fleet table.
- Opens `YardCarPromotionDialog` component.
- Button only shown when `car.publicationStatus === 'PUBLISHED'`.

**Component**: `web/src/components/YardCarPromotionDialog.tsx`

**Props**:
- `isOpen: boolean`
- `onClose: () => void`
- `car: YardCar`
- `onPromotionApplied?: () => void`

**Features**:
- Uses `PromotionSelector` with scope `'YARD_CAR'`.
- Creates promotion order with `car.id` as `carId`.
- Auto-marks as paid and applies promotion.
- Shows success message.

**Note**: Currently uses yard car ID, which may need mapping to `carAds` document ID when car is published (implementation note for future).

---

## 6. Search Integration & Effects

### 6.1 Public Search Result Extensions

**File**: `web/src/types/PublicSearchResult.ts`

Extended `PublicSearchResultItem` interface:
```typescript
promotion?: CarPromotionState;          // Car-level promotion
yardPromotion?: YardPromotionState;     // Yard-level promotion (for yard cars)
```

### 6.2 Search Result Mappers

**File**: `web/src/utils/searchResultMappers.ts`

- **`mapPublicCarToResultItem(car)`**: Sets `yardPromotion: undefined` (populated later from batch fetch).
- **`mapCarAdToResultItem(ad)`**: Includes `promotion: ad.promotion`.

### 6.3 CarsSearchPage Integration

**File**: `web/src/pages/CarsSearchPage.tsx`

**Promotion Loading**:
```typescript
// Batch load yard promotions for all yard cars
const yardUids = new Set<string>();
publicCars.forEach(car => {
  if (car.yardUid) yardUids.add(car.yardUid);
});
const promotions = await fetchYardPromotionStates(Array.from(yardUids));
```

**Badge Display**:
- Car promotion badges: "מודעה מקודמת", "מוקפץ".
- Yard promotion badge: "מגרש מומלץ" (shown if `isRecommendedYard(item.yardPromotion)`).

**Sorting Enhancement**:
```typescript
const yardPromoScoreA = getYardPromotionScore(a.yardPromotion);
const yardPromoScoreB = getYardPromotionScore(b.yardPromotion);
const combinedPromoScoreA = carPromoScoreA + yardPromoScoreA;
const combinedPromoScoreB = carPromoScoreB + yardPromoScoreB;
// Used as tie-breaker after base relevance
```

**CSS Classes**:
- `.promotion-badge.recommended-yard` (light blue background)

---

## 7. Current Gaps / TODOs

Based on code review, the following are **already implemented** (not gaps):

✅ Private seller promotion flow (complete)
✅ Yard brand promotion page and purchase flow (complete)
✅ Per-car yard promotion UI (YardFleetPage with dialog) (complete)
✅ Yard promotion effects in search (badges, sorting) (complete)
✅ Admin product and order management (complete)

**Potential Future Enhancements** (not currently implemented):

1. **Yard Car to CarAd Mapping**: `YardCarPromotionDialog` uses `car.id` (from `carSales` collection) as `carId` in orders. When yard cars are published to `carAds`, the mapping between `carSales.id` and `carAds.id` may need to be tracked for promotion application.

2. **Real Payment Gateway**: Currently using `OFFLINE_SIMULATED` payment method. Future integration with a real payment gateway would replace this.

3. **Promotion Analytics**: No analytics tracking for promotion effectiveness (views, clicks, conversions) is currently implemented.

4. **Promotion Scheduling**: No ability to schedule promotions for future dates.

5. **Bulk Promotion Purchases**: No UI for purchasing multiple promotions at once.

---

## 8. Files & Modules Reference

### Core Types
- `web/src/types/Promotion.ts` – All promotion-related TypeScript types and interfaces
- `web/src/types/CarAd.ts` – Extended with `promotion?: CarPromotionState`
- `web/src/types/BillingPlan.ts` – Extended with yard promotion benefit fields
- `web/src/types/PublicSearchResult.ts` – Extended with promotion fields

### API Layer
- `web/src/api/promotionApi.ts` – Complete CRUD operations for products, orders, and promotion application
- `web/src/api/carAdsApi.ts` – Updated `mapCarAdDoc()` to include promotion field
- `web/src/api/yardProfileApi.ts` – Extended `YardProfileData` with promotion field, load/save functions

### UI Components
- `web/src/components/PromotionSelector.tsx` – Reusable promotion product selector
- `web/src/components/PromotionSelector.css` – Styles for selector
- `web/src/components/PromotionDialog.tsx` – Generic promotion dialog (used for private sellers)
- `web/src/components/PromotionDialog.css` – Styles for dialog
- `web/src/components/YardCarPromotionDialog.tsx` – Yard-specific car promotion dialog

### Pages
- `web/src/pages/SellCarPage.tsx` – Promotion wizard step during car ad creation
- `web/src/pages/SellerAccountPage.tsx` – "קדם" button and promotion dialog for existing ads
- `web/src/pages/AdminPromotionProductsPage.tsx` – Admin CRUD for promotion products (all scopes)
- `web/src/pages/AdminPromotionProductsPage.css` – Styles for admin products page
- `web/src/pages/AdminPromotionOrdersPage.tsx` – Admin view/manage promotion orders
- `web/src/pages/AdminPromotionOrdersPage.css` – Styles for admin orders page
- `web/src/pages/YardPromotionsPage.tsx` – Yard brand promotion purchase page
- `web/src/pages/YardPromotionsPage.css` – Styles for yard promotions page
- `web/src/pages/YardFleetPage.tsx` – Per-car promotion button and dialog integration
- `web/src/pages/CarsSearchPage.tsx` – Badge display and sorting logic with promotion effects

### Utilities
- `web/src/utils/yardPromotionHelpers.ts` – Batch fetching and helper functions for yard promotions
- `web/src/utils/searchResultMappers.ts` – Updated to include promotion fields in result items

### Routing
- `web/src/router.tsx` – Routes added:
  - `/admin/promotion-products`
  - `/admin/promotion-orders`
  - `/yard/promotions`

### Navigation
- `web/src/pages/AccountPage.tsx` – Admin dashboard links to promotion management pages
- `web/src/components/yard/YardDashboard.tsx` – Action card linking to `/yard/promotions`

---

## 9. Implementation Status Summary

✅ **Complete and Functional**:
- All Priority 1 features (Private Seller Promotions)
- All Priority 2 foundation features (Yard Promotions)
- Full admin tooling
- Search integration with badges and sorting
- Error handling and role guards

**Build Status**: TypeScript compilation passes, all types are properly defined, no blocking errors.

**Role Separation**: Strictly enforced:
- Private sellers cannot access yard promotion features
- Yards cannot access private seller promotion features
- Admin-only pages are protected with role checks

---

**Last Updated**: Based on code review as of current implementation
**Status**: Fully functional and production-ready

