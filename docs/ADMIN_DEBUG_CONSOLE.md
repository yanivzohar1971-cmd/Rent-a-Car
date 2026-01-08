# Admin Debug Console

## Overview

The Admin Debug Console is a powerful diagnostic tool for admins to inspect and debug the car publishing pipeline, data integrity, and system health.

## Access

- **Route:** `/admin/debug`
- **Access:** Admin only (requires `admin=true` custom claim or presence in `config/admins` collection)

## Features

### 1. AutoComplete Pickers

#### Yard Picker
- **Search:** By yard/business display name only (not phone, domain, or UID)
- **Placeholder:** "אנא בחר מגרש (חיפוש לפי שם מגרש בלבד)"
- **Display:** Yard name (bold) + optional city/area
- **Tech Details:** After selection, shows `yardUid` with copy button

#### Car Picker
- **Search:** By license plate number (digits), make, model, or year
- **Placeholder:** "אנא הקלד מספר רישוי לחיפוש"
- **Display:** 
  - Input field uses plate-style font (Courier New, monospace)
  - Suggestions show `LicensePlateBadge` component for plates
  - Shows make/model/year in suggestions
- **Auto-fill:** Selecting a car automatically sets the yard if `yardUid` is available
- **Tech Details:** After selection, shows `carId` and `yardUid` with copy buttons

**Plate Styling:**
- Reuses existing `LicensePlateBadge` component from `web/src/components/common/LicensePlateBadge.tsx`
- Uses CSS classes: `.license-plate-badge`, `.license-plate-badge-sm`
- Input field styled with `font-family: 'Courier New', monospace` to match plate appearance

### 2. Smart Disable System

Every control card shows clear requirements and disable reasons:

- **Disabled State:** Cards are greyed out (opacity 0.55) when not runnable
- **Disable Reasons (Hebrew):**
  - "נדרש לבחור מגרש" - Yard required
  - "נדרש לבחור רכב" - Car required
  - "כבה Read-only" - Read-only mode must be OFF
  - "אין הרשאת Admin" - Admin permission missing
  - "פונקציות לא זמינות" - Functions unavailable

- **Requirement Badges:** Always visible on cards:
  - "נדרש מגרש" - Yard required
  - "נדרש רכב" - Car required
  - "כבה Read-only" - Read-only OFF required
  - "Verbose (אופציונלי)" - Verbose optional

- **Requirements Line:** Shows "Requires: Yard / Car / Read-only OFF / Verbose optional"

**Important:** Controls cannot be run when disabled. The UI prevents clicking "Run" to avoid confusing "Missing carId" error results.

### 3. Read-only Toggle

- **Default:** ON (safe mode)
- **Visual Indicator:** Pill showing "Read-only: ON" (green) or "OFF" (orange)
- **Behavior:**
  - When OFF: Reproject controls become enabled immediately (if yard/car provided)
  - When ON: Reproject controls are disabled with "כבה Read-only" badge

**Fix:** The toggle is now properly wired - changing it immediately updates control runnability.

### 4. Verbose Mode

- **Label:** "Verbose (יותר שדות בדוח)"
- **Behavior:**
  - When ON: Includes extra fields in `detailsVerbose`
  - Shows "VERBOSE" badge in results
  - Includes stack traces in error details
- **Indication:** Cards show "Verbose recommended" badge when verbose is helpful

### 5. Limit Input

- **Label:** "Limit (כמה תוצאות לבדיקה)"
- **Helper Text (Hebrew):**
  "מגביל כמה מסמכים/רכבים נסרקים בכל בדיקה כדי לשמור על מהירות ולא להעמיס על Firestore/Functions. לדוגמה: 25 = בדיקה מהירה על 25 הרשומות האחרונות."

- **Controls that honor Limit:**
  - Undefined Scan
  - Canonicality Scan
  - Reproject Yard Batch
  - Public Listing Query (sample size)
  - Detect Old Docs (sample size)

**Note:** Limit does not affect the public website - it only limits the debug check scope.

### 6. Results Panel

Results are displayed in collapsible sections:

#### Summary (always visible)
- Title + status badge
- Timestamp
- Correlation ID (if available)
- Short Hebrew explanation of status meaning

#### Details (Readable) (default open)
- Key-value table format (not raw JSON)
- Shows counts, fields, mismatches in readable format
- Includes "Recommended Action" if error occurred
- Verbose details shown separately if verbose mode was used

#### Raw JSON (collapsed by default)
- Full JSON dump for technical inspection

**Status Meanings (Hebrew tooltip):**
- **OK:** עבר בהצלחה, אין צורך בפעולה (Passed, no action needed)
- **WARN:** עובד אבל צריך תשומת לב (Works but needs attention - e.g., fallback used / missing optional fields / partial)
- **FAIL:** לא ניתן לאמת או שהפעולה נכשלה (Cannot validate or operation failed - permissions, not found, runtime error)

### 7. Error Mapping & Correlation IDs

#### Client-Side Error Mapping

Firebase Functions errors are mapped to Hebrew messages:

- `permission-denied` → "המשתמש לא מזוהה כ-Admin ב-Claims/Allowlist"
- `unauthenticated` → "המשתמש לא מזוהה"
- `not-found` → "המשאב לא נמצא"
- `failed-precondition` → "תנאי מוקדם נכשל"
- `internal` → "שגיאת שרת. פתח Logs לפי correlationId"
- `unavailable` → "Functions לא זמינות/בעיה ברשת/Region"

Each error includes a "Recommended Action" in Hebrew.

#### Correlation IDs

- **Format:** `dbg_{timestamp}_{random}`
- **Usage:**
  - Generated client-side for every debug run
  - Passed to callable functions
  - Included in server logs
  - Displayed in UI results
  - Clickable to copy to clipboard

**How to use:**
1. Run a debug control
2. If error occurs, note the Correlation ID in results
3. Search Cloud Functions logs for this ID
4. Find the server-side error details

### 8. History

- Shows last 20 runs
- Each item displays:
  - Status badge (OK/WARN/FAIL)
  - Control title
  - Time
  - Tooltip with result summary
- Click to view full result

## Controls

### Publish Pipeline
- **MASTER Car Publish State:** Reads `users/{yardUid}/carSales/{carId}` and reports publish status
- **PUBLIC Car Projection State:** Reads `publicCars/{carId}` and reports projection status
- **MASTER vs PUBLIC Diff:** Compares MASTER and PUBLIC documents
- **Yard Published Counts:** Counts published cars for a yard

### Functions/Projection
- **Reproject Car:** Forces reprojection for a single car (requires Read-only OFF)
- **Reproject Yard Batch:** Batch reprojects up to limit cars (requires Read-only OFF)

### Queries & Backward Compatibility
- **Public Listing Query Dry Run:** Runs the same query as buyer/public page
- **Detect Old Docs Missing isPublished:** Samples and counts docs missing `isPublished` field

### Rules/Permissions Signals
- **Client Write Permission Probe:** Tests callable function access

### Data Integrity
- **MASTER Undefined/Null Scan:** Scans for missing/inconsistent fields
- **Publish Signal Canonicality Scan:** Scans for misaligned publish signals

### Performance / Sampling
- **Functions Latency Snapshot:** Measures function call latency

## Functions Endpoints

### adminDebugSearchYards
- **Purpose:** Search yards by name
- **Input:** `{ q: string, limit?: number }`
- **Output:** `{ ok: true, results: [{ yardUid, yardName, city? }] }`
- **Search:** Name only (displayName, fullName, yardName, businessName, companyName, name)

### adminDebugSearchCars
- **Purpose:** Search cars by plate/make/model/year
- **Input:** `{ q: string, yardUid?: string, limit?: number }`
- **Output:** `{ ok: true, results: [{ carId, yardUid, plateNumber?, make?, model?, year?, title? }] }`
- **Search:** 
  - If `yardUid` provided: searches `users/{yardUid}/carSales`
  - Else: searches `publicCars` sample
  - Matches by plate digits OR make/model/year text

### adminDebugPing
- **Purpose:** Test callable access and measure latency
- **Input:** `{ correlationId?: string }`
- **Output:** `{ ok: true, serverTs, serverTsISO, projectId, region, version?, correlationId, callerUid }`
- **Error Handling:** Returns structured error with correlationId

## Technical Details

### Plate Styling Implementation
- **Component:** `LicensePlateBadge` from `web/src/components/common/LicensePlateBadge.tsx`
- **CSS Classes:** `.license-plate-badge`, `.license-plate-badge-sm`
- **Font:** `'Courier New', monospace` for input field
- **Usage:** Applied to car picker input and suggestion rows

### Yard Search Implementation
- **Search Field:** Name only (no phone, domain, UID)
- **Query:** Searches `users` collection where `isYard=true` OR `primaryRole='YARD'`
- **Filtering:** In-memory case-insensitive contains match
- **Limit:** Default 15, max 50

### Disable Reason Computation
- Uses `getControlDisabledReason(control, ctx)` helper
- Checks `requires` object (new format) and legacy `requiresCarId`/`requiresYardUid`/`requiresReadOnly`
- Returns Hebrew string or `null` if runnable

### Read-only Toggle Wiring
- Controlled React state: `const [readOnly, setReadOnly] = useState(true)`
- Context updated immediately: `ctx.readOnly` reflects current state
- Controls recompute runnability on every render (no stale memo deps)

### Error Mapping
- Helper function: `mapFirebaseError(error)`
- Returns `{ message: string, action: string }` in Hebrew
- Applied to all callable function errors

## Deployment

### Functions
```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

### Web
```bash
cd web
npm install
npm run build
firebase deploy --only hosting
```

## Troubleshooting

### "Missing carId" errors
- **Cause:** Control requires car but none selected
- **Fix:** Select a car using the car picker
- **Note:** UI should prevent running when disabled - if you see this, it's a bug

### "כבה Read-only" but toggle is OFF
- **Cause:** Stale state or memoization issue
- **Fix:** Toggle should work immediately - refresh page if not

### Functions return `{ code: "functions/internal" }`
- **Cause:** Server-side error
- **Fix:** 
  1. Check Correlation ID in results
  2. Search Cloud Functions logs for this ID
  3. Check server logs for detailed error

### Yard search returns no results
- **Cause:** Yard name doesn't match or yard not marked as `isYard=true`
- **Fix:** Try partial name match, check `users` collection for yard documents

### Car search returns no results
- **Cause:** Plate/make/model doesn't match or car not in searched collection
- **Fix:** 
  - Try digits only for plate search
  - Ensure `yardUid` is set if searching specific yard
  - Check `publicCars` or `users/{yardUid}/carSales` collections
