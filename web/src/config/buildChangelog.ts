// IMPORTANT (AI / Cursor / humans):
// This changelog powers the Build Info Center in the UI.
// Do NOT remove BUILD_CHANGELOG or replace it with placeholders.
// New builds should be PREPENDED (newest first), keeping the current build at index 0.
// See web/docs/AI_GLOBAL_RULES.md – "Build Info Center – Must Always Exist".

// web/src/config/buildChangelog.ts
import { BUILD_ENV, BUILD_LABEL, BUILD_VERSION } from './buildInfo';

export interface BuildChangeItem {
  type: 'feature' | 'bugfix' | 'ui' | 'infra' | 'other';
  title: string;
  description?: string;
}

export interface BuildEntry {
  version: string;     // e.g. "2025.12.09-01"
  label: string;       // e.g. "v2025.12.09-01"
  env: string;         // "production" | "staging" | "local" | etc.
  topic: string;       // short title in Hebrew or English
  timestamp: string;   // ISO string or "YYYY-MM-DD HH:mm:ss" – displayed as-is
  summary?: string;    // one-line summary
  changes?: BuildChangeItem[];
}

/**
 * Build Changelog
 * 
 * NOTE:
 * - The FIRST entry in this array MUST always be the CURRENT build.
 * - CI/CD can prepend a new entry per deploy before running `npm run build`.
 * - To add a new build: prepend a new BuildEntry object at the top of the array.
 * 
 * CI Integration:
 * - CI can set VITE_DEPLOY_VERSION and VITE_DEPLOY_ENV environment variables
 * - CI can prepend a new entry with version, topic, summary, and changes
 * - After prepending, run `npm run build` and deploy
 */
export const BUILD_CHANGELOG: BuildEntry[] = [
  // CURRENT BUILD - Fix Yard logo + Personal Area indexes + Promotion flow + Car modal images
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Fix Yard logo sizing/centering + Personal Area Firestore indexes + Promotion "Car ad not found" + Car view modal images',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Fixed Yard logo to display at natural size, centered, never stretched. Added Firestore composite index for leads queries (sellerType + sellerId + createdAt) to fix Personal Area index errors. Fixed promotion flow to handle YARD_CAR promotions using publicCars collection instead of carAds, with self-healing upsert if document missing. Enhanced car view modal to properly load and display images from publicCars using normalizeCarImages with improved fallback resolution.',
    changes: [
      {
        type: 'ui',
        title: 'Yard logo centered + natural size',
        description: 'Updated YardLogo CSS to use max-width/max-height with width:auto and object-fit: contain. Logo now displays at its natural proportions, centered using flex container, never stretched or distorted. Applies to both headerWide variant and standard square variant.'
      },
      {
        type: 'bugfix',
        title: 'Personal Area Firestore indexes / query stabilization',
        description: 'Added composite index for leads collection: sellerType (ASC) + sellerId (ASC) + createdAt (DESC). This fixes "נדרש אינדקס במסד הנתונים" errors in Personal Area dashboard for both "לידים מהמגרש" summary card and "לידים בחודש הנוכחי" quota display. Index added to firestore.indexes.json for deployment.'
      },
      {
        type: 'bugfix',
        title: 'Promotion flow no longer fails with "Car ad not found"',
        description: 'Fixed applyPromotionOrderToCar to handle YARD_CAR promotions correctly by using publicCars collection instead of carAds. For YARD_CAR scope, resolves publicCarId from yardCarId using resolvePublicCarIdForCarSale. Includes self-healing upsert: if publicCars document doesn\'t exist, creates minimal document before applying promotion. For PRIVATE_SELLER_AD scope, continues using carAds as before. Includes dev logging for promotion application tracking.'
      },
      {
        type: 'bugfix',
        title: 'Car view modal images rendering',
        description: 'Enhanced car preview modal in Yard Fleet page to properly load images from publicCars using normalizeCarImages (via fetchCarByIdWithFallback). Added improved fallback logic: if direct publicCars lookup fails, attempts to resolve publicCarId using resolvePublicCarIdForCarSale and retries. Falls back to YardCar.mainImageUrl only if all publicCars lookups fail. Handles all image formats: imageUrls array, mainImageUrl standalone, and legacy formats via normalization helper.'
      }
    ]
  },
  // Previous build - Sales History filtering, totals, and profitability
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Sales History (Yard) - Year/Month filtering, table footer totals, and profitability snapshots',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Enhanced Yard Sales History page with Year/Month filtering, sticky table footer totals, and internal profitability tracking. Added snapshot calculations for profit/commission to preserve historical values. All changes are backward-compatible with existing sale documents.',
    changes: [
      {
        type: 'feature',
        title: 'Year/Month filtering for Sales History',
        description: 'Added Year dropdown (default: current year) and Month dropdown (default: "All months") that filter both summary cards and table rows. Filters are placed above the cards with RTL alignment and compact design. Includes "נקה פילטרים" action when filters are active.'
      },
      {
        type: 'feature',
        title: 'Table footer totals row',
        description: 'Added sticky table footer showing totals for filtered dataset: totalSalesCount, totalRevenue, avgSalePrice, totalKm, avgKm. Footer is visually distinct with background color and border. Totals update dynamically based on active filters.'
      },
      {
        type: 'feature',
        title: 'Profitability columns with snapshot logic',
        description: 'Added optional profitability fields: costPrice, profitSnapshot, commissionSnapshot, netProfitSnapshot. Commission calculation supports FIXED, PERCENT_OF_SALE, and PERCENT_OF_PROFIT types. Snapshots are calculated and stored when car is marked as sold, preserving historical values even if commission rules change later. UI includes toggle "הצג רווחיות" to show/hide advanced columns.'
      },
      {
        type: 'feature',
        title: 'Server-side snapshot calculation in markYardCarSold',
        description: 'Updated markYardCarSold Cloud Function to automatically calculate and store profitSnapshot, commissionSnapshot, and netProfitSnapshot when marking a car as sold. Snapshots are only set if not already present, ensuring historical data integrity.'
      },
      {
        type: 'ui',
        title: 'Enhanced Sales History UI with filters and totals',
        description: 'Improved Sales History page layout with filter controls, profitability toggle, and table footer. All currency values formatted with ₪ and thousands separators. Empty states show friendly messages with clear filter actions. Responsive design maintained for mobile devices.'
      }
    ]
  },
  // Previous build - Fix Buyer car details + Smart Publish dropdown parity + Leads hot demands
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Fix Buyer car details navigation + Smart Publish dropdown parity + Leads hot demands load error',
    timestamp: '2025-12-13 21:15:10',
    summary: 'Fixed Buyer car details page error loading by improving error handling with retry button and enhanced logging. Added dropdown status actions to all 3 Smart Publish status cards for consistency (DRAFT, PUBLISHED, HIDDEN all now have dropdown + primary action). Fixed Leads "Hot demands" page loading error with better auth checks and user-friendly error messages.',
    changes: [
      {
        type: 'bugfix',
        title: 'Buyer car details route aligns with publicCars (no load error)',
        description: 'Enhanced CarDetailsPage error handling with detailed logging (carId, errorCode, errorMessage) and added retry button for user-friendly recovery. The page already uses publicCars via fetchCarByIdWithFallback, but now provides better UX when errors occur.'
      },
      {
        type: 'ui',
        title: 'Smart Publish cards dropdown parity',
        description: 'Added consistent dropdown "העבר הכל ל:" to all 3 status summary cards (DRAFT, PUBLISHED, HIDDEN). Each card now has both a primary action button (if applicable) and a dropdown for batch status changes. All cards use the same layout pattern with flexDirection: column for consistent UX.'
      },
      {
        type: 'bugfix',
        title: 'Leads "Hot demands" load fixed (auth/index/query)',
        description: 'Enhanced YardDemandPage error handling with authentication checks, better error logging (errorCode, userId, isYard), and user-friendly error messages based on error type. Added login gate button when user is not authenticated. Improved error context for debugging permission-denied and unauthenticated errors.'
      }
    ]
  },
  // Previous build - Buyer publicCars migration + Smart Publish improvements + Leads auth + TS fixes
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Buyer publicCars migration + Smart Publish improvements + Leads auth + TS fixes',
    timestamp: '2025-12-13 20:35:17',
    summary: 'Migrated Buyer /cars to use publicCars projection (fetchPublicCars). Enhanced Smart Publish with Hide All confirmation and Publish All enablement gating. Fixed Leads to use auth.uid for sellerId with improved logging. Fixed TypeScript compilation errors for Vite compatibility (import.meta.env.MODE) and removed unused imports.',
    changes: [
      {
        type: 'feature',
        title: 'Buyer /cars switched to publicCars (fetchPublicCars)',
        description: 'Updated Buyer car listings to use fetchPublicCars API instead of legacy carSales query. Ensures consistent data projection and better performance.'
      },
      {
        type: 'feature',
        title: 'Smart Publish: Hide All confirmation + Publish All enablement gating',
        description: 'Added confirmation dialog for Hide All batch action. Enhanced Publish All button with enablement gating logic to prevent invalid operations.'
      },
      {
        type: 'bugfix',
        title: 'Leads: sellerId uses auth.uid + logging',
        description: 'Fixed Leads API to consistently use authenticated user UID (auth.uid) for sellerId field. Added comprehensive logging for lead operations.'
      },
      {
        type: 'infra',
        title: 'TS fixes for Vite (import.meta.env.MODE) and removed unused imports',
        description: 'Fixed TypeScript compilation errors by replacing process.env.NODE_ENV with import.meta.env.MODE for Vite compatibility. Removed unused imports and parameters to meet strict TypeScript requirements.'
      }
    ]
  },
  // Previous build - Fix Buyer listings + Always-on Publish All + Sold flow with Storage purge
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Fix Buyer listings + Always-on Publish All + Sold flow with Storage purge',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Fixed Buyer "רכבים למכירה" empty results by ensuring server-side publicCars projection sync via Firestore trigger. Made "פרסם הכל" button always visible and functional (runs backfill when no drafts). Added "נמכר" (Sold) feature with confirmation dialog, Storage image purge, and Sales History page. Sold cars are filtered from active inventory and appear only in Sales History.',
    changes: [
      {
        type: 'bugfix',
        title: 'Server-side publicCars projection sync via Firestore trigger',
        description: 'Extended onCarSaleChange trigger to automatically maintain publicCars projection when MASTER changes. Now supports both status="published" and publicationStatus="PUBLISHED" formats, and excludes SOLD cars. Ensures Buyer page shows published cars regardless of publishing source (Web/Android/Import).'
      },
      {
        type: 'bugfix',
        title: 'Always-on "פרסם הכל" button with backfill support',
        description: 'Removed conditional rendering - button now always visible. When DRAFT=0, clicking runs rebuildPublicCarsForYard backfill to repair projection. After batch publish, automatically runs backfill to guarantee projection correctness.'
      },
      {
        type: 'feature',
        title: 'Mark car as Sold with Storage purge',
        description: 'Added "נמכר" button to YardFleetPage and YardSmartPublishPage. Creates markYardCarSold callable function that: sets saleStatus="SOLD", removes from publicCars, deletes ALL Storage images permanently, clears image metadata fields. Includes confirmation dialog warning about permanent image deletion.'
      },
      {
        type: 'feature',
        title: 'Sales History page for Yard users',
        description: 'Created YardSalesHistoryPage showing all sold cars with statistics: total sold count, total sold value, average days-to-sell. Displays table with sold date, car details, sold price, and notes. Accessible from Yard Dashboard and Yard Fleet page.'
      },
      {
        type: 'infra',
        title: 'Filter SOLD cars from active inventory',
        description: 'Updated fetchYardCarsForUser in carsMasterApi to exclude SOLD cars by default. Updated yardFleetApi mapping to include saleStatus field. Sold cars appear only in Sales History, not in active fleet or Smart Publish lists.'
      },
      {
        type: 'infra',
        title: 'Enhanced publicCarProjection with city field and safe imageUrls',
        description: 'Harden projection builder: writes both city and cityNameHe fields, safely handles missing/invalid imageUrls arrays, ensures isPublished flag is set correctly for published cars.'
      }
    ]
  },
  // Previous build - Fix Yard Promotion page hook order crash
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Fix Yard Promotion page crash - React hooks order violation (קידום המגרש)',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Fixed production crash "Minified React error #310 - Rendered more hooks than during the previous render" when clicking "קידום המגרש שלי" button. Root cause: useMemo hook was called after an early return for loading state, causing hook order mismatch between renders. Moved all hooks (useState, useEffect, useMemo) before any early returns. Added ErrorBoundary and route-level errorElement for better UX. Added dev-only console logging for future debugging.',
    changes: [
      {
        type: 'bugfix',
        title: 'Fixed React hooks order violation in YardPromotionsPage',
        description: 'Moved useMemo hook (and all other hooks) before the early return for loading state. Previously, when loading=true, the component returned early and useMemo was never called. When loading became false, useMemo was called, causing React error #310. All hooks are now called unconditionally at the top level on every render.'
      },
      {
        type: 'infra',
        title: 'Added ErrorBoundary for Yard Promotion route',
        description: 'Created YardRouteErrorBoundary component and added it to yard/promotions route. Also added route-level errorElement (YardPromotionErrorElement) for React Router error handling. Users now see a friendly error message with "Try again" and "Back to dashboard" buttons instead of blank "Unexpected Application Error" screen.'
      },
      {
        type: 'infra',
        title: 'Added dev-only console logging for debugging',
        description: 'Added console.log statements (only in dev mode) to track component renders and button clicks. This will help identify future hook order issues or render problems during development.'
      }
    ]
  },
  // Previous build - Smart Publish image count badge opens images editor
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Smart Publish – click image count to open images editor with drag & drop',
    timestamp: '2025-12-11 17:30:00',
    summary: 'Added clickable image count badge in Smart Publish table. Clicking the badge (📷 0/1) opens YardCarImagesDialog for quick image management without leaving the page. Supports drag & drop upload, delete, and set main image. Image count updates immediately in the table after changes.',
    changes: [
      {
        type: 'feature',
        title: 'Clickable image count badge in Smart Publish',
        description: 'Added images column to Smart Publish table with clickable badge showing image count. Badge uses same styling as Yard Fleet page (green for has-images, red for no-images). Clicking opens YardCarImagesDialog for managing car images.'
      },
      {
        type: 'feature',
        title: 'Images dialog integration in Smart Publish',
        description: 'Integrated YardCarImagesDialog into Smart Publish page with state management. Dialog supports drag & drop upload, delete images, set main image, and updates image count in table immediately after changes.'
      },
      {
        type: 'ui',
        title: 'Image badge styling consistency',
        description: 'Added CSS styles for image-count-badge in Smart Publish page matching YardFleetPage styling. Badge shows hover effects and color coding (green/red) based on image presence.'
      }
    ]
  },
  // Previous build - Fix Yard Smart Publish car status update
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Fix Yard Smart Publish car status update (טיוטה/מפורסם/מוסתר)',
    timestamp: '2025-12-11 17:00:00',
    summary: 'Fixed critical bug where changing car status to "מוסתר" (HIDDEN) or "מפורסם" (PUBLISHED) failed with "שגיאה בעדכון סטטוס הרכב". The issue was incorrect status mapping: HIDDEN was mapped to "draft" instead of "archived", causing saveYardCar to set wrong publicationStatus. Status updates now work correctly and UI refreshes properly.',
    changes: [
      {
        type: 'bugfix',
        title: 'Fixed HIDDEN status mapping in updateCarPublicationStatus',
        description: 'Changed HIDDEN status mapping from "draft" to "archived" in both updateCarPublicationStatus and batchUpdateCarPublicationStatus. This ensures saveYardCar correctly sets publicationStatus="HIDDEN" and yardFleetApi maps it back correctly for the UI.'
      },
      {
        type: 'bugfix',
        title: 'Enhanced error logging for status updates',
        description: 'Added detailed error logging in handleStatusChange and updateCarPublicationStatus to capture carId, status, userId, and full error details. This helps diagnose any future status update failures.'
      },
      {
        type: 'infra',
        title: 'Status mapping flow verification',
        description: 'Verified complete status mapping flow: UI CarPublicationStatus → YardCarMaster.status → Firestore status/publicationStatus → yardFleetApi publicationStatus → UI display. All mappings now align correctly.'
      }
    ]
  },
  // Previous build - Yard Fleet quick images edit modal with drag & drop upload
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Yard Fleet – quick images edit modal from image count with drag & drop upload',
    timestamp: '2025-12-11 16:30:00',
    summary: 'Added quick image editing modal accessible from the image count badge in Yard Fleet table. Users can now click the image count to open a focused modal for managing car images with drag & drop upload support, without navigating to the full car edit page.',
    changes: [
      {
        type: 'feature',
        title: 'Quick images edit modal from Yard Fleet table',
        description: 'Clicking the image count badge (📷 0/1/35) in the Yard Fleet table now opens a compact modal for editing only the car\'s images. The modal includes upload, delete, and set main image functionality, matching the existing images section in Yard Car Edit page.'
      },
      {
        type: 'ui',
        title: 'Drag & drop image upload',
        description: 'Added drag & drop upload zone in the images editor. Users can drag multiple image files directly onto the drop zone or click to select files. The drop zone provides visual feedback when dragging files over it.'
      },
      {
        type: 'feature',
        title: 'Reusable YardCarImagesEditor component',
        description: 'Extracted image management logic from YardCarEditPage into a reusable YardCarImagesEditor component. This component handles image loading, upload, delete, mark as main, and drag & drop reordering, and can be used both in the full edit page and in the quick edit modal.'
      },
      {
        type: 'ui',
        title: 'Real-time image count updates',
        description: 'Image count badge in the Yard Fleet table updates immediately after images are added or deleted in the modal, without requiring a page refresh.'
      }
    ]
  },
  // Previous build - Fix Yard Excel import flow (simplified upload + Storage trigger fixes)
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Fix Yard Excel import flow (simplified upload + Storage trigger fixes)',
    timestamp: '2025-12-11 15:00:00',
    summary: 'Simplified Yard Excel import on Web (removed progress bar, KISS upload), fixed Storage rules, ensured jobs never stay stuck at UPLOADED, and fixed bucket mismatch between Web and Functions.',
    changes: [
      {
        type: 'bugfix',
        title: 'Simplified Yard Excel import on Web',
        description: 'Removed upload progress bar and per-percent tracking. Changed from uploadBytesResumable to simple uploadBytes. UI now shows simple busy state "מעלה ומעבד את קובץ האקסל..." instead of progress percentage. Added success/failure alerts when job completes.'
      },
      {
        type: 'bugfix',
        title: 'Fixed Firebase Storage rules for Yard Excel import',
        description: 'Updated storage.rules to allow authenticated yard owners to upload Excel/CSV files to yardImports/{yardUid}/{jobId}.xlsx. Added support for .xlsx, .xls, and .csv file types with proper MIME type validation.'
      },
      {
        type: 'bugfix',
        title: 'Fixed yardImportParseExcel to never leave jobs stuck',
        description: 'Refactored Storage trigger to ensure jobs always move from UPLOADED to either PREVIEW_READY or FAILED. Converted early returns to throws inside try/catch block. Added comprehensive logging at every step. Jobs can no longer remain stuck at UPLOADED status.'
      },
      {
        type: 'bugfix',
        title: 'Fixed Storage bucket mismatch between Web and Functions',
        description: 'Added explicit storageBucket: "carexpert-94faa.appspot.com" to admin.initializeApp() in functions/src/index.ts. This ensures Functions use the same bucket as Web, fixing "No such object" errors when clicking "יבוא ישירות". Added bucket logging in yardImportCommitJob and yardImportParseExcel.'
      },
      {
        type: 'infra',
        title: 'Enhanced logging for Yard Import functions',
        description: 'Added detailed logging throughout yardImportParseExcel and yardImportCommitJob to track bucket usage, file downloads, and status transitions. All logs use consistent [yardImportParseExcel] and [yardImportCommitJob] prefixes.'
      }
    ]
  },
  // Previous build - Add yardImportWebSimple Cloud Function (KISS Excel import for Web)
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Add yardImportWebSimple Cloud Function (KISS Excel import for Web)',
    timestamp: '2025-12-10 16:32:49',
    summary: 'Added new yardImportWebSimple Cloud Function that enables direct Excel import for Web without job-based flow. Function receives base64 file, parses it, and creates/updates cars in carSales. Returns summary with counts. This is a parallel path to the existing job-based flow used by Android.',
    changes: [
      {
        type: 'feature',
        title: 'New yardImportWebSimple Cloud Function',
        description: 'Added HTTPS callable function that accepts Excel file as base64, parses it using shared parsing logic, creates/updates cars in carSales (MASTER), and optionally creates publicCars projection. Returns summary with rowsTotal, rowsValid, carsCreated, carsUpdated, carsSkipped.'
      },
      {
        type: 'infra',
        title: 'Added importYardExcelSimple API function',
        description: 'Added Web API function in yardImportApi.ts that converts File to base64 and calls yardImportWebSimple. Includes error handling and user-friendly error messages.'
      },
      {
        type: 'infra',
        title: 'Reused existing import logic',
        description: 'yardImportWebSimple reuses existing parseExcelFileBuffer, buildYardCarMasterDataFromImportRow, upsertYardCarMaster, and upsertPublicCarFromMaster helpers. No duplication of parsing or car creation logic.'
      }
    ]
  },
  // Previous build: Final fix: Yard Fleet imageCount=0 and Yard Car Edit missing images
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Final fix: Yard Fleet imageCount=0 and Yard Car Edit missing images',
    timestamp: '2025-12-09 21:45:00',
    summary: 'Fixed critical bug where normalizeCarImages used explicitCount=0 instead of imageUrls.length. Yard Fleet now shows correct image counts, and Yard Car Edit displays external images correctly.',
    changes: [
      {
        type: 'bugfix',
        title: 'Fixed normalizeCarImages count logic',
        description: 'Changed logic to only trust explicitCount if it\'s > 0. When explicitCount is 0 or null, now uses imageUrls.length as source of truth. Fixes cases where publicCars.imageUrls has 10 images but imagesCount=0.'
      },
      {
        type: 'bugfix',
        title: 'Yard Car Edit external images display',
        description: 'Fixed rendering logic to show external images even when managed images exist. Updated lightbox to handle combined managed + external images. "אין תמונות עדיין" now only shows when both arrays are empty.'
      },
      {
        type: 'infra',
        title: 'Debug logging for specific car',
        description: 'Added dev-only debug logging for car 1764682386599 to trace image data flow from Firestore → yardFleetApi → YardCarEditPage. All logs gated with import.meta.env.DEV.'
      }
    ]
  },
  // Previous build: Public car details layout, image filters, and yard edit improvements
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Public car details layout, image filters, and yard edit improvements',
    timestamp: '2025-12-09 21:00:00',
    summary: 'Reworked car details page layout, added "with images only" filter, fixed yard fleet image counts, and improved yard car edit to show existing images.',
    changes: [
      {
        type: 'ui',
        title: 'Public car details layout',
        description: 'Reworked car details page to show gallery first (full-width at top), with all details and contact form below. Added expandable "Advanced details" section for technical/ownership fields.'
      },
      {
        type: 'feature',
        title: 'With images only filter',
        description: 'Added filter chip "רק עם תמונות" in car search page to show only cars that have images (mainImageUrl or imageUrls).'
      },
      {
        type: 'bugfix',
        title: 'Yard fleet image count accuracy',
        description: 'Enhanced image count logic to derive from publicCars.imageUrls.length when explicit count is missing. Ensures accurate counts for all yard cars.'
      },
      {
        type: 'bugfix',
        title: 'Yard car edit shows existing images',
        description: 'Yard car edit screen now displays existing images from publicCars/carSales as read-only thumbnails, preventing "אין תמונות עדיין" when images exist on the public side.'
      }
    ]
  },
  // Previous build: Robust public car linking + accurate image count
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Robust public car linking + accurate image count',
    timestamp: '2025-12-09 20:00:00',
    summary: 'Fixed "car not found" from Facebook share links and image count=0 bug in Yard Fleet. Added validation to prevent broken URLs.',
    changes: [
      {
        type: 'bugfix',
        title: 'Robust public car linking',
        description: 'Added verifyPublicCarExists() validation before generating /cars/:id URLs. getEffectivePublicCarId now verifies publicCars doc exists, preventing "הרכב לא נמצא" from Smart Publish links.'
      },
      {
        type: 'bugfix',
        title: 'Accurate image count in yard fleet',
        description: 'Image counts now reflect real image availability from publicCars and carSales, including legacy fields. Added safety check to force imageCount when publicCars has imageUrls but count is 0.'
      },
      {
        type: 'infra',
        title: 'Public car validation',
        description: 'New verifyPublicCarExists() helper in carsApi.ts ensures share URLs only use valid publicCars document IDs.'
      },
      {
        type: 'infra',
        title: 'Enhanced image normalization',
        description: 'Improved merging of publicCars and carSales image data in yardFleetApi, ensuring all field variants are passed to normalizeCarImages().'
      }
    ]
  },
  // Previous build: Fix main image and image count in yard fleet
  {
    version: '2025.12.09-04',
    label: 'v2025.12.09-04',
    env: 'production',
    topic: 'Fix main image and image count in yard fleet',
    timestamp: '2025-12-09 15:20:00',
    summary: 'Fixed empty main image rendering in CarImageGallery and imageCount=0 bug in Yard Fleet list.',
    changes: [
      {
        type: 'bugfix',
        title: 'Main image rendering',
        description: 'Fixed CarImageGallery to properly display main image (was showing empty gradient). Now renders <img> directly when selectedUrl exists.'
      },
      {
        type: 'bugfix',
        title: 'Image count from publicCars',
        description: 'Strengthened publicCars ↔ carSales mapping to use ALL candidate keys. imageCount now correctly reflects publicCars.imageUrls when available.'
      },
      {
        type: 'infra',
        title: 'Multi-key mapping',
        description: 'addPublicCarToMap now maps each publicCars doc under all relevant keys (carSaleId, originalCarId, carId, id, publicCarId) for robust linking.'
      }
    ]
  },
  // Previous deploy: Fix yard car image gallery & Facebook links
  {
    version: '2025.12.09-03',
    label: 'v2025.12.09-03',
    env: 'production',
    topic: 'Fix yard car image gallery & Facebook links',
    timestamp: '2025-12-09 14:30:00',
    summary: 'Fixed main image selection, added zoom overlay, unified image loading from publicCars.',
    changes: [
      {
        type: 'feature',
        title: 'Image Zoom Overlay',
        description: 'Clicking main image opens full-screen zoom overlay with ESC/backdrop close support.'
      },
      {
        type: 'bugfix',
        title: 'Robust image selection',
        description: 'CarImageGallery now properly selects mainImageUrl on load, falls back to first image.'
      },
      {
        type: 'bugfix',
        title: 'YardFleet preview from publicCars',
        description: 'Preview dialog now loads images from publicCars (same as public car page), ensuring consistency.'
      },
      {
        type: 'infra',
        title: 'Facebook share verified',
        description: 'Confirmed Facebook share uses getEffectivePublicCarId with Firestore fallback resolution.'
      }
    ]
  },
  // Previous deploy: Build Info Center + AI Governance Layer
  {
    version: '2025.12.09-02',
    label: 'v2025.12.09-02',
    env: 'production',
    topic: 'Deploy – Build Info Center + AI Governance Layer',
    timestamp: '2025-12-09 12:10:00',
    summary: 'Added Build Info Center, footer version label, and AI governance docs for all future AI work.',
    changes: [
      {
        type: 'feature',
        title: 'Build Info Center',
        description: 'Footer "Build Info" button opens modal dialog showing current and historical builds.'
      },
      {
        type: 'infra',
        title: 'AI Governance Docs',
        description: 'Added AI_GLOBAL_RULES.md and CURSOR_MASTER_PROMPT.md to guide all future AI/Cursor work on this repo.'
      },
      {
        type: 'ui',
        title: 'Footer version label',
        description: 'BUILD_LABEL displayed in footer as system version indicator (RTL-friendly).'
      },
      {
        type: 'infra',
        title: 'Build changelog module',
        description: 'TypeScript-based BUILD_CHANGELOG array for version history (no DB yet).'
      },
      {
        type: 'infra',
        title: 'MASTER BUILD RULES',
        description: 'AI agents must treat Topic/Summary as Build Log material and output BuildEntry templates for deploys.'
      }
    ]
  },
  // Previous build entry
  {
    version: '2025.12.09-01',
    label: 'v2025.12.09-01',
    env: 'local',
    topic: 'Build Info Center - מרכז מידע גרסאות',
    timestamp: '2025-12-09 11:15:00',
    summary: 'הוספת מרכז מידע גרסאות עם היסטוריית שינויים.',
    changes: [
      {
        type: 'feature',
        title: 'מודל Build Info',
        description: 'דיאלוג מודרני להצגת גרסה נוכחית והיסטוריה.'
      },
      {
        type: 'ui',
        title: 'כפתור Build Info בפוטר',
        description: 'כפתור קטן ליד הגרסה לפתיחת המודל.'
      },
      {
        type: 'infra',
        title: 'מודול buildChangelog.ts',
        description: 'מבנה נתונים typed להיסטוריית גרסאות.'
      }
    ]
  },
  {
    version: '2025.12.09-00',
    label: 'v2025.12.09-00',
    env: 'local',
    topic: 'Build Version Indicator - הושלם',
    timestamp: '2025-12-09 11:07:00',
    summary: 'הוספת גרסת BUILD לפוטר ולוג גרסה בקונסול.',
    changes: [
      {
        type: 'feature',
        title: 'הצגת גרסת מערכת בפוטר',
        description: 'תווית vXXXX עם תמיכה ב-RTL ו-LTR למספרים.'
      },
      {
        type: 'infra',
        title: 'לוג גרסה בקונסול',
        description: 'הדפסת BUILD_LABEL ו-BUILD_ENV בתחילת טעינת האפליקציה.'
      }
    ]
  },
  // Older builds go here, newest first (descending by date).
  // CI/CD or manual editing should prepend new entries above.
];

/**
 * Get the current build entry (first in the changelog)
 */
export function getCurrentBuild(): BuildEntry | undefined {
  return BUILD_CHANGELOG[0];
}

/**
 * Get historical builds (all except the current one)
 */
export function getBuildHistory(): BuildEntry[] {
  return BUILD_CHANGELOG.slice(1);
}

